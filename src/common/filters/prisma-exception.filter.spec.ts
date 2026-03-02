import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock ArgumentsHost that captures the Express response calls.
 * The returned references let individual tests assert on the exact arguments
 * passed to `status()` and `json()`.
 */
const buildHost = () => {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
  const mockGetRequest = jest
    .fn()
    .mockReturnValue({ method: 'POST', url: '/api/resource' });

  const host = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
    }),
  };

  return { host, mockStatus, mockJson };
};

/**
 * Builds a PrismaClientKnownRequestError with the given code and optional meta.
 */
const buildPrismaError = (
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: '7.4.1',
    meta,
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // P2002 — Unique constraint violation
  // -------------------------------------------------------------------------

  describe('P2002 — unique constraint violation', () => {
    it('responds with HTTP 409 CONFLICT', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    });

    it('includes the conflicting field name in the message', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe('A record with this email already exists');
    });

    it('joins multiple conflicting fields with ", "', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email', 'phone'] }),
        host as never,
      );
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe(
        'A record with this email, phone already exists',
      );
    });

    it('falls back to "field" when meta.target is absent', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2002'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe('A record with this field already exists');
    });

    it('falls back to "field" when meta.target is an empty array', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2002', { target: [] }), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      // An empty join produces "" which is falsy → falls back to 'field'
      expect(body.message).toBe('A record with this field already exists');
    });

    it('sets statusCode to 409 in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('sets error to "CONFLICT" (spaces, not underscores) in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.error).toBe('CONFLICT');
    });
  });

  // -------------------------------------------------------------------------
  // P2025 — Record not found
  // -------------------------------------------------------------------------

  describe('P2025 — record not found', () => {
    it('responds with HTTP 404 NOT_FOUND', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('sets message to "Record not found"', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe('Record not found');
    });

    it('sets statusCode to 404 in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('sets error to "NOT FOUND" in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.error).toBe('NOT FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // P2003 — Foreign key constraint failed
  // -------------------------------------------------------------------------

  describe('P2003 — foreign key constraint failed', () => {
    it('responds with HTTP 400 BAD_REQUEST', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(buildPrismaError('P2003'), host as never);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('sets message to the foreign key constraint description', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2003'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe(
        'Related record not found (foreign key constraint failed)',
      );
    });

    it('sets statusCode to 400 in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2003'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('sets error to "BAD REQUEST" in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2003'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.error).toBe('BAD REQUEST');
    });
  });

  // -------------------------------------------------------------------------
  // Unknown / unhandled Prisma codes
  // -------------------------------------------------------------------------

  describe('unknown Prisma error codes', () => {
    it('responds with HTTP 500 INTERNAL_SERVER_ERROR', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(buildPrismaError('P9999'), host as never);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('sets message to "Database error"', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P9999'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.message).toBe('Database error');
    });

    it('sets statusCode to 500 in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P9999'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('sets error to "INTERNAL SERVER ERROR" in the response body', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P9999'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(body.error).toBe('INTERNAL SERVER ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // Response shape — fields present on every response
  // -------------------------------------------------------------------------

  describe('response body shape', () => {
    it('always includes a timestamp ISO string', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof body.timestamp).toBe('string');
      expect(new Date(body.timestamp as string).toISOString()).toBe(
        body.timestamp,
      );
    });

    it('always includes statusCode, message, error, and timestamp keys', () => {
      const { host, mockJson } = buildHost();
      filter.catch(buildPrismaError('P2025'), host as never);
      const body = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(
        expect.arrayContaining(['statusCode', 'message', 'error', 'timestamp']),
      );
    });

    it('calls json() exactly once per exception', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      expect(mockJson).toHaveBeenCalledTimes(1);
    });

    it('calls status() exactly once per exception', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(
        buildPrismaError('P2002', { target: ['email'] }),
        host as never,
      );
      expect(mockStatus).toHaveBeenCalledTimes(1);
    });
  });
});
