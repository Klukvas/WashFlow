import { CustomThrottlerGuard } from './custom-throttler.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('CustomThrottlerGuard', () => {
  it('extends ThrottlerGuard', () => {
    expect(CustomThrottlerGuard.prototype).toBeInstanceOf(ThrottlerGuard);
  });

  it('overrides canActivate to skip in test env', () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        CustomThrottlerGuard.prototype,
        'canActivate',
      ),
    ).toBe(true);
  });
});
