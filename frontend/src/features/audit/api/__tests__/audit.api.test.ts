import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuditLogs } from '../audit.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
  toPaginated: vi.fn((resp) => ({
    items: resp.data,
    meta: {
      total: resp.meta.total,
      page: resp.meta.page,
      limit: resp.meta.limit,
      totalPages: resp.meta.totalPages,
    },
  })),
}));

import { apiClient } from '@/shared/api/client';

describe('audit.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchAuditLogs calls GET /audit-logs with params', async () => {
    const mockLog = {
      id: 'al1',
      entityType: 'Order',
      entityId: 'o1',
      action: 'CREATE',
      performedById: 'u1',
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockLog],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchAuditLogs({
      entityType: 'Order',
      page: 1,
      limit: 20,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/audit-logs', {
      params: { entityType: 'Order', page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});
