import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected shouldSkip(_context: ExecutionContext): Promise<boolean> {
    const env = this.config.get<string>('nodeEnv');
    // Skip rate limiting in test and development — only enforce in production/staging
    if (env === 'test' || env === 'development') {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
}
