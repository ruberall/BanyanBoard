import type { Queryable } from '../db/queryable';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  created_at: Date;
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async createUser(email: string, passwordHash: string): Promise<PublicUser> {
    const result = await this.db.query<User>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, passwordHash],
    );
    const row = result.rows[0];
    return { id: row.id, email: row.email, created_at: row.created_at };
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<PublicUser | null> {
    const result = await this.db.query<User>(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { id: row.id, email: row.email, created_at: row.created_at };
  }
}
