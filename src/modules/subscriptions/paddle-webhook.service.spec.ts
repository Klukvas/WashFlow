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

      it('returns false when timestamp is older than 5 minutes (replay attack)', () => {
        const rawBody = '{"event_type":"subscription.created"}';
        const staleTs = String(Math.floor(Date.now() / 1000) - 400);
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, staleTs);

        expect(service.verifySignature(rawBody, header)).toBe(false);
      });

      it('returns false when timestamp is in the far future', () => {
        const rawBody = '{"event_type":"subscription.created"}';
        const futureTs = String(Math.floor(Date.now() / 1000) + 400);
        const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, futureTs);

        expect(service.verifySignature(rawBody, header)).toBe(false);
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
    });
  });
});
