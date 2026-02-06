import { PaymentService } from '../PaymentService';
import { AbandonmentRepository } from '../../repositories/AbandonmentRepository';
import { ConversationService, ConversationStatus } from '../ConversationService';

jest.mock('../../repositories/AbandonmentRepository');
jest.mock('../ConversationService');

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processPaymentWebhook', () => {
    it('should process completed payment and mark abandonment as converted', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'pending',
        payment_id: null,
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        payment_id: 'pay-123',
        status: 'converted',
      });
      (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
        amount: 150.0,
        currency: 'BRL',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
      expect(result.abandonmentId).toBe('abn-123');
      expect(result.paymentStatus).toBe('converted');
      expect(AbandonmentRepository.markAsConverted).toHaveBeenCalledWith(
        'abn-123',
        'pay-123',
        'converted',
        150.0
      );
      expect(ConversationService.updateState).toHaveBeenCalledWith(
        'conv-123',
        ConversationStatus.CLOSED,
        'Payment converted: pay-123',
        'trace-123'
      );
    });

    it('should handle payment declined and close conversation', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'pending',
        payment_id: null,
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        payment_id: 'pay-123',
        status: 'declined',
      });
      (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'declined',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
      expect(result.paymentStatus).toBe('declined');
      expect(ConversationService.updateState).toHaveBeenCalledWith(
        'conv-123',
        ConversationStatus.CLOSED,
        'Payment declined: pay-123',
        'trace-123'
      );
    });

    it('should handle pending payment status', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'pending',
        payment_id: null,
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        payment_id: 'pay-123',
        status: 'pending',
      });
      (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'processing',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
      expect(result.paymentStatus).toBe('pending');
    });

    it('should enforce idempotency via payment_id', async () => {
      const existingAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'converted',
        payment_id: 'pay-123',
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(existingAbandonment);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('already_processed');
      expect(result.paymentStatus).toBe('converted');
      expect(AbandonmentRepository.markAsConverted).not.toHaveBeenCalled();
    });

    it('should return failed when abandonment not found', async () => {
      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(null);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'nonexistent',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
      expect(result.message).toContain('Abandonment not found');
    });

    it('should reject invalid payload without payment_id', async () => {
      const payload = {
        abandonment_id: 'abn-123',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
      expect(result.message).toContain('Invalid');
    });

    it('should reject invalid payload without abandonment_id', async () => {
      const payload = {
        payment_id: 'pay-123',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
      expect(result.message).toContain('Invalid');
    });

    it('should reject invalid payload without status', async () => {
      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
      expect(result.message).toContain('Invalid');
    });

    it('should map various payment statuses to SARA statuses', async () => {
      const testCases: Array<[string, string]> = [
        ['completed', 'converted'],
        ['succeeded', 'converted'],
        ['captured', 'converted'],
        ['approved', 'converted'],
        ['pending', 'pending'],
        ['processing', 'pending'],
        ['declined', 'declined'],
        ['failed', 'declined'],
        ['cancelled', 'declined'],
        ['refunded', 'declined'],
      ];

      for (const [paymentStatus, expectedSaraStatus] of testCases) {
        jest.clearAllMocks();

        const mockAbandonment = {
          id: 'abn-123',
          conversation_id: 'conv-123',
          status: 'pending',
          payment_id: null,
        };

        (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
        (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
        (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
          ...mockAbandonment,
          payment_id: 'pay-123',
          status: expectedSaraStatus,
        });
        (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

        const payload = {
          payment_id: `pay-${paymentStatus}`,
          abandonment_id: 'abn-123',
          status: paymentStatus,
        };

        const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

        expect(result.paymentStatus).toBe(expectedSaraStatus);
      }
    });

    it('should handle abandonment without conversation_id', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: null,
        status: 'pending',
        payment_id: null,
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        payment_id: 'pay-123',
        status: 'converted',
      });

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
      expect(ConversationService.updateState).not.toHaveBeenCalled();
    });

    it('should include amount in update when provided', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'pending',
        payment_id: null,
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        payment_id: 'pay-123',
        status: 'converted',
      });
      (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
        amount: 199.99,
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
      expect(AbandonmentRepository.markAsConverted).toHaveBeenCalledWith(
        'abn-123',
        'pay-123',
        'converted',
        199.99
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status for abandonment', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        payment_id: 'pay-123',
        status: 'converted',
        converted_at: '2026-02-06T10:00:00Z',
      };

      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);

      const status = await PaymentService.getPaymentStatus('abn-123');

      expect(status.paymentId).toBe('pay-123');
      expect(status.status).toBe('converted');
      expect(status.convertedAt).toBe('2026-02-06T10:00:00Z');
    });

    it('should throw error when abandonment not found', async () => {
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(PaymentService.getPaymentStatus('nonexistent')).rejects.toThrow(
        'Abandonment not found'
      );
    });
  });

  describe('isConverted', () => {
    it('should return true when abandonment is converted', async () => {
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue({
        id: 'abn-123',
        status: 'converted',
      });

      const result = await PaymentService.isConverted('abn-123');

      expect(result).toBe(true);
    });

    it('should return false when abandonment is not converted', async () => {
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue({
        id: 'abn-123',
        status: 'pending',
      });

      const result = await PaymentService.isConverted('abn-123');

      expect(result).toBe(false);
    });

    it('should return false when abandonment not found', async () => {
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(null);

      const result = await PaymentService.isConverted('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getUserConversionStats', () => {
    it('should calculate conversion statistics correctly', async () => {
      (AbandonmentRepository.findByUserId as jest.Mock).mockResolvedValue([
        { id: 'abn-1', status: 'converted', value: 100 },
        { id: 'abn-2', status: 'converted', value: 200 },
        { id: 'abn-3', status: 'pending', value: 150 },
        { id: 'abn-4', status: 'declined', value: 75 },
      ]);

      const stats = await PaymentService.getUserConversionStats('user-123');

      expect(stats.totalAbandonments).toBe(4);
      expect(stats.convertedAbandonments).toBe(2);
      expect(stats.conversionRate).toBe(50);
      expect(stats.totalRevenue).toBe(300);
    });

    it('should handle zero abandonments', async () => {
      (AbandonmentRepository.findByUserId as jest.Mock).mockResolvedValue([]);

      const stats = await PaymentService.getUserConversionStats('user-123');

      expect(stats.totalAbandonments).toBe(0);
      expect(stats.convertedAbandonments).toBe(0);
      expect(stats.conversionRate).toBe(0);
      expect(stats.totalRevenue).toBe(0);
    });

    it('should handle all conversions', async () => {
      (AbandonmentRepository.findByUserId as jest.Mock).mockResolvedValue([
        { id: 'abn-1', status: 'converted', value: 100 },
        { id: 'abn-2', status: 'converted', value: 200 },
      ]);

      const stats = await PaymentService.getUserConversionStats('user-123');

      expect(stats.totalAbandonments).toBe(2);
      expect(stats.convertedAbandonments).toBe(2);
      expect(stats.conversionRate).toBe(100);
      expect(stats.totalRevenue).toBe(300);
    });
  });

  describe('Payload validation', () => {
    it('should validate payment_id is non-empty string', async () => {
      const payload = {
        payment_id: '',
        abandonment_id: 'abn-123',
        status: 'completed',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
    });

    it('should validate amount is non-negative', async () => {
      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
        amount: -50,
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
    });

    it('should validate currency is 3-letter code', async () => {
      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
        currency: 'INVALID',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('failed');
    });

    it('should accept valid currency codes', async () => {
      const mockAbandonment = {
        id: 'abn-123',
        conversation_id: 'conv-123',
        status: 'pending',
      };

      (AbandonmentRepository.findByPaymentId as jest.Mock).mockResolvedValue(null);
      (AbandonmentRepository.findById as jest.Mock).mockResolvedValue(mockAbandonment);
      (AbandonmentRepository.markAsConverted as jest.Mock).mockResolvedValue({
        ...mockAbandonment,
        status: 'converted',
      });
      (ConversationService.updateState as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        payment_id: 'pay-123',
        abandonment_id: 'abn-123',
        status: 'completed',
        currency: 'USD',
      };

      const result = await PaymentService.processPaymentWebhook(payload, 'trace-123');

      expect(result.status).toBe('processed');
    });
  });
});
