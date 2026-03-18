import {
  Controller,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { PaddleWebhookService } from './paddle-webhook.service';

@Controller('webhooks/paddle')
export class PaddleWebhookController {
  private readonly logger = new Logger(PaddleWebhookController.name);

  constructor(private readonly webhookService: PaddleWebhookService) {}

  @Post()
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['paddle-signature'] as string | undefined;
    if (!signature) {
      throw new BadRequestException('Missing Paddle-Signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    const isValid = this.webhookService.verifySignature(
      rawBody.toString('utf-8'),
      signature,
    );
    if (!isValid) {
      this.logger.warn('Invalid Paddle webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    const event = req.body as {
      event_id: string;
      event_type: string;
      data: Record<string, unknown>;
    };

    await this.webhookService.processEvent(event);

    return { received: true };
  }
}
