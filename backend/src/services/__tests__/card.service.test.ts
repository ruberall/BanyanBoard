/**
 * card.service.test.ts
 *
 * Phase 1 coverage: CardService (unit tests — mock CardRepository)
 */

import { CardService } from '../card.service';
import { CardRepository } from '../../repositories/card.repository';
import type { Card } from '../../repositories/card.repository';

const BASE_CARD: Card = {
  id: 'card-uuid-1',
  column_id: 'col-uuid-1',
  title: 'Write tests',
  description: null,
  due_date: null,
  labels: [],
  position: 0,
  created_at: new Date('2026-06-16T00:00:00Z'),
  updated_at: new Date('2026-06-16T00:00:00Z'),
};

function makeMockRepo(): jest.Mocked<CardRepository> {
  return {
    createCard: jest.fn(),
    findCardsByColumnId: jest.fn(),
    findCardById: jest.fn(),
    updateCard: jest.fn(),
    deleteCard: jest.fn(),
  } as unknown as jest.Mocked<CardRepository>;
}

describe('CardService', () => {
  let repo: jest.Mocked<CardRepository>;
  let service: CardService;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new CardService(repo);
  });

  describe('createCard(columnId, input)', () => {
    it('delegates to repo.createCard and returns the card', async () => {
      repo.createCard.mockResolvedValueOnce(BASE_CARD);

      const card = await service.createCard('col-uuid-1', { title: 'Write tests' });

      expect(repo.createCard).toHaveBeenCalledWith('col-uuid-1', { title: 'Write tests' });
      expect(card).toBe(BASE_CARD);
    });
  });

  describe('getCardsByColumnId(columnId)', () => {
    it('delegates to repo.findCardsByColumnId and returns cards array', async () => {
      repo.findCardsByColumnId.mockResolvedValueOnce([BASE_CARD]);

      const cards = await service.getCardsByColumnId('col-uuid-1');

      expect(repo.findCardsByColumnId).toHaveBeenCalledWith('col-uuid-1');
      expect(cards).toHaveLength(1);
    });
  });

  describe('getCardById(id)', () => {
    it('delegates to repo.findCardById and returns card', async () => {
      repo.findCardById.mockResolvedValueOnce(BASE_CARD);

      const card = await service.getCardById('card-uuid-1');

      expect(repo.findCardById).toHaveBeenCalledWith('card-uuid-1');
      expect(card).toBe(BASE_CARD);
    });
  });

  describe('updateCard(id, updates)', () => {
    it('delegates to repo.updateCard and returns updated card', async () => {
      const updated = { ...BASE_CARD, title: 'Updated' };
      repo.updateCard.mockResolvedValueOnce(updated);

      const card = await service.updateCard('card-uuid-1', { title: 'Updated' });

      expect(repo.updateCard).toHaveBeenCalledWith('card-uuid-1', { title: 'Updated' });
      expect(card.title).toBe('Updated');
    });
  });

  describe('deleteCard(id)', () => {
    it('delegates to repo.deleteCard and resolves void', async () => {
      repo.deleteCard.mockResolvedValueOnce(undefined);

      await expect(service.deleteCard('card-uuid-1')).resolves.toBeUndefined();
      expect(repo.deleteCard).toHaveBeenCalledWith('card-uuid-1');
    });
  });
});
