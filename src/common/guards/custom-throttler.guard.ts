import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    return false;
  }
}
