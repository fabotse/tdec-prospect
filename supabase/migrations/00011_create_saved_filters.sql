-- Story 3.7: Saved Filters / Favorites
-- Creates saved_filters table for storing user filter configurations
-- AC: #6 - RLS for tenant + user isolation

CREATE TABLE saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: unique name per user
  CONSTRAINT unique_filter_name_per_user UNIQUE (tenant_id, user_id, name)
);

-- Indexes for query performance
CREATE INDEX idx_saved_filters_tenant_user ON saved_filters(tenant_id, user_id);
CREATE INDEX idx_saved_filters_created_at ON saved_filters(created_at DESC);

-- Enable RLS
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own filters within their tenant
CREATE POLICY "Users can view own saved filters"
  ON saved_filters
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can insert own saved filters"
  ON saved_filters
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can delete own saved filters"
  ON saved_filters
  FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );
