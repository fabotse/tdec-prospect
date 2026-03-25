-- Story 16.1: Tabela agent_steps
-- Armazena etapas individuais de cada execucao do agente

CREATE TABLE agent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  cost JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(execution_id, step_number)
);

CREATE INDEX idx_agent_steps_execution ON agent_steps(execution_id);
