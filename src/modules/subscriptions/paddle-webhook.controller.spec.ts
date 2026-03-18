import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleWebhookService } from './paddle-webhook.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buildRequest = (overrides: Record<string, unknown> = {}) => {
  const defaults = {
    headers: {
      'paddle-signature': 'ts=1710000000;h1=validhash',
    },
    rawBody: Buffer.from('{"event_type":"subscription.created"}'),
    body: {
      event_id: 'evt_001',
      event_type: 'subscription.created',
      data: { id: 'sub_001' },
    },
  };

  return { ...defaults, ...overrides } as any;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaddleWebhookController', () => {
  let controller: PaddleWebhookController;
  let webhookService: {
    verifySignature: jest.Mock;
    processEvent: jest.Mock;
  };

  beforeEach(async () => {
    webhookService = {
      verifySignature: jest.fn().mockReturnValue(true),
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaddleWebhookController],
      providers: [
        { provide: PaddleWebhookService, useValue: webhookService },
      ],
    }).compile();

    controller = module.get<PaddleWebhookController>(PaddleWebhookController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Missing Paddle-Signature header
  // -------------------------------------------------------------------------

  describe('missing Paddle-Signature header', () => {
    it('throws BadRequestException when header is missing', async () => {
      const req = buildRequest({
        headers: {},
      });

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with correct message', async () => {
      const req = buildRequest({
        headers: {},
      });

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        /Missing Paddle-Signature header/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Missing raw body
  // -------------------------------------------------------------------------

  describe('missing raw body', () => {
    it('throws BadRequestException when rawBody is missing', async () => {
      const req = buildRequest({
        rawBody: undefined,
      });

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with correct message', async () => {
      const req = buildRequest({
        rawBody: undefined,
      });

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        /Missing raw body/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invalid signature
  // -------------------------------------------------------------------------

  describe('invalid signature', () => {
    it('throws BadRequestException when verifySignature returns false', async () => {
      webhookService.verifySignature.mockReturnValue(false);

      const req = buildRequest();

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "Invalid signature" message', async () => {
      webhookService.verifySignature.mockReturnValue(false);

      const req = buildRequest();

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        /Invalid signature/,
      );
    });

    it('calls verifySignature with rawBody as string and signature header', async () => {
      webhookService.verifySignature.mockReturnValue(false);

      const rawBody = Buffer.from('test-body');
      const req = buildRequest({
        rawBody,
        headers: { 'paddle-signature': 'ts=123;h1=abc' },
      });

      await expect(controller.handleWebhook(req)).rejects.toThrow();

      expect(webhookService.verifySignature).toHaveBeenCalledWith(
        'test-body',
        'ts=123;h1=abc',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Valid signature — successful processing
  // -------------------------------------------------------------------------

  describe('valid signature', () => {
    it('calls webhookService.processEvent with the event body', async () => {
      const eventBody = {
        event_id: 'evt_002',
        event_type: 'subscription.updated',
        data: { id: 'sub_002' },
      };

      const req = buildRequest({ body: eventBody });

      await controller.handleWebhook(req);

      expect(webhookService.processEvent).toHaveBeenCalledTimes(1);
      expect(webhookService.processEvent).toHaveBeenCalledWith(eventBody);
    });

    it('returns { received: true }', async () => {
      const req = buildRequest();

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
    });

    it('does not throw when signature is valid', async () => {
      const req = buildRequest();

      await expect(controller.handleWebhook(req)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // processEvent error propagation
  // -------------------------------------------------------------------------

  describe('processEvent error propagation', () => {
    it('propagates errors from webhookService.processEvent', async () => {
      webhookService.processEvent.mockRejectedValue(
        new Error('Processing failed'),
      );

      const req = buildRequest();

      await expect(controller.handleWebhook(req)).rejects.toThrow(
        'Processing failed',
      );
    });
  });
});
