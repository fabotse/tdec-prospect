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

/**
 * Motivo para abordar agora — configuracao (fonte unica)
 * Story: 24.20 - Motivo para abordar agora
 *
 * Fase final (fail-open) do `research_accounts`: 1 chamada de LLM barato por conta com
 * fato elegivel. Todos os tetos sao nossos e baixos. Orcamento de tempo:
 * `timeBudgetMs` (180 s) + `phaseBudgetMs` (45 s) < `hardDeadlineMs` (240 s); alem disso
 * toda espera da fase corre contra o prazo duro, entao o pior caso do step (~256 s) nao
 * muda. Kill switch em codigo (`enabled`), nunca em env.
 */
export const WHY_NOW_CONFIG = {
  /** Kill switch: `false` = nenhum lead avaliado, zero chamadas. */
  enabled: true,
  /** Teto de chamadas de LLM por execucao. */
  maxCallsPerExecution: 10,
  /** Teto de custo reservado por execucao (US$). */
  maxCostUsdPerExecution: 0.05,
  /** Custo reservado por chamada (US$). */
  reservedUsdPerCall: 0.005,
  /** Leads de uma conta numa chamada (os excedentes ficam `call_limit`). */
  maxLeadsPerCall: 10,
  /** Fatos citaveis por chamada (os mais recentes). */
  maxEligibleFactsPerCall: 15,
  /** Fatos de contexto (site/tecnologia, nao citaveis) por chamada. */
  maxContextFacts: 5,
  /** Corte do texto de cada fato no prompt (caracteres). */
  factMaxChars: 300,
  /** Corte das dores do ICP no prompt (caracteres). */
  painPointsMaxChars: 1500,
  /** Timeout de cada chamada (ms). */
  callTimeoutMs: 20_000,
  /** Orcamento de tempo da fase inteira (ms). */
  phaseBudgetMs: 45_000,
  /** Menos que isto ate o prazo duro ao iniciar: a fase nao roda (ms). */
  minPhaseMs: 10_000,
  /** Menos que isto ate o prazo da fase: a chamada nem comeca (ms). */
  minCallMs: 3_000,
  /** Contas avaliadas em paralelo. */
  concurrency: 3,
  /** Linhas por lead no resumo do chat. */
  summaryMaxLeads: 10,
  /** Teto do gatilho e da hipotese de dor (caracteres). */
  textMaxChars: 240,
} as const;

export type WhyNowConfig = typeof WHY_NOW_CONFIG;
