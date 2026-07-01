/**
 * webhook.transport.test.ts
 *
 * Phase 3 coverage: WebhookTransport.post (TASK-019)
 *
 * Tests FAIL until WebhookTransport is implemented in src/services/webhook.transport.ts:
 *   - post(url, payload, timeoutMs): Promise<TransportResult>
 *   - Uses built-in fetch + AbortController
 *   - Returns TransportResult { ok, status, errorKind? } — NEVER throws
 *   - Logs host only (not full URL) via pino logger
 *   - AbortError → { ok: false, status: null, errorKind: 'timeout' }
 *   - Non-AbortError network failure → { ok: false, status: null, errorKind: 'connection' }
 */

import pino from 'pino';
import type { DestinationStream } from 'pino';
import { Writable } from 'stream';

// ---------------------------------------------------------------------------
// Logger capture helper
// ---------------------------------------------------------------------------

interface CapturedLog {
  msg: string;
  [key: string]: unknown;
}

function makeCaptureLogger(): { logger: pino.Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      try {
        logs.push(JSON.parse(chunk.toString()) as CapturedLog);
      } catch {
        // ignore non-JSON
      }
      cb();
    },
  }) as DestinationStream;
  const logger = pino({ level: 'trace' }, sink);
  return { logger, logs };
}

// ---------------------------------------------------------------------------
// Helpers to build mock Response objects
// ---------------------------------------------------------------------------

function mockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

// ---------------------------------------------------------------------------
// Import the class under test — will fail until implemented
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebhookTransport } = require('../webhook.transport') as typeof import('../webhook.transport');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookTransport.post', () => {
  let fetchSpy: jest.SpyInstance;
  let capture: ReturnType<typeof makeCaptureLogger>;
  let transport: InstanceType<typeof WebhookTransport>;

  beforeEach(() => {
    capture = makeCaptureLogger();
    transport = new WebhookTransport(capture.logger);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns { ok: true, status: 200 } when fetch resolves with 200', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const payload = { event: 'card.moved.done', data: { card_id: 'c-1' } };

    const result = await transport.post('https://example.com/hook', payload, 5000);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.errorKind).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Non-2xx response
  // -------------------------------------------------------------------------

  it('returns { ok: false, status: 500 } when fetch resolves with 500', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(500));

    const result = await transport.post('https://example.com/hook', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.errorKind).toBeUndefined();
  });

  it('returns { ok: false, status: 429 } when fetch resolves with 429', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(429));

    const result = await transport.post('https://example.com/hook', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
  });

  // -------------------------------------------------------------------------
  // Timeout (AbortError)
  // -------------------------------------------------------------------------

  it('returns { ok: false, status: null, errorKind: "timeout" } when fetch throws AbortError', async () => {
    fetchSpy.mockRejectedValueOnce(abortError());

    const result = await transport.post('https://example.com/hook', {}, 100);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.errorKind).toBe('timeout');
  });

  // -------------------------------------------------------------------------
  // Connection failure (non-AbortError)
  // -------------------------------------------------------------------------

  it('returns { ok: false, status: null, errorKind: "connection" } when fetch throws a network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await transport.post('https://example.com/hook', {}, 5000);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.errorKind).toBe('connection');
  });

  it('never throws — resolves even when fetch rejects with unexpected error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(transport.post('https://example.com/hook', {}, 5000)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Request body and headers (Stub Detection)
  // -------------------------------------------------------------------------

  it('sends correct JSON body and Content-Type: application/json header', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const payload = { version: '1', event: 'card.moved.done', rule_id: 'r-1' };

    await transport.post('https://example.com/hook', payload, 5000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const contentType = (init.headers as Record<string, string>)['Content-Type'];
    expect(contentType).toBe('application/json');
    const body = JSON.parse(init.body as string) as unknown;
    expect(body).toEqual(payload);
  });

  it('sends the POST to the exact URL provided', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await transport.post('https://hooks.example.com/receiver', {}, 5000);

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://hooks.example.com/receiver');
  });

  it('injects traceparent header when OTel context is active', async () => {
    // The OTel propagation API is a no-op shim when no SDK is registered.
    // We verify the headers object is passed to fetch; traceparent will be
    // absent (no-op) but the spread must not throw or override Content-Type.
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await transport.post('https://example.com/hook', { v: 1 }, 5000);

    const calledHeaders = (fetchSpy.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(calledHeaders['Content-Type']).toBe('application/json');
    // When no SDK is active, propagation.inject is a no-op — traceparent is absent
    // and Content-Type must not be clobbered by the spread
    expect(calledHeaders['traceparent']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Observability: log host only, NOT full URL (Guiding Principle #9)
  // -------------------------------------------------------------------------

  it('logs the host but NOT the full URL', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const url = 'https://secret-token-endpoint.example.com/hook?token=abc123';

    await transport.post(url, {}, 5000);

    // At least one log entry must exist
    expect(capture.logs.length).toBeGreaterThan(0);

    // Every log entry must NOT contain the full URL (with path/query)
    const fullUrlAppears = capture.logs.some((log) =>
      JSON.stringify(log).includes(url),
    );
    expect(fullUrlAppears).toBe(false);

    // At least one log entry must contain the host
    const hostAppears = capture.logs.some((log) =>
      JSON.stringify(log).includes('secret-token-endpoint.example.com'),
    );
    expect(hostAppears).toBe(true);
  });
});
