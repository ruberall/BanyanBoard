/**
 * requireAuth.test.ts
 *
 * Unit tests for requireAuth middleware.
 *
 * requireAuth is SYNCHRONOUS — it reads req.session.userId and either:
 *   - calls next() if userId is present
 *   - throws UnauthorizedError if userId is absent
 *
 * It does NOT use asyncHandler (it is not async).
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/middleware/requireAuth.ts — requireAuth function
 */

import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../errors';

// ---------------------------------------------------------------------------
// Helpers — minimal request/response/next stubs
// ---------------------------------------------------------------------------

function makeReq(userId?: string): Partial<Request> {
  return {
    session: { userId } as any,
  };
}

const makeRes = (): Partial<Response> => ({});

const makeNext = (): jest.MockedFunction<NextFunction> => jest.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {

  it('calls next() when req.session.userId is present', async () => {
    // Arrange
    const { requireAuth } = await import('../requireAuth');
    const req  = makeReq('user-uuid-1234') as Request;
    const res  = makeRes() as Response;
    const next = makeNext();

    // Act
    requireAuth(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(/* no argument — not an error */);
  });

  it('throws UnauthorizedError when req.session.userId is undefined', async () => {
    // Arrange
    const { requireAuth } = await import('../requireAuth');
    const req  = makeReq(undefined) as Request;
    const res  = makeRes() as Response;
    const next = makeNext();

    // Act & Assert — synchronous throw; wrap in try/catch or expect().toThrow
    expect(() => requireAuth(req, res, next)).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when req.session.userId is an empty string', async () => {
    // Arrange — empty string is falsy and should be treated as absent
    const { requireAuth } = await import('../requireAuth');
    const req  = makeReq('') as Request;
    const res  = makeRes() as Response;
    const next = makeNext();

    // Act & Assert
    expect(() => requireAuth(req, res, next)).toThrow(UnauthorizedError);
  });

  it('does NOT call next() when userId is absent', async () => {
    // Arrange
    const { requireAuth } = await import('../requireAuth');
    const req  = makeReq(undefined) as Request;
    const res  = makeRes() as Response;
    const next = makeNext();

    // Act
    try { requireAuth(req, res, next); } catch (_) {}

    // Assert — next must not have been called at all (not even with an error arg)
    expect(next).not.toHaveBeenCalled();
  });

  it('thrown UnauthorizedError has statusCode 401', async () => {
    // Arrange
    const { requireAuth } = await import('../requireAuth');
    const req  = makeReq(undefined) as Request;
    const res  = makeRes() as Response;
    const next = makeNext();

    // Act
    let caughtError: any;
    try { requireAuth(req, res, next); } catch (e) { caughtError = e; }

    // Assert
    expect(caughtError).toBeInstanceOf(UnauthorizedError);
    expect(caughtError.statusCode).toBe(401);
  });

});
