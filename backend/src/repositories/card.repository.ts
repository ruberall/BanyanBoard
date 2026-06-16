import type { Queryable } from '../db/queryable';
import { NotFoundError } from '../errors';

export interface Card {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  due_date: Date | null;
  labels: string[];
  position: number;
  created_at: Date;
  updated_at: Date;
}

export interface CardInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  labels?: string[];
}

export interface CardUpdate {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  labels?: string[];
}

export class CardRepository {
  constructor(private readonly db: Queryable) {}

  async createCard(columnId: string, input: CardInput): Promise<Card> {
    const result = await this.db.query<Card>(
      `INSERT INTO cards (column_id, title, description, due_date, labels)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, column_id, title, description, due_date, labels, position, created_at, updated_at`,
      [columnId, input.title, input.description ?? null, input.due_date ?? null, input.labels ?? []],
    );
    return result.rows[0];
  }

  async findCardsByColumnId(columnId: string): Promise<Card[]> {
    const result = await this.db.query<Card>(
      `SELECT id, column_id, title, description, due_date, labels, position, created_at, updated_at
       FROM cards
       WHERE column_id = $1
       ORDER BY position ASC, created_at ASC`,
      [columnId],
    );
    return result.rows;
  }

  async findCardById(id: string): Promise<Card> {
    const result = await this.db.query<Card>(
      `SELECT id, column_id, title, description, due_date, labels, position, created_at, updated_at
       FROM cards
       WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Card not found');
    }
    return result.rows[0];
  }

  async updateCard(id: string, updates: CardUpdate): Promise<Card> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.due_date !== undefined) {
      fields.push(`due_date = $${paramIndex++}`);
      values.push(updates.due_date);
    }
    if (updates.labels !== undefined) {
      fields.push(`labels = $${paramIndex++}`);
      values.push(updates.labels);
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const result = await this.db.query<Card>(
      `UPDATE cards SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, column_id, title, description, due_date, labels, position, created_at, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Card not found');
    }
    return result.rows[0];
  }

  async deleteCard(id: string): Promise<void> {
    const result = await this.db.query(
      'DELETE FROM cards WHERE id = $1',
      [id],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundError('Card not found');
    }
  }
}
