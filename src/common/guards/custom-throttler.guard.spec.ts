import { CustomThrottlerGuard } from './custom-throttler.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('CustomThrottlerGuard', () => {
  it('extends ThrottlerGuard', () => {
    expect(CustomThrottlerGuard.prototype).toBeInstanceOf(ThrottlerGuard);
  });

  it('does not override shouldSkip (rate limiting always active)', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        CustomThrottlerGuard.prototype,
        'shouldSkip',
      ),
    ).toBe(false);
  });
});
