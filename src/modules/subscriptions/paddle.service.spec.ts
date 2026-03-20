import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaddleService } from './paddle.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_KEY = 'test-paddle-api-key';
const SANDBOX_URL = 'https://sandbox-api.paddle.com';
const PRODUCTION_URL = 'https://api.paddle.com';
const PADDLE_SUB_ID = 'sub_01abc123def456';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfigMock(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'paddle.apiKey': API_KEY,
    'paddle.sandbox': true,
  };
  const merged = { ...defaults, ...overrides };

  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in merged ? merged[key] : (fallback ?? undefined);
    }),
  };
}

function buildFetchResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue({ data }),
    text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'bad' })),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaddleService', () => {
  let service: PaddleService;
  let configMock: ReturnType<typeof buildConfigMock>;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    configMock = buildConfigMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddleService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<PaddleService>(PaddleService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // URL selection
  // -------------------------------------------------------------------------

  describe('URL selection', () => {
    it('uses sandbox URL when PADDLE_SANDBOX is true', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_test', quantity: 1 }],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(SANDBOX_URL),
        expect.any(Object),
      );
    });

    it('uses production URL when PADDLE_SANDBOX is false', async () => {
      configMock = buildConfigMock({ 'paddle.sandbox': false });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaddleService,
          { provide: ConfigService, useValue: configMock },
        ],
      }).compile();

      const productionService = module.get<PaddleService>(PaddleService);

      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await productionService.createCheckoutTransaction({
        items: [{ priceId: 'pri_test', quantity: 1 }],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(PRODUCTION_URL),
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Authorization header
  // -------------------------------------------------------------------------

  describe('Authorization header', () => {
    it('includes Bearer token in requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_test', quantity: 1 }],
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestInit = callArgs[1] as RequestInit;

      expect(requestInit.headers).toEqual(
        expect.objectContaining({
          Authorization: `Bearer ${API_KEY}`,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse(null, false, 422),
      );

      await expect(
        service.createCheckoutTransaction({
          items: [{ priceId: 'pri_test', quantity: 1 }],
        }),
      ).rejects.toThrow(/Paddle API error: 422/);
    });
  });

  // -------------------------------------------------------------------------
  // fetchAllPrices
  // -------------------------------------------------------------------------

  describe('fetchAllPrices()', () => {
    it('returns empty map when no price IDs are provided', async () => {
      const result = await service.fetchAllPrices([]);

      expect(result.size).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('makes a GET request to /prices with id params and per_page', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse([
          {
            id: 'pri_001',
            unit_price: { amount: '2900', currency_code: 'USD' },
            name: 'Starter Monthly',
          },
        ]),
      );

      await service.fetchAllPrices(['pri_001']);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/prices?id=pri_001&status=active');
      expect(url).toContain('per_page=200');
      expect(options.method).toBe('GET');
    });

    it('returns a Map of priceId to PaddlePriceInfo', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse([
          {
            id: 'pri_001',
            unit_price: { amount: '2900', currency_code: 'USD' },
            name: 'Starter Monthly',
          },
          {
            id: 'pri_002',
            unit_price: { amount: '29000', currency_code: 'USD' },
            name: 'Starter Yearly',
          },
        ]),
      );

      const result = await service.fetchAllPrices(['pri_001', 'pri_002']);

      expect(result.size).toBe(2);
      expect(result.get('pri_001')).toEqual({
        amountCents: '2900',
        currency: 'USD',
        name: 'Starter Monthly',
      });
      expect(result.get('pri_002')).toEqual({
        amountCents: '29000',
        currency: 'USD',
        name: 'Starter Yearly',
      });
    });

    it('passes multiple id params in the query string', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse([]));

      await service.fetchAllPrices(['pri_a', 'pri_b', 'pri_c']);

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('id=pri_a');
      expect(url).toContain('id=pri_b');
      expect(url).toContain('id=pri_c');
    });

    it('includes AbortSignal timeout in the request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse([]));

      await service.fetchAllPrices(['pri_001']);

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.signal).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // createCheckoutTransaction
  // -------------------------------------------------------------------------

  describe('createCheckoutTransaction()', () => {
    it('makes a POST request to /transactions', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_starter_monthly', quantity: 1 }],
      });

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/transactions`);
      expect(options.method).toBe('POST');
    });

    it('returns transactionId from response data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_abc_123' }),
      );

      const result = await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_starter_monthly', quantity: 1 }],
      });

      expect(result).toEqual({ transactionId: 'txn_abc_123' });
    });

    it('maps items with priceId to price_id in the request body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_biz_yearly', quantity: 2 }],
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.items).toEqual([{ price_id: 'pri_biz_yearly', quantity: 2 }]);
    });

    it('includes customer_id when customerId is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_test', quantity: 1 }],
        customerId: 'ctm_existing',
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.customer_id).toBe('ctm_existing');
    });

    it('includes custom_data when customData is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({ id: 'txn_001' }),
      );

      await service.createCheckoutTransaction({
        items: [{ priceId: 'pri_test', quantity: 1 }],
        customData: { tenantId: 'tenant-123' },
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.custom_data).toEqual({ tenantId: 'tenant-123' });
    });
  });

  // -------------------------------------------------------------------------
  // updateSubscription
  // -------------------------------------------------------------------------

  describe('updateSubscription()', () => {
    it('makes a PATCH request to /subscriptions/{id}', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.updateSubscription(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_biz_monthly', quantity: 1 }],
      });

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/subscriptions/${PADDLE_SUB_ID}`);
      expect(options.method).toBe('PATCH');
    });

    it('includes proration_billing_mode when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.updateSubscription(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_biz_monthly', quantity: 1 }],
        prorationBillingMode: 'prorated_immediately',
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.proration_billing_mode).toBe('prorated_immediately');
    });

    it('maps items with priceId to price_id', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.updateSubscription(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_enterprise_yearly', quantity: 1 }],
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.items).toEqual([
        { price_id: 'pri_enterprise_yearly', quantity: 1 },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // previewSubscriptionUpdate
  // -------------------------------------------------------------------------

  describe('previewSubscriptionUpdate()', () => {
    it('makes a POST request to /subscriptions/{id}/preview', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          immediate_transaction: {
            details: { totals: { total: '1500' } },
          },
          currency_code: 'USD',
        }),
      );

      await service.previewSubscriptionUpdate(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_biz_monthly', quantity: 1 }],
      });

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/subscriptions/${PADDLE_SUB_ID}/preview`);
      expect(options.method).toBe('POST');
    });

    it('maps response correctly with immediateTransaction', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          immediate_transaction: {
            details: { totals: { total: '2500' } },
          },
          next_transaction: {
            details: { totals: { total: '4900' } },
            billing_period: { starts_at: '2026-04-01T00:00:00Z' },
          },
          currency_code: 'EUR',
        }),
      );

      const result = await service.previewSubscriptionUpdate(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_biz_monthly', quantity: 1 }],
      });

      expect(result).toEqual({
        immediateTransaction: { amount: '2500', currency: 'EUR' },
        nextTransaction: {
          amount: '4900',
          currency: 'EUR',
          billingDate: '2026-04-01T00:00:00Z',
        },
      });
    });

    it('returns undefined for immediateTransaction when no total is present', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          immediate_transaction: {},
          currency_code: 'USD',
        }),
      );

      const result = await service.previewSubscriptionUpdate(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_biz_monthly', quantity: 1 }],
      });

      expect(result.immediateTransaction).toBeUndefined();
    });

    it('defaults currency to USD when currency_code is absent', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          immediate_transaction: {
            details: { totals: { total: '1000' } },
          },
        }),
      );

      const result = await service.previewSubscriptionUpdate(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_test', quantity: 1 }],
      });

      expect(result.immediateTransaction?.currency).toBe('USD');
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------

  describe('cancelSubscription()', () => {
    it('makes a POST request to /subscriptions/{id}/cancel', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.cancelSubscription(PADDLE_SUB_ID);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/subscriptions/${PADDLE_SUB_ID}/cancel`);
      expect(options.method).toBe('POST');
    });

    it('sends effective_from as next_billing_period by default', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.cancelSubscription(PADDLE_SUB_ID);

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.effective_from).toBe('next_billing_period');
    });

    it('sends effective_from as immediately when specified', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildFetchResponse({}));

      await service.cancelSubscription(PADDLE_SUB_ID, 'immediately');

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.effective_from).toBe('immediately');
    });
  });

  // -------------------------------------------------------------------------
  // getSubscription
  // -------------------------------------------------------------------------

  describe('getSubscription()', () => {
    it('makes a GET request to /subscriptions/{id}', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          id: PADDLE_SUB_ID,
          status: 'active',
          customer_id: 'ctm_001',
          items: [],
        }),
      );

      await service.getSubscription(PADDLE_SUB_ID);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${SANDBOX_URL}/subscriptions/${PADDLE_SUB_ID}`);
      expect(options.method).toBe('GET');
    });

    it('maps response correctly', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          id: PADDLE_SUB_ID,
          status: 'active',
          customer_id: 'ctm_001',
          current_billing_period: {
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
          },
          items: [
            { price: { id: 'pri_biz_monthly' }, quantity: 1 },
            { price: { id: 'pri_addon_users' }, quantity: 2 },
          ],
        }),
      );

      const result = await service.getSubscription(PADDLE_SUB_ID);

      expect(result).toEqual({
        id: PADDLE_SUB_ID,
        status: 'active',
        customerId: 'ctm_001',
        currentBillingPeriod: {
          startsAt: '2026-03-01T00:00:00Z',
          endsAt: '2026-04-01T00:00:00Z',
        },
        items: [
          { priceId: 'pri_biz_monthly', quantity: 1 },
          { priceId: 'pri_addon_users', quantity: 2 },
        ],
      });
    });

    it('returns undefined for currentBillingPeriod when absent', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          id: PADDLE_SUB_ID,
          status: 'canceled',
          customer_id: 'ctm_001',
          items: [],
        }),
      );

      const result = await service.getSubscription(PADDLE_SUB_ID);

      expect(result.currentBillingPeriod).toBeUndefined();
    });

    it('does not include a body in the GET request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildFetchResponse({
          id: PADDLE_SUB_ID,
          status: 'active',
          customer_id: 'ctm_001',
          items: [],
        }),
      );

      await service.getSubscription(PADDLE_SUB_ID);

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.body).toBeUndefined();
    });
  });
});
