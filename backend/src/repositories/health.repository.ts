import type { Queryable } from '../db/queryable';

export class HealthRepository {
  constructor(private readonly db: Queryable) {}

  async ping(): Promise<boolean> {
    const result = await this.db.query<{ value: number }>('SELECT 1 AS value');
    return result.rows.length > 0;
  }
}
