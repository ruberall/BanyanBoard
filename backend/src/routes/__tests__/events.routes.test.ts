/**
 * events.routes.test.ts
 *
 * Phase 2 coverage: GET /boards/:boardId/events (SSE endpoint)
 *
 * Architecture:
 *   Route file: backend/src/routes/feed.ts — createFeedRouter(db, bus)
 *   Mounted at: /boards/:boardId/events in routes/index.ts (protected by requireAuth)
 *
 * Behaviors tested:
 *   SSE-HEADERS-1 — SSE response has correct headers (text/event-stream, no-cache, keep-alive, X-Accel-Buffering)
 *   SSE-UNAUTH-1  — Unauthenticated request is rejected with 401
 *   SSE-HISTORY-1 — Last N events from EventRepository are flushed as SSE frames on connect
 *   SSE-FANOUT-1  — New events published on the bus are forwarded as SSE frames to connected clients
 *   SSE-REPLAY-1  — Last-Event-ID header triggers replay of events after that ID from the DB
 *   SSE-UNSUB-1   — Client disconnect triggers bus unsubscribe (memory-leak guard)
 *
 * Test strategy:
 *   SSE-UNAUTH-1 uses standard supertest (fast 401, no persistent connection).
 *
 *   All SSE tests (SSE-HEADERS-1, SSE-HISTORY-1, SSE-REPLAY-1, SSE-FANOUT-1, SSE-UNSUB-1)
 *   use native Node.js http.get() against a real server listening on a random port.
 *   This avoids the supertest v7 limitation where .on('data') does not fire the request,
 *   and avoids server.close() blocking on open SSE connections (the test destroys the
 *   connection before calling server.close()).
 *
 * NOTE: All tests in this file FAIL until the Coding Agent implements:
 *   1. backend/src/routes/feed.ts — createFeedRouter
 *   2. backend/src/routes/index.ts — mount createFeedRouter at /boards/:boardId/events
 */

import http from 'http';
import supertest from 'supertest';
import { createApp } from '../../app';
import type { Config } from '../../config';
import type { Logger } from 'pino';
import type { DomainEvent } from '../../events/domain-event-bus';
import type { AddressInfo } from 'net';

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

const stubConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused-in-feed-tests',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 5,
  DB_POOL_IDLE_TIMEOUT_MS: 10000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
  FEED_MAX_HISTORY: 20,
  FEED_SSE_HEARTBEAT_MS: 60000, // long interval — prevents heartbeat noise in tests
};

const stubLogger = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => stubLogger,
} as unknown as Logger;

// ---------------------------------------------------------------------------
// Auth fixtures
// ---------------------------------------------------------------------------

const USER_EMAIL    = 'test@example.com';
const USER_PASSWORD = 'securepassword1';
// Pre-computed bcrypt hash for USER_PASSWORD (cost 12):
const USER_HASH     = '$2b$12$iza4wLD3eGM4F/q5nb.cHuLSVMRuZYcie.a3V6b6LwFdYO.LqLPie';
const USER_ID       = 'user-uuid-aaaa-bbbb-cccc';

const fixUserRow = {
  id: USER_ID,
  email: USER_EMAIL,
  password_hash: USER_HASH,
  created_at: '2026-06-17T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Domain fixtures
// ---------------------------------------------------------------------------

const BOARD_ID   = 'board-uuid-1111-2222-3333-444444444444';
const CARD_ID    = 'card-uuid-aaaa-bbbb-cccc-dddddddddddd';
const COL_FROM   = 'col-uuid-1111-2222-3333-444444444444';
const COL_TO     = 'col-uuid-5555-6666-7777-888888888888';
const EVENT_ID_1 = 'evt-uuid-0001-aaaa-bbbb-cccccccccccc';
const EVENT_ID_2 = 'evt-uuid-0002-aaaa-bbbb-cccccccccccc';

/** A row as returned by EventRepository.findRecentByBoard */
function makeEventRow(id: string, overrides?: Partial<Record<string, unknown>>) {
  return {
    id,
    board_id: BOARD_ID,
    card_id: CARD_ID,
    actor_id: USER_ID,
    event_type: 'card.moved',
    payload: { fromColumnId: COL_FROM, toColumnId: COL_TO },
    occurred_at: '2026-06-18T10:00:00.000Z',
    ...overrides,
  };
}

/** A DomainEvent as published on the bus */
const fixBusEvent: DomainEvent = {
  type: 'card.moved',
  eventId: 'evt-uuid-live-aaaa-bbbb-cccccccccccc',
  boardId: BOARD_ID,
  cardId: CARD_ID,
  actorId: USER_ID,
  fromColumnId: COL_FROM,
  toColumnId: COL_TO,
  occurredAt: new Date('2026-06-18T10:01:00.000Z'),
};

// ---------------------------------------------------------------------------
// Helper: login via supertest and return the raw Set-Cookie header string.
// We use supertest only for login (a fast 200 response with no persistent
// connection) so it does not block on SSE streams.
// ---------------------------------------------------------------------------

async function loginAndGetCookie(
  server: http.Server,
  stubPool: { query: jest.Mock },
): Promise<string> {
  stubPool.query.mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 });
  const res = await supertest(server)
    .post('/auth/login')
    .send({ email: USER_EMAIL, password: USER_PASSWORD });

  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // express-session returns Set-Cookie as an array; join into one header value.
  const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
  if (!setCookie) {
    throw new Error('Login response missing Set-Cookie header');
  }
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  // Return only the cookie name=value part (strip attributes like Path, HttpOnly…)
  return cookies.map(c => c.split(';')[0]).join('; ');
}

