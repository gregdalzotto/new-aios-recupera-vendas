-- SARA - Agente de Recuperação de Vendas
-- Migration 001: Initial Schema
-- Creates the 7 core tables with UUID PKs and proper constraints

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMP WITH TIME ZONE,
  opted_out_reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Product Offers table
CREATE TABLE IF NOT EXISTS product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) NOT NULL UNIQUE,
  product_name VARCHAR(255) NOT NULL,
  payment_link TEXT NOT NULL,
  discount_link TEXT,
  discount_percent INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Abandonments table
CREATE TABLE IF NOT EXISTS abandonments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL UNIQUE,
  product_id VARCHAR(255) NOT NULL REFERENCES product_offers(product_id),
  value DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  conversation_id UUID,
  converted_at TIMESTAMP WITH TIME ZONE,
  conversion_link TEXT,
  payment_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abandonment_id UUID NOT NULL UNIQUE REFERENCES abandonments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'AWAITING_RESPONSE',
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_user_message_at TIMESTAMP WITH TIME ZONE,
  followup_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_sender VARCHAR(50) NOT NULL DEFAULT 'user',
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  whatsapp_message_id VARCHAR(255) UNIQUE,
  openai_response_id VARCHAR(255),
  openai_tokens_used INTEGER,
  intent VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Webhooks Log table
CREATE TABLE IF NOT EXISTS webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(webhook_type, external_id)
);

-- 7. Opt-out Keywords table
CREATE TABLE IF NOT EXISTS opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) NOT NULL UNIQUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment to schema
COMMENT ON TABLE users IS 'Users table - stores customer information and opt-out status';
COMMENT ON TABLE product_offers IS 'Product offers - stores available products with discounts';
COMMENT ON TABLE abandonments IS 'Cart abandonments - tracks recoverable sales';
COMMENT ON TABLE conversations IS 'Conversation states - tracks interaction progress';
COMMENT ON TABLE messages IS 'Message history - stores all messages in conversations';
COMMENT ON TABLE webhooks_log IS 'Webhook audit log - tracks incoming webhooks from external systems';
COMMENT ON TABLE opt_out_keywords IS 'Keywords for opt-out detection - phrases that indicate user wants to unsubscribe';
