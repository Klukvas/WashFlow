import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@/shared/types/enums';
import { ALLOWED_TRANSITIONS, ORDER_STATUS_CONFIG } from '../order-status';

describe('ALLOWED_TRANSITIONS', () => {
  it('has entries for every OrderStatus', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('BOOKED_PENDING_CONFIRMATION can go to BOOKED or CANCELLED', () => {
    const allowed = ALLOWED_TRANSITIONS[OrderStatus.BOOKED_PENDING_CONFIRMATION];
    expect(allowed).toContain(OrderStatus.BOOKED);
    expect(allowed).toContain(OrderStatus.CANCELLED);
    expect(allowed).toHaveLength(2);
  });

  it('BOOKED can go to IN_PROGRESS, CANCELLED, or NO_SHOW', () => {
    const allowed = ALLOWED_TRANSITIONS[OrderStatus.BOOKED];
    expect(allowed).toContain(OrderStatus.IN_PROGRESS);
    expect(allowed).toContain(OrderStatus.CANCELLED);
    expect(allowed).toContain(OrderStatus.NO_SHOW);
    expect(allowed).toHaveLength(3);
  });

  it('IN_PROGRESS can go to COMPLETED or CANCELLED', () => {
    const allowed = ALLOWED_TRANSITIONS[OrderStatus.IN_PROGRESS];
    expect(allowed).toContain(OrderStatus.COMPLETED);
    expect(allowed).toContain(OrderStatus.CANCELLED);
    expect(allowed).toHaveLength(2);
  });

  it('terminal states have no transitions', () => {
    expect(ALLOWED_TRANSITIONS[OrderStatus.COMPLETED]).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS[OrderStatus.CANCELLED]).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS[OrderStatus.NO_SHOW]).toHaveLength(0);
  });

  it('no transition leads to BOOKED_PENDING_CONFIRMATION', () => {
    for (const transitions of Object.values(ALLOWED_TRANSITIONS)) {
      expect(transitions).not.toContain(OrderStatus.BOOKED_PENDING_CONFIRMATION);
    }
  });
});

describe('ORDER_STATUS_CONFIG', () => {
  it('has a config for every OrderStatus', () => {
    for (const status of Object.values(OrderStatus)) {
      const config = ORDER_STATUS_CONFIG[status];
      expect(config).toBeDefined();
      expect(config.label).toBeTruthy();
      expect(config.color).toBeTruthy();
      expect(config.bgColor).toBeTruthy();
    }
  });
});
