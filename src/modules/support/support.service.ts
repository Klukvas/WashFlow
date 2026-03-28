import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

export interface SupportContext {
  tenantId: string;
  userId: string;
  userEmail: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('telegram.botToken', '');
    this.chatId = this.config.get<string>('telegram.supportChatId', '');
  }

  async createRequest(
    dto: CreateSupportRequestDto,
    context: SupportContext,
  ): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram support not configured — request dropped');
      throw new ServiceUnavailableException(
        'Support channel is temporarily unavailable',
      );
    }

    const text = [
      `<b>Support Request</b>`,
      ``,
      `<b>Subject:</b> ${this.escapeHtml(dto.subject)}`,
      `<b>From:</b> ${this.escapeHtml(context.userEmail)}`,
      `<b>User ID:</b> <code>${context.userId}</code>`,
      `<b>Tenant ID:</b> <code>${context.tenantId}</code>`,
      ``,
      `<b>Message:</b>`,
      this.escapeHtml(dto.message),
    ].join('\n');

    await this.sendTelegramMessage(text);
  }

  private async sendTelegramMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(
          `Telegram API error: ${response.status} — ${body}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to send Telegram message', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
