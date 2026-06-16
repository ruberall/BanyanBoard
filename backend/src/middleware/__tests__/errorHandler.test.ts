import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../errorHandler';
import { ValidationError, NotFoundError } from '../../errors';

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
});