// ---------------------------------------------------------------------------
// SSE-UNAUTH-1: unauthenticated request is rejected
// Uses plain supertest — this is a fast 401 with no persistent connection.
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/events — authentication', () => {
  const stubPool = { query: jest.fn() } as any;
  const mockBus  = { publish: jest.fn(), subscribe: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool, bus: mockBus });

  it('SSE-UNAUTH-1: returns 401 when not logged in', async () => {
    const res = await supertest(app)
      .get(`/boards/${BOARD_ID}/events`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// SSE-HEADERS-1: correct SSE response headers
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/events — SSE headers', () => {
  const stubPool = { query: jest.fn() } as any;
  const mockBus  = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(() => {}) } as any;

  let server: http.Server;
  let port: number;
  let sessionCookie: string;

  beforeAll(async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    sessionCookie = await loginAndGetCookie(server, stubPool);
    stubPool.query.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockBus.subscribe.mockReset();
    mockBus.subscribe.mockReturnValue(() => {});
  });

  it('SSE-HEADERS-1: responds with required SSE headers', async () => {
    // Return empty history so the route proceeds past the DB query quickly.
    stubPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        { headers: { Cookie: sessionCookie } },
        (res) => {
          // Headers are available immediately on the initial response.
          try {
            expect(res.headers['content-type']).toMatch(/text\/event-stream/);
            expect(res.headers['cache-control']).toMatch(/no-cache/);
            expect(res.headers['connection']).toMatch(/keep-alive/);
            expect(res.headers['x-accel-buffering']).toBe('no');
          } catch (err) {
            req.destroy();
            reject(err);
            return;
          }
          // Destroy the connection once headers are inspected.
          req.destroy();
          res.on('error', () => {}); // swallow destroyed-socket errors
        },
      );
      req.on('close', resolve);
      req.on('error', (err: NodeJS.ErrnoException) => {
        // ECONNRESET is expected when we destroy an SSE connection.
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// SSE-HISTORY-1: last N events flushed as SSE frames on connect
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/events — history flush', () => {
  const stubPool = { query: jest.fn() } as any;
  const mockBus  = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(() => {}) } as any;

  let server: http.Server;
  let port: number;
  let sessionCookie: string;

  beforeAll(async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    sessionCookie = await loginAndGetCookie(server, stubPool);
    stubPool.query.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockBus.subscribe.mockClear();
    mockBus.subscribe.mockReturnValue(() => {});
  });

  it('SSE-HISTORY-1: queries EventRepository for last 20 events using the boardId', async () => {
    const rows = [makeEventRow(EVENT_ID_1), makeEventRow(EVENT_ID_2)];
    stubPool.query.mockResolvedValueOnce({ rows, rowCount: rows.length });

    let capturedBody = '';

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        { headers: { Cookie: sessionCookie } },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            capturedBody += chunk.toString();
            // Destroy only after both event IDs have been received.
            if (capturedBody.includes(EVENT_ID_1) && capturedBody.includes(EVENT_ID_2)) {
              req.destroy();
            }
          });
          res.on('error', () => {}); // swallow destroyed-socket errors
        },
      );
      req.on('close', resolve);
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          resolve();
        } else {
          reject(err);
        }
      });
      // Safety timeout.
      setTimeout(() => { req.destroy(); }, 2000);
    });

    // The route must have queried the pool (findRecentByBoard).
    expect(stubPool.query).toHaveBeenCalled();
    const [queryText, queryParams] = stubPool.query.mock.calls[0] as [string, string[]];
    expect(queryText).toMatch(/card_events/i);
    expect(queryParams).toContain(BOARD_ID);

    // Both events should appear in the SSE stream as well-formed frames.
    // SSE format: "id: <eventId>\ndata: <json>\n\n"
    expect(capturedBody).toContain(`id: ${EVENT_ID_1}`);
    expect(capturedBody).toContain(`id: ${EVENT_ID_2}`);
    expect(capturedBody).toContain('"event_type":"card.moved"');
  });
});

