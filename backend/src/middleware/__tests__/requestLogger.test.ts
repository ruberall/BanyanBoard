import express from 'express';
import request from 'supertest';
import { Writable } from 'stream';
import { createRequestLogger } from '../requestLogger';
import { createLogger } from '../../logger';

function makeLogCapture() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    stream,
    lines: () => chunks.join('').split('\n').filter((l) => l.trim()),
  };
}

describe('createRequestLogger', () => {
  it('returns a middleware function', () => {
    expect(typeof createRequestLogger()).toBe('function');
  });

  it('passes requests through to the next handler', async () => {
    const app = express();
    app.use(createRequestLogger());
    app.get('/ping', (_req, res) => res.json({ pong: true }));

    await request(app).get('/ping').expect(200, { pong: true });
  });

  it('logs method, path, status code, and responseTime for a completed request', async () => {
    const { stream, lines } = makeLogCapture();
    const log = createLogger({ destination: stream });

    const app = express();
    app.use(createRequestLogger(log));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    await request(app).get('/health').expect(200);
    await new Promise<void>((r) => setImmediate(r));

    const logLines = lines();
    expect(logLines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(logLines[logLines.length - 1]);
    expect(parsed.req.method).toBe('GET');
    expect(parsed.req.url).toBe('/health');
    expect(parsed.res.statusCode).toBe(200);
    expect(typeof parsed.responseTime).toBe('number');
  });

  it('captures non-2xx status codes accurately', async () => {
    const { stream, lines } = makeLogCapture();
    const log = createLogger({ destination: stream });

    const app = express();
    app.use(createRequestLogger(log));
    app.get('/boom', (_req, res) => res.status(500).json({ error: 'oops' }));

    await request(app).get('/boom').expect(500);
    await new Promise<void>((r) => setImmediate(r));

    const logLines = lines();
    expect(logLines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(logLines[logLines.length - 1]);
    expect(parsed.res.statusCode).toBe(500);
  });

  it('logs 404 for routes not matched by any handler', async () => {
    const { stream, lines } = makeLogCapture();
    const log = createLogger({ destination: stream });

    const app = express();
    app.use(createRequestLogger(log));

    await request(app).get('/no-such-route').expect(404);
    await new Promise<void>((r) => setImmediate(r));

    const logLines = lines();
    expect(logLines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(logLines[logLines.length - 1]);
    expect(parsed.res.statusCode).toBe(404);
  });
});
