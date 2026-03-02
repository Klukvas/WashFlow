import 'reflect-metadata';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal CallHandler that emits a single value through the
 * observable pipeline.
 */
const buildCallHandler = (value: unknown): CallHandler => ({
  handle: jest.fn().mockReturnValue(of(value)),
});

/**
 * Runs the interceptor synchronously and returns the emitted envelope.
 * The ExecutionContext is not used by this interceptor, so a stub suffices.
 */
const intercept = <T>(
  interceptor: TransformInterceptor<T>,
  value: unknown,
): Promise<unknown> => {
  const context = {} as ExecutionContext;
  const handler = buildCallHandler(value);
  return new Promise((resolve, reject) => {
    interceptor
      .intercept(context, handler)
      .subscribe({ next: resolve, error: reject });
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Plain (non-paginated) responses
  // -------------------------------------------------------------------------

  describe('plain (non-paginated) responses', () => {
    it('wraps a plain object in an envelope with a data key', async () => {
      const payload = { id: 1, name: 'Alice' };
      const result = (await intercept(interceptor, payload)) as Record<
        string,
        unknown
      >;
      expect(result.data).toEqual(payload);
    });

    it('includes a meta.timestamp ISO string for a plain object', async () => {
      const result = (await intercept(interceptor, { id: 1 })) as Record<
        string,
        { timestamp: string }
      >;
      expect(result.meta.timestamp).toBeDefined();
      expect(() => new Date(result.meta.timestamp)).not.toThrow();
      expect(new Date(result.meta.timestamp).toISOString()).toBe(
        result.meta.timestamp,
      );
    });

    it('does not include pagination fields in meta for a plain object', async () => {
      const result = (await intercept(interceptor, { id: 1 })) as {
        meta: Record<string, unknown>;
      };
      expect(result.meta.total).toBeUndefined();
      expect(result.meta.page).toBeUndefined();
      expect(result.meta.limit).toBeUndefined();
      expect(result.meta.totalPages).toBeUndefined();
    });

    it('wraps null in an envelope with data: null', async () => {
      const result = (await intercept(interceptor, null)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toBeNull();
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps undefined in an envelope with data: undefined', async () => {
      const result = (await intercept(interceptor, undefined)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toBeUndefined();
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps a primitive string in an envelope', async () => {
      const result = (await intercept(interceptor, 'hello')) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toBe('hello');
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps a numeric primitive in an envelope', async () => {
      const result = (await intercept(interceptor, 42)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toBe(42);
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps a boolean primitive in an envelope', async () => {
      const result = (await intercept(interceptor, false)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toBe(false);
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps an empty array in an envelope', async () => {
      const result = (await intercept(interceptor, [])) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toEqual([]);
      expect(result.meta.timestamp).toBeDefined();
    });

    it('wraps an object that has "items" but no "total" as a plain response', async () => {
      const payload = { items: [1, 2, 3] };
      const result = (await intercept(interceptor, payload)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      // Missing "total" → non-paginated branch
      expect(result.data).toEqual(payload);
      expect(result.meta.total).toBeUndefined();
    });

    it('wraps an object that has "total" but no "items" as a plain response', async () => {
      const payload = { total: 10 };
      const result = (await intercept(interceptor, payload)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      // Missing "items" → non-paginated branch
      expect(result.data).toEqual(payload);
      expect(result.meta.total).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Paginated responses
  // -------------------------------------------------------------------------

  describe('paginated responses (items + total present)', () => {
    const paginatedPayload = {
      items: [{ id: 1 }, { id: 2 }],
      total: 50,
      page: 2,
      limit: 10,
      totalPages: 5,
    };

    it('sets data to the items array', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        data: unknown;
      };
      expect(result.data).toBe(paginatedPayload.items);
    });

    it('sets meta.total from the response', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        meta: Record<string, unknown>;
      };
      expect(result.meta.total).toBe(50);
    });

    it('sets meta.page from the response', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        meta: Record<string, unknown>;
      };
      expect(result.meta.page).toBe(2);
    });

    it('sets meta.limit from the response', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        meta: Record<string, unknown>;
      };
      expect(result.meta.limit).toBe(10);
    });

    it('sets meta.totalPages from the response', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        meta: Record<string, unknown>;
      };
      expect(result.meta.totalPages).toBe(5);
    });

    it('includes a valid meta.timestamp for paginated response', async () => {
      const result = (await intercept(interceptor, paginatedPayload)) as {
        meta: { timestamp: string };
      };
      expect(new Date(result.meta.timestamp).toISOString()).toBe(
        result.meta.timestamp,
      );
    });

    it('handles a paginated payload with an empty items array', async () => {
      const emptyPaginated = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      const result = (await intercept(interceptor, emptyPaginated)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.page).toBe(1);
    });

    it('tolerates missing optional pagination fields (page / limit / totalPages)', async () => {
      // Only items and total are required for the branch to trigger
      const minimal = { items: ['a', 'b'], total: 2 };
      const result = (await intercept(interceptor, minimal)) as {
        data: unknown;
        meta: Record<string, unknown>;
      };
      expect(result.data).toEqual(['a', 'b']);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBeUndefined();
      expect(result.meta.limit).toBeUndefined();
      expect(result.meta.totalPages).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Observable plumbing
  // -------------------------------------------------------------------------

  describe('observable plumbing', () => {
    it('calls next.handle() exactly once', async () => {
      const handler = buildCallHandler({ id: 1 });
      await new Promise<void>((resolve) => {
        interceptor.intercept({} as ExecutionContext, handler).subscribe({
          next: () => resolve(),
        });
      });
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });
  });
});
