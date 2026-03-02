import 'reflect-metadata';
import { PaginationDto } from './pagination.dto';
import {
  buildPaginationArgs,
  buildPaginationMeta,
  paginatedResponse,
} from './pagination.util';

function buildDto(overrides: Partial<PaginationDto> = {}): PaginationDto {
  return Object.assign(new PaginationDto(), {
    page: 1,
    limit: 20,
    sortOrder: 'asc' as const,
    ...overrides,
  });
}

describe('buildPaginationArgs', () => {
  describe('skip calculation', () => {
    it('returns skip=0 for the first page', () => {
      const dto = buildDto({ page: 1, limit: 20 });
      const { skip } = buildPaginationArgs(dto);
      expect(skip).toBe(0);
    });

    it('returns skip=20 for page 2 with limit 20', () => {
      const dto = buildDto({ page: 2, limit: 20 });
      const { skip } = buildPaginationArgs(dto);
      expect(skip).toBe(20);
    });

    it('returns skip=40 for page 3 with limit 20', () => {
      const dto = buildDto({ page: 3, limit: 20 });
      const { skip } = buildPaginationArgs(dto);
      expect(skip).toBe(40);
    });

    it('uses custom limit when calculating skip', () => {
      const dto = buildDto({ page: 4, limit: 10 });
      const { skip } = buildPaginationArgs(dto);
      expect(skip).toBe(30);
    });
  });

  describe('take value', () => {
    it('sets take equal to the dto limit', () => {
      const dto = buildDto({ limit: 20 });
      const { take } = buildPaginationArgs(dto);
      expect(take).toBe(20);
    });

    it('reflects a custom limit in take', () => {
      const dto = buildDto({ limit: 50 });
      const { take } = buildPaginationArgs(dto);
      expect(take).toBe(50);
    });
  });

  describe('orderBy — no sortBy provided', () => {
    it('defaults to createdAt desc when sortBy is absent', () => {
      const dto = buildDto();
      const { orderBy } = buildPaginationArgs(dto);
      expect(orderBy).toEqual({ createdAt: 'desc' });
    });

    it('defaults to createdAt desc when sortBy is undefined', () => {
      const dto = buildDto({ sortBy: undefined });
      const { orderBy } = buildPaginationArgs(dto);
      expect(orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('orderBy — sortBy provided', () => {
    it('uses the provided sortBy field as the key', () => {
      const dto = buildDto({ sortBy: 'name', sortOrder: 'asc' });
      const { orderBy } = buildPaginationArgs(dto);
      expect(orderBy).toEqual({ name: 'asc' });
    });

    it('respects sortOrder desc when sortBy is provided', () => {
      const dto = buildDto({ sortBy: 'createdAt', sortOrder: 'desc' });
      const { orderBy } = buildPaginationArgs(dto);
      expect(orderBy).toEqual({ createdAt: 'desc' });
    });

    it('falls back to asc when sortBy is provided but sortOrder is missing', () => {
      const dto = buildDto({ sortBy: 'updatedAt' });
      // Simulate the edge case: sortOrder is omitted after object construction
      delete (dto as Partial<PaginationDto>).sortOrder;
      const { orderBy } = buildPaginationArgs(dto);
      expect(orderBy).toEqual({ updatedAt: 'asc' });
    });
  });

  describe('return shape', () => {
    it('returns an object with exactly skip, take, and orderBy keys', () => {
      const dto = buildDto();
      const result = buildPaginationArgs(dto);
      expect(Object.keys(result)).toEqual(['skip', 'take', 'orderBy']);
    });
  });
});

describe('buildPaginationMeta', () => {
  it('returns the total passed in', () => {
    const dto = buildDto({ page: 1, limit: 20 });
    const { total } = buildPaginationMeta(100, dto);
    expect(total).toBe(100);
  });

  it('returns the current page from the dto', () => {
    const dto = buildDto({ page: 3, limit: 20 });
    const { page } = buildPaginationMeta(100, dto);
    expect(page).toBe(3);
  });

  it('returns the limit from the dto', () => {
    const dto = buildDto({ page: 1, limit: 25 });
    const { limit } = buildPaginationMeta(100, dto);
    expect(limit).toBe(25);
  });

  it('calculates totalPages correctly when total divides evenly', () => {
    const dto = buildDto({ limit: 10 });
    const { totalPages } = buildPaginationMeta(100, dto);
    expect(totalPages).toBe(10);
  });

  it('rounds totalPages up when there is a remainder (ceil)', () => {
    const dto = buildDto({ limit: 10 });
    const { totalPages } = buildPaginationMeta(101, dto);
    expect(totalPages).toBe(11);
  });

  it('returns totalPages=1 when total equals the limit exactly', () => {
    const dto = buildDto({ limit: 20 });
    const { totalPages } = buildPaginationMeta(20, dto);
    expect(totalPages).toBe(1);
  });

  it('returns totalPages=1 when total is less than the limit', () => {
    const dto = buildDto({ limit: 20 });
    const { totalPages } = buildPaginationMeta(7, dto);
    expect(totalPages).toBe(1);
  });

  it('returns totalPages=0 when total is zero', () => {
    const dto = buildDto({ limit: 20 });
    const { totalPages } = buildPaginationMeta(0, dto);
    expect(totalPages).toBe(0);
  });

  it('returns the correct shape with all four keys', () => {
    const dto = buildDto({ page: 2, limit: 10 });
    const result = buildPaginationMeta(55, dto);
    expect(result).toEqual({
      total: 55,
      page: 2,
      limit: 10,
      totalPages: 6,
    });
  });
});

describe('paginatedResponse', () => {
  it('includes the items array in the response', () => {
    const dto = buildDto({ page: 1, limit: 20 });
    const items = [{ id: 1 }, { id: 2 }];
    const result = paginatedResponse(items, 2, dto);
    expect(result.items).toBe(items);
  });

  it('spreads pagination meta alongside items', () => {
    const dto = buildDto({ page: 2, limit: 10 });
    const items = [{ id: 'a' }];
    const result = paginatedResponse(items, 45, dto);
    expect(result).toEqual({
      items,
      total: 45,
      page: 2,
      limit: 10,
      totalPages: 5,
    });
  });

  it('handles an empty items array', () => {
    const dto = buildDto({ page: 1, limit: 20 });
    const result = paginatedResponse([], 0, dto);
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it('works with generic item types (strings)', () => {
    const dto = buildDto({ limit: 5 });
    const items = ['alpha', 'beta', 'gamma'];
    const result = paginatedResponse(items, 3, dto);
    expect(result.items).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.totalPages).toBe(1);
  });

  it('does not mutate the items array', () => {
    const dto = buildDto();
    const items = [{ id: 1 }];
    const original = [...items];
    paginatedResponse(items, 1, dto);
    expect(items).toEqual(original);
  });
});
