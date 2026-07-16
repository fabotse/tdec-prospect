-- Migration: Add 'openai' to api_usage_logs.service_name CHECK constraint
-- Story: 21.3 - Classificação de Intenção por IA (NFR6)
--
-- 🔴 BUG PRÉ-EXISTENTE (NFR6 quebrado hoje): o CHECK de `api_usage_logs.service_name`
-- (00035:20-21) nunca incluiu 'openai':
--   CHECK (service_name IN ('apify','apollo','signalhire','snovio','instantly'))
-- Todas as migrations que adicionaram 'openai' (00022/00032/00041/00046) alteraram o CHECK
-- da tabela `api_configs`, NÃO de `api_usage_logs`. Como os loggers de custo engolem
-- qualquer erro (`catch {}` — "logging never breaks the main flow"), todo INSERT de custo
-- de IA com service_name='openai' é rejeitado (Postgres 23514) EM SILÊNCIO — o custo de IA
-- (inclusive o do Epic 13: monitoring_relevance_filter / monitoring_approach_suggestion)
-- provavelmente nunca persistiu.
--
-- Esta migration corrige o CHECK, espelhando o padrão de 00022 (que fez o mesmo em
-- api_configs). Idempotente/defensiva (DROP CONSTRAINT IF EXISTS) — o banco do cliente é
-- gerido à mão e pode ter drift de schema.

-- 1. Drop existing constraint (nome auto-gerado do CHECK inline de 00035)
ALTER TABLE public.api_usage_logs
DROP CONSTRAINT IF EXISTS api_usage_logs_service_name_check;

-- 2. Add new constraint with openai
ALTER TABLE public.api_usage_logs
ADD CONSTRAINT api_usage_logs_service_name_check
CHECK (service_name IN ('apify', 'apollo', 'signalhire', 'snovio', 'instantly', 'openai'));

-- 3. Update table/column comments
COMMENT ON TABLE public.api_usage_logs IS
  'Registra o uso de APIs externas para monitoramento de custos e análise por tenant. Suporta: apify, apollo, signalhire, snovio, instantly, openai.';

COMMENT ON COLUMN public.api_usage_logs.service_name IS
  'Nome do serviço externo: apify (icebreakers), apollo (search/enrichment), signalhire (phone lookup), snovio (export), instantly (export), openai (classificação/geração por IA).';
