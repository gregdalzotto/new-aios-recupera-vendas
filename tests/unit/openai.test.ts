import { OPENAI_CONFIG, SARA_SYSTEM_PROMPT } from '../../src/config/openai';

describe('OpenAI Configuration', () => {
  describe('OPENAI_CONFIG', () => {
    it('should have correct model', () => {
      expect(OPENAI_CONFIG.MODEL).toBe('gpt-3.5-turbo');
    });

    it('should have max tokens set to 150', () => {
      expect(OPENAI_CONFIG.MAX_TOKENS).toBe(150);
    });

    it('should have temperature 0.7 for balanced responses', () => {
      expect(OPENAI_CONFIG.TEMPERATURE).toBe(0.7);
    });

    it('should have 5 second timeout', () => {
      expect(OPENAI_CONFIG.TIMEOUT_MS).toBe(5000);
    });

    it('should have no automatic retries (handled by app)', () => {
      expect(OPENAI_CONFIG.RETRY_ATTEMPTS).toBe(0);
    });
  });

  describe('SARA_SYSTEM_PROMPT', () => {
    it('should define Sara as a sales recovery assistant', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('Sara');
      expect(SARA_SYSTEM_PROMPT).toContain('sales recovery');
      expect(SARA_SYSTEM_PROMPT).toContain('abandoned');
    });

    it('should mention empathy and non-pushy approach', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('empathetic');
      expect(SARA_SYSTEM_PROMPT).toContain('non-pushy');
    });

    it('should specify Portuguese (Brazil)', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('pt_BR');
      expect(SARA_SYSTEM_PROMPT).toContain('Portuguese');
    });

    it('should define expected JSON response format', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('JSON');
      expect(SARA_SYSTEM_PROMPT).toContain('response');
      expect(SARA_SYSTEM_PROMPT).toContain('intent');
      expect(SARA_SYSTEM_PROMPT).toContain('sentiment');
      expect(SARA_SYSTEM_PROMPT).toContain('should_offer_discount');
    });

    it('should include all required intents', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('price_question');
      expect(SARA_SYSTEM_PROMPT).toContain('objection');
      expect(SARA_SYSTEM_PROMPT).toContain('confirmation');
      expect(SARA_SYSTEM_PROMPT).toContain('unclear');
    });

    it('should include all sentiments', () => {
      expect(SARA_SYSTEM_PROMPT).toContain('positive');
      expect(SARA_SYSTEM_PROMPT).toContain('neutral');
      expect(SARA_SYSTEM_PROMPT).toContain('negative');
    });
  });
});
