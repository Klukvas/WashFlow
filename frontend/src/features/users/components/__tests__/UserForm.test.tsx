import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/locales/en/common.json';
import uk from '@/i18n/locales/uk/common.json';
import { UserForm } from '../UserForm';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [] }),
}));

describe('user form validation', () => {
  it.each(['en', 'uk'] as const)(
    'explains invalid create fields in %s without Zod internals',
    async (language) => {
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        resources: { en: { common: en }, uk: { common: uk } },
      });
      const submit = vi.fn();
      const { container } = render(
        <I18nextProvider i18n={i18n}>
          <UserForm onSubmit={submit} onCancel={vi.fn()} />
        </I18nextProvider>,
      );
      const translations = language === 'uk' ? uk : en;
      const form = container.querySelector('form');
      if (!form) throw new Error('User form not rendered');
      fireEvent.submit(form);
      expect(
        await screen.findAllByText(translations.validation.required),
      ).toHaveLength(2);
      expect(
        screen.getByText(translations.validation.invalidEmail),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          language === 'uk'
            ? 'Пароль має містити щонайменше 8 символів'
            : 'Password must contain at least 8 characters',
        ),
      ).toBeInTheDocument();
      expect(container).not.toHaveTextContent('expected string');
      expect(submit).not.toHaveBeenCalled();
    },
  );
});
