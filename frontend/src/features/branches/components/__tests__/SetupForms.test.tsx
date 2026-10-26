import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BranchForm } from '../BranchForm';
import { BookingSettingsForm } from '../BookingSettingsForm';
import type { Branch, BookingSettings } from '@/shared/types/models';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
const branch = {
  id: 'branch',
  name: 'Main',
  timezone: 'Europe/Kyiv',
  address: '',
  phone: '',
} as Branch;
const settings = {
  id: 'settings',
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
  workingDays: [1],
  slotDurationMinutes: 30,
  bufferTimeMinutes: 10,
  maxAdvanceBookingDays: 30,
  allowOnlineBooking: false,
} as BookingSettings;
describe('setup form corrections', () => {
  it('a timezone-only edit is dirty and included in payload', async () => {
    const submit = vi.fn();
    render(<BranchForm branch={branch} onSubmit={submit} />);
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/fields.timezone/), {
      target: { value: 'America/New_York' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/New_York' }),
      ),
    );
  });
  it('preserves same-branch dirty draft, but resets when branch identity changes', () => {
    const { rerender } = render(
      <BranchForm branch={branch} onSubmit={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/fields.name/), {
      target: { value: 'Draft A' },
    });
    rerender(
      <BranchForm
        branch={{ ...branch, name: 'Server A' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/fields.name/)).toHaveValue('Draft A');
    rerender(
      <BranchForm
        branch={{ ...branch, id: 'branch-b', name: 'Branch B' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/fields.name/)).toHaveValue('Branch B');
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
  });
  it('first defaults save unchanged, while persisted edits still require changes', () => {
    const { rerender } = render(
      <BookingSettingsForm settings={null} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeEnabled();
    rerender(<BookingSettingsForm settings={settings} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
    expect(
      screen.getByLabelText('bookingFields.bufferTimeMinutes'),
    ).toHaveAttribute('max', '60');
    expect(screen.getByRole('button', { name: 'days.mon' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('background settings refetch does not overwrite dirty hours', () => {
    const { rerender } = render(
      <BookingSettingsForm settings={settings} onSubmit={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('bookingFields.workingHoursStart'), {
      target: { value: '10:00' },
    });
    rerender(
      <BookingSettingsForm
        settings={{ ...settings, workingHoursStart: '09:00' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText('bookingFields.workingHoursStart'),
    ).toHaveValue('10:00');
  });
});
