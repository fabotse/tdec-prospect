/**
 * Dossie da conta — DTO de exibicao (somente leitura)
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * Contrato do `GET /api/account-dossiers/lookup`. Nao leva `lead_apollo_id`/`lead_email`
 * dos fatos nem nome ou e-mail de outros leads.
 */

export type DossierViewFactKind = 'site' | 'news' | 'job' | 'technology' | 'post';

export interface DossierViewFact {
  kind: DossierViewFactKind;
  fato: string;
  /** Ja validada no servidor (http/https) ou null. */
  fonteUrl: string | null;
  /** YYYY-MM-DD */
  data: string;
  confianca: 'baixa' | 'media' | 'alta';
  isTriggerSource: boolean;
}

export interface DossierViewWhyNow {
  status: 'trigger' | 'no_trigger';
  /** `WhyNowNoTriggerReason` ou null. */
  reason: string | null;
  gatilho: string | null;
  hipoteseDor: string | null;
  confianca: 'media' | 'alta' | null;
  /** Da `fatoOrigem`, validada. */
  fonteUrl: string | null;
  data: string | null;
}

export interface AccountDossierViewDossier {
  id: string;
  companyName: string | null;
  companyDomain: string;
  dossierStatus: 'complete' | 'partial' | 'empty';
  failedSources: string[];
  /** ISO */
  researchedAt: string;
  expired: boolean;
}

export type AccountDossierView =
  | { status: 'none' }
  | {
      status: 'found';
      dossier: AccountDossierViewDossier;
      /** Ja filtrados (D7), ordenados e cortados (D8). */
      facts: DossierViewFact[];
      /** Antes do corte. */
      totalFacts: number;
      /** null = nao avaliado. */
      whyNow: DossierViewWhyNow | null;
    };

/** Identificadores do lead aberto no painel. */
export interface AccountDossierLookupParams {
  executionId?: string | null;
  leadId?: string | null;
  apolloId?: string | null;
  email?: string | null;
}

/** Alvo do painel (o que a tela sabe do lead). */
export interface AccountDossierTarget extends AccountDossierLookupParams {
  leadName: string;
  companyName: string | null;
}

export type AccountDossierContext = 'lead_review' | 'campaign' | 'opportunity';
