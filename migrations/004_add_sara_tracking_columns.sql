-- Migration: 004_add_sara_tracking_columns
-- Purpose: Add columns to track conversation cycles and discount offers for SARA persona
-- Date: 2026-02-06

BEGIN;

-- Add cycle_count to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cycle_count INTEGER DEFAULT 0;

-- Add discount_was_offered to payment_configs (if it exists, otherwise skip)
-- This will be created if payment_configs table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_configs') THEN
    ALTER TABLE payment_configs ADD COLUMN IF NOT EXISTS discount_was_offered BOOLEAN DEFAULT FALSE;
    ALTER TABLE payment_configs ADD COLUMN IF NOT EXISTS offered_at TIMESTAMP;
  END IF;
END $$;

-- Create trigger to auto-increment cycle_count when SARA sends a response
CREATE OR REPLACE FUNCTION increment_conversation_cycle()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment cycle_count only when SARA sends outgoing message
  IF NEW.from_sender = 'sara' THEN
    UPDATE conversations
    SET cycle_count = cycle_count + 1
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_increment_cycle_count ON messages;

-- Create trigger for messages table
CREATE TRIGGER tr_increment_cycle_count
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION increment_conversation_cycle();

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_cycle_count
ON conversations(cycle_count);

COMMIT;
