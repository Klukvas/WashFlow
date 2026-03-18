import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

export class AuthLoginEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_LOGIN;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      userId: string;
      email: string;
      ip?: string;
    },
  ) {
    super();
  }
}

export class AuthLoginFailedEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_LOGIN_FAILED;
  readonly tenantId = 'system';

  constructor(
    readonly payload: {
      email: string;
      reason: string;
      ip?: string;
    },
  ) {
    super();
  }
}

export class AuthPasswordChangedEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_PASSWORD_CHANGED;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      userId: string;
      email: string;
    },
  ) {
    super();
  }
}

export class AuthLogoutEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_LOGOUT;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      userId: string;
    },
  ) {
    super();
  }
}

export class SuperAdminTenantAccessEvent extends DomainEvent {
  readonly eventType = EventType.SUPERADMIN_TENANT_ACCESS;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      superAdminId: string;
      targetTenantId: string;
    },
  ) {
    super();
  }
}

export class AuthAccountLockedEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_ACCOUNT_LOCKED;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      userId: string;
      email: string;
      failedAttempts: number;
    },
  ) {
    super();
  }
}

export class AuthPasswordResetRequestedEvent extends DomainEvent {
  readonly eventType = EventType.AUTH_PASSWORD_RESET_REQUESTED;
  readonly tenantId = 'system';

  constructor(
    readonly payload: {
      email: string;
    },
  ) {
    super();
  }
}
