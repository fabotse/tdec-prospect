-- Story 16.1: Tabela cost_models
-- Armazena modelos de custo por servico por tenant

CREATE TABLE cost_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_name VARCHAR(30) NOT NULL,
  unit_price DECIMAL(10, 4) NOT NULL,
  unit_description VARCHAR(100) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, service_name)
);

ALTER TABLE cost_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON cost_models
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_insert" ON cost_models
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_update" ON cost_models
  FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tenant_delete" ON cost_models
  FOR DELETE USING (tenant_id = public.get_current_tenant_id());
