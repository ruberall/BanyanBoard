import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../errorHandler';
import { ValidationError, NotFoundError, WorkflowError } from '../../errors';

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = jest.fn() as unknown as NextFunction;

describe('errorHandler', () => {
  it('returns correct status and body for AppError subclasses', () => {
    const res = mockRes();
    errorHandler(new NotFoundError('Board not found'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'NOT_FOUND', message: 'Board not found' });
  });

  it('returns 400 for malformed JSON (SyntaxError with body property)', () => {
    const res = mockRes();
    const syntaxErr = Object.assign(new SyntaxError('Unexpected token'), { body: true });
    errorHandler(syntaxErr as Error, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'BAD_REQUEST',
      message: 'Malformed JSON in request body',
    });
  });

  it('returns 500 for unexpected non-operational errors', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it('does not expose message for non-AppError in production-like path', () => {
    const res = mockRes();
    errorHandler(new RangeError('secret internal detail'), req, res, next);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBe('An unexpected error occurred');
  });

  // ---------------------------------------------------------------------------
  // WorkflowError — details serialization
  // Tests will FAIL until:
  //   src/errors.ts adds WorkflowError class
  //   src/middleware/errorHandler.ts includes details in the JSON response when present
  // ---------------------------------------------------------------------------

  it('WorkflowError: returns 400 with WORKFLOW_ACTION_FAILED code', () => {
    const res = mockRes();
    errorHandler(new WorkflowError('Action failed'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'WORKFLOW_ACTION_FAILED', message: 'Action failed' }),
    );
  });

  it('WorkflowError: includes details array in response when details are provided', () => {
    const res = mockRes();
    const details = [
      { field: 'recipient', error: 'Email address is invalid' },
      { field: 'subject', error: 'Subject is required' },
    ];
    errorHandler(new WorkflowError('Action failed', details), req, res, next);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.details).toEqual(details);
  });

  it('WorkflowError: omits or uses empty details array when no details provided', () => {
    const res = mockRes();
    errorHandler(new WorkflowError('Action failed'), req, res, next);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    // details should either be absent or an empty array — not undefined-throwing
    if ('details' in body) {
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details).toHaveLength(0);
    }
    // error and message must always be present
    expect(body.error).toBe('WORKFLOW_ACTION_FAILED');
    expect(body.message).toBeDefined();
  });
});
