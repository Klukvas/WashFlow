import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorkPosts, createWorkPost, updateWorkPost } from '../work-posts.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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

const mockWorkPost = { id: 'wp1', name: 'Post 1', branchId: 'b1' };

describe('work-posts.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchWorkPosts calls GET /work-posts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockWorkPost],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchWorkPosts({ branchId: 'b1', page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/work-posts', {
      params: { branchId: 'b1', page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('createWorkPost calls POST /work-posts', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockWorkPost },
    });

    const result = await createWorkPost({ name: 'Post 1', branchId: 'b1' });
    expect(apiClient.post).toHaveBeenCalledWith('/work-posts', { name: 'Post 1', branchId: 'b1' });
    expect(result.id).toBe('wp1');
  });

  it('updateWorkPost calls PATCH /work-posts/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockWorkPost, name: 'Updated' } },
    });

    const result = await updateWorkPost('wp1', { name: 'Updated' });
    expect(apiClient.patch).toHaveBeenCalledWith('/work-posts/wp1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });
});
