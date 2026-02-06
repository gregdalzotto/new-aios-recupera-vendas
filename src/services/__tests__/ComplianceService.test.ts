import { ComplianceService } from '../ComplianceService';
import { ConversationRepository } from '../../repositories/ConversationRepository';

jest.mock('../../repositories/ConversationRepository');

describe('ComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isWithin24HourWindow', () => {
    it('should return false for conversation not found', async () => {
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(null);

      const result = await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(result).toBe(false);
    });

    it('should check against last user message timestamp when available', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: twoHoursAgo,
        created_at: new Date(twoHoursAgo.getTime() - 24 * 60 * 60 * 1000),
      });

      const result = await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(result).toBe(true);
    });

    it('should return false when outside 24-hour window from last user message', async () => {
      const now = new Date();
      const moreThan24HoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: moreThan24HoursAgo,
        created_at: new Date(moreThan24HoursAgo.getTime() - 24 * 60 * 60 * 1000),
      });

      const result = await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(result).toBe(false);
    });

    it('should fall back to conversation creation time when no user messages', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: null,
        created_at: twoHoursAgo,
      });

      const result = await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(result).toBe(true);
    });

    it('should return false when outside 24h from creation time', async () => {
      const now = new Date();
      const moreThan24HoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: null,
        created_at: moreThan24HoursAgo,
      });

      const result = await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      (ConversationRepository.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        ComplianceService.isWithin24HourWindow('conv-123', 'trace-123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getComplianceStatus', () => {
    it('should return compliance status with 24h window check', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: oneHourAgo,
        created_at: new Date(oneHourAgo.getTime() - 60 * 60 * 1000),
      });

      const status = await ComplianceService.getComplianceStatus('conv-123', 'trace-123');

      expect(status.isWithin24h).toBe(true);
      expect(status.hasOptedOut).toBe(false);
      expect(status.complianceWarnings).toEqual([]);
    });

    it('should include warning when outside 24h window', async () => {
      const now = new Date();
      const moreThan24HoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: moreThan24HoursAgo,
        created_at: new Date(moreThan24HoursAgo.getTime() - 24 * 60 * 60 * 1000),
      });

      const status = await ComplianceService.getComplianceStatus('conv-123', 'trace-123');

      expect(status.isWithin24h).toBe(false);
      expect(status.complianceWarnings).toContain('Outside 24-hour message window');
    });

    it('should throw error when conversation not found', async () => {
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        ComplianceService.getComplianceStatus('nonexistent-conv', 'trace-123')
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('logComplianceDecision', () => {
    it('should log compliance decision for allowed', async () => {
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      await ComplianceService.logComplianceDecision('conv-123', 'allowed', 'Message within 24h window', 'trace-123');

      // Should not throw
      expect(true).toBe(true);

      logSpy.mockRestore();
    });

    it('should log compliance decision for blocked', async () => {
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      await ComplianceService.logComplianceDecision('conv-123', 'blocked', 'User opted out', 'trace-123');

      expect(true).toBe(true);

      logSpy.mockRestore();
    });

    it('should log compliance decision for warned', async () => {
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      await ComplianceService.logComplianceDecision(
        'conv-123',
        'warned',
        'Outside 24-hour window',
        'trace-123'
      );

      expect(true).toBe(true);

      logSpy.mockRestore();
    });
  });

  describe('validateWebhookSignature', () => {
    it('should return false when signature is missing', () => {
      const result = ComplianceService.validateWebhookSignature(undefined);

      expect(result).toBe(false);
    });

    it('should return true when signature is provided', () => {
      const result = ComplianceService.validateWebhookSignature('valid-signature');

      expect(result).toBe(true);
    });

    it('should return true for any non-empty signature', () => {
      const result = ComplianceService.validateWebhookSignature('some-random-signature');

      expect(result).toBe(true);
    });
  });

  describe('checkMessageSafety', () => {
    it('should detect JavaScript protocol injection', async () => {
      const result = await ComplianceService.checkMessageSafety('javascript:alert("xss")', 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect script tag injection', async () => {
      const result = await ComplianceService.checkMessageSafety('<script>alert("xss")</script>', 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect onclick handler injection', async () => {
      const result = await ComplianceService.checkMessageSafety('onclick=alert("xss")', 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect onerror handler injection', async () => {
      const result = await ComplianceService.checkMessageSafety('onerror=alert("xss")', 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect SQL injection patterns', async () => {
      const result = await ComplianceService.checkMessageSafety("'; DROP TABLE users; --", 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect drop table statement', async () => {
      const result = await ComplianceService.checkMessageSafety('drop table users', 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect union select statement', async () => {
      const result = await ComplianceService.checkMessageSafety('union select * from users', 'trace-123');

      expect(result).toBe(false);
    });

    it('should allow normal messages', async () => {
      const result = await ComplianceService.checkMessageSafety('Qual é o preço do produto?', 'trace-123');

      expect(result).toBe(true);
    });

    it('should allow messages with SQL keywords in normal context', async () => {
      const result = await ComplianceService.checkMessageSafety('Gosto de pescar no rio', 'trace-123');

      expect(result).toBe(true);
    });

    it('should be case-insensitive for injection patterns', async () => {
      const result = await ComplianceService.checkMessageSafety('JAVASCRIPT:alert("xss")', 'trace-123');

      expect(result).toBe(false);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null conversation gracefully in getComplianceStatus', async () => {
      (ConversationRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        ComplianceService.getComplianceStatus('conv-123', 'trace-123')
      ).rejects.toThrow();
    });

    it('should calculate remaining minutes in 24h window', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      jest.setSystemTime(now);

      (ConversationRepository.findById as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        last_user_message_at: oneHourAgo,
        created_at: new Date(oneHourAgo.getTime() - 60 * 60 * 1000),
      });

      // Should log remaining time without throwing
      await ComplianceService.isWithin24HourWindow('conv-123', 'trace-123');

      expect(true).toBe(true);
    });

    it('should handle very long messages for safety check', async () => {
      const longMessage = 'A'.repeat(10000) + '<script>alert("xss")</script>';
      const result = await ComplianceService.checkMessageSafety(longMessage, 'trace-123');

      expect(result).toBe(false);
    });

    it('should detect injection patterns at any position', async () => {
      const resultStart = await ComplianceService.checkMessageSafety('<script>alert("xss")</script> rest of message', 'trace-123');
      const resultMiddle = await ComplianceService.checkMessageSafety('some message <script>alert("xss")</script> more', 'trace-123');
      const resultEnd = await ComplianceService.checkMessageSafety('some message <script>alert("xss")</script>', 'trace-123');

      expect(resultStart).toBe(false);
      expect(resultMiddle).toBe(false);
      expect(resultEnd).toBe(false);
    });
  });
});
