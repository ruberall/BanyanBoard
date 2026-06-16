import { Request, Response, NextFunction } from 'express';
import { requireFields } from '../validate';
import { ValidationError } from '../../errors';

function makeReq(body: unknown): Request {
  return { body } as Request;
}

const res = {} as Response;

describe('requireFields middleware', () => {
  it('calls next() with no error when all required fields are present', () => {
    const next = jest.fn() as NextFunction;
    requireFields('name', 'title')(makeReq({ name: 'Test', title: 'T' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ValidationError) when a required field is missing', () => {
    const next = jest.fn() as NextFunction;
    requireFields('name')(makeReq({}), res, next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain('name');
  });

  it('calls next(ValidationError) when body is null', () => {
    const next = jest.fn() as NextFunction;
    requireFields('name')(makeReq(null), res, next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('calls next(ValidationError) for the first missing field', () => {
    const next = jest.fn() as NextFunction;
    requireFields('name', 'email')(makeReq({ name: 'ok' }), res, next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err.message).toContain('email');
  });

  it('calls next() when fields are present but empty string (field presence only, not value)', () => {
    const next = jest.fn() as NextFunction;
    requireFields('name')(makeReq({ name: '' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns a middleware function (curried factory)', () => {
    expect(typeof requireFields('name')).toBe('function');
  });
});
