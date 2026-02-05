import { UserRepository } from '../../src/repositories/UserRepository';
import { AbandonmentRepository } from '../../src/repositories/AbandonmentRepository';
import { ConversationRepository } from '../../src/repositories/ConversationRepository';

describe('Repositories', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      console.log('DATABASE_URL not set, skipping repository tests');
    }
  });

  describe('UserRepository', () => {
    it('should have upsert method', async () => {
      if (!process.env.DATABASE_URL) {
        return;
      }

      expect(typeof UserRepository.upsert).toBe('function');
    });

    it('should have findByPhone method', async () => {
      expect(typeof UserRepository.findByPhone).toBe('function');
    });

    it('should have findById method', async () => {
      expect(typeof UserRepository.findById).toBe('function');
    });

    it('should have markOptedOut method', async () => {
      expect(typeof UserRepository.markOptedOut).toBe('function');
    });

    it('should have isOptedOut method', async () => {
      expect(typeof UserRepository.isOptedOut).toBe('function');
    });
  });

  describe('AbandonmentRepository', () => {
    it('should have findByExternalId method', async () => {
      expect(typeof AbandonmentRepository.findByExternalId).toBe('function');
    });

    it('should have create method', async () => {
      expect(typeof AbandonmentRepository.create).toBe('function');
    });

    it('should have findById method', async () => {
      expect(typeof AbandonmentRepository.findById).toBe('function');
    });

    it('should have findActiveByUserId method', async () => {
      expect(typeof AbandonmentRepository.findActiveByUserId).toBe('function');
    });
  });

  describe('ConversationRepository', () => {
    it('should have create method', async () => {
      expect(typeof ConversationRepository.create).toBe('function');
    });

    it('should have findByAbandonmentId method', async () => {
      expect(typeof ConversationRepository.findByAbandonmentId).toBe('function');
    });

    it('should have findById method', async () => {
      expect(typeof ConversationRepository.findById).toBe('function');
    });

    it('should have findActiveByUserId method', async () => {
      expect(typeof ConversationRepository.findActiveByUserId).toBe('function');
    });

    it('should have updateStatus method', async () => {
      expect(typeof ConversationRepository.updateStatus).toBe('function');
    });
  });
});
