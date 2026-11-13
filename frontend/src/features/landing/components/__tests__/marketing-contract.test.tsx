import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { PLAN_CATALOG } from '../../../../../../src/modules/subscriptions/plan.constants';
import en from '@/i18n/locales/en/landing.json';
import uk from '@/i18n/locales/uk/landing.json';
import { LandingHeader } from '../LandingHeader';
import { PricingSection } from '../PricingSection';

afterEach(cleanup);

async function translated(language: string) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    resources: { en: { landing: en }, uk: { landing: uk } },
  });
  return i18n;
}

describe.each(['en', 'uk'])('marketing contract in %s', (language) => {
  it('shows catalogue prices and resource limits for every paid plan', async () => {
    const i18n = await translated(language);
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <PricingSection />
      </I18nextProvider>,
    );
    const cards = container.querySelectorAll('.landing-plan-card');
    PLAN_CATALOG.forEach((plan, index) => {
      expect(
        cards[index].querySelector('.landing-plan-name'),
      ).toHaveTextContent(plan.name);
      expect(
        cards[index].querySelector('.landing-plan-amount'),
      ).toHaveTextContent(`$${plan.monthlyPrice}`);
      const resources = cards[index].querySelectorAll(
        '.landing-plan-features li',
      );
      const limits = [
        plan.limits.users,
        plan.limits.branches,
        plan.limits.workPosts,
        plan.limits.services,
      ];
      limits.forEach((limit, resource) => {
        const text = resources[resource].textContent ?? '';
        if (limit === null) expect(text).toMatch(/Unlimited|Необмежено/);
        else expect(text.match(/\d+/)?.[0]).toBe(String(limit));
      });
    });
  });

  it.each([
    '/',
    '/blog',
    '/blog/article',
    '/legal/privacy',
    '/legal/terms',
    '/legal/refund',
  ])('links to the landing page and its sections from %s', async (route) => {
    const i18n = await translated(language);
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <I18nextProvider i18n={i18n}>
          <LandingHeader />
        </I18nextProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'WashFlow' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      [...container.querySelectorAll('.landing-nav-links a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/#features', '/#how', '/#pricing', '/#realtime']);
  });

  it('scrolls a landing section into view after a cross-page hash navigation mounts', async () => {
    const i18n = await translated(language);
    const target = document.createElement('section');
    target.id = 'pricing';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(
      <MemoryRouter initialEntries={['/#pricing']}>
        <I18nextProvider i18n={i18n}>
          <LandingHeader />
        </I18nextProvider>
      </MemoryRouter>,
    );
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });
});
