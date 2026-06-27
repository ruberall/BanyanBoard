import bcrypt from 'bcrypt';
import { ConflictError, UnauthorizedError } from '../errors';
import type { UserRepository } from '../repositories/user.repository';
import type { PublicUser } from '../repositories/user.repository';

export class AuthService {
  constructor(private readonly repo: UserRepository) {}

  async register(email: string, password: string, firstName?: string | null, lastName?: string | null): Promise<PublicUser> {
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }
    const hash = await bcrypt.hash(password, 12);
    return this.repo.createUser(email, hash, firstName, lastName);
  }

  async login(email: string, password: string): Promise<PublicUser> {
    const user = await this.repo.findByEmail(email);
    // Identical message for unknown email AND wrong password — prevents email
    // enumeration: an attacker cannot distinguish "no such account" from "wrong
    // password" by observing the error response.
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new UnauthorizedError('Invalid email or password');
    }
    return { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, created_at: user.created_at };
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }
    return user;
  }
}
