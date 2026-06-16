-- Migration: Expand role model from admin|user to gestor|diretor|sdr
-- Epic: 20 - Níveis de Acesso (Gestor / Diretor / SDR)
-- Story: 20.1 - Modelo de três papéis (enum, migração e RLS)
--
-- Decisões arquiteturais (architecture-epic-20-niveis-de-acesso.md):
--   AD-1: role continua TEXT + CHECK (NÃO criar ENUM Postgres).
--   AD-3: manter o nome public.is_admin() (só trocar o corpo) + eliminar a exceção inline do 00020.
--   AD-4: admin -> gestor, user -> sdr; default 'sdr' (menor privilégio).
--
-- NFR-C1: nenhum usuário perde nível de acesso (admin migrado p/ gestor mantém acesso total).
--
-- Ordem obrigatória (AD §5.1): drop CHECK -> UPDATE dados -> add CHECK.
-- (Rodar o UPDATE depois do novo CHECK violaria o constraint durante a transição.)
--
-- ROBUSTEZ: as operações em `team_invitations` (00009) e `ai_prompts` (00020) são
-- guardadas por `to_regclass(...)` IS NOT NULL para que esta migration aplique mesmo
-- em bancos cujo histórico ainda não criou essas tabelas. `profiles` (00002) é
-- dependência forte e permanece sem guarda.

-- ==============================================================
-- PROFILES (core — sem guarda)
-- ==============================================================

-- 1. Remover CHECK antigo (nomes auto-gerados pelo Postgres: <tabela>_<coluna>_check)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrar dados (AD-4) — ANTES do novo CHECK
UPDATE public.profiles SET role = 'gestor' WHERE role = 'admin';
UPDATE public.profiles SET role = 'sdr'    WHERE role = 'user';

-- 3. Novo CHECK + novo default (menor privilégio)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('gestor', 'diretor', 'sdr'));
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'sdr';

COMMENT ON COLUMN public.profiles.role IS 'User role: gestor, diretor ou sdr (Epic 20)';

-- ==============================================================
-- TEAM_INVITATIONS (00009 — guardado por existência da tabela)
-- ==============================================================
DO $$
BEGIN
  IF to_regclass('public.team_invitations') IS NOT NULL THEN
    ALTER TABLE public.team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;

    UPDATE public.team_invitations SET role = 'gestor' WHERE role = 'admin';
    UPDATE public.team_invitations SET role = 'sdr'    WHERE role = 'user';

    ALTER TABLE public.team_invitations
      ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('gestor', 'diretor', 'sdr'));
    ALTER TABLE public.team_invitations ALTER COLUMN role SET DEFAULT 'sdr';

    COMMENT ON COLUMN public.team_invitations.role IS 'Role assigned to invited user: gestor, diretor ou sdr (Epic 20)';
  ELSE
    RAISE NOTICE 'public.team_invitations ausente — pulando (histórico de migrations incompleto?).';
  END IF;
END $$;

-- ==============================================================
-- HELPER CENTRAL is_admin() (referencia profiles — sem guarda)
-- ==============================================================

-- 4. Atualizar o helper central is_admin() (cobre ~26 policies sem tocá-las — AD-3)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- COALESCE p/ FALSE: sem linha em profiles (sessão ausente / perfil ainda não criado)
  -- a subquery escalar retorna NULL. Hoje todo call-site é `AND public.is_admin()`
  -- (NULL ≈ FALSE), mas garantir booleano definido protege qualquer `NOT is_admin()` futuro.
  RETURN COALESCE(
    (
      SELECT role IN ('gestor', 'diretor')
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.is_admin() IS 'TRUE se o papel tem acesso administrativo (gestor ou diretor). Epic 20.';

-- ==============================================================
-- AI_PROMPTS policies (00020 — guardado por existência da tabela)
-- ==============================================================

-- 5. Refatorar as 3 policies inline de ai_prompts p/ usar public.is_admin()
--    Elimina a última referência a role = 'admin' inline (AD-3).
DO $$
BEGIN
  IF to_regclass('public.ai_prompts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can insert prompts"              ON public.ai_prompts;
    DROP POLICY IF EXISTS "Admins can update their tenant prompts" ON public.ai_prompts;
    DROP POLICY IF EXISTS "Admins can delete their tenant prompts" ON public.ai_prompts;

    CREATE POLICY "Admins can insert prompts"
      ON public.ai_prompts FOR INSERT
      WITH CHECK (
        tenant_id = public.get_current_tenant_id()
        AND public.is_admin()
      );

    CREATE POLICY "Admins can update their tenant prompts"
      ON public.ai_prompts FOR UPDATE
      USING (
        tenant_id = public.get_current_tenant_id()
        AND public.is_admin()
      )
      WITH CHECK (
        tenant_id = public.get_current_tenant_id()
      );

    CREATE POLICY "Admins can delete their tenant prompts"
      ON public.ai_prompts FOR DELETE
      USING (
        tenant_id = public.get_current_tenant_id()
        AND public.is_admin()
      );
  ELSE
    RAISE NOTICE 'public.ai_prompts ausente — pulando policies (histórico de migrations incompleto?).';
  END IF;
END $$;

-- ==============================================================
-- handle_new_user() (referencia tenants/profiles — sem guarda)
-- ==============================================================

-- 6. handle_new_user(): trocar APENAS o literal default 'user' -> 'sdr'.
--    (NÃO honrar raw_user_meta_data->>'role' aqui — é vetor de escalonamento via /signup;
--     a correção segura, lookup em team_invitations pós-aceitação, é da Story 20.4.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- For MVP, get or create a default tenant
  -- In production, this would come from invite/signup flow
  SELECT id INTO default_tenant_id FROM public.tenants LIMIT 1;

  IF default_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name) VALUES ('Default Tenant')
    RETURNING id INTO default_tenant_id;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    default_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'sdr'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
