/**
 * automation.routes.integration.test.ts
 *
 * Route integration tests for Phase 1: Webhook Delivery for Workflow Rules (TASK-019).
 *
 * Tests the HTTP layer for:
 *   POST   /boards/:boardId/automation-rules
 *   GET    /boards/:boardId/automation-rules
 *   PATCH  /boards/:boardId/automation-rules/:ruleId
 *   DELETE /boards/:boardId/automation-rules/:ruleId
 *   GET    /boards/:boardId/webhook-deliveries
 *
 * Pattern: real Express app via createApp(), stub pool injected so no Postgres
 * connection is required. The stub pool's query mock is shaped to satisfy
 * AutomationRepository's SQL calls for each scenario.
 *
 * Authentication: requireAuth middleware requires a session. Each describe block
 * uses supertest.agent() + beforeAll login so all requests carry a session cookie.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/automation.repository.ts — AutomationRepository
 *   src/services/automation.service.ts — AutomationService
 *   src/routes/automation.ts — createAutomationRouter
 *   (and the router mounted in routes/index.ts)
 */

import supertest from 'supertest';
import { createApp } from '../app';
import type { Config } from '../config';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

const stubConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused-in-automation-tests',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 5,
  DB_POOL_IDLE_TIMEOUT_MS: 10000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
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
// Auth fixtures — pre-computed bcrypt hash for 'securepassword1' (cost 12)
// ---------------------------------------------------------------------------

const USER_EMAIL    = 'test@example.com';
const USER_PASSWORD = 'securepassword1';
const USER_HASH     = '$2b$12$iza4wLD3eGM4F/q5nb.cHuLSVMRuZYcie.a3V6b6LwFdYO.LqLPie';
const USER_ID       = 'user-uuid-aaaa-bbbb-cccc';

