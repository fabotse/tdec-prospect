-- Migration: Allow admins to UPDATE profiles within their tenant
-- Epic: 20 - Níveis de Acesso (Gestor / Diretor / SDR)
-- Story: 20.3 - UI de papéis na gestão de time (atribuição / edição de papel)
--
-- Contexto: a edição de papel de um membro (AC2) grava em profiles.role via a
-- action `updateMemberRole`. As policies de UPDATE de profiles hoje (00003) só
-- permitem "atualizar o próprio perfil" (id = auth.uid()); NÃO há policy de admin
-- para alterar o perfil de OUTRO membro do tenant. Sem ela, o UPDATE do admin
-- afeta 0 linhas SEM erro (o RLS filtra a linha), produzindo um FALSO sucesso.
--
-- Decisão (AD-3 / NFR-S2 — defesa-em-profundidade via RLS, Fabossi 2026-06-16):
-- adicionar a policy de UPDATE de admin, SIMÉTRICA à de DELETE de admin já
-- existente (00009), usando o chokepoint public.is_admin()
-- (corpo = role IN ('gestor','diretor'), definido na 00053).
--
-- Idempotente: DROP ... IF EXISTS antes do CREATE (re-aplicável em banco gerido
-- à mão). `profiles` é tabela core (00002) — sem guarda de existência.

DROP POLICY IF EXISTS "Admins can update tenant profiles" ON public.profiles;

CREATE POLICY "Admins can update tenant profiles"
  ON public.profiles FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

COMMENT ON POLICY "Admins can update tenant profiles" ON public.profiles
  IS 'Epic 20.3: admins (gestor/diretor) podem atualizar perfis do próprio tenant (ex.: alterar papel de um membro). Defesa-em-profundidade — a action updateMemberRole também valida hasAdminAccess + isolamento de tenant.';
