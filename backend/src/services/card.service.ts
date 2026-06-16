import type { CardRepository, Card, CardInput, CardUpdate } from '../repositories/card.repository';
import { logger } from '../logger';

export class CardService {
  constructor(private readonly repo: CardRepository) {}

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
}
