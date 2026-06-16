import type { CardRepository, Card, CardInput, CardUpdate } from '../repositories/card.repository';
import { logger } from '../logger';
import { NotFoundError } from '../errors';
import type { Queryable } from '../db/queryable';

export class CardService {
  constructor(
    private readonly repo: CardRepository,
    private readonly db: Queryable,
  ) {}

  async createCard(columnId: string, input: CardInput): Promise<Card> {
    const card = await this.repo.createCard(columnId, input);
    logger.info({ cardId: card.id, columnId }, 'card.created');
    return card;
  }

  async getCardsByColumnId(columnId: string): Promise<Card[]> {
    return this.repo.findCardsByColumnId(columnId);
  }

  async getCardById(id: string): Promise<Card> {
    return this.repo.findCardById(id);
  }

  async updateCard(id: string, updates: CardUpdate): Promise<Card> {
    const card = await this.repo.updateCard(id, updates);
    logger.info({ cardId: id }, 'card.updated');
    return card;
  }

  async deleteCard(id: string): Promise<void> {
    await this.repo.deleteCard(id);
    logger.info({ cardId: id }, 'card.deleted');
  }

  async moveCard(id: string, columnId: string, afterCardId: string | null): Promise<Card> {
    await this.repo.findCardById(id);

    const colResult = await this.db.query<{ id: string }>(
      'SELECT id FROM columns WHERE id = $1',
      [columnId],
    );
    if (colResult.rows.length === 0) {
      throw new NotFoundError('Column not found');
    }

    const cards = await this.repo.findCardsByColumnId(columnId);

    let newPosition: number;
    if (cards.length === 0) {
      newPosition = 1.0;
    } else if (afterCardId === null) {
      newPosition = cards[0].position / 2;
    } else {
      const afterIndex = cards.findIndex((c) => c.id === afterCardId);
      if (afterIndex === cards.length - 1) {
        newPosition = cards[cards.length - 1].position + 1.0;
      } else {
        newPosition = (cards[afterIndex].position + cards[afterIndex + 1].position) / 2;
      }
    }

    const card = await this.repo.moveCard(id, columnId, newPosition);
    logger.info({ cardId: id, columnId, position: newPosition }, 'card.moved');
    return card;
  }
}
