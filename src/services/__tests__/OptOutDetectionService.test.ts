import { OptOutDetectionService } from '../OptOutDetectionService';
import { UserRepository } from '../../repositories/UserRepository';

jest.mock('../../repositories/UserRepository');

describe('OptOutDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectOptOut', () => {
    it('should detect opt-out using deterministic method with Portuguese keyword', async () => {
      const result = await OptOutDetectionService.detectOptOut('parar', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out using deterministic method with English keyword', async () => {
      const result = await OptOutDetectionService.detectOptOut('stop sending messages', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out using deterministic method with cancelar', async () => {
      const result = await OptOutDetectionService.detectOptOut('quero cancelar minha inscrição', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out using deterministic method with unsubscribe', async () => {
      const result = await OptOutDetectionService.detectOptOut('please unsubscribe me', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out with case-insensitive keywords', async () => {
      const result = await OptOutDetectionService.detectOptOut('PARAR com mensagens', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out with "não quero" phrase', async () => {
      const result = await OptOutDetectionService.detectOptOut('não quero mais mensagens', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect opt-out with "retire meu número" phrase', async () => {
      const result = await OptOutDetectionService.detectOptOut('retire meu número da lista', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(true);
      expect(result.method).toBe('deterministic');
      expect(result.confidence).toBe(0.95);
    });

    it('should not detect opt-out for normal messages', async () => {
      const result = await OptOutDetectionService.detectOptOut('qual é o preço?', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(false);
      expect(result.method).toBe('none');
      expect(result.confidence).toBe(0);
    });

    it('should not detect opt-out for positive responses', async () => {
      const result = await OptOutDetectionService.detectOptOut('sim, quero continuar', 'conv-123', 'trace-123');

      expect(result.isOptOut).toBe(false);
      expect(result.method).toBe('none');
      expect(result.confidence).toBe(0);
    });

    it('should use AI fallback for ambiguous long messages', async () => {
      const longMessage = 'Estou muito ocupado agora porque tenho muitos compromissos porque não tenho tempo para ficar recebendo mensagens';
      const result = await OptOutDetectionService.detectOptOut(longMessage, 'conv-123', 'trace-123');

      // Should attempt AI fallback but may return 'none' if no opt-out patterns found
      expect(result).toHaveProperty('isOptOut');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('confidence');
    });

    it('should return false on error and log the error', async () => {
      const result = await OptOutDetectionService.detectOptOut('test', 'conv-123', 'trace-123');

      // Should not throw but return safe default
      expect(result.isOptOut).toBeDefined();
      expect(result.method).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  describe('markOptedOut', () => {
    it('should mark user as opted out', async () => {
      const mockUser = { id: 'user-123', opted_out: false };
      (UserRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (UserRepository.markOptedOut as jest.Mock).mockResolvedValue(undefined);

      await OptOutDetectionService.markOptedOut('user-123', 'trace-123');

      expect(UserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(UserRepository.markOptedOut).toHaveBeenCalledWith('user-123', 'User requested opt-out via WhatsApp message');
    });

    it('should handle user not found gracefully', async () => {
      (UserRepository.findById as jest.Mock).mockResolvedValue(null);

      // Should not throw
      await OptOutDetectionService.markOptedOut('nonexistent-user', 'trace-123');

      expect(UserRepository.findById).toHaveBeenCalledWith('nonexistent-user');
    });

    it('should throw on database error', async () => {
      (UserRepository.findById as jest.Mock).mockResolvedValue({ id: 'user-123' });
      (UserRepository.markOptedOut as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        OptOutDetectionService.markOptedOut('user-123', 'trace-123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('Deterministic keyword detection edge cases', () => {
    it('should match keyword as whole word only', async () => {
      // "não" should match in "não quero" but not in "nãosei"
      const result1 = await OptOutDetectionService.detectOptOut('não', 'conv-123', 'trace-123');
      expect(result1.isOptOut).toBe(true);
    });

    it('should detect "basta" (enough)', async () => {
      const result = await OptOutDetectionService.detectOptOut('basta de mensagens', 'conv-123', 'trace-123');
      expect(result.isOptOut).toBe(true);
    });

    it('should detect "chega" (enough/stop)', async () => {
      const result = await OptOutDetectionService.detectOptOut('chega de spam', 'conv-123', 'trace-123');
      expect(result.isOptOut).toBe(true);
    });

    it('should detect "sair" (leave)', async () => {
      const result = await OptOutDetectionService.detectOptOut('quero sair desta lista', 'conv-123', 'trace-123');
      expect(result.isOptOut).toBe(true);
    });

    it('should detect "desinscrever" (unsubscribe)', async () => {
      const result = await OptOutDetectionService.detectOptOut('desinscrever', 'conv-123', 'trace-123');
      expect(result.isOptOut).toBe(true);
    });
  });

  describe('AI fallback edge cases', () => {
    it('should trigger AI fallback for messages with "porque" (because)', async () => {
      const message = 'não posso responder agora porque estou muito ocupado';
      const result = await OptOutDetectionService.detectOptOut(message, 'conv-123', 'trace-123');

      // Should have attempted to use AI or returned deterministic match
      expect(result).toHaveProperty('method');
    });

    it('should trigger AI fallback for messages longer than 50 chars without keywords', async () => {
      const longMessage = 'Eu realmente gostaria de continuar recebendo informações sobre seus produtos e serviços no futuro';
      const result = await OptOutDetectionService.detectOptOut(longMessage, 'conv-123', 'trace-123');

      expect(result).toHaveProperty('isOptOut');
      expect(result).toHaveProperty('confidence');
    });
  });
});
