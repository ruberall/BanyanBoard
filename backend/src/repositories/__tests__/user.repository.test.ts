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

const fixUserRowWithNames = {
  id: USER_ID,
  email: USER_EMAIL,
  password_hash: PASS_HASH,
  first_name: 'Alice',
  last_name: 'Smith',
  created_at: CREATED_AT,
};

const fixPublicUserWithNames = {
  id: USER_ID,
  email: USER_EMAIL,
  first_name: 'Alice',
  last_name: 'Smith',
  created_at: CREATED_AT,
};

const fixPublicUserNullNames = {
  id: USER_ID,
  email: USER_EMAIL,
  first_name: null,
  last_name: null,
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

    // ── createUser with first_name / last_name (TASK-015 Phase 1) ────────────
    //
    // AC-S2-VERIFY-1: users table has first_name and last_name columns (nullable)
    // AC-S3-HAPPY-1: POST /auth/register with first_name + last_name returns 201 with those fields
    // AC-S3-HAPPY-2: POST /auth/register WITHOUT first_name/last_name still succeeds (null values)

    describe('createUser(email, passwordHash, firstName?, lastName?)', () => {
      it('AC-S3-HAPPY-1: returns PublicUser with first_name and last_name when both are supplied', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRowWithNames], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        const result = await repo.createUser(USER_EMAIL, PASS_HASH, 'Alice', 'Smith');

        // Assert — PublicUser shape now includes first_name and last_name
        expect(result.id).toBe(USER_ID);
        expect(result.email).toBe(USER_EMAIL);
        expect((result as any).first_name).toBe('Alice');
        expect((result as any).last_name).toBe('Smith');
        expect(result.created_at).toEqual(CREATED_AT);
        expect((result as any).password_hash).toBeUndefined();
      });

      it('AC-S3-HAPPY-1: passes first_name and last_name as SQL parameters when supplied', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixUserRowWithNames], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act
        await repo.createUser(USER_EMAIL, PASS_HASH, 'Alice', 'Smith');

        // Assert — SQL params must include email, hash, first_name, last_name
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [_sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(values).toContain(USER_EMAIL);
        expect(values).toContain(PASS_HASH);
        expect(values).toContain('Alice');
        expect(values).toContain('Smith');
      });

      it('AC-S3-HAPPY-2: returns PublicUser with first_name=null and last_name=null when names are omitted', async () => {
        // Arrange — DB returns null for the name columns (as would happen post-migration)
        const mockDb = makeMockDb([
          { rows: [fixPublicUserNullNames], rowCount: 1 },
        ]);
        const { UserRepository } = await import('../user.repository');
        const repo = new UserRepository(mockDb);

        // Act — call without optional name params
        const result = await repo.createUser(USER_EMAIL, PASS_HASH);

        // Assert — first_name and last_name are present as null (not undefined)
        expect(result.id).toBe(USER_ID);
        expect((result as any).first_name).toBeNull();
        expect((result as any).last_name).toBeNull();
        expect((result as any).password_hash).toBeUndefined();
      });
    });

  });
});
