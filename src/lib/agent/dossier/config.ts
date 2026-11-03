/**
 * Dossie da conta — configuracao (fonte unica)
 * Story: 24.19 - Dossie da conta
 *
 * Todos os numeros do step `research_accounts` moram aqui (padrao `parser-config.ts`).
 * Valores do spike 24.11: ~US$ 0,015-0,02 por conta no dossie basico.
 */

export const DOSSIER_CONFIG = {
  /** Dossie `complete` reaproveitado por N dias (`expires_at`). */
  reuseDays: 30,
  /** Janela de noticias, vagas e posts (dias). */
  windowDays: 90,
  /** Teto de custo por execucao (US$), aplicado no nosso codigo. */
  maxCostUsdPerExecution: 0.5,
  /** Teto por chamada (`X-Treg-Route-Max-Cost`, US$). Exa custa US$ 0,007. */
  maxCostUsdPerCall: 0.01,
  /** Custo reservado por perfil do LinkedIn consultado no Apify (US$). */
  apifyUsdPerProfile: 0.03,
  maxNewsPerAccount: 5,
  maxJobsPerAccount: 5,
  maxTechPerAccount: 10,
  maxPostsPerLead: 10,
  /** Contas pesquisadas em paralelo. */
  accountConcurrency: 3,
  /** Depois deste tempo o step nao inicia contas novas (ms). */
  timeBudgetMs: 180_000,
  /**
   * Prazo DURO da pesquisa (ms desde o inicio do step): nenhuma espera (Treg, Apify,
   * banco, log, classificador, mensagens) passa dele. A rota tem `maxDuration = 300` s;
   * estourar deixaria o step `running` antes do `create_campaign`.
   */
  hardDeadlineMs: 240_000,
  /**
   * Orcamento (ms) do fechamento DEPOIS do prazo duro: resumo no chat, checkpoint
   * `completed` (com fallback minimo) e log do step. Pior caso do step:
   * 240 s + 1 s + 15 s = 256 s, bem antes dos 300 s da rota.
   */
  finalizeBudgetMs: 15_000,
  /** Menos que isto ate o prazo duro: a chamada nem comeca (ms). */
  minCallMs: 5_000,
  /** Timeout de cada chamada ao Treg (ms). */
  callTimeoutMs: 60_000,
  /** Teto do trecho do site no fato (caracteres). */
  siteSummaryMaxChars: 500,
} as const;

export type DossierConfig = typeof DOSSIER_CONFIG;
