import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaddleWebhookService } from './paddle-webhook.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { SubscriptionStatus } from './plan.constants';
import { EventType } from '../../common/events/event-types';
import { WEBHOOK_REDIS } from './subscriptions.constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PADDLE_SUB_ID = 'sub_01abc123def456';
const PADDLE_CUSTOMER_ID = 'ctm_01xyz789';
const WEBHOOK_SECRET = 'test-webhook-secret-32-chars-long';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-internal-1',
  tenantId: TENANT_ID,
  paddleSubscriptionId: PADDLE_SUB_ID,
  planTier: 'STARTER',
  billingInterval: 'MONTHLY',
  status: 'ACTIVE',
  paddleStatus: 'active',
  isTrial: false,
  trialEndsAt: null,
  currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
  cancelledAt: null,
  cancelEffectiveAt: null,
  addons: [],
  ...overrides,
});

const makeSubscriptionCreatedData = (
  overrides: Record<string, unknown> = {},
) => ({
  id: PADDLE_SUB_ID,
  customer_id: PADDLE_CUSTOMER_ID,
  custom_data: { tenantId: TENANT_ID },
  billing_cycle: { interval: 'month' },
  items: [
    {
      price: {
        custom_data: { plan_tier: 'BUSINESS' },
      },
    },
  ],
  current_billing_period: {
    starts_at: '2026-03-01T00:00:00Z',
    ends_at: '2026-04-01T00:00:00Z',
  },
  ...overrides,
});

const makePaddleEvent = (
  eventType: string,
  data: Record<string, unknown>,
  eventId = 'evt_unique_001',
) => ({
  event_id: eventId,
  event_type: eventType,
  data,
});

// ---------------------------------------------------------------------------
// HMAC helper — produces a valid Paddle-Signature header value
// ---------------------------------------------------------------------------

function currentTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function buildSignatureHeader(
  rawBody: string,
  secret: string,
  ts = currentTs(),
): string {
  const hash = createHmac('sha256', secret)
    .update(`${ts}:${rawBody}`)
    .digest('hex');
  return `ts=${ts};h1=${hash}`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaddleWebhookService', () => {
  let service: PaddleWebhookService;
  let configService: { get: jest.Mock };
  let subscriptionsRepo: {
    update: jest.Mock;
    findByPaddleSubscriptionId: jest.Mock;
    upsertAddon: jest.Mock;
    deleteAddon: jest.Mock;
    findAddons: jest.Mock;
  };
  let subscriptionsService: { recalculateEffectiveLimits: jest.Mock };
  let eventDispatcher: { dispatch: jest.Mock };
  let redisMock: { set: jest.Mock; del: jest.Mock; quit: jest.Mock };

  let eventCounter = 0;
  const uniqueEventId = () => `evt_${++eventCounter}_${Date.now()}`;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'paddle.webhookSecret') return WEBHOOK_SECRET;
        return defaultValue ?? undefined;
      }),
    };

    subscriptionsRepo = {
      update: jest.fn().mockResolvedValue(undefined),
      findByPaddleSubscriptionId: jest
        .fn()
        .mockResolvedValue(makeSubscription()),
      upsertAddon: jest.fn().mockResolvedValue(undefined),
      deleteAddon: jest.fn().mockResolvedValue(undefined),
      findAddons: jest.fn().mockResolvedValue([]),
    };

    subscriptionsService = {
      recalculateEffectiveLimits: jest.fn().mockResolvedValue(undefined),
    };

    eventDispatcher = {
      dispatch: jest.fn(),
    };

    // Redis mock: set with NX returns 'OK' on first call, null on duplicate
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddleWebhookService,
        { provide: ConfigService, useValue: configService },
        { provide: SubscriptionsRepository, useValue: subscriptionsRepo },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: EventDispatcherService, useValue: eventDispatcher },
        { provide: WEBHOOK_REDIS, useValue: redisMock },
      ],
    }).compile();

    service = module.get<PaddleWebhookService>(PaddleWebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // verifySignature()
  // =========================================================================

  describe('verifySignature()', () => {
    // -----------------------------------------------------------------------
    // Valid signature
    // -----------------------------------------------------------------------

    describe('valid signatures', () => {
      it('returns true for a correctly signed payload', () => {
        const rawBody = '{"event_type":"subscription.created"}';
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);

        expect(service.verifySignature(rawBody, header)).toBe(true);
      });

      it('returns true when rawBody is an empty string', () => {
        const rawBody = '';
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);

        expect(service.verifySignature(rawBody, header)).toBe(true);
      });

      it('returns true for a complex JSON body', () => {
        const rawBody = JSON.stringify({
          event_type: 'transaction.completed',
          data: { id: 'txn_001', amount: 9900 },
        });
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);

        expect(service.verifySignature(rawBody, header)).toBe(true);
      });

      it('uses the timestamp from the header in signed payload construction', () => {
        const rawBody = 'body-content';
        const ts = currentTs();
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, ts);

        expect(service.verifySignature(rawBody, header)).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // Invalid signature
    // -----------------------------------------------------------------------

    describe('invalid signatures', () => {
      it('returns false when the hash does not match the body', () => {
        const rawBody = '{"event_type":"subscription.created"}';
        const tamperedBody = '{"event_type":"subscription.canceled"}';
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);

        expect(service.verifySignature(tamperedBody, header)).toBe(false);
      });

      it('returns false when the secret used to sign differs from the configured secret', () => {
        const rawBody = '{"event_type":"subscription.created"}';
        const header = buildSignatureHeader(rawBody, 'wrong-secret-value');

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      it('returns false when h1 hash has been tampered with', () => {
        const rawBody = 'payload';
        const ts = currentTs();
        const header = `ts=${ts};h1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`;

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      it('returns false when h1 value has wrong hex length (timingSafeEqual throws)', () => {
        const rawBody = 'payload';
        const ts = currentTs();
        const header = `ts=${ts};h1=tooshort`;

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      describe('timestamp tolerance (deterministic with fake timers)', () => {
        const FIXED_TIME = new Date('2026-06-15T12:00:00Z').getTime();

        beforeEach(() => {
          jest.useFakeTimers();
          jest.setSystemTime(FIXED_TIME);
        });

        afterEach(() => {
          jest.useRealTimers();
        });

        it('returns false when timestamp is older than 5 minutes (replay attack)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const staleTs = String(Math.floor(FIXED_TIME / 1000) - 400);
          const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, staleTs);

          expect(service.verifySignature(rawBody, header)).toBe(false);
        });

        it('returns false when timestamp is in the far future', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const futureTs = String(Math.floor(FIXED_TIME / 1000) + 400);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            futureTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(false);
        });

        it('returns true at exactly 300 seconds in the past (boundary, tolerance is > 300)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const boundaryTs = String(Math.floor(FIXED_TIME / 1000) - 300);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            boundaryTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(true);
        });

        it('returns false at 301 seconds in the past (just beyond tolerance)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const beyondTs = String(Math.floor(FIXED_TIME / 1000) - 301);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            beyondTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(false);
        });

        it('returns true at 299 seconds in the past (within tolerance)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const withinTs = String(Math.floor(FIXED_TIME / 1000) - 299);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            withinTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(true);
        });

        it('returns true at exactly 300 seconds in the future (boundary, tolerance is > 300)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const boundaryTs = String(Math.floor(FIXED_TIME / 1000) + 300);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            boundaryTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(true);
        });

        it('returns false at 301 seconds in the future (just beyond tolerance)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const beyondTs = String(Math.floor(FIXED_TIME / 1000) + 301);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            beyondTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(false);
        });

        it('returns true at 299 seconds in the future (within tolerance)', () => {
          const rawBody = '{"event_type":"subscription.created"}';
          const withinTs = String(Math.floor(FIXED_TIME / 1000) + 299);
          const header = buildSignatureHeader(
            rawBody,
            WEBHOOK_SECRET,
            withinTs,
          );

          expect(service.verifySignature(rawBody, header)).toBe(true);
        });
      });

      it('returns false when timestamp is not a number', () => {
        const rawBody = 'payload';
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, 'abc');

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Missing fields
    // -----------------------------------------------------------------------

    describe('missing header fields', () => {
      it('returns false when the ts field is absent', () => {
        const rawBody = 'payload';
        const ts = currentTs();
        const validHash = createHmac('sha256', WEBHOOK_SECRET)
          .update(`${ts}:${rawBody}`)
          .digest('hex');
        const header = `h1=${validHash}`;

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      it('returns false when the h1 field is absent', () => {
        const rawBody = 'payload';
        const header = `ts=${currentTs()}`;

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      it('returns false for a completely empty signature header', () => {
        expect(service.verifySignature('payload', '')).toBe(false);
      });

      it('returns false when header contains only unrecognised fields', () => {
        expect(service.verifySignature('payload', 'v1=abc;v2=def')).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Dev mode (no secret configured)
    // -----------------------------------------------------------------------

    describe('dev mode — no secret configured', () => {
      beforeEach(async () => {
        configService.get.mockImplementation(
          (key: string, defaultValue?: unknown) => {
            if (key === 'paddle.webhookSecret') return '';
            return defaultValue ?? undefined;
          },
        );

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            PaddleWebhookService,
            { provide: ConfigService, useValue: configService },
            { provide: SubscriptionsRepository, useValue: subscriptionsRepo },
            { provide: SubscriptionsService, useValue: subscriptionsService },
            { provide: EventDispatcherService, useValue: eventDispatcher },
            { provide: WEBHOOK_REDIS, useValue: redisMock },
          ],
        }).compile();

        service = module.get<PaddleWebhookService>(PaddleWebhookService);
      });

      it('returns true regardless of what signature header is provided', () => {
        expect(service.verifySignature('any-body', 'ts=1;h1=garbage')).toBe(
          true,
        );
      });

      it('returns true even when signature header is empty', () => {
        expect(service.verifySignature('any-body', '')).toBe(true);
      });

      it('returns true for a completely invalid header format', () => {
        expect(
          service.verifySignature('body', 'totally-invalid-header-value'),
        ).toBe(true);
      });
    });
  });

  // =========================================================================
  // processEvent()
  // =========================================================================

  describe('processEvent()', () => {
    // -----------------------------------------------------------------------
    // Idempotency
    // -----------------------------------------------------------------------

    describe('idempotency', () => {
      it('processes the event only once for the same event_id', async () => {
        const eventId = uniqueEventId();
        const data = makeSubscriptionCreatedData();
        const event = makePaddleEvent('subscription.created', data, eventId);

        // First call: Redis SET NX returns 'OK' (key didn't exist)
        redisMock.set.mockResolvedValueOnce('OK');
        await service.processEvent(event);

        // Second call: Redis SET NX returns null (key already exists)
        redisMock.set.mockResolvedValueOnce(null);
        await service.processEvent(event);

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
      });

      it('does not call update on the second call with the same event_id', async () => {
        const eventId = uniqueEventId();
        const data = makeSubscriptionCreatedData();
        const event = makePaddleEvent('subscription.created', data, eventId);

        redisMock.set.mockResolvedValueOnce('OK');
        await service.processEvent(event);
        subscriptionsRepo.update.mockClear();

        redisMock.set.mockResolvedValueOnce(null);
        await service.processEvent(event);

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('processes two distinct events with different event IDs', async () => {
        const data = makeSubscriptionCreatedData();

        redisMock.set.mockResolvedValue('OK');
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(2);
      });

      it('calls Redis SET with NX and EX flags for idempotency', async () => {
        const eventId = uniqueEventId();
        const data = makeSubscriptionCreatedData();
        const event = makePaddleEvent('subscription.created', data, eventId);

        await service.processEvent(event);

        expect(redisMock.set).toHaveBeenCalledWith(
          eventId,
          '1',
          'EX',
          86400,
          'NX',
        );
      });

      it('deletes idempotency key when handler throws so Paddle can retry', async () => {
        const eventId = uniqueEventId();
        subscriptionsRepo.update.mockRejectedValueOnce(new Error('DB error'));

        const event = makePaddleEvent(
          'subscription.created',
          makeSubscriptionCreatedData(),
          eventId,
        );

        await expect(service.processEvent(event)).rejects.toThrow('DB error');
        expect(redisMock.del).toHaveBeenCalledWith(eventId);
      });

      it('does not delete idempotency key on successful processing', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(redisMock.del).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Unknown event types
    // -----------------------------------------------------------------------

    describe('unknown event types', () => {
      it('does not call update or recalculateEffectiveLimits for an unknown event type', async () => {
        const event = makePaddleEvent(
          'some.unknown.event',
          { id: PADDLE_SUB_ID },
          uniqueEventId(),
        );

        await service.processEvent(event);

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).not.toHaveBeenCalled();
      });

      it('does not dispatch any event for an unknown event type', async () => {
        const event = makePaddleEvent(
          'customer.created',
          { id: 'ctm_001' },
          uniqueEventId(),
        );

        await service.processEvent(event);

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });

      it('still marks the unknown event as processed (no duplicate processing)', async () => {
        const eventId = uniqueEventId();
        const event = makePaddleEvent(
          'some.unknown.event',
          { id: PADDLE_SUB_ID },
          eventId,
        );

        redisMock.set.mockResolvedValueOnce('OK');
        await service.processEvent(event);

        redisMock.set.mockResolvedValueOnce(null);
        await service.processEvent(event);

        // Neither call triggers any side-effect, proving idempotency still runs
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.created
    // -----------------------------------------------------------------------

    describe('subscription.created', () => {
      it('calls subscriptionsRepo.update with correct fields', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            paddleSubscriptionId: PADDLE_SUB_ID,
            paddleCustomerId: PADDLE_CUSTOMER_ID,
            paddleStatus: 'active',
            status: SubscriptionStatus.ACTIVE,
            isTrial: false,
            trialEndsAt: null,
          }),
        );
      });

      it('sets planTier from items[0].price.custom_data.plan_tier', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.planTier).toBe('BUSINESS');
      });

      it('falls back to planTier from subscription custom_data when items have none', async () => {
        const data = makeSubscriptionCreatedData({
          items: [{ price: {} }],
          custom_data: { tenantId: TENANT_ID, planTier: 'ENTERPRISE' },
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.planTier).toBe('ENTERPRISE');
      });

      it('falls back to STARTER when no plan tier can be extracted', async () => {
        const data = makeSubscriptionCreatedData({
          items: [{ price: {} }],
          custom_data: { tenantId: TENANT_ID },
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.planTier).toBe('STARTER');
      });

      it('sets billingInterval to MONTHLY when billing_cycle.interval is "month"', async () => {
        const data = makeSubscriptionCreatedData({
          billing_cycle: { interval: 'month' },
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.billingInterval).toBe('MONTHLY');
      });

      it('sets billingInterval to YEARLY when billing_cycle.interval is "year"', async () => {
        const data = makeSubscriptionCreatedData({
          billing_cycle: { interval: 'year' },
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.billingInterval).toBe('YEARLY');
      });

      it('sets currentPeriodStart and currentPeriodEnd from current_billing_period', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.currentPeriodStart).toEqual(
          new Date('2026-03-01T00:00:00Z'),
        );
        expect(updatePayload.currentPeriodEnd).toEqual(
          new Date('2026-04-01T00:00:00Z'),
        );
      });

      it('calls recalculateEffectiveLimits with the tenantId', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).toHaveBeenCalledTimes(1);
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).toHaveBeenCalledWith(TENANT_ID);
      });

      it('dispatches a SubscriptionActivatedEvent', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.eventType).toBe(EventType.SUBSCRIPTION_ACTIVATED);
      });

      it('dispatches event with correct tenantId and paddleSubscriptionId', async () => {
        const data = makeSubscriptionCreatedData();
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.tenantId).toBe(TENANT_ID);
        expect(event.payload.paddleSubscriptionId).toBe(PADDLE_SUB_ID);
      });

      it('does not call update when tenantId is missing from custom_data', async () => {
        const data = makeSubscriptionCreatedData({ custom_data: undefined });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).not.toHaveBeenCalled();
        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });

      it('does not call update when custom_data is present but tenantId is empty', async () => {
        const data = makeSubscriptionCreatedData({
          custom_data: { tenantId: '' },
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('syncs addon items from webhook data on subscription.created', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 2 },
            { price: { id: 'pri_addon_users' }, quantity: 1 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
          2,
          'pri_addon_branches',
        );
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'users',
          1,
          'pri_addon_users',
        );
      });
    });

    // -----------------------------------------------------------------------
    // subscription.canceled
    // -----------------------------------------------------------------------

    describe('subscription.canceled', () => {
      it('calls subscriptionsRepo.update with CANCELLED status', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.CANCELLED,
            paddleStatus: 'canceled',
          }),
        );
      });

      it('sets cancelEffectiveAt from current_billing_period.ends_at', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.cancelEffectiveAt).toEqual(
          new Date('2026-04-01T00:00:00Z'),
        );
      });

      it('sets cancelledAt to a Date value', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.cancelledAt).toBeInstanceOf(Date);
      });

      it('dispatches a SubscriptionCancelledEvent', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.eventType).toBe(EventType.SUBSCRIPTION_CANCELLED);
      });

      it('dispatches event with tenantId and paddleSubscriptionId', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.tenantId).toBe(TENANT_ID);
        expect(event.payload.paddleSubscriptionId).toBe(PADDLE_SUB_ID);
      });

      it('does not call update when subscription is not found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        await service.processEvent(
          makePaddleEvent(
            'subscription.canceled',
            { id: 'sub_unknown' },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.past_due
    // -----------------------------------------------------------------------

    describe('subscription.past_due', () => {
      it('calls subscriptionsRepo.update with PAST_DUE status', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.past_due',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.PAST_DUE,
            paddleStatus: 'past_due',
          }),
        );
      });

      it('does not call update when subscription is not found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        await service.processEvent(
          makePaddleEvent(
            'subscription.past_due',
            { id: 'sub_unknown' },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not dispatch any event for past_due', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.past_due',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.paused
    // -----------------------------------------------------------------------

    describe('subscription.paused', () => {
      it('calls subscriptionsRepo.update with PAUSED status', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.paused',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.PAUSED,
            paddleStatus: 'paused',
          }),
        );
      });

      it('does not call update when subscription is not found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        await service.processEvent(
          makePaddleEvent(
            'subscription.paused',
            { id: 'sub_unknown' },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not dispatch any event for paused', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.paused',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.resumed
    // -----------------------------------------------------------------------

    describe('subscription.resumed', () => {
      it('calls subscriptionsRepo.update with ACTIVE status', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ status: 'PAUSED', paddleStatus: 'paused' }),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.resumed',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.ACTIVE,
            paddleStatus: 'active',
          }),
        );
      });

      it('does not call update when subscription is not found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        await service.processEvent(
          makePaddleEvent(
            'subscription.resumed',
            { id: 'sub_unknown' },
            uniqueEventId(),
          ),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not dispatch any event for resumed', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        await service.processEvent(
          makePaddleEvent(
            'subscription.resumed',
            { id: PADDLE_SUB_ID },
            uniqueEventId(),
          ),
        );

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // transaction.completed
    // -----------------------------------------------------------------------

    describe('transaction.completed', () => {
      it('calls subscriptionsRepo.update with updated currentPeriodEnd', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          subscription_id: PADDLE_SUB_ID,
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            currentPeriodEnd: new Date('2026-05-01T00:00:00Z'),
          }),
        );
      });

      it('does not call update when subscription_id is absent from the event data', async () => {
        const data = {
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not call update when subscription is not found by subscription_id', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        const data = {
          subscription_id: 'sub_unknown',
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not call update when billing_period is absent', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = { subscription_id: PADDLE_SUB_ID };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not call update when billing_period.ends_at is absent', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          subscription_id: PADDLE_SUB_ID,
          billing_period: {},
        };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not dispatch any event for transaction.completed', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          subscription_id: PADDLE_SUB_ID,
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('transaction.completed', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.updated (plan change / upgrade / downgrade)
    // -----------------------------------------------------------------------

    describe('subscription.updated', () => {
      it('calls update and recalculateEffectiveLimits when subscription is found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({ planTier: 'BUSINESS' }),
        );
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).toHaveBeenCalledWith(TENANT_ID);
      });

      it('dispatches SubscriptionChangedEvent when plan tier changes', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.eventType).toBe(EventType.SUBSCRIPTION_CHANGED);
      });

      it('does not dispatch a changed event when the plan tier remains the same', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
      });

      it('does not call update when subscription is not found', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        const data = {
          id: 'sub_unknown',
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [],
          current_billing_period: {},
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).not.toHaveBeenCalled();
      });

      it('syncs addon items from webhook data', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 3 },
            { price: { id: 'pri_addon_users' }, quantity: 2 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
          3,
          'pri_addon_branches',
        );
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'users',
          2,
          'pri_addon_users',
        );
      });

      it('removes addons from DB that are no longer in Paddle items', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );
        subscriptionsRepo.findAddons.mockResolvedValue([
          { resource: 'branches', quantity: 3 },
          { resource: 'services', quantity: 1 },
        ]);

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 3 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        // branches is still in Paddle items, so not deleted
        // services is NOT in Paddle items, so should be deleted
        expect(subscriptionsRepo.deleteAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'services',
        );
      });

      it('extractPlanTier correctly identifies plan item among mixed items', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            { price: { id: 'pri_addon_branches' }, quantity: 2 },
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_users' }, quantity: 1 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        // Should extract BUSINESS as the plan tier (not be confused by addon items)
        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({ planTier: 'BUSINESS' }),
        );
      });

      it('extractPlanTier resolves tier from price ID when custom_data is absent', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'year' },
          items: [
            { price: { id: 'pri_addon_branches' }, quantity: 1 },
            { price: { id: 'pri_enterprise_yearly' }, quantity: 1 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2027-03-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({ planTier: 'ENTERPRISE' }),
        );
      });

      it('dispatches "upgrade" changeType when plan tier upgrades (STARTER → BUSINESS)', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.payload.changeType).toBe('upgrade');
        expect(event.payload.previousPlanTier).toBe('STARTER');
        expect(event.payload.newPlanTier).toBe('BUSINESS');
      });

      it('dispatches "downgrade" changeType when plan tier downgrades (BUSINESS → STARTER)', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'STARTER' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.payload.changeType).toBe('downgrade');
        expect(event.payload.previousPlanTier).toBe('BUSINESS');
        expect(event.payload.newPlanTier).toBe('STARTER');
      });

      it('sets CANCELLED status when scheduled_change.action is "cancel"', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
          scheduled_change: { action: 'cancel' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.CANCELLED,
          }),
        );
      });

      it('does not clear cancellation fields when pending cancellation', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
          scheduled_change: { action: 'cancel' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.cancelledAt).toBeUndefined();
        expect(updatePayload.cancelEffectiveAt).toBeUndefined();
      });

      it('clears cancellation fields when status is active and no pending cancellation', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [, updatePayload] = subscriptionsRepo.update.mock.calls[0];
        expect(updatePayload.cancelledAt).toBeNull();
        expect(updatePayload.cancelEffectiveAt).toBeNull();
      });

      it('maps paddle status "past_due" to PAST_DUE', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'past_due',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.PAST_DUE,
            paddleStatus: 'past_due',
          }),
        );
      });

      it('maps paddle status "paused" to PAUSED', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'paused',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.PAUSED,
            paddleStatus: 'paused',
          }),
        );
      });

      it('maps paddle status "trialing" to TRIALING', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'trialing',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.TRIALING,
            paddleStatus: 'trialing',
          }),
        );
      });

      it('defaults unknown paddle status to ACTIVE', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'some_future_status',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            status: SubscriptionStatus.ACTIVE,
            paddleStatus: 'some_future_status',
          }),
        );
      });

      it('updates billingInterval when switching from monthly to yearly', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({
            planTier: 'BUSINESS',
            billingInterval: 'MONTHLY',
          }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'year' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2027-03-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            billingInterval: 'YEARLY',
          }),
        );
      });

      it('does not call update when subscription id is missing from payload', async () => {
        const data = {
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [],
          current_billing_period: {},
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('deletes addon items with quantity 0 from Paddle payload', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );
        subscriptionsRepo.findAddons.mockResolvedValue([]);

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 0 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.deleteAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
        );
        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.created — missing id edge case
    // -----------------------------------------------------------------------

    describe('subscription.created — missing id', () => {
      it('does not call update when id is missing from data', async () => {
        const data = {
          customer_id: PADDLE_CUSTOMER_ID,
          custom_data: { tenantId: TENANT_ID },
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not call update when id is empty string', async () => {
        const data = {
          id: '',
          customer_id: PADDLE_CUSTOMER_ID,
          custom_data: { tenantId: TENANT_ID },
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });

      it('does not call update when id is a number instead of string', async () => {
        const data = {
          id: 12345,
          customer_id: PADDLE_CUSTOMER_ID,
          custom_data: { tenantId: TENANT_ID },
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.canceled — missing id
    // -----------------------------------------------------------------------

    describe('subscription.canceled — missing id', () => {
      it('does not call update when id is missing', async () => {
        const data = {
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.past_due — missing id
    // -----------------------------------------------------------------------

    describe('subscription.past_due — missing id', () => {
      it('does not call update when id is missing', async () => {
        await service.processEvent(
          makePaddleEvent('subscription.past_due', {}, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.paused — missing id
    // -----------------------------------------------------------------------

    describe('subscription.paused — missing id', () => {
      it('does not call update when id is missing', async () => {
        await service.processEvent(
          makePaddleEvent('subscription.paused', {}, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.resumed — missing id
    // -----------------------------------------------------------------------

    describe('subscription.resumed — missing id', () => {
      it('does not call update when id is missing', async () => {
        await service.processEvent(
          makePaddleEvent('subscription.resumed', {}, uniqueEventId()),
        );

        expect(
          subscriptionsRepo.findByPaddleSubscriptionId,
        ).not.toHaveBeenCalled();
        expect(subscriptionsRepo.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Idempotency logic prevents duplicate processing
    // NOTE: These tests verify idempotency via mocked Redis NX semantics.
    // True concurrency testing (real race conditions on Redis SET NX)
    // requires integration tests with a real Redis instance.
    // -----------------------------------------------------------------------

    describe('idempotency logic prevents duplicate processing', () => {
      it('processes both events when they have different event IDs', async () => {
        redisMock.set.mockResolvedValue('OK');
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const updateData = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'BUSINESS' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };

        const txnData = {
          subscription_id: PADDLE_SUB_ID,
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };

        const [result1, result2] = await Promise.allSettled([
          service.processEvent(
            makePaddleEvent(
              'subscription.updated',
              updateData,
              uniqueEventId(),
            ),
          ),
          service.processEvent(
            makePaddleEvent('transaction.completed', txnData, uniqueEventId()),
          ),
        ]);

        expect(result1.status).toBe('fulfilled');
        expect(result2.status).toBe('fulfilled');
        // Both events trigger repo.update
        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(2);
      });

      it('idempotency prevents duplicate processing when both have the same event ID', async () => {
        redisMock.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

        const sharedEventId = uniqueEventId();
        const data = makeSubscriptionCreatedData();

        await Promise.allSettled([
          service.processEvent(
            makePaddleEvent('subscription.created', data, sharedEventId),
          ),
          service.processEvent(
            makePaddleEvent('subscription.created', data, sharedEventId),
          ),
        ]);

        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
      });
    });

    // -----------------------------------------------------------------------
    // Error handling: handler throws releases idempotency key
    // -----------------------------------------------------------------------

    describe('error handling and idempotency key cleanup', () => {
      it('releases idempotency key on subscription.updated handler error', async () => {
        const eventId = uniqueEventId();
        subscriptionsRepo.findByPaddleSubscriptionId.mockRejectedValueOnce(
          new Error('DB connection lost'),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [],
          current_billing_period: {},
        };

        await expect(
          service.processEvent(
            makePaddleEvent('subscription.updated', data, eventId),
          ),
        ).rejects.toThrow('DB connection lost');

        expect(redisMock.del).toHaveBeenCalledWith(eventId);
      });

      it('releases idempotency key on subscription.canceled handler error', async () => {
        const eventId = uniqueEventId();
        subscriptionsRepo.findByPaddleSubscriptionId.mockRejectedValueOnce(
          new Error('Query timeout'),
        );

        const data = {
          id: PADDLE_SUB_ID,
          current_billing_period: { ends_at: '2026-04-01T00:00:00Z' },
        };

        await expect(
          service.processEvent(
            makePaddleEvent('subscription.canceled', data, eventId),
          ),
        ).rejects.toThrow('Query timeout');

        expect(redisMock.del).toHaveBeenCalledWith(eventId);
      });

      it('releases idempotency key on transaction.completed handler error', async () => {
        const eventId = uniqueEventId();
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );
        subscriptionsRepo.update.mockRejectedValueOnce(
          new Error('Write conflict'),
        );

        const data = {
          subscription_id: PADDLE_SUB_ID,
          billing_period: { ends_at: '2026-05-01T00:00:00Z' },
        };

        await expect(
          service.processEvent(
            makePaddleEvent('transaction.completed', data, eventId),
          ),
        ).rejects.toThrow('Write conflict');

        expect(redisMock.del).toHaveBeenCalledWith(eventId);
      });

      it('allows retry after error releases idempotency key', async () => {
        const eventId = uniqueEventId();

        // First attempt: DB error → idempotency key released
        subscriptionsRepo.update.mockRejectedValueOnce(new Error('DB error'));
        redisMock.set.mockResolvedValueOnce('OK');

        const data = makeSubscriptionCreatedData();
        await expect(
          service.processEvent(
            makePaddleEvent('subscription.created', data, eventId),
          ),
        ).rejects.toThrow('DB error');

        expect(redisMock.del).toHaveBeenCalledWith(eventId);

        // Second attempt: succeeds
        subscriptionsRepo.update.mockResolvedValueOnce(undefined);
        redisMock.set.mockResolvedValueOnce('OK');

        await service.processEvent(
          makePaddleEvent('subscription.created', data, eventId),
        );

        // update called twice: first attempt (failed) + second attempt (succeeded)
        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(2);
      });
    });

    // -----------------------------------------------------------------------
    // subscription.canceled — no billing period (effective date fallback)
    // -----------------------------------------------------------------------

    describe('subscription.canceled — missing billing period', () => {
      it('dispatches event with current date ISO string when period end is undefined', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription(),
        );

        const data = {
          id: PADDLE_SUB_ID,
          // No current_billing_period at all
        };
        await service.processEvent(
          makePaddleEvent('subscription.canceled', data, uniqueEventId()),
        );

        expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
        const [event] = eventDispatcher.dispatch.mock.calls[0];
        // effectiveAt should be a valid ISO date string (fallback to new Date())
        expect(() => new Date(event.payload.effectiveAt)).not.toThrow();
        const parsed = new Date(event.payload.effectiveAt);
        expect(parsed.getTime()).not.toBeNaN();
      });
    });

    // -----------------------------------------------------------------------
    // subscription.created — addon sync edge cases
    // -----------------------------------------------------------------------

    describe('subscription.created — addon sync edge cases', () => {
      it('does not upsert addons when items array is empty', async () => {
        const data = makeSubscriptionCreatedData({ items: [] });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });

      it('does not upsert addons when items is undefined', async () => {
        const data = makeSubscriptionCreatedData({ items: undefined });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });

      it('does not sync addons when subscription is not found after update', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(null);

        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 2 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        // update is called (for the main subscription), but no addon sync
        expect(subscriptionsRepo.update).toHaveBeenCalledTimes(1);
        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });

      it('ignores items with unknown price IDs (not a known plan or addon)', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_unknown_thing' }, quantity: 5 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        // Unknown price ID should not trigger upsertAddon
        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });

      it('handles items with missing price.id gracefully', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: { custom_data: { plan_tier: 'BUSINESS' } },
              quantity: 1,
            },
            { price: {}, quantity: 3 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        // No addon items should be synced because price.id is missing
        expect(subscriptionsRepo.upsertAddon).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Addon price ID coverage — workPosts and services resources
    // -----------------------------------------------------------------------

    describe('addon sync — workPosts and services price IDs', () => {
      it('maps pri_addon_work_posts to workPosts resource on subscription.created', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_work_posts' }, quantity: 4 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'workPosts',
          4,
          'pri_addon_work_posts',
        );
      });

      it('maps pri_addon_services to services resource on subscription.created', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_services' }, quantity: 3 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'services',
          3,
          'pri_addon_services',
        );
      });

      it('maps pri_addon_work_posts to workPosts resource on subscription.updated', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_work_posts' }, quantity: 2 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'workPosts',
          2,
          'pri_addon_work_posts',
        );
      });

      it('maps pri_addon_services to services resource on subscription.updated', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_services' }, quantity: 5 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'services',
          5,
          'pri_addon_services',
        );
      });

      it('syncs all four addon types in a single subscription.created event', async () => {
        const data = makeSubscriptionCreatedData({
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 2 },
            { price: { id: 'pri_addon_work_posts' }, quantity: 3 },
            { price: { id: 'pri_addon_users' }, quantity: 1 },
            { price: { id: 'pri_addon_services' }, quantity: 4 },
          ],
        });
        await service.processEvent(
          makePaddleEvent('subscription.created', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledTimes(4);
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
          2,
          'pri_addon_branches',
        );
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'workPosts',
          3,
          'pri_addon_work_posts',
        );
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'users',
          1,
          'pri_addon_users',
        );
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'services',
          4,
          'pri_addon_services',
        );
      });
    });

    // -----------------------------------------------------------------------
    // subscription.updated — stale addon removal edge cases
    // -----------------------------------------------------------------------

    describe('subscription.updated — stale addon removal', () => {
      it('removes all existing addons when Paddle payload has no addon items', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );
        subscriptionsRepo.findAddons.mockResolvedValue([
          { resource: 'branches', quantity: 2 },
          { resource: 'users', quantity: 1 },
        ]);

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.deleteAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
        );
        expect(subscriptionsRepo.deleteAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'users',
        );
      });

      it('does not delete addons that are still present in Paddle items', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'BUSINESS' }),
        );
        subscriptionsRepo.findAddons.mockResolvedValue([
          { resource: 'branches', quantity: 3 },
        ]);

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [
            {
              price: {
                id: 'pri_business_monthly',
                custom_data: { plan_tier: 'BUSINESS' },
              },
              quantity: 1,
            },
            { price: { id: 'pri_addon_branches' }, quantity: 5 },
          ],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        // branches is upserted with new quantity, not deleted
        expect(subscriptionsRepo.upsertAddon).toHaveBeenCalledWith(
          'sub-internal-1',
          'branches',
          5,
          'pri_addon_branches',
        );
        expect(subscriptionsRepo.deleteAddon).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Upgrade → immediate plan change with new limits
    // -----------------------------------------------------------------------

    describe('subscription upgrade — immediate plan change with new limits', () => {
      it('recalculates effective limits after plan upgrade', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'ENTERPRISE' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({ planTier: 'ENTERPRISE' }),
        );
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).toHaveBeenCalledWith(TENANT_ID);
      });

      it('dispatches upgrade event with correct payload for STARTER → ENTERPRISE', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'STARTER' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'ENTERPRISE' } } }],
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.payload).toEqual({
          previousPlanTier: 'STARTER',
          newPlanTier: 'ENTERPRISE',
          changeType: 'upgrade',
        });
      });
    });

    // -----------------------------------------------------------------------
    // Downgrade mid-billing — plan change with prorated billing
    // -----------------------------------------------------------------------

    describe('subscription downgrade mid-billing', () => {
      it('updates the plan tier and recalculates limits on downgrade', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'ENTERPRISE' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'STARTER' } } }],
          current_billing_period: {
            starts_at: '2026-03-15T00:00:00Z',
            ends_at: '2026-04-15T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        expect(subscriptionsRepo.update).toHaveBeenCalledWith(
          TENANT_ID,
          expect.objectContaining({
            planTier: 'STARTER',
            currentPeriodStart: new Date('2026-03-15T00:00:00Z'),
            currentPeriodEnd: new Date('2026-04-15T00:00:00Z'),
          }),
        );
        expect(
          subscriptionsService.recalculateEffectiveLimits,
        ).toHaveBeenCalledWith(TENANT_ID);
      });

      it('dispatches downgrade event for ENTERPRISE → STARTER', async () => {
        subscriptionsRepo.findByPaddleSubscriptionId.mockResolvedValue(
          makeSubscription({ planTier: 'ENTERPRISE' }),
        );

        const data = {
          id: PADDLE_SUB_ID,
          status: 'active',
          billing_cycle: { interval: 'month' },
          items: [{ price: { custom_data: { plan_tier: 'STARTER' } } }],
          current_billing_period: {
            starts_at: '2026-03-15T00:00:00Z',
            ends_at: '2026-04-15T00:00:00Z',
          },
        };
        await service.processEvent(
          makePaddleEvent('subscription.updated', data, uniqueEventId()),
        );

        const [event] = eventDispatcher.dispatch.mock.calls[0];
        expect(event.payload).toEqual({
          previousPlanTier: 'ENTERPRISE',
          newPlanTier: 'STARTER',
          changeType: 'downgrade',
        });
      });
    });
  });

  // =========================================================================
  // verifySignature() — production mode without secret
  // =========================================================================

  describe('verifySignature() — production mode without secret', () => {
    let prodService: PaddleWebhookService;

    beforeEach(async () => {
      const prodConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'paddle.webhookSecret') return '';
          if (key === 'nodeEnv') return 'production';
          return defaultValue ?? undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaddleWebhookService,
          { provide: ConfigService, useValue: prodConfigService },
          { provide: SubscriptionsRepository, useValue: subscriptionsRepo },
          { provide: SubscriptionsService, useValue: subscriptionsService },
          { provide: EventDispatcherService, useValue: eventDispatcher },
          { provide: WEBHOOK_REDIS, useValue: redisMock },
        ],
      }).compile();

      prodService = module.get<PaddleWebhookService>(PaddleWebhookService);
    });

    it('rejects all webhooks in production when secret is empty', () => {
      expect(prodService.verifySignature('any-body', 'ts=1;h1=any')).toBe(
        false,
      );
    });

    it('rejects even with a valid-looking signature when secret is empty in production', () => {
      const rawBody = 'test';
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);

      expect(prodService.verifySignature(rawBody, header)).toBe(false);
    });
  });

  // =========================================================================
  // onModuleDestroy
  // =========================================================================

  describe('onModuleDestroy()', () => {
    it('calls redis.quit() on module destroy', async () => {
      await service.onModuleDestroy();

      expect(redisMock.quit).toHaveBeenCalledTimes(1);
    });
  });
});
