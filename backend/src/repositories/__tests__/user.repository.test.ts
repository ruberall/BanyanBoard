/**
 * user.repository.test.ts
 *
 * Unit tests for UserRepository — mock Queryable only, no real database.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/user.repository.ts — UserRepository class
 *
 * Acceptance Criteria covered:
 *   - createUser inserts and returns PublicUser (no password_hash)
 *   - findByEmail returns User (with password_hash) when found
 *   - findByEmail returns null when not found
 *   - findById returns PublicUser (no password_hash) when found
 *   - findById returns null when not found
 */

// ---------------------------------------------------------------------------
// Helpers — minimal Queryable stub
// ---------------------------------------------------------------------------

function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }>) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID    = 'user-uuid-1234-5678-abcd';
const USER_EMAIL = 'test@example.com';
const PASS_HASH  = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
const CREATED_AT = new Date('2026-06-17T00:00:00Z');

const fixUserRow = {
  id: USER_ID,
  email: USER_EMAIL,
  password_hash: PASS_HASH,
  created_at: CREATED_AT,
};

const fixPublicUser = {
  id: USER_ID,
  email: USER_EMAIL,
  created_at: CREATED_AT,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserRepository', () => {
  describe('unit (mock Queryable)', () => {

    // ── createUser ────────────────────────────────────────────────────────────

    describe('createUser(email, passwordHash)', () => {
      it('inserts user and returns PublicUser (id, email, created_at — no password_hash)', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.createUser(USER_EMAIL, PASS_HASH);

        // Assert — shape is PublicUser (no password_hash)
        expect(result.id).toBe(USER_ID);
        expect(result.email).toBe(USER_EMAIL);
        expect(result.created_at).toEqual(CREATED_AT);
        expect((result as any).password_hash).toBeUndefined();
      });

      it('calls query with email and passwordHash as parameters', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        await repo.createUser(USER_EMAIL, PASS_HASH);

        // Assert — the SQL params must include both email and hash
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [_sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(values).toContain(USER_EMAIL);
        expect(values).toContain(PASS_HASH);
      });
    });

    // ── findByEmail ───────────────────────────────────────────────────────────

    describe('findByEmail(email)', () => {
      it('returns the full User row (including password_hash) when email exists', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.findByEmail(USER_EMAIL);

        // Assert — must include password_hash (needed for bcrypt comparison in AuthService)
        expect(result).not.toBeNull();
        expect(result!.id).toBe(USER_ID);
        expect(result!.email).toBe(USER_EMAIL);
        expect(result!.password_hash).toBe(PASS_HASH);
        expect(result!.created_at).toEqual(CREATED_AT);
      });

      it('returns null when no user has the given email', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [], rowCount: 0 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.findByEmail('nobody@example.com');

        // Assert
        expect(result).toBeNull();
      });

      it('passes email as query parameter', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        await repo.findByEmail(USER_EMAIL);

        // Assert
        const [_sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(values).toContain(USER_EMAIL);
      });
    });

    // ── findById ──────────────────────────────────────────────────────────────

    describe('findById(id)', () => {
      it('returns PublicUser (no password_hash) when user id exists', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.findById(USER_ID);

        // Assert — shape is PublicUser
        expect(result).not.toBeNull();
        expect(result!.id).toBe(USER_ID);
        expect(result!.email).toBe(USER_EMAIL);
        expect(result!.created_at).toEqual(CREATED_AT);
        expect((result as any).password_hash).toBeUndefined();
      });

      it('returns null when no user has the given id', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [], rowCount: 0 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.findById('non-existent-uuid');

        // Assert
        expect(result).toBeNull();
      });

      it('passes id as query parameter', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRow], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        await repo.findById(USER_ID);

        // Assert
        const [_sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(values).toContain(USER_ID);
      });
    });

  });
});
