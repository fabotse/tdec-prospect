-- Story 6.13: Smart Campaign Templates
-- Migration: Create campaign_templates table and seed data
-- AC #6: Templates stored in campaign_templates table with RLS

-- ==============================================
-- TABLE: campaign_templates
-- ==============================================

CREATE TABLE campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  name_key VARCHAR(50) NOT NULL UNIQUE, -- for i18n future support
  description TEXT NOT NULL,
  structure_json JSONB NOT NULL,
  use_case VARCHAR(100) NOT NULL,
  email_count INTEGER NOT NULL,
  total_days INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active templates ordered by display_order
CREATE INDEX idx_campaign_templates_active ON campaign_templates(is_active, display_order);

-- ==============================================
-- ROW LEVEL SECURITY
-- AC #6: RLS allows read access to all authenticated users
-- ==============================================

ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users (templates are global)
CREATE POLICY "templates_read_access" ON campaign_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ==============================================
-- SEED DATA: Initial Templates
-- AC #2: Pre-defined templates based on cold email best practices
-- ==============================================

-- Template 1: Cold Outreach Classico (5 emails, 14 days)
INSERT INTO campaign_templates (name, name_key, description, structure_json, use_case, email_count, total_days, display_order)
VALUES (
  'Cold Outreach Classico',
  'cold_outreach_classic',
  'Sequencia completa de 5 emails para primeiro contato com leads frios. Inclui introducao, beneficios, prova social, superacao de objecoes e call-to-action final.',
  '{
    "emails": [
      { "position": 1, "context": "Introducao e proposta de valor", "emailMode": "initial" },
      { "position": 2, "context": "Aprofundamento em beneficios", "emailMode": "follow-up" },
      { "position": 3, "context": "Prova social e case de sucesso", "emailMode": "follow-up" },
      { "position": 4, "context": "Superacao de objecoes", "emailMode": "follow-up" },
      { "position": 5, "context": "Urgencia e call-to-action final", "emailMode": "follow-up" }
    ],
    "delays": [
      { "afterEmail": 1, "days": 3 },
      { "afterEmail": 2, "days": 3 },
      { "afterEmail": 3, "days": 4 },
      { "afterEmail": 4, "days": 4 }
    ]
  }'::jsonb,
  'Primeiro contato com leads frios',
  5,
  14,
  1
);

-- Template 2: Reengajamento Rapido (3 emails, 7 days)
INSERT INTO campaign_templates (name, name_key, description, structure_json, use_case, email_count, total_days, display_order)
VALUES (
  'Reengajamento Rapido',
  'quick_reengagement',
  'Sequencia curta de 3 emails para reativar leads que nao responderam anteriormente. Foco em retomada, novo valor e ultima chance.',
  '{
    "emails": [
      { "position": 1, "context": "Retomada do contato anterior", "emailMode": "initial" },
      { "position": 2, "context": "Apresentacao de novo valor ou atualizacao", "emailMode": "follow-up" },
      { "position": 3, "context": "Ultima chance com oferta especial", "emailMode": "follow-up" }
    ],
    "delays": [
      { "afterEmail": 1, "days": 3 },
      { "afterEmail": 2, "days": 4 }
    ]
  }'::jsonb,
  'Leads que nao responderam antes',
  3,
  7,
  2
);

-- Template 3: Nutricao Longa (7 emails, 30 days)
INSERT INTO campaign_templates (name, name_key, description, structure_json, use_case, email_count, total_days, display_order)
VALUES (
  'Nutricao Longa',
  'long_nurture',
  'Sequencia extensa de 7 emails para construir relacionamento de longo prazo. Ideal para ciclos de venda mais longos com conteudo educativo.',
  '{
    "emails": [
      { "position": 1, "context": "Introducao e boas-vindas", "emailMode": "initial" },
      { "position": 2, "context": "Conteudo educativo #1 - Problema do mercado", "emailMode": "follow-up" },
      { "position": 3, "context": "Conteudo educativo #2 - Solucao e metodologia", "emailMode": "follow-up" },
      { "position": 4, "context": "Conteudo educativo #3 - Diferencial competitivo", "emailMode": "follow-up" },
      { "position": 5, "context": "Estudo de caso e resultados", "emailMode": "follow-up" },
      { "position": 6, "context": "Convite para conversa ou demo", "emailMode": "follow-up" },
      { "position": 7, "context": "Encerramento com proximos passos", "emailMode": "follow-up" }
    ],
    "delays": [
      { "afterEmail": 1, "days": 4 },
      { "afterEmail": 2, "days": 5 },
      { "afterEmail": 3, "days": 5 },
      { "afterEmail": 4, "days": 5 },
      { "afterEmail": 5, "days": 5 },
      { "afterEmail": 6, "days": 6 }
    ]
  }'::jsonb,
  'Relacionamento de longo prazo',
  7,
  30,
  3
);

-- Template 4: Follow-up Urgente (3 emails, 5 days)
INSERT INTO campaign_templates (name, name_key, description, structure_json, use_case, email_count, total_days, display_order)
VALUES (
  'Follow-up Urgente',
  'urgent_followup',
  'Sequencia intensiva de 3 emails para leads quentes com decisao proxima. Intervalos curtos e mensagens diretas com senso de urgencia.',
  '{
    "emails": [
      { "position": 1, "context": "Reforco da proposta e beneficios imediatos", "emailMode": "initial" },
      { "position": 2, "context": "Criacao de urgencia e escassez", "emailMode": "follow-up" },
      { "position": 3, "context": "Decisao final com incentivo", "emailMode": "follow-up" }
    ],
    "delays": [
      { "afterEmail": 1, "days": 2 },
      { "afterEmail": 2, "days": 3 }
    ]
  }'::jsonb,
  'Leads quentes, decisao proxima',
  3,
  5,
  4
);

-- Template 5: Apresentacao de Produto (4 emails, 10 days)
INSERT INTO campaign_templates (name, name_key, description, structure_json, use_case, email_count, total_days, display_order)
VALUES (
  'Apresentacao de Produto',
  'product_presentation',
  'Sequencia de 4 emails focada em lancamento ou demonstracao de produto. Estrutura: apresentacao, features, demo e proximos passos.',
  '{
    "emails": [
      { "position": 1, "context": "Apresentacao do produto e problema que resolve", "emailMode": "initial" },
      { "position": 2, "context": "Features e funcionalidades principais", "emailMode": "follow-up" },
      { "position": 3, "context": "Convite para demo ou trial", "emailMode": "follow-up" },
      { "position": 4, "context": "Proximos passos e fechamento", "emailMode": "follow-up" }
    ],
    "delays": [
      { "afterEmail": 1, "days": 3 },
      { "afterEmail": 2, "days": 3 },
      { "afterEmail": 3, "days": 4 }
    ]
  }'::jsonb,
  'Lancamento ou demo de produto',
  4,
  10,
  5
);

-- ==============================================
-- TRIGGER: Update updated_at on modification
-- ==============================================

CREATE OR REPLACE FUNCTION update_campaign_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_templates_updated_at
  BEFORE UPDATE ON campaign_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_templates_updated_at();
