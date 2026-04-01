import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from '../LanguageSwitcher';

const mockChangeLanguage = vi.fn();
let mockLanguage = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: mockLanguage,
      changeLanguage: mockChangeLanguage,
      t: (key: string) => key,
    },
  }),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguage = 'en';
  });

  it('renders a button', () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('switches from en to uk on click', async () => {
    mockLanguage = 'en';
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('uk');
  });

  it('switches from uk to en on click', async () => {
    mockLanguage = 'uk';
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('has an accessible aria-label', () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'common:language.switch');
  });
});
