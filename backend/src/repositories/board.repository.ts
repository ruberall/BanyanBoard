import type { Queryable } from '../db/queryable';
import { NotFoundError } from '../errors';

export interface Board {
  id: string;
  name: string;
  created_at: Date;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at?: Date;
}

export interface BoardWithColumns extends Board {
  columns: Column[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'] as const;

export class BoardRepository {
  constructor(private readonly db: Queryable) {}

  async createBoard(name: string): Promise<Board> {
    const result = await this.db.query<Board>(
      'INSERT INTO boards (name) VALUES ($1) RETURNING id, name, created_at',
      [name],
    );

    const board = result.rows[0];

    // Seed the three default columns concurrently. Positions are 1-indexed
    // to leave headroom for inserting columns before position 1 in the future.
    await Promise.all(
      DEFAULT_COLUMNS.map((colName, i) =>
        this.db.query(
          'INSERT INTO columns (board_id, name, position) VALUES ($1, $2, $3)',
          [board.id, colName, i + 1],
        ),
      ),
    );

    return board;
  }

  async findAllBoards(page: number, limit: number): Promise<PaginatedResult<Board>> {
    const offset = (page - 1) * limit;
    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ count: string }>('SELECT COUNT(*) AS count FROM boards'),
      this.db.query<Board>(
        'SELECT id, name, created_at FROM boards ORDER BY created_at ASC LIMIT $1 OFFSET $2',
        [limit, offset],
      ),
    ]);
    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    };
  }

  async findBoardById(id: string): Promise<BoardWithColumns> {
    // Two separate queries rather than a JOIN so that boards with zero columns
    // are still returned (a LEFT JOIN would still work, but the two-query
    // approach is clearer and avoids repeated board fields per row).
    const boardResult = await this.db.query<Board>(
      'SELECT id, name, created_at FROM boards WHERE id = $1',
      [id],
    );

    if (boardResult.rows.length === 0) {
      throw new NotFoundError('Board not found');
    }

    const board = boardResult.rows[0];

    const columnsResult = await this.db.query<Column>(
      'SELECT id, board_id, name, position FROM columns WHERE board_id = $1 ORDER BY position ASC',
      [id],
    );

    return {
      ...board,
      columns: columnsResult.rows,
    };
  }

  async deleteBoard(id: string): Promise<void> {
    const result = await this.db.query(
      'DELETE FROM boards WHERE id = $1',
      [id],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundError('Board not found');
    }
  }
}
