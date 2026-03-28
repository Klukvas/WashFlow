import { Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  readonly name: string;
  readonly failureThreshold?: number;
  readonly resetTimeoutMs?: number;
}

/**
 * Simple circuit breaker for external service calls.
 *
 * - CLOSED: requests pass through; consecutive failures are counted.
 * - OPEN: requests are rejected immediately with CircuitOpenError.
 * - HALF_OPEN: one probe request is allowed through to test recovery.
 *
 * Each external service should get its own CircuitBreaker instance.
 */
export class CircuitBreaker {
  private readonly logger: Logger;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(config: CircuitBreakerConfig) {
    this.logger = new Logger(`CircuitBreaker:${config.name}`);
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
  }

  /** Returns the current circuit state (for observability / logging). */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Executes `fn` through the circuit breaker.
   *
   * - CLOSED: runs fn, tracks failures.
   * - OPEN: rejects immediately if reset timeout has not elapsed,
   *         otherwise transitions to HALF_OPEN and allows one probe.
   * - HALF_OPEN: runs fn; success closes the circuit, failure re-opens it.
   */
  async fire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(
          `Circuit breaker is OPEN — calls are being rejected`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    this.logger.warn(
      `State transition: ${this.state} -> ${newState} (failures: ${this.failureCount})`,
    );
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }
}

/** Thrown when the circuit is OPEN and calls are being rejected. */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
