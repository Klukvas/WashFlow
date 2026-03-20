import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsEnabledGuard } from './payments-enabled.guard';

describe('PaymentsEnabledGuard', () => {
  function createGuard(paymentsEnabled: boolean) {
    const config = { get: jest.fn().mockReturnValue(paymentsEnabled) };
    return new PaymentsEnabledGuard(config as unknown as ConfigService);
  }

  it('should allow when payments are enabled', () => {
    const guard = createGuard(true);
    expect(guard.canActivate()).toBe(true);
  });

  it('should throw ServiceUnavailableException when payments are disabled', () => {
    const guard = createGuard(false);
    expect(() => guard.canActivate()).toThrow(ServiceUnavailableException);
    expect(() => guard.canActivate()).toThrow(
      'Payments are currently disabled',
    );
  });
});
