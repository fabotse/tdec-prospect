-- Migration: Create suppression_entries (lista de supressão por tenant)
-- Epic: 23 - Plataforma e higiene
-- Story: 23.5 - Lista de supressão: cadastro e import
--
-- Domínios e e-mails que nunca podem receber campanha (clientes, negociações em
-- andamento, concorrentes, parceiros, opt-outs). Esta story só cadastra: nenhum caminho
-- de envio lê a tabela ainda (isso é a 23.6).
--
-- SOMENTE ADITIVA: uma tabela nova, seu índice, suas policies e comments. Nenhum objeto
-- existente é alterado e nenhuma linha existente é tocada. Idempotente (IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY): banco do cliente é gerido à mão, sem
-- migration tracking (ver 00053/00055).
--
-- NÃO APLICAR sem o OK do Fabossi.
--
-- PRE-CHECK (rodar antes, no SQL Editor):
--   SELECT to_regclass('public.suppression_entries');          -- esperado: NULL
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('get_current_tenant_id', 'is_admin');   -- esperado: as 2 funções
--
-- IMPACTO: nenhum para o cliente. Sem a tabela, a aba Configurações → Lista de Supressão
-- mostra erro com "Tentar novamente" e o resto do app segue igual. Busca, import de
-- leads, campanhas, export/ativação no Instantly, webhook e reply-sweep não leem a tabela.
--
-- ROLLBACK (só se nada depender da lista ainda; apaga as entradas cadastradas):
--   DROP TABLE IF EXISTS public.suppression_entries;

-- ============================================
-- 1. TABELA
-- ============================================
CREATE TABLE IF NOT EXISTS public.suppression_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL
    CONSTRAINT suppression_entries_entry_type_check CHECK (entry_type IN ('domain', 'email')),
  value TEXT NOT NULL,
  reason TEXT NOT NULL
    CONSTRAINT suppression_entries_reason_check CHECK (
      reason IN ('cliente', 'negociacao', 'concorrente', 'parceiro', 'opt_out')
    ),
  source TEXT NOT NULL DEFAULT 'manual'
    CONSTRAINT suppression_entries_source_check CHECK (
      source IN ('manual', 'import_csv', 'opt_out_automatico')
    ),
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suppression_entries_tenant_type_value_key UNIQUE (tenant_id, entry_type, value)
);

-- ============================================
-- 2. ÍNDICE (listagem por tenant, mais recentes primeiro)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_suppression_entries_tenant_created
  ON public.suppression_entries (tenant_id, created_at DESC);

-- ============================================
-- 3. RLS (somente a tabela nova)
-- Leitura: qualquer membro do tenant (SDR consulta).
-- Escrita: só admin (gestor/diretor). Sem policy de UPDATE: entrada não se edita,
-- o ciclo é adicionar e remover.
-- ============================================
ALTER TABLE public.suppression_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view own suppression entries" ON public.suppression_entries;
CREATE POLICY "Tenant members can view own suppression entries"
  ON public.suppression_entries
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
  );

DROP POLICY IF EXISTS "Admins can insert suppression entries" ON public.suppression_entries;
CREATE POLICY "Admins can insert suppression entries"
  ON public.suppression_entries
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete own suppression entries" ON public.suppression_entries;
CREATE POLICY "Admins can delete own suppression entries"
  ON public.suppression_entries
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 4. COMMENTS
-- ============================================
COMMENT ON TABLE public.suppression_entries IS 'Story 23.5: lista de supressão (domínios e e-mails que nunca recebem campanha), por tenant';
COMMENT ON COLUMN public.suppression_entries.entry_type IS 'domain ou email (detectado pelo valor)';
COMMENT ON COLUMN public.suppression_entries.value IS 'Valor normalizado no servidor (minúsculo; domínio sem protocolo/www/caminho)';
COMMENT ON COLUMN public.suppression_entries.reason IS 'Motivo: cliente, negociacao, concorrente, parceiro, opt_out';
COMMENT ON COLUMN public.suppression_entries.source IS 'Origem: manual, import_csv, opt_out_automatico (23.6)';
COMMENT ON COLUMN public.suppression_entries.created_by IS 'Perfil que cadastrou (NULL se removido ou automático)';
