-- Story 16.1: Tabela agent_messages
-- Armazena mensagens do chat entre usuario e agente

CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_messages_execution ON agent_messages(execution_id);
CREATE INDEX idx_agent_messages_created ON agent_messages(execution_id, created_at);
