import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';

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

  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    if (this.config.get<string>('nodeEnv') === 'test') {
      return true;
    }
    return false;
  }
}
