import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Returns the tracking key for rate limiting.
   * Uses the authenticated user's ID when available so that
   * one user cannot exhaust the rate limit for everyone sharing
   * the same IP (e.g. an office network).
   * Falls back to the client IP for unauthenticated requests.
   */
  protected async getTracker(
    req: Record<string, any>,
    _context?: unknown,
  ): Promise<string> {
    const user = req.user as { sub?: string } | undefined;
    if (user?.sub && typeof user.sub === 'string') {
      return `user-${user.sub}`;
    }
    return super.getTracker(req);
  }
}
