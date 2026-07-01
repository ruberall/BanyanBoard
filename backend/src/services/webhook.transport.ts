import { context, propagation } from '@opentelemetry/api';
import type { Logger } from 'pino';
import { logger as defaultLogger } from '../logger';

export interface TransportResult {
  ok: boolean;
  status: number | null;
  errorKind?: 'timeout' | 'connection';
}

export class WebhookTransport {
  private readonly log: Logger;

  constructor(log?: Logger) {
    this.log = log ?? defaultLogger;
  }

  async post(url: string, payload: unknown, timeoutMs: number): Promise<TransportResult> {
    const host = new URL(url).host;
    this.log.debug({ host }, 'webhook.transport.post');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Inject W3C trace context headers (no-op when OTel SDK is not registered)
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...traceHeaders,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status };
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        this.log.warn({ host, errorKind: 'timeout' }, 'webhook.transport.error');
        return { ok: false, status: null, errorKind: 'timeout' };
      }
      this.log.warn({ host, errorKind: 'connection' }, 'webhook.transport.error');
      return { ok: false, status: null, errorKind: 'connection' };
    } finally {
      clearTimeout(timer);
    }
  }
}
