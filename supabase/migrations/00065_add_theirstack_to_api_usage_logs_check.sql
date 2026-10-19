-- Migration: Add 'theirstack' to api_usage_logs.service_name CHECK constraint
-- Story: 24.10 - Custo real e estimativa honesta
--
-- O agente passa a logar cada busca de empresas no TheirStack em `api_usage_logs`
-- (service_name = 'theirstack'). O CHECK atual (00058) nao aceita esse valor, e o logger
-- engole o erro: sem esta migration o insert e rejeitado em silencio e nada muda para o
-- cliente (o step segue igual).
--
-- ADITIVA: so amplia a lista de valores aceitos. Nenhuma linha existente e alterada e
-- todos os valores ja aceitos continuam validos. Mesmo padrao da 00058 (DROP/ADD do CHECK,
-- idempotente).

-- 1. Drop existing constraint
ALTER TABLE public.api_usage_logs
DROP CONSTRAINT IF EXISTS api_usage_logs_service_name_check;

-- 2. Add new constraint with theirstack
ALTER TABLE public.api_usage_logs
ADD CONSTRAINT api_usage_logs_service_name_check
CHECK (service_name IN ('apify', 'apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'theirstack'));

-- 3. Update table/column comments
COMMENT ON TABLE public.api_usage_logs IS
  'Registra o uso de APIs externas para monitoramento de custos e análise por tenant. Suporta: apify, apollo, signalhire, snovio, instantly, openai, theirstack.';

COMMENT ON COLUMN public.api_usage_logs.service_name IS
  'Nome do serviço externo: apify (icebreakers), apollo (search/enrichment), signalhire (phone lookup), snovio (export), instantly (export/ativação), openai (classificação/geração por IA), theirstack (busca de empresas).';
