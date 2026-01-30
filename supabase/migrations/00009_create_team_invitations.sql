-- Migration: Create team_invitations table for tracking invitations
-- Story: 2.7 - Team Management - Invite & Remove Users
-- AC: #4 - Invitation sent via Supabase Auth
-- AC: #6 - Pending invitations shown in list
-- AC: #10 - Cancel invitation functionality

-- 1. Create team_invitations table
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_tenant_id ON public.team_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);

-- 3. Add unique constraint for pending invitations per tenant/email
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending
  ON public.team_invitations(tenant_id, email)
  WHERE status = 'pending';

-- 4. RLS policies
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations for their tenant
CREATE POLICY "Admins can view tenant invitations"
  ON public.team_invitations FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can insert invitations for their tenant
CREATE POLICY "Admins can create invitations"
  ON public.team_invitations FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can update invitations for their tenant
CREATE POLICY "Admins can update invitations"
  ON public.team_invitations FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can delete invitations for their tenant
CREATE POLICY "Admins can delete invitations"
  ON public.team_invitations FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- 5. Comments
COMMENT ON TABLE public.team_invitations IS 'Tracks user invitations to tenants';
COMMENT ON COLUMN public.team_invitations.id IS 'Unique invitation identifier';
COMMENT ON COLUMN public.team_invitations.tenant_id IS 'Tenant the invitation belongs to';
COMMENT ON COLUMN public.team_invitations.email IS 'Email address of invited user';
COMMENT ON COLUMN public.team_invitations.role IS 'Role assigned to invited user: admin or user';
COMMENT ON COLUMN public.team_invitations.status IS 'Invitation status: pending, accepted, expired, or cancelled';
COMMENT ON COLUMN public.team_invitations.invited_by IS 'User who sent the invitation';
COMMENT ON COLUMN public.team_invitations.created_at IS 'When invitation was created';
COMMENT ON COLUMN public.team_invitations.expires_at IS 'When invitation expires';
COMMENT ON COLUMN public.team_invitations.accepted_at IS 'When invitation was accepted';

-- 6. Add admin delete policy for profiles
-- Admins can delete profiles from their tenant (for removing team members)
CREATE POLICY "Admins can delete tenant profiles"
  ON public.profiles FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

COMMENT ON POLICY "Admins can delete tenant profiles" ON public.profiles
  IS 'FR36: Admin can remove users from tenant';
