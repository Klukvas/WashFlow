import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const enabled = this.config.get<boolean>('features.paymentsEnabled');
    if (!enabled) {
      throw new ServiceUnavailableException('Payments are currently disabled');
    }
    return true;
  }
}
