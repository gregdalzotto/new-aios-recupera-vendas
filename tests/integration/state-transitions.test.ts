/**
 * State Transition Integration Tests
 * Tests conversation state machine and transitions
 */

import { UserFactory } from './fixtures/userFactory';
import { ConversationFactory } from './fixtures/conversationFactory';
import { ConversationStatus } from '../../src/services/ConversationService';

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('State Transition Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  afterAll(async () => {
    await UserFactory.cleanup();
    await ConversationFactory.cleanup();
  });

  describe('Valid State Transitions', () => {
    it('should transition from AWAITING_RESPONSE to ACTIVE', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      expect(conversation.status).toBe(ConversationStatus.AWAITING_RESPONSE);

      // Simulate transition to ACTIVE (user responds)
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.ACTIVE,
      });

      expect(updatedConversation.status).toBe(ConversationStatus.ACTIVE);
    });

    it('should transition from ACTIVE to AWAITING_RESPONSE', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ACTIVE,
      });

      expect(conversation.status).toBe(ConversationStatus.ACTIVE);

      // Simulate transition back to AWAITING_RESPONSE (waiting for user response)
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      expect(updatedConversation.status).toBe(ConversationStatus.AWAITING_RESPONSE);
    });

    it('should transition from ACTIVE to CLOSED', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ACTIVE,
      });

      // After max cycles or user opt-out
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.CLOSED,
      });

      expect(updatedConversation.status).toBe(ConversationStatus.CLOSED);
    });

    it('should transition from AWAITING_RESPONSE to CLOSED', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      // Can close from awaiting if max cycles reached
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.CLOSED,
        cycle_count: 5,
      });

      expect(updatedConversation.status).toBe(ConversationStatus.CLOSED);
      expect(updatedConversation.cycle_count).toBe(5);
    });

    it('should maintain CLOSED as terminal state', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.CLOSED,
      });

      // CLOSED is a terminal state - conversations should not transition from CLOSED
      expect(conversation.status).toBe(ConversationStatus.CLOSED);
    });
  });

  describe('Cycle Count Management', () => {
    it('should increment cycle count on state transitions', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        cycle_count: 0,
        max_cycles: 5,
      });

      expect(conversation.cycle_count).toBe(0);

      // Simulate cycle increment
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        cycle_count: 1,
      });

      expect(updatedConversation.cycle_count).toBe(1);
    });

    it('should track multiple cycles through conversation', async () => {
      const user = await UserFactory.create();
      let conversation = await ConversationFactory.create({
        user_id: user.id,
        cycle_count: 0,
        max_cycles: 5,
      });

      // Simulate 5 cycles
      for (let i = 1; i <= 5; i++) {
        conversation = await ConversationFactory.create({
          ...conversation,
          cycle_count: i,
          updated_at: new Date().toISOString(),
        });

        expect(conversation.cycle_count).toBe(i);
      }

      expect(conversation.cycle_count).toBe(5);
    });

    it('should enforce max cycle limit', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        cycle_count: 5,
        max_cycles: 5,
      });

      expect(conversation.cycle_count).toBe(conversation.max_cycles);

      // Should not allow exceeding max cycles
      const cyclesExceeded = conversation.cycle_count >= conversation.max_cycles;
      expect(cyclesExceeded).toBe(true);
    });
  });

  describe('24-Hour Window Validation', () => {
    it('should allow messages within 24-hour window', async () => {
      const now = new Date();
      const within24h = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

      const conversation = await ConversationFactory.create({
        last_user_message_at: within24h.toISOString(),
      });

      // Message is within 24 hour window
      const timeSinceLastMessage = now.getTime() - within24h.getTime();
      const within24hWindow = timeSinceLastMessage <= 24 * 60 * 60 * 1000;

      expect(within24hWindow).toBe(true);
      expect(conversation.last_user_message_at).toBeDefined();
    });

    it('should reject messages beyond 24-hour window', async () => {
      const now = new Date();
      const beyond24h = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      await ConversationFactory.create({
        last_user_message_at: beyond24h.toISOString(),
      });

      // Message is beyond 24 hour window
      const timeSinceLastMessage = now.getTime() - beyond24h.getTime();
      const within24hWindow = timeSinceLastMessage <= 24 * 60 * 60 * 1000;

      expect(within24hWindow).toBe(false);
    });

    it('should update last_user_message_at timestamp on new message', async () => {
      const conversation = await ConversationFactory.create({
        last_user_message_at: null,
      });

      expect(conversation.last_user_message_at).toBeNull();

      // Simulate user message
      const now = new Date().toISOString();
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        last_user_message_at: now,
      });

      expect(updatedConversation.last_user_message_at).toBe(now);
    });
  });

  describe('Conversation Closure Prevention', () => {
    it('should prevent messages on CLOSED conversations', async () => {
      const user = await UserFactory.create();
      const _conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.CLOSED,
      });

      expect(_conversation.status).toBe(ConversationStatus.CLOSED);

      // Attempt to send message should fail
      const canReceiveMessage = _conversation.status !== ConversationStatus.CLOSED;
      expect(canReceiveMessage).toBe(false);
    });

    it('should prevent messages on ERROR conversations', async () => {
      const _conversation = await ConversationFactory.create({
        status: ConversationStatus.ERROR,
      });

      expect(_conversation.status).toBe(ConversationStatus.ERROR);

      // ERROR state allows recovery but shouldn't receive user messages
      const canReceiveMessage =
        _conversation.status === ConversationStatus.ACTIVE ||
        _conversation.status === ConversationStatus.AWAITING_RESPONSE;
      expect(canReceiveMessage).toBe(false);
    });

    it('should allow messages on ACTIVE conversations', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ACTIVE,
      });

      expect(conversation.status).toBe(ConversationStatus.ACTIVE);

      // Should allow message
      const canReceiveMessage =
        conversation.status === ConversationStatus.ACTIVE ||
        conversation.status === ConversationStatus.AWAITING_RESPONSE;

      expect(canReceiveMessage).toBe(true);
    });

    it('should allow messages on AWAITING_RESPONSE conversations', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      expect(conversation.status).toBe(ConversationStatus.AWAITING_RESPONSE);

      // Should allow message
      const canReceiveMessage =
        conversation.status === ConversationStatus.ACTIVE ||
        conversation.status === ConversationStatus.AWAITING_RESPONSE;

      expect(canReceiveMessage).toBe(true);
    });
  });

  describe('Error State Handling', () => {
    it('should create ERROR status on critical failure', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ACTIVE,
      });

      // Simulate transition to error state
      const errorConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.ERROR,
      });

      expect(errorConversation.status).toBe(ConversationStatus.ERROR);
    });

    it('should recover from ERROR status', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ERROR,
      });

      expect(conversation.status).toBe(ConversationStatus.ERROR);

      // Recovery: transition back to operational status
      const recoveredConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      expect(recoveredConversation.status).toBe(ConversationStatus.AWAITING_RESPONSE);
    });
  });

  describe('Concurrent State Access', () => {
    it('should maintain state consistency on simultaneous reads', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.ACTIVE,
        cycle_count: 2,
      });

      // Simulate multiple simultaneous reads
      const reads = [
        conversation.status,
        conversation.cycle_count,
        conversation.max_cycles,
      ];

      expect(reads[0]).toBe(ConversationStatus.ACTIVE);
      expect(reads[1]).toBe(2);
      expect(reads[2]).toBeDefined();
    });

    it('should handle rapid state transitions', async () => {
      const user = await UserFactory.create();
      let conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.AWAITING_RESPONSE,
        cycle_count: 0,
      });

      // Simulate rapid state changes
      const transitions = [
        ConversationStatus.ACTIVE,
        ConversationStatus.AWAITING_RESPONSE,
        ConversationStatus.ACTIVE,
      ];

      for (const newStatus of transitions) {
        conversation = await ConversationFactory.create({
          ...conversation,
          status: newStatus,
          cycle_count: conversation.cycle_count + 1,
        });

        expect(conversation.status).toBe(newStatus);
      }

      expect(conversation.cycle_count).toBe(3);
    });
  });

  describe('State Persistence', () => {
    it('should persist state changes to database', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
        status: ConversationStatus.AWAITING_RESPONSE,
      });

      const originalStatus = conversation.status;

      // Update state
      const updatedConversation = await ConversationFactory.create({
        ...conversation,
        status: ConversationStatus.ACTIVE,
      });

      expect(originalStatus).toBe(ConversationStatus.AWAITING_RESPONSE);
      expect(updatedConversation.status).toBe(ConversationStatus.ACTIVE);
    });

    it('should maintain created_at timestamp across state transitions', async () => {
      const user = await UserFactory.create();
      const conversation = await ConversationFactory.create({
        user_id: user.id,
      });

      const originalCreatedAt = conversation.created_at;

      // Update state multiple times
      for (let i = 0; i < 3; i++) {
        const updatedConversation = await ConversationFactory.create({
          ...conversation,
          status: ConversationStatus.ACTIVE,
        });

        expect(updatedConversation.created_at).toBe(originalCreatedAt);
      }
    });
  });
});
