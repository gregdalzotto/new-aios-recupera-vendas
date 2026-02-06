-- SARA - Agente de Recuperação de Vendas
-- Migration 002: Create Performance Indices
-- Creates indexes for common queries to optimize performance

-- Users table indices
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
-- CREATE INDEX IF NOT EXISTS idx_users_opted_out ON users(opted_out); -- TODO: Fix - column doesn't exist

-- Product Offers table indices
CREATE INDEX IF NOT EXISTS idx_product_offers_product_id ON product_offers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_active ON product_offers(active);

-- Abandonments table indices
CREATE INDEX IF NOT EXISTS idx_abandonments_user_id ON abandonments(user_id);
CREATE INDEX IF NOT EXISTS idx_abandonments_external_id ON abandonments(external_id);
CREATE INDEX IF NOT EXISTS idx_abandonments_status ON abandonments(status);
CREATE INDEX IF NOT EXISTS idx_abandonments_payment_id ON abandonments(payment_id);
CREATE INDEX IF NOT EXISTS idx_abandonments_created_at ON abandonments(created_at);

-- Conversations table indices
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_abandonment ON conversations(abandonment_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Messages table indices
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id);

-- Webhooks Log table indices
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhooks_log_type_external ON webhooks_log(webhook_type, external_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_log_type ON webhooks_log(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhooks_log_created_at ON webhooks_log(created_at);

-- Opt-out Keywords table indices
CREATE INDEX IF NOT EXISTS idx_opt_out_keywords_keyword ON opt_out_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_opt_out_keywords_active ON opt_out_keywords(active);
