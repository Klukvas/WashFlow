import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanCard } from '../PlanCard';
import type { PlanDefinition } from '../../api/subscription.api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'plans.unlimited': 'unlimited',
        'plans.popular': 'Most Popular',
        'plans.month': 'mo',
        'plans.year': 'yr',
        'plans.twoMonthsFree': '2 months free',
        'plans.currentPlan': 'Current Plan',
        'plans.selectPlan': 'Select Plan',
        'plans.addons': 'Add-ons',
        'plans.available': 'Available',
        'resources.branches': 'Branches',
        'resources.workPosts': 'Work Posts',
        'resources.users': 'Users',
        'resources.services': 'Services',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const starterPlan: PlanDefinition = {
  tier: 'STARTER',
  name: 'Starter',
  monthlyPrice: 29,
  yearlyPrice: 290,
  limits: { branches: 1, workPosts: 5, users: 5, services: 15 },
  addonsAvailable: true,
};

const businessPlan: PlanDefinition = {
  tier: 'BUSINESS',
  name: 'Business',
  monthlyPrice: 79,
  yearlyPrice: 790,
  limits: { branches: 5, workPosts: 25, users: 25, services: 50 },
  addonsAvailable: true,
};

const enterprisePlan: PlanDefinition = {
  tier: 'ENTERPRISE',
  name: 'Enterprise',
  monthlyPrice: 199,
  yearlyPrice: 1990,
  limits: { branches: 25, workPosts: 100, users: null, services: null },
  addonsAvailable: false,
};

describe('PlanCard', () => {
  const defaultProps = {
    plan: starterPlan,
    billingInterval: 'MONTHLY' as const,
    onSelect: vi.fn(),
  };

  it('renders the plan name', () => {
    render(<PlanCard {...defaultProps} />);

    expect(screen.getByText('Starter')).toBeInTheDocument();
  });

  it('renders the monthly price', () => {
    render(<PlanCard {...defaultProps} />);

    expect(screen.getByText('$29')).toBeInTheDocument();
  });

  it('renders the yearly equivalent monthly price', () => {
    render(
      <PlanCard {...defaultProps} billingInterval="YEARLY" />,
    );

    // yearlyPrice 290 / 12 = 24.17 → Math.round = 24
    expect(screen.getByText('$24')).toBeInTheDocument();
  });

  it('shows "Most Popular" badge only for BUSINESS tier', () => {
    const { rerender } = render(
      <PlanCard {...defaultProps} plan={businessPlan} />,
    );

    expect(screen.getByText('Most Popular')).toBeInTheDocument();

    rerender(<PlanCard {...defaultProps} plan={starterPlan} />);
    expect(screen.queryByText('Most Popular')).not.toBeInTheDocument();
  });

  it('renders limit rows for branches, workPosts, users, services', () => {
    render(<PlanCard {...defaultProps} />);

    expect(screen.getByText(/1.*Branches/)).toBeInTheDocument();
    expect(screen.getByText(/5.*Work Posts/)).toBeInTheDocument();
    expect(screen.getByText(/5.*Users/)).toBeInTheDocument();
    expect(screen.getByText(/15.*Services/)).toBeInTheDocument();
  });

  it('renders "unlimited" for null limits', () => {
    render(<PlanCard {...defaultProps} plan={enterprisePlan} />);

    const unlimitedItems = screen.getAllByText(/unlimited/);
    expect(unlimitedItems.length).toBeGreaterThanOrEqual(2);
  });

  it('renders add-ons row when addonsAvailable is true', () => {
    render(<PlanCard {...defaultProps} plan={starterPlan} />);

    expect(screen.getByText(/Available.*Add-ons/)).toBeInTheDocument();
  });

  it('does not render add-ons row when addonsAvailable is false', () => {
    render(<PlanCard {...defaultProps} plan={enterprisePlan} />);

    expect(screen.queryByText(/Available.*Add-ons/)).not.toBeInTheDocument();
  });

  it('shows "Current Plan" and disables button when tier matches', () => {
    render(<PlanCard {...defaultProps} currentTier="STARTER" />);

    const button = screen.getByRole('button', { name: 'Current Plan' });
    expect(button).toBeDisabled();
  });

  it('shows "Select Plan" when tier does not match', () => {
    render(<PlanCard {...defaultProps} currentTier="BUSINESS" />);

    expect(
      screen.getByRole('button', { name: 'Select Plan' }),
    ).toBeInTheDocument();
  });

  it('calls onSelect with tier on click', async () => {
    const onSelect = vi.fn();
    render(<PlanCard {...defaultProps} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Select Plan' }));

    expect(onSelect).toHaveBeenCalledWith('STARTER');
  });

  it('disables button when isLoading is true', () => {
    render(<PlanCard {...defaultProps} isLoading />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows yearly total price when billingInterval is YEARLY', () => {
    render(
      <PlanCard {...defaultProps} billingInterval="YEARLY" />,
    );

    expect(screen.getByText(/\$290/)).toBeInTheDocument();
  });

  it('does not show yearly info when billingInterval is MONTHLY', () => {
    render(<PlanCard {...defaultProps} billingInterval="MONTHLY" />);

    expect(screen.queryByText(/2 months free/)).not.toBeInTheDocument();
  });
});
