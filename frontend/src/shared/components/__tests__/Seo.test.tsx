import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { Seo } from '../Seo';

function renderWithHelmet(ui: React.ReactElement) {
  return render(<HelmetProvider>{ui}</HelmetProvider>);
}

describe('Seo', () => {
  it('renders default title when no title is provided', () => {
    renderWithHelmet(<Seo />);

    const title = document.querySelector('title');
    expect(title?.textContent).toBe(
      'WashFlow \u2014 Car Wash Management Platform',
    );
  });

  it('renders custom title with WashFlow suffix', () => {
    renderWithHelmet(<Seo title="Orders" />);

    const title = document.querySelector('title');
    expect(title?.textContent).toBe('Orders | WashFlow');
  });

  it('sets meta description', () => {
    renderWithHelmet(<Seo description="Manage your car wash" />);

    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe('Manage your car wash');
  });

  it('uses default description when none provided', () => {
    renderWithHelmet(<Seo />);

    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toContain('Streamline your car wash');
  });

  it('constructs canonical URL from path', () => {
    renderWithHelmet(<Seo path="/orders" />);

    const link = document.querySelector('link[rel="canonical"]');
    expect(link?.getAttribute('href')).toBe('https://washflow.solutions/orders');
  });

  it('defaults canonical URL to root', () => {
    renderWithHelmet(<Seo />);

    const link = document.querySelector('link[rel="canonical"]');
    expect(link?.getAttribute('href')).toBe('https://washflow.solutions/');
  });

  it('sets og:title meta tag', () => {
    renderWithHelmet(<Seo title="Dashboard" />);

    const meta = document.querySelector('meta[property="og:title"]');
    expect(meta?.getAttribute('content')).toBe('Dashboard | WashFlow');
  });

  it('sets og:image with default screenshot when no image provided', () => {
    renderWithHelmet(<Seo />);

    const meta = document.querySelector('meta[property="og:image"]');
    expect(meta?.getAttribute('content')).toBe(
      'https://washflow.solutions/screenshots/orders.png',
    );
  });

  it('sets og:image with custom image when provided', () => {
    renderWithHelmet(<Seo image="https://washflow.solutions/custom.png" />);

    const meta = document.querySelector('meta[property="og:image"]');
    expect(meta?.getAttribute('content')).toBe(
      'https://washflow.solutions/custom.png',
    );
  });
});
