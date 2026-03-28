import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: {
        response: { use: vi.fn() },
        request: { use: vi.fn() },
      },
    })),
  },
}));

import {
  fetchPublicServices,
  fetchPublicBranches,
  fetchPublicAvailability,
  createPublicBooking,
} from '../booking.api';

describe('booking.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchPublicServices calls GET /:slug/services', async () => {
    const services = [{ id: 's1', name: 'Wash' }];
    mockGet.mockResolvedValue({ data: { data: services } });

    const result = await fetchPublicServices('my-wash');

    expect(mockGet).toHaveBeenCalledWith('/my-wash/services');
    expect(result).toHaveLength(1);
  });

  it('fetchPublicBranches calls GET /:slug/branches', async () => {
    const branches = [{ id: 'b1', name: 'Main' }];
    mockGet.mockResolvedValue({ data: { data: branches } });

    const result = await fetchPublicBranches('my-wash');

    expect(mockGet).toHaveBeenCalledWith('/my-wash/branches');
    expect(result).toHaveLength(1);
  });

  it('fetchPublicAvailability calls GET /:slug/availability', async () => {
    const slots = [
      {
        start: '10:00',
        end: '10:30',
        workPostId: 'wp1',
        workPostName: 'Post 1',
        available: true,
      },
    ];
    mockGet.mockResolvedValue({ data: { data: slots } });

    const result = await fetchPublicAvailability('my-wash', {
      branchId: 'b1',
      date: '2026-03-10',
    });

    expect(mockGet).toHaveBeenCalledWith('/my-wash/availability', {
      params: { branchId: 'b1', date: '2026-03-10' },
    });
    expect(result[0].available).toBe(true);
  });

  it('createPublicBooking calls POST /:slug/book', async () => {
    const order = { id: 'o1', status: 'BOOKED_PENDING_CONFIRMATION' };
    mockPost.mockResolvedValue({ data: { data: order } });

    const payload = {
      branchId: 'b1',
      scheduledStart: '2026-03-10T10:00:00Z',
      serviceIds: ['s1'],
      firstName: 'John',
      phone: '+380991234567',
      licensePlate: 'AA1234BB',
    };

    const result = await createPublicBooking('my-wash', payload);

    expect(mockPost).toHaveBeenCalledWith(
      '/my-wash/book',
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
        }),
      }),
    );
    expect(result.id).toBe('o1');
  });
});
