import { Router } from 'express';
import { z } from 'zod';
import type { Queryable } from '../db/queryable';
import { UserRepository } from '../repositories/user.repository';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../lib/asyncHandler';
import { ValidationError } from '../errors';
import { requireAuth } from '../middleware/requireAuth';

const registerSchema = z.object({
  email: z.string().email('email must be a valid email address'),
  password: z.string().min(8, 'password must be at least 8 characters').max(72, 'password must be at most 72 characters'),
});

const loginSchema = z.object({
  email: z.string().email('email must be a valid email address'),
  password: z.string().min(1, 'password is required'),
});

export function createAuthRouter(db: Queryable): Router {
  const repo = new UserRepository(db);
  const service = new AuthService(repo);
  const router = Router();

  router.post('/register', asyncHandler(async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input');
    }
    const { email, password } = parsed.data;
    const user = await service.register(email, password);
    // Regenerate session ID before writing userId to prevent session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.log.info({ event: 'user.registered', userId: user.id }, 'User registered');
      res.status(201).json(user);
    });
  }));

  router.post('/login', asyncHandler(async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input');
    }
    const { email, password } = parsed.data;
    const user = await service.login(email, password);
    // Regenerate session ID before writing userId to prevent session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.log.info({ event: 'user.login', userId: user.id }, 'User logged in');
      res.json(user);
    });
  }));

  router.post('/logout', (req, res, next) => {
    const userId = req.session.userId;
    // Log before destroy: once the session is torn down req.session.userId
    // is gone, so we capture the user identity while it's still accessible.
    req.log.info({ event: 'user.logout', userId }, 'User logged out');
    req.session.destroy((err) => {
      if (err) return next(err);
      res.json({});
    });
  });

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await service.getMe(req.session.userId!);
    res.json(user);
  }));

  return router;
}