const fixUserRow = {
  id:            USER_ID,
  email:         USER_EMAIL,
  password_hash: USER_HASH,
  created_at:    '2026-06-17T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Domain fixtures
// ---------------------------------------------------------------------------

const BOARD_ID    = 'board-uuid-1111-2222-3333';
const RULE_ID     = 'rule-uuid-4444-5555-6666';
const EXEC_ID     = 'exec-uuid-7777-8888-9999';
const DELIVERY_ID = 'delivery-uuid-aaaa-bbbb';

const fixRule = {
  id:           RULE_ID,
  board_id:     BOARD_ID,
  trigger_type: 'card.moved.done',
  webhook_url:  'https://example.com/webhook',
  enabled:      true,
  created_at:   '2026-06-30T00:00:00.000Z',
};

const fixDelivery = {
  id:                   DELIVERY_ID,
  trigger_execution_id: EXEC_ID,
  automation_rule_id:   RULE_ID,
  board_id:             BOARD_ID,
  attempt_count:        1,
  status:               'delivered',
  http_response_code:   200,
  error:                null,
  created_at:           '2026-06-30T01:00:00.000Z',
  updated_at:           '2026-06-30T01:00:05.000Z',
};

// ---------------------------------------------------------------------------
// POST /boards/:boardId/automation-rules
// ---------------------------------------------------------------------------

describe('POST /boards/:boardId/automation-rules', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // AuthService.login: findByEmail
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('AC-ENTRY-1: returns 201 with created automation rule when given a valid https webhook URL', async () => {
    // Arrange — stub pool for AutomationRepository.insertRule RETURNING
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixRule], rowCount: 1 });

    // Act
    const response = await agent
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'card.moved.done', webhook_url: 'https://example.com/webhook' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id:           RULE_ID,
      board_id:     BOARD_ID,
      trigger_type: 'card.moved.done',
      webhook_url:  'https://example.com/webhook',
      enabled:      true,
    });
    expect(response.body.created_at).toBeDefined();
  });

  it('accepts http:// webhook URLs as valid', async () => {
    // Arrange — http:// is valid per spec (not just https)
    const ruleWithHttp = { ...fixRule, webhook_url: 'http://internal-service/hook' };
    stubPool.query
      .mockResolvedValueOnce({ rows: [ruleWithHttp], rowCount: 1 });

    // Act
    const response = await agent
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'card.moved.done', webhook_url: 'http://internal-service/hook' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.webhook_url).toBe('http://internal-service/hook');
  });

  it('returns 400 WORKFLOW_ACTION_FAILED with details when webhook_url is not http/https', async () => {
    // Arrange — no DB call expected (validation fails before insert)

    // Act
    const response = await agent
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'card.moved.done', webhook_url: 'ftp://badscheme.com/hook' });

    // Assert — WorkflowError serialization
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('WORKFLOW_ACTION_FAILED');
    expect(response.body.message).toBeDefined();
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'webhook_url' }),
      ]),
    );
    // No DB call should have been made
    expect(stubPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 WORKFLOW_ACTION_FAILED with details when webhook_url is malformed', async () => {
    // Act
    const response = await agent
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'card.moved.done', webhook_url: 'not-a-url-at-all' });

    // Assert — WorkflowError with field-level detail
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('WORKFLOW_ACTION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'webhook_url' }),
      ]),
    );
    expect(stubPool.query).not.toHaveBeenCalled();
  });

  it('returns 400 WORKFLOW_ACTION_FAILED with details when trigger_type is not allowed', async () => {
    // Act
    const response = await agent
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'invalid.type', webhook_url: 'https://example.com/hook' });

    // Assert — WorkflowError serialization
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('WORKFLOW_ACTION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'trigger_type' }),
      ]),
    );
    expect(stubPool.query).not.toHaveBeenCalled();
  });

  it('returns 401 when request is not authenticated', async () => {
    // Act — unauthenticated request (no session cookie)
    const response = await supertest(app)
      .post(`/boards/${BOARD_ID}/automation-rules`)
      .send({ trigger_type: 'card.moved.done', webhook_url: 'https://example.com/hook' });

    // Assert
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /boards/:boardId/automation-rules
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/automation-rules', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 });
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('returns 200 with array of automation rules for the board', async () => {
    // Arrange
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixRule], rowCount: 1 });

    // Act
    const response = await agent.get(`/boards/${BOARD_ID}/automation-rules`);

    // Assert
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id:           RULE_ID,
      board_id:     BOARD_ID,
      trigger_type: 'card.moved.done',
      enabled:      true,
    });
  });

  it('returns 200 with empty array when board has no rules', async () => {
    // Arrange
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // Act
    const response = await agent.get(`/boards/${BOARD_ID}/automation-rules`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns 401 when request is not authenticated', async () => {
    const response = await supertest(app).get(`/boards/${BOARD_ID}/automation-rules`);
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/automation-rules/:ruleId
// ---------------------------------------------------------------------------

describe('PATCH /boards/:boardId/automation-rules/:ruleId', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 });
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('returns 200 with the updated rule when toggling enabled to false', async () => {
    // Arrange — stub: single UPDATE RETURNING * call
    const disabledRule = { ...fixRule, enabled: false };
    stubPool.query
      .mockResolvedValueOnce({ rows: [disabledRule], rowCount: 1 }); // UPDATE RETURNING *

    // Act
    const response = await agent
      .patch(`/boards/${BOARD_ID}/automation-rules/${RULE_ID}`)
      .send({ enabled: false });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id:      RULE_ID,
      enabled: false,
    });
  });

  it('returns 401 when request is not authenticated', async () => {
    const response = await supertest(app)
      .patch(`/boards/${BOARD_ID}/automation-rules/${RULE_ID}`)
      .send({ enabled: false });
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /boards/:boardId/automation-rules/:ruleId
// ---------------------------------------------------------------------------

describe('DELETE /boards/:boardId/automation-rules/:ruleId', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 });
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('returns 204 No Content when rule is deleted successfully', async () => {
    // Arrange — stub: DELETE (void)
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    // Act
    const response = await agent.delete(`/boards/${BOARD_ID}/automation-rules/${RULE_ID}`);

    // Assert
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('returns 401 when request is not authenticated', async () => {
    const response = await supertest(app)
      .delete(`/boards/${BOARD_ID}/automation-rules/${RULE_ID}`);
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /boards/:boardId/webhook-deliveries
// ---------------------------------------------------------------------------

describe('GET /boards/:boardId/webhook-deliveries', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 });
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('returns 200 with paginated envelope of webhook deliveries for the board', async () => {
    // Arrange
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixDelivery], rowCount: 1 });

    // Act
    const response = await agent.get(`/boards/${BOARD_ID}/webhook-deliveries`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id:      DELIVERY_ID,
      status:  'delivered',
      board_id: BOARD_ID,
    });
    expect(response.body).toHaveProperty('hasMore', false);
  });

  it('returns 200 with empty data array when board has no deliveries', async () => {
    // Arrange
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // Act
    const response = await agent.get(`/boards/${BOARD_ID}/webhook-deliveries`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toEqual([]);
    expect(response.body).toHaveProperty('hasMore', false);
  });

  it('returns 401 when request is not authenticated', async () => {
    const response = await supertest(app).get(`/boards/${BOARD_ID}/webhook-deliveries`);
    expect(response.status).toBe(401);
  });
});
