import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaddleCheckoutConfig {
  transactionId?: string;
  customerId?: string;
  items: Array<{ priceId: string; quantity: number }>;
  customData?: Record<string, string>;
}

export interface PaddleSubscriptionPreview {
  immediateTransaction?: {
    amount: string;
    currency: string;
  };
  nextTransaction?: {
    amount: string;
    currency: string;
    billingDate: string;
  };
}

@Injectable()
export class PaddleService {
  private readonly logger = new Logger(PaddleService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('paddle.apiKey', '');
    const isSandbox = this.config.get<boolean>('paddle.sandbox', true);
    this.baseUrl = isSandbox
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Paddle API error: ${response.status} ${method} ${path}: ${errorBody}`,
      );
      throw new Error(`Paddle API error: ${response.status}`);
    }

    const json = (await response.json()) as { data: T };
    return json.data;
  }

  async createCheckoutTransaction(params: {
    items: Array<{ priceId: string; quantity: number }>;
    customerId?: string;
    customData?: Record<string, string>;
  }): Promise<{ transactionId: string }> {
    const body: Record<string, unknown> = {
      items: params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      })),
    };

    if (params.customerId) {
      body.customer_id = params.customerId;
    }

    if (params.customData) {
      body.custom_data = params.customData;
    }

    const result = await this.request<{ id: string }>(
      'POST',
      '/transactions',
      body,
    );

    return { transactionId: result.id };
  }

  async updateSubscription(
    paddleSubscriptionId: string,
    params: {
      items?: Array<{ priceId: string; quantity: number }>;
      prorationBillingMode?: string;
    },
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    if (params.items) {
      body.items = params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      }));
    }

    if (params.prorationBillingMode) {
      body.proration_billing_mode = params.prorationBillingMode;
    }

    await this.request<unknown>(
      'PATCH',
      `/subscriptions/${paddleSubscriptionId}`,
      body,
    );
  }

  async previewSubscriptionUpdate(
    paddleSubscriptionId: string,
    params: {
      items: Array<{ priceId: string; quantity: number }>;
      prorationBillingMode?: string;
    },
  ): Promise<PaddleSubscriptionPreview> {
    const body: Record<string, unknown> = {
      items: params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      })),
    };

    if (params.prorationBillingMode) {
      body.proration_billing_mode = params.prorationBillingMode;
    }

    const result = await this.request<{
      immediate_transaction?: { details?: { totals?: { total?: string } } };
      next_transaction?: {
        details?: { totals?: { total?: string } };
        billing_period?: { starts_at?: string };
      };
      currency_code?: string;
    }>('POST', `/subscriptions/${paddleSubscriptionId}/preview`, body);

    return {
      immediateTransaction: result.immediate_transaction?.details?.totals?.total
        ? {
            amount: result.immediate_transaction.details.totals.total,
            currency: result.currency_code ?? 'USD',
          }
        : undefined,
      nextTransaction: result.next_transaction?.details?.totals?.total
        ? {
            amount: result.next_transaction.details.totals.total,
            currency: result.currency_code ?? 'USD',
            billingDate:
              result.next_transaction.billing_period?.starts_at ?? '',
          }
        : undefined,
    };
  }

  async cancelSubscription(
    paddleSubscriptionId: string,
    effectiveFrom:
      | 'immediately'
      | 'next_billing_period' = 'next_billing_period',
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/subscriptions/${paddleSubscriptionId}/cancel`,
      { effective_from: effectiveFrom },
    );
  }

  async getSubscription(paddleSubscriptionId: string): Promise<{
    id: string;
    status: string;
    customerId: string;
    currentBillingPeriod?: {
      startsAt: string;
      endsAt: string;
    };
    items: Array<{
      priceId: string;
      quantity: number;
    }>;
  }> {
    const result = await this.request<{
      id: string;
      status: string;
      customer_id: string;
      current_billing_period?: {
        starts_at: string;
        ends_at: string;
      };
      items: Array<{
        price: { id: string };
        quantity: number;
      }>;
    }>('GET', `/subscriptions/${paddleSubscriptionId}`);

    return {
      id: result.id,
      status: result.status,
      customerId: result.customer_id,
      currentBillingPeriod: result.current_billing_period
        ? {
            startsAt: result.current_billing_period.starts_at,
            endsAt: result.current_billing_period.ends_at,
          }
        : undefined,
      items: result.items.map((item) => ({
        priceId: item.price.id,
        quantity: item.quantity,
      })),
    };
  }
}
