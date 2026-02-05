-- SARA - Agente de Recuperação de Vendas
-- Migration 003: Seed Opt-out Keywords
-- Inserts default opt-out keywords for deterministic detection

INSERT INTO opt_out_keywords (keyword, active) VALUES
('parar', TRUE),
('remover', TRUE),
('cancelar', TRUE),
('sair', TRUE),
('stop', TRUE),
('não quero', TRUE),
('me tire', TRUE),
('excluir', TRUE),
('desinscrever', TRUE),
('unsubscribe', TRUE)
ON CONFLICT (keyword) DO NOTHING;

-- Insert additional common opt-out phrases
INSERT INTO opt_out_keywords (keyword, active) VALUES
('pare', TRUE),
('parei', TRUE),
('parar de enviar', TRUE),
('sem mensagens', TRUE),
('bloquear', TRUE),
('sacar', TRUE),
('apagar', TRUE),
('tirar do grupo', TRUE),
('nao enviem', TRUE),
('terminar', TRUE)
ON CONFLICT (keyword) DO NOTHING;
