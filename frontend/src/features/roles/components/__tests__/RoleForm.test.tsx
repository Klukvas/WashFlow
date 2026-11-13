import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RoleForm } from '../RoleForm';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('role form cancellation', () => {
  it('lets the user cancel an untouched create form without submitting', () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    render(<RoleForm onSubmit={submit} onCancel={cancel} />);
    expect(
      screen.getByRole('button', { name: 'actions.create' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
});
