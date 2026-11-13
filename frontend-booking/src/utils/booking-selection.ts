import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePublicAvailability } from '@/hooks/usePublicBooking';

type ServiceDuration = { id: string; durationMin: number };
type Slot = { start: string; available: boolean };
export type BookingSelection = { context: string; start: string };

export function bookingContext(
  tenant: string,
  branchId: string,
  date: string,
  serviceIds: string[],
  services: ServiceDuration[],
): string {
  return JSON.stringify([
    tenant,
    branchId,
    date,
    [...serviceIds]
      .sort()
      .map((id) => [
        id,
        services.find((service) => service.id === id)?.durationMin ?? null,
      ]),
  ]);
}

export function isFutureBookingSlot(slot: Slot, now = Date.now()): boolean {
  return slot.available && new Date(slot.start).getTime() > now;
}

export function isBookingSelectionCurrent(
  selection: BookingSelection | null,
  context: string,
  scheduledStart: string,
  availability:
    | { status: string; fetchStatus: string; data?: Slot[] }
    | undefined,
): boolean {
  return (
    !!selection &&
    selection.context === context &&
    selection.start === scheduledStart &&
    availability?.status === 'success' &&
    availability.fetchStatus === 'idle' &&
    !!availability.data?.some(
      (slot) => isFutureBookingSlot(slot) && slot.start === scheduledStart,
    )
  );
}

type BookingFields = {
  branchId: string;
  serviceIds: string[];
  scheduledStart: string;
};

type SelectionOptions = {
  tenant: string;
  date: string;
  services: ServiceDuration[];
  durationMinutes?: number;
  getValues: () => BookingFields;
  setScheduledStart: (start: string) => void;
};

export function useBookingSelection(options: SelectionOptions) {
  const [clock, setClock] = useState(0);
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  const selectionRef = useRef<BookingSelection | null>(null);
  const queryClient = useQueryClient();
  const {
    tenant,
    date,
    services,
    durationMinutes,
    getValues,
    setScheduledStart,
  } = options;
  const values = getValues();
  const params = { branchId: values.branchId, date, durationMinutes };
  const availability = usePublicAvailability(params);
  // Callers pass an inline setter; keep the expiry timer from restarting on every render.
  const setScheduledStartRef = useRef(setScheduledStart);
  useLayoutEffect(() => {
    setScheduledStartRef.current = setScheduledStart;
  }, [setScheduledStart]);
  // Re-render at the next expiry even when the availability response stays cached.
  useEffect(() => {
    const now = Date.now();
    const nextStart = availability.data
      ?.filter((slot) => isFutureBookingSlot(slot, now))
      .reduce(
        (earliest, slot) => Math.min(earliest, new Date(slot.start).getTime()),
        Infinity,
      );
    if (!nextStart || !Number.isFinite(nextStart)) return;
    const timeout = setTimeout(
      () => {
        if (
          selectionRef.current &&
          new Date(selectionRef.current.start).getTime() <= Date.now()
        ) {
          selectionRef.current = null;
          setSelection(null);
          setScheduledStartRef.current('');
        }
        setClock(Date.now());
      },
      Math.min(nextStart - now, 2_147_483_647),
    );
    return () => clearTimeout(timeout);
  }, [availability.data, clock]);
  const availabilityKey = ['widget', 'availability', params];
  const servicesKey = ['widget', 'services'];
  const context = bookingContext(
    tenant,
    values.branchId,
    date,
    values.serviceIds,
    services,
  );
  // A new context gets a distinct lifetime, including navigation back to the same values.
  const [contextVersion, setContextVersion] = useState({ context });
  const committedContext = useRef<typeof contextVersion | null>(null);
  useLayoutEffect(() => {
    committedContext.current = contextVersion;
    return () => {
      committedContext.current = null;
      selectionRef.current = null;
    };
  }, [contextVersion]);
  if (contextVersion.context !== context) {
    setContextVersion({ context });
    setSelection(null);
  }

  const hasSelectedSlot =
    values.serviceIds.length > 0 &&
    isBookingSelectionCurrent(
      selection,
      context,
      values.scheduledStart,
      availability,
    );

  function clearSelectedSlot() {
    selectionRef.current = null;
    setSelection(null);
    setScheduledStart('');
  }

  function selectSlot(start: string) {
    if (committedContext.current !== contextVersion) return;
    const next = { context, start };
    if (
      !isBookingSelectionCurrent(
        next,
        context,
        start,
        queryClient.getQueryState(availabilityKey),
      )
    )
      return;
    selectionRef.current = next;
    setSelection(next);
    setScheduledStart(start);
  }

  // Validation awaits a promise: read the cache and form again at the action boundary.
  function hasCurrentSelection(data: BookingFields = getValues()) {
    if (committedContext.current !== contextVersion) return false;
    const current = getValues();
    const liveServices =
      queryClient.getQueryData<ServiceDuration[]>(servicesKey) ?? [];
    const liveContext = bookingContext(
      tenant,
      current.branchId,
      date,
      current.serviceIds,
      liveServices,
    );
    return (
      data.branchId === current.branchId &&
      data.scheduledStart === current.scheduledStart &&
      JSON.stringify([...data.serviceIds].sort()) ===
        JSON.stringify([...current.serviceIds].sort()) &&
      isBookingSelectionCurrent(
        selectionRef.current,
        liveContext,
        data.scheduledStart,
        queryClient.getQueryState(availabilityKey),
      )
    );
  }

  return {
    hasSelectedSlot,
    clearSelectedSlot,
    selectSlot,
    hasCurrentSelection,
    rawSlots: availability.data?.filter((slot) => isFutureBookingSlot(slot)),
    slotsFetching: availability.isFetching,
  };
}
