import 'reflect-metadata';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockHost {
  host: {
    switchToHttp: jest.Mock;
  };
  mockStatus: jest.Mock;
  mockJson: jest.Mock;
}

/**
 * Builds a mock ArgumentsHost for a request against the given method + url.
 */
const buildHost = (method = 'GET', url = '/test'): MockHost => {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

  const host = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue({ status: mockStatus }),
      getRequest: jest.fn().mockReturnValue({ method, url }),
    }),
  };

  return { host, mockStatus, mockJson };
};

/** Extracts the single JSON body that was sent in a test. */
const captureBody = (mockJson: jest.Mock): Record<string, unknown> =>
  mockJson.mock.calls[0][0] as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  // -------------------------------------------------------------------------
  // HttpException — string response
  // -------------------------------------------------------------------------

  describe('HttpException with string response', () => {
    it('uses the HTTP status from the exception', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
        host as never,
      );
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('uses the string as the message', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException('Forbidden resource', HttpStatus.FORBIDDEN),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.message).toBe('Forbidden resource');
    });

    it('keeps the default error value when the string response carries none', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED),
        host as never,
      );
      const body = captureBody(mockJson);
      // error field stays at its initialised value 'Internal Server Error'
      // because a plain string response has no error key to override it
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // -------------------------------------------------------------------------
  // HttpException — object response with message + error
  // -------------------------------------------------------------------------

  describe('HttpException with object response', () => {
    it('uses message from the object', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          { message: 'Custom message', error: 'Custom Error' },
          HttpStatus.BAD_REQUEST,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.message).toBe('Custom message');
    });

    it('uses error from the object', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          { message: 'Bad input', error: 'Validation Error' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.error).toBe('Validation Error');
    });

    it('sets the correct HTTP status from the exception', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(
        new HttpException({ message: 'Gone', error: 'Gone' }, HttpStatus.GONE),
        host as never,
      );
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.GONE);
    });

    it('keeps "Internal Server Error" as error fallback when object has no error key', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          { message: 'Only a message' },
          HttpStatus.BAD_REQUEST,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.error).toBe('Internal Server Error');
    });

    it('keeps "Internal server error" as message fallback when object message is absent', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException({ error: 'Bad Request' }, HttpStatus.BAD_REQUEST),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.message).toBe('Internal server error');
    });
  });

  // -------------------------------------------------------------------------
  // HttpException — array message (class-validator validation errors)
  // -------------------------------------------------------------------------

  describe('HttpException with array message (validation errors)', () => {
    it('joins array items with ", "', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          {
            message: ['name must not be empty', 'email must be valid'],
            error: 'Bad Request',
          },
          HttpStatus.BAD_REQUEST,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.message).toBe('name must not be empty, email must be valid');
    });

    it('handles a single-element array message', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          { message: ['email is required'], error: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.message).toBe('email is required');
    });

    it('produces an empty string message for an empty array', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException(
          { message: [], error: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        ),
        host as never,
      );
      const body = captureBody(mockJson);
      // Array.isArray([]) is true, so the ternary short-circuits to join('')
      // which yields '' — the fallback path is not reached for array inputs.
      expect(body.message).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Plain Error — environment-dependent message exposure
  // -------------------------------------------------------------------------

  describe('plain Error exception', () => {
    it('exposes the error message in development mode', () => {
      process.env.NODE_ENV = 'development';
      const { host, mockJson } = buildHost();
      filter.catch(new Error('Something broke'), host as never);
      const body = captureBody(mockJson);
      expect(body.message).toBe('Something broke');
    });

    it('hides the error message in production mode', () => {
      process.env.NODE_ENV = 'production';
      const { host, mockJson } = buildHost();
      filter.catch(new Error('DB credentials: admin/secret'), host as never);
      const body = captureBody(mockJson);
      expect(body.message).toBe('Internal server error');
    });

    it('hides the error message in "test" mode (only development exposes it)', () => {
      process.env.NODE_ENV = 'test';
      const { host, mockJson } = buildHost();
      filter.catch(new Error('Sensitive detail'), host as never);
      const body = captureBody(mockJson);
      // The implementation exposes the message only when NODE_ENV === 'development';
      // every other value, including 'test', returns the generic message.
      expect(body.message).toBe('Internal server error');
    });

    it('responds with HTTP 500', () => {
      const { host, mockStatus } = buildHost();
      filter.catch(new Error('Boom'), host as never);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('sets error to "Internal Server Error"', () => {
      const { host, mockJson } = buildHost();
      filter.catch(new Error('Boom'), host as never);
      const body = captureBody(mockJson);
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // -------------------------------------------------------------------------
  // Non-Error exceptions (thrown primitives, objects, etc.)
  // -------------------------------------------------------------------------

  describe('non-Error exception (thrown primitive)', () => {
    it('responds with HTTP 500', () => {
      const { host, mockStatus } = buildHost();
      filter.catch('just a string thrown', host as never);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('uses the default message "Internal server error"', () => {
      const { host, mockJson } = buildHost();
      filter.catch(12345, host as never);
      const body = captureBody(mockJson);
      expect(body.message).toBe('Internal server error');
    });

    it('uses the default error "Internal Server Error"', () => {
      const { host, mockJson } = buildHost();
      filter.catch({ weird: true }, host as never);
      const body = captureBody(mockJson);
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // -------------------------------------------------------------------------
  // Logging behaviour
  // -------------------------------------------------------------------------

  describe('logging', () => {
    it('logs the error for a plain Error (status 500)', () => {
      const { host } = buildHost('GET', '/api/fail');
      filter.catch(new Error('Server crash'), host as never);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('passes the exception stack to the logger for Error instances', () => {
      const err = new Error('With stack');
      const { host } = buildHost();
      filter.catch(err, host as never);
      const [, secondArg] = loggerErrorSpy.mock.calls[0] as [string, string];
      expect(secondArg).toBe(err.stack);
    });

    it('stringifies non-Error exceptions when logging', () => {
      const { host } = buildHost();
      filter.catch('raw string', host as never);
      const [, secondArg] = loggerErrorSpy.mock.calls[0] as [string, string];
      expect(secondArg).toBe('raw string');
    });

    it('includes method and url in the log message', () => {
      const { host } = buildHost('DELETE', '/api/users/1');
      filter.catch(new Error('Oops'), host as never);
      const [firstArg] = loggerErrorSpy.mock.calls[0] as [string];
      expect(firstArg).toContain('DELETE');
      expect(firstArg).toContain('/api/users/1');
    });

    it('includes the status code in the log message', () => {
      const { host } = buildHost();
      filter.catch(new Error('Oops'), host as never);
      const [firstArg] = loggerErrorSpy.mock.calls[0] as [string];
      expect(firstArg).toContain('500');
    });

    it('does NOT log for a 404 HttpException', () => {
      const { host } = buildHost();
      filter.catch(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
        host as never,
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('does NOT log for a 400 HttpException', () => {
      const { host } = buildHost();
      filter.catch(
        new HttpException('Bad request', HttpStatus.BAD_REQUEST),
        host as never,
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('does NOT log for a 401 HttpException', () => {
      const { host } = buildHost();
      filter.catch(
        new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED),
        host as never,
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('DOES log for an HttpException with status 500', () => {
      const { host } = buildHost();
      filter.catch(
        new HttpException('Server Error', HttpStatus.INTERNAL_SERVER_ERROR),
        host as never,
      );
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Response body shape
  // -------------------------------------------------------------------------

  describe('response body shape', () => {
    it('includes statusCode', () => {
      const { host, mockJson } = buildHost();
      filter.catch(
        new HttpException('Bad', HttpStatus.BAD_REQUEST),
        host as never,
      );
      const body = captureBody(mockJson);
      expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('includes a valid timestamp ISO string', () => {
      const { host, mockJson } = buildHost();
      filter.catch(new Error('Oops'), host as never);
      const body = captureBody(mockJson);
      expect(typeof body.timestamp).toBe('string');
      expect(new Date(body.timestamp as string).toISOString()).toBe(
        body.timestamp,
      );
    });

    it('includes path matching the request url', () => {
      const { host, mockJson } = buildHost('GET', '/api/orders/42');
      filter.catch(new Error('Oops'), host as never);
      const body = captureBody(mockJson);
      expect(body.path).toBe('/api/orders/42');
    });

    it('always contains statusCode, message, error, timestamp, and path keys', () => {
      const { host, mockJson } = buildHost();
      filter.catch(new Error('Oops'), host as never);
      const body = captureBody(mockJson);
      expect(Object.keys(body)).toEqual(
        expect.arrayContaining([
          'statusCode',
          'message',
          'error',
          'timestamp',
          'path',
        ]),
      );
    });

    it('calls status() and json() exactly once per exception', () => {
      const { host, mockStatus, mockJson } = buildHost();
      filter.catch(
        new HttpException('Bad', HttpStatus.BAD_REQUEST),
        host as never,
      );
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledTimes(1);
    });
  });
});