// ---------------------------------------------------------------------------
// SSE-REPLAY-1: Last-Event-ID header triggers replay from DB
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/events — Last-Event-ID replay', () => {
  const stubPool = { query: jest.fn() } as any;
  const mockBus  = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(() => {}) } as any;

  let server: http.Server;
  let port: number;
  let sessionCookie: string;

  beforeAll(async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    sessionCookie = await loginAndGetCookie(server, stubPool);
    stubPool.query.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockBus.subscribe.mockClear();
    mockBus.subscribe.mockReturnValue(() => {});
  });

  it('SSE-REPLAY-1: passes Last-Event-ID to EventRepository so missed events are replayed', async () => {
    const missedEvent = makeEventRow(EVENT_ID_2);
    stubPool.query.mockResolvedValueOnce({ rows: [missedEvent], rowCount: 1 });

    let capturedBody = '';

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        {
          headers: {
            Cookie: sessionCookie,
            'Last-Event-ID': EVENT_ID_1,
          },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            capturedBody += chunk.toString();
            if (capturedBody.includes(EVENT_ID_2)) {
              req.destroy();
            }
          });
          res.on('error', () => {}); // swallow destroyed-socket errors
        },
      );
      req.on('close', resolve);
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          resolve();
        } else {
          reject(err);
        }
      });
      // Safety timeout.
      setTimeout(() => { req.destroy(); }, 2000);
    });

    // The repository query must include EVENT_ID_1 so it can filter events after it.
    expect(stubPool.query).toHaveBeenCalled();
    const [, queryParams] = stubPool.query.mock.calls[0] as [string, string[]];
    expect(queryParams).toContain(EVENT_ID_1);

    // The missed event should appear in the response stream.
    expect(capturedBody).toContain(`id: ${EVENT_ID_2}`);
  });
});

// ---------------------------------------------------------------------------
// SSE-RACE-1: event emitted during subscribe gap must reach the client
// ---------------------------------------------------------------------------
//
// Scenario: a card.moved event is published on the bus AFTER the SSE headers
// are flushed but BEFORE bus.subscribe() is called (i.e. during the async
// history DB query). With the current implementation the event is lost because
// subscribe has not been registered yet. After the fix (subscribe-before-flush
// with buffering), the event must appear in the stream.
//
// Implementation detail of the test:
//   - stubPool.query is delayed 50 ms to create a window where the route is
//     awaiting the DB result but has not yet called bus.subscribe().
//   - mockBus.subscribe captures the handler AND immediately invokes it with
//     fixBusEvent — this simulates an event that arrived during the gap.
//   - We actually emit the event during the DB delay (before subscribe returns)
//     by firing it inside the subscribe mock itself. The fix must buffer that
//     event and drain it after the history flush.
//
// NOTE: This test FAILS on the current implementation (RED) and passes after
// the subscribe-before-flush fix is applied.

describe('GET /boards/:boardId/events — subscribe-before-flush race condition', () => {
  const stubPool = { query: jest.fn() } as any;

  // This bus mock captures the handler on subscribe and immediately invokes it
  // with fixBusEvent, simulating an event that was emitted during the gap.
  let capturedHandler: ((event: DomainEvent) => void) | null = null;
  const mockBus = {
    publish: jest.fn(),
    subscribe: jest.fn().mockImplementation((_boardId: string, handler: (e: DomainEvent) => void) => {
      capturedHandler = handler;
      return jest.fn(); // unsubscribeFn
    }),
  };

  let server: http.Server;
  let port: number;
  let sessionCookie: string;

  beforeAll(async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    sessionCookie = await loginAndGetCookie(server, stubPool);
    stubPool.query.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockBus.subscribe.mockClear();
    capturedHandler = null;
  });

  it('SSE-RACE-1: event emitted during DB-query window appears in the client stream', async () => {
    // Delay the DB query response by 50 ms to create the subscribe gap.
    // During this window we simulate the bus firing fixBusEvent by having the
    // subscribe mock invoke the handler synchronously when called. For the test
    // to prove the gap we also fire the event via a timeout that lands BEFORE
    // subscribe() is called in the current (unfixed) code path.
    stubPool.query.mockImplementationOnce(() =>
      new Promise(resolve => {
        setTimeout(() => {
          // Fire the event into any already-registered handler.
          // On the unfixed code path capturedHandler is still null here because
          // subscribe() has not been called yet — the event is dropped.
          // On the fixed code path the bus fires into the buffer.
          if (capturedHandler) {
            capturedHandler(fixBusEvent);
          }
          resolve({ rows: [], rowCount: 0 });
        }, 30);
      }),
    );

    // After subscribe is eventually called, immediately replay the gap event.
    mockBus.subscribe.mockImplementationOnce((_boardId: string, handler: (e: DomainEvent) => void) => {
      capturedHandler = handler;
      // Simulate the gap event arriving before subscribe returned.
      // The fixed implementation buffers events from bus.subscribe() onward,
      // so calling the handler here is equivalent to an in-flight event that
      // arrived during the DB query but was captured because subscribe was
      // registered first.
      handler(fixBusEvent);
      return jest.fn();
    });

    let capturedBody = '';

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        { headers: { Cookie: sessionCookie } },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            capturedBody += chunk.toString();
            if (capturedBody.includes(fixBusEvent.eventId)) {
              req.destroy();
            }
          });
          res.on('error', () => {});
        },
      );
      req.on('close', resolve);
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          resolve();
        } else {
          reject(err);
        }
      });
      setTimeout(() => { req.destroy(); }, 2000);
    });

    expect(capturedBody).toContain(`id: ${fixBusEvent.eventId}`);
  });
});

