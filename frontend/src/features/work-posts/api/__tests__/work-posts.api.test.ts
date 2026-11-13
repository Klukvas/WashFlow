import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorkPosts, createWorkPost, updateWorkPost } from '../work-posts.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },

}));

import { apiClient } from '@/shared/api/client';

const mockWorkPost = { id: 'wp1', name: 'Post 1', branchId: 'b1' };

describe('work-posts.api', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.clearAllMocks();
  });

  it('counts the complete branch-filtered array rather than timestamp-only metadata', async () => {
    const posts = Array.from({ length: 4 }, (_, index) => ({ ...mockWorkPost, id: `wp${index}` }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: posts, meta: { timestamp: '' } } });
    const result = await fetchWorkPosts({ branchId: 'b1', page: 1, limit: 2 });
    expect(apiClient.get).toHaveBeenCalledWith('/work-posts', { params: { branchId: 'b1' } });
    expect(result.items).toEqual(posts);
    expect(result.meta).toEqual({ total: 4, page: 1, limit: 4, totalPages: 1 });
  });

  it('recalculates counts for an empty branch and after the list changes', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { data: [], meta: { timestamp: '' } } })
      .mockResolvedValueOnce({ data: { data: [mockWorkPost], meta: { timestamp: '' } } });
    expect((await fetchWorkPosts({ branchId: 'b1' })).meta.total).toBe(0);
    expect((await fetchWorkPosts({ branchId: 'b1' })).meta.total).toBe(1);
  });

  it('rejects a malformed list instead of reporting an empty branch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: null, meta: { timestamp: '' } } });
    await expect(fetchWorkPosts({ branchId: 'b1' })).rejects.toThrow();
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
