-- Story 16.1: Tabela agent_executions
-- Armazena execucoes do agente TDEC por tenant

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  mode VARCHAR(10) NOT NULL DEFAULT 'guided',
  briefing JSONB NOT NULL,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER NOT NULL,
  cost_estimate JSONB,
  cost_actual JSONB,
  result_summary JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON agent_executions
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_insert" ON agent_executions
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_update" ON agent_executions
  FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_delete" ON agent_executions
  FOR DELETE USING (tenant_id = public.get_current_tenant_id());

CREATE INDEX idx_agent_executions_tenant ON agent_executions(tenant_id);