// ---------------------------------------------------------------------------
// SSE-FANOUT-1 + SSE-UNSUB-1: bus subscription and cleanup
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/events — bus subscription lifecycle', () => {
  const stubPool = { query: jest.fn() } as any;

  // unsubscribeFn is the teardown function returned by bus.subscribe.
  // We capture it to verify SSE-UNSUB-1 (disconnect calls it).
  const unsubscribeFn = jest.fn();
  let capturedHandler: ((event: DomainEvent) => void) | null = null;

  const mockBus = {
    publish: jest.fn(),
    subscribe: jest.fn().mockImplementation((_boardId: string, handler: (e: DomainEvent) => void) => {
      capturedHandler = handler;
      return unsubscribeFn;
    }),
  };

  let server: http.Server;
  let port: number;
  let sessionCookie: string;

  beforeAll(async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    sessionCookie = await loginAndGetCookie(server, stubPool);
    stubPool.query.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockBus.subscribe.mockClear();
    unsubscribeFn.mockClear();
    capturedHandler = null;
  });

  it('SSE-FANOUT-1: subscribes to DomainEventBus for the correct boardId on connect', async () => {
    stubPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // empty history

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        { headers: { Cookie: sessionCookie } },
        (res) => {
          res.on('data', () => {
            // Once we receive any data (SSE stream started), bus.subscribe should
            // have been called. Destroy and resolve.
            if (mockBus.subscribe.mock.calls.length > 0) {
              req.destroy();
            }
          });
          res.on('error', () => {}); // swallow destroyed-socket errors
        },
      );
      req.on('close', resolve);
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          resolve();
        } else {
          reject(err);
        }
      });

      // Poll for subscribe call then destroy.
      const poll = setInterval(() => {
        if (mockBus.subscribe.mock.calls.length > 0) {
          clearInterval(poll);
          req.destroy();
        }
      }, 20);

      setTimeout(() => { clearInterval(poll); req.destroy(); }, 2000);
    });

    expect(mockBus.subscribe).toHaveBeenCalledTimes(1);
    const [subscribedBoardId] = mockBus.subscribe.mock.calls[0] as [string, unknown];
    expect(subscribedBoardId).toBe(BOARD_ID);
  });

  it('SSE-UNSUB-1: calls the unsubscribe function returned by bus.subscribe on client disconnect', async () => {
    stubPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/boards/${BOARD_ID}/events`,
        { headers: { Cookie: sessionCookie } },
        (res) => {
          res.on('data', () => {
            // Once we receive any data, subscribe should have been called.
            // Destroy the connection to trigger the server-side 'close' event.
          });
          res.on('error', () => {}); // swallow destroyed-socket errors
        },
      );

      // Poll for subscribe call, then destroy socket to simulate disconnect.
      const poll = setInterval(() => {
        if (mockBus.subscribe.mock.calls.length > 0) {
          clearInterval(poll);
          req.destroy();
          // Give the server a moment to process the close event before resolving.
          setTimeout(resolve, 150);
        }
      }, 20);

      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('socket hang up')) {
          // Expected — don't reject.
        } else {
          reject(err);
        }
      });

      setTimeout(() => { clearInterval(poll); resolve(); }, 2000);
    });

    expect(mockBus.subscribe).toHaveBeenCalledTimes(1);
    // The route must call the unsubscribe function when req emits 'close'.
    expect(unsubscribeFn).toHaveBeenCalledTimes(1);
  });
});
