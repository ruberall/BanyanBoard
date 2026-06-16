import express from 'express';
import request from 'supertest';

// Helper — build a minimal Express app with the CORS middleware under test
async function makeApp(env: Record<string, string> = {}) {
  // Reset modules so corsMiddleware re-reads env on each test
  jest.resetModules();
  Object.entries(env).forEach(([k, v]) => (process.env[k] = v));
  const { corsMiddleware } = await import('../cors');
  const app = express();
  app.use(corsMiddleware());
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

afterEach(() => {
  delete process.env.CORS_ORIGINS;
  delete process.env.CORS_METHODS;
  delete process.env.CORS_HEADERS;
});

describe('corsMiddleware', () => {
  it('exports a factory function', async () => {
    const { corsMiddleware } = await import('../cors');
    expect(typeof corsMiddleware).toBe('function');
  });

  it('returns an Express middleware function', async () => {
    const { corsMiddleware } = await import('../cors');
    expect(typeof corsMiddleware()).toBe('function');
  });

  it('blocks cross-origin requests when CORS_ORIGINS is not set (safe default)', async () => {
    const app = await makeApp({}); // no CORS_ORIGINS
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://evil.example.com');

    // No Access-Control-Allow-Origin header means the browser will block it
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows a configured origin and echoes it in the response header', async () => {
    const app = await makeApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows multiple configured origins', async () => {
    const app = await makeApp({
      CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
    });

    const res1 = await request(app)
      .get('/ping')
      .set('Origin', 'http://localhost:5173');
    expect(res1.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const res2 = await request(app)
      .get('/ping')
      .set('Origin', 'https://app.example.com');
    expect(res2.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('rejects an origin not in the allow-list', async () => {
    const app = await makeApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://attacker.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows wildcard origin when CORS_ORIGINS=*', async () => {
    const app = await makeApp({ CORS_ORIGINS: '*' });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://anything.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('responds to preflight OPTIONS with 204 and allowed methods', async () => {
    const app = await makeApp({
      CORS_ORIGINS: 'http://localhost:5173',
      CORS_METHODS: 'GET,POST,DELETE',
    });
    const res = await request(app)
      .options('/ping')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('includes custom CORS_HEADERS in allowed headers', async () => {
    const app = await makeApp({
      CORS_ORIGINS: 'http://localhost:5173',
      CORS_HEADERS: 'Content-Type,Authorization,X-Request-Id',
    });
    const res = await request(app)
      .options('/ping')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Request-Id');

    expect(res.headers['access-control-allow-headers']).toContain('X-Request-Id');
  });
});
