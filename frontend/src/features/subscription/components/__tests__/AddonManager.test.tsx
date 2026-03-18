import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddonManager } from '../AddonManager';
import type { AddonDefinition, SubscriptionAddon } from '../../api/subscription.api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'addons.title': 'Add-ons',
        'addons.description': 'Extend your plan with additional resources',
        'addons.perUnit': 'per unit',
        'plans.month': 'mo',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const addons: AddonDefinition[] = [
  { resource: 'branches', unitSize: 1, monthlyPrice: 15, name: 'Extra Branch' },
  { resource: 'workPosts', unitSize: 5, monthlyPrice: 10, name: 'Extra Work Posts' },
  { resource: 'users', unitSize: 5, monthlyPrice: 5, name: 'Extra Users' },
  { resource: 'services', unitSize: 10, monthlyPrice: 5, name: 'Extra Services' },
];

describe('AddonManager', () => {
  const defaultProps = {
    addons,
    currentAddons: [] as SubscriptionAddon[],
    onUpdate: vi.fn(),
  };

  it('renders the title and description', () => {
    render(<AddonManager {...defaultProps} />);

    expect(screen.getByText('Add-ons')).toBeInTheDocument();
    expect(
      screen.getByText('Extend your plan with additional resources'),
    ).toBeInTheDocument();
  });

  it('renders one row per addon', () => {
    render(<AddonManager {...defaultProps} />);

    expect(screen.getByText('Extra Branch')).toBeInTheDocument();
    expect(screen.getByText('Extra Work Posts')).toBeInTheDocument();
    expect(screen.getByText('Extra Users')).toBeInTheDocument();
    expect(screen.getByText('Extra Services')).toBeInTheDocument();
  });

  it('displays addon name, unitSize, and monthlyPrice', () => {
    render(<AddonManager {...defaultProps} />);

    expect(screen.getByText(/\+1.*per unit.*\$15\/mo/)).toBeInTheDocument();
    expect(screen.getByText(/\+5.*per unit.*\$10\/mo/)).toBeInTheDocument();
  });

  it('displays current quantity from currentAddons', () => {
    const currentAddons: SubscriptionAddon[] = [
      { resource: 'branches', quantity: 3 },
    ];

    render(<AddonManager {...defaultProps} currentAddons={currentAddons} />);

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    expect(within(branchRow).getByText('3')).toBeInTheDocument();
  });

  it('displays 0 for addons not in currentAddons', () => {
    render(<AddonManager {...defaultProps} currentAddons={[]} />);

    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });

  it('calls onUpdate with incremented quantity on plus click', async () => {
    const onUpdate = vi.fn();
    const currentAddons: SubscriptionAddon[] = [
      { resource: 'branches', quantity: 2 },
    ];

    render(
      <AddonManager
        {...defaultProps}
        onUpdate={onUpdate}
        currentAddons={currentAddons}
      />,
    );

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');
    const plusButton = buttons[buttons.length - 1];

    await userEvent.click(plusButton);

    expect(onUpdate).toHaveBeenCalledWith('branches', 3);
  });

  it('calls onUpdate with decremented quantity on minus click', async () => {
    const onUpdate = vi.fn();
    const currentAddons: SubscriptionAddon[] = [
      { resource: 'branches', quantity: 2 },
    ];

    render(
      <AddonManager
        {...defaultProps}
        onUpdate={onUpdate}
        currentAddons={currentAddons}
      />,
    );

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');
    const minusButton = buttons[0];

    await userEvent.click(minusButton);

    expect(onUpdate).toHaveBeenCalledWith('branches', 1);
  });

  it('disables minus button when quantity is 0', () => {
    render(<AddonManager {...defaultProps} currentAddons={[]} />);

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');
    const minusButton = buttons[0];

    expect(minusButton).toBeDisabled();
  });

  it('disables both buttons when isLoading is true', () => {
    render(
      <AddonManager
        {...defaultProps}
        currentAddons={[{ resource: 'branches', quantity: 2 }]}
        isLoading
      />,
    );

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');

    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it('disables both buttons when disabled is true', () => {
    render(
      <AddonManager
        {...defaultProps}
        currentAddons={[{ resource: 'branches', quantity: 2 }]}
        disabled
      />,
    );

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');

    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it('plus button remains enabled when quantity is 0 and not loading/disabled', () => {
    render(<AddonManager {...defaultProps} currentAddons={[]} />);

    const branchRow = screen.getByText('Extra Branch').closest('div')!.parentElement!;
    const buttons = within(branchRow).getAllByRole('button');
    const plusButton = buttons[buttons.length - 1];

    expect(plusButton).not.toBeDisabled();
  });
});
