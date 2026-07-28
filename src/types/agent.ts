/**
 * Agent Types
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #3 - Tipos do agente disponiveis para importacao
 */

// === Enums / Unions ===

// Story 22.10: 'cancelled' e TERMINAL — o usuario abandonou a execucao pelo botao
// "Nova conversa". Nenhum caminho escreve por cima dele (execute/approve recusam
// status terminal), entao "descancelar" e impossivel.
// Ciclo real: pending (briefing) -> running (POST /confirm) -> completed | paused (erro)
//             qualquer nao-terminal -> cancelled (PATCH { status: "cancelled" })
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type ExecutionMode = 'guided' | 'autopilot';
export type StepType = 'search_companies' | 'search_leads' | 'create_campaign' | 'export' | 'activate';
export type StepStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'completed' | 'failed' | 'skipped';
export type MessageRole = 'user' | 'agent' | 'system';
// Story 22.17 (AC3): `step_complete` e o log de CONCLUSAO de um step. Antes ele era
// gravado como `progress`, e a bolha renderizava "Processando..." + spinner girando
// em cima de um texto que dizia "concluido com sucesso". Mensagens antigas no banco
// continuam `progress` e seguem renderizando (o render nao quebra por tipo).
export type MessageType = 'text' | 'approval_gate' | 'progress' | 'step_complete' | 'error' | 'cost_estimate' | 'summary' | 'skip';

// Story 22.3: conversa com memoria real + intencao via LLM
// nextAction e a decisao de CONVERSA do parser (perguntar/confirmar/prosseguir/etc).
// NAO decide pipeline (skipSteps/canProceed continuam deterministicos — NFR1).
export type NextAction = 'ask' | 'confirm' | 'proceed' | 'register_product' | 'import_leads';

// Story 22.5: metadados de CAMPANHA capturados na conversa (nao de busca/pipeline).
// Valores EXATOS consumidos pelo prompt campaign_structure_generation (defaults.ts).
export type CampaignObjective = 'COLD_OUTREACH' | 'REENGAGEMENT' | 'FOLLOW_UP' | 'NURTURE';
export type CampaignUrgency = 'LOW' | 'MEDIUM' | 'HIGH';

// Turno de conversa enviado ao parser (usuario E agente). role reusa MessageRole
// (o hook so usa 'user'|'agent'; 'system' fica disponivel para o service/back-compat).
export interface ChatTurn {
  role: MessageRole;
  content: string;
}

// === Database Row Types ===

export interface AgentExecution {
  id: string;
  tenant_id: string;
  user_id: string;
  status: ExecutionStatus;
  mode: ExecutionMode;
  briefing: ParsedBriefing;
  current_step: number;
  total_steps: number;
  cost_estimate: CostEstimate | null;
  cost_actual: Record<string, number> | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentStep {
  id: string;
  execution_id: string;
  step_number: number;
  step_type: StepType;
  status: StepStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  cost: Record<string, number> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentMessage {
  id: string;
  execution_id: string;
  role: MessageRole;
  content: string;
  metadata: AgentMessageMetadata;
  created_at: string;
}

export interface AgentMessageMetadata {
  stepNumber?: number;
  messageType?: MessageType;
  approvalData?: {
    stepType: StepType;
    previewData: unknown;
  };
  // Story 22.13: auditoria DURAVEL da rejeicao de um gate (JSONB, sem migration).
  // Carimbado pelo POST .../steps/[n]/reject na mensagem approval_gate mais recente
  // do step. Sem isto, a marcacao "Rejeitado" era estado local e sumia no refresh —
  // o card voltava com os botoes ativos.
  rejected?: boolean;
  // Story 22.18 (AC3): desfecho DURAVEL do gate de ativacao (JSONB, sem migration).
  // "deferred" e carimbado pelo POST .../steps/[n]/approve (ali o approve E a acao
  // completa); "activated" e carimbado pelo ActivateStep DEPOIS de a campanha ficar
  // ativa no Instantly — nunca no approve, que retorna antes de o `execute` disparar e
  // nao tem como saber se a ativacao deu certo. Ativacao que falha NAO carimba nada:
  // o card volta re-armado para a retomada continuar alcancavel.
  activationOutcome?: "activated" | "deferred";
}

// === Domain Types ===

export interface ParsedBriefing {
  technology: string | null;
  jobTitles: string[];
  location: string | null;
  companySize: string | null;
  industry: string | null;
  productSlug: string | null;
  mode: ExecutionMode;
  skipSteps: string[];
  importedLeads?: SearchLeadResult[]; // Story 17.11: leads fornecidos pelo usuario
  premiumIcebreakers?: boolean; // Story 22.2: toggle opcional de icebreaker premium (LinkedIn via Apify). Ausente/false = comportamento standard atual.
  objective?: CampaignObjective | null; // Story 22.5: objetivo da campanha (metadado). Null = nao especificado; default COLD_OUTREACH aplicado no CreateCampaignStep.
  urgency?: CampaignUrgency | null; // Story 22.5: urgencia da campanha (metadado). Null = nao especificado; default MEDIUM aplicado no CreateCampaignStep.
  campaignDescription?: string | null; // Story 22.5: descricao livre da campanha (ex.: "Black Friday"). Alimenta {{additional_description}} e o nome da campanha.
  emailCount?: number | null; // Story 22.5: quantidade de e-mails desejada (1-10). Null = heuristica por objetivo no prompt.
  // Story 22.15: nome do SEGMENTO onde os leads aprovados sao salvos em "Meus Leads",
  // quando o usuario pede um na conversa ("coloca no segmento Teste Atibaia"). Null =
  // usa o proprio nome da campanha. NAO e filtro de busca: nunca altera skipSteps,
  // nextAction nem os parametros do Apollo. Teto de 100 chars (segments.name e VARCHAR(100)).
  segmentName?: string | null;
}

export interface CostModel {
  id: string;
  tenant_id: string;
  service_name: string;
  unit_price: number;
  unit_description: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface CostEstimate {
  steps: Record<string, { estimated: number; description: string }>;
  total: number;
  currency: 'BRL';
}

// === Execution Plan Types ===

export interface PlannedStep {
  stepNumber: number;
  stepType: StepType;
  title: string;
  description: string;
  skipped: boolean;
  estimatedCost: number;
  costDescription: string;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
  costEstimate: CostEstimate;
  totalActiveSteps: number;
}

// === Pipeline Types ===

export interface StepInput {
  executionId: string;
  briefing: ParsedBriefing;
  previousStepOutput?: Record<string, unknown>;
  mode?: ExecutionMode;
}

export interface StepOutput {
  success: boolean;
  data: Record<string, unknown>;
  cost?: Record<string, number>;
}

export interface PipelineError {
  code: string;
  message: string;
  stepNumber: number;
  stepType: StepType;
  isRetryable: boolean;
  externalService?: string;
  /**
   * Story 22.18 (code review, P2): a bolha de erro JA foi escrita em `agent_messages`
   * por `sendErrorMessage`.
   *
   * O cliente usava a presenca de `stepType` como proxy disso ("tem forma de
   * PipelineError logo ja foi reportado"), mas `createPipelineError` preenche `stepType`
   * SEMPRE — inclusive em `ORCHESTRATOR_INVALID_STEP` e `ORCHESTRATOR_STEP_NOT_READY`,
   * lancados FORA do try/catch que chama `sendErrorMessage`. Nesses casos o gate
   * suprimia a mensagem e nao havia bolha nenhuma: falha 100% silenciosa, o defeito que
   * a AC1 existe para matar. Este flag e escrito DEPOIS da escrita da bolha, entao
   * afirma um fato em vez de inferi-lo. Ausente = mostrar (falhar visivel).
   */
  reportedInChat?: boolean;
}

export interface ExtractedProduct {
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  targetAudience: string | null;
}

export const AGENT_ERROR_CODES = {
  BRIEFING_PARSE_ERROR: 'Nao consegui interpretar o briefing',
  PRODUCT_PARSE_ERROR: 'Nao consegui extrair dados do produto',
  STEP_EXECUTION_ERROR: 'Erro ao executar etapa do pipeline',
  STEP_TIMEOUT: 'Etapa demorou demais para responder',
  APPROVAL_TIMEOUT: 'Aprovacao expirou',
  COST_ESTIMATE_ERROR: 'Erro ao calcular estimativa de custo',
  EXECUTION_RESUME_ERROR: 'Erro ao retomar execucao',
  STEP_SEARCH_COMPANIES_ERROR: 'Erro ao buscar empresas',
  STEP_SEARCH_LEADS_ERROR: 'Erro ao buscar leads',
  STEP_CREATE_CAMPAIGN_ERROR: 'Erro na criacao da campanha',
  STEP_EXPORT_ERROR: 'Erro na exportacao da campanha',
  STEP_ACTIVATE_ERROR: 'Erro na ativacao da campanha',
  ORCHESTRATOR_INVALID_STEP: 'Step invalido no pipeline',
  ORCHESTRATOR_STEP_NOT_READY: 'Step nao esta pronto para execucao',
  CHECKPOINT_SAVE_ERROR: 'Erro ao salvar checkpoint',
} as const;

// === Pipeline Orchestrator Interface (Story 17.1 AC #5) ===

export interface IPipelineOrchestrator {
  planExecution(briefing: ParsedBriefing): Promise<PlannedStep[]>;
  executeStep(executionId: string, stepNumber: number): Promise<StepOutput>;
  getExecution(executionId: string): Promise<AgentExecution | null>;
}

// === Search Companies Output (Story 17.1 AC #3) ===

export interface SearchCompaniesOutput {
  companies: Record<string, unknown>[];
  totalFound: number;
  technologySlug: string;
  filtersApplied: Record<string, unknown>;
}

// === Search Leads Output (Story 17.2 AC #2, #3) ===

export interface SearchLeadResult {
  name: string;
  title: string | null;
  companyName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  apolloId: string | null;
}

export interface SearchLeadsOutput {
  leads: SearchLeadResult[];
  totalFound: number;
  jobTitles: string[];
  domainsSearched: string[];
  searchFilters?: Record<string, unknown>; // Story 17.12: filtros para re-paginacao
}

// === Create Campaign Output (Story 17.3 AC #4) ===

export interface CampaignStructureItem {
  position: number;
  type: 'email' | 'delay';
  context?: string;
  days?: number;
  emailMode?: 'initial' | 'follow-up';
}

export interface LeadWithIcebreaker extends SearchLeadResult {
  icebreaker: string | null;
}

export interface CreateCampaignOutput {
  campaignName: string;
  structure: {
    totalEmails: number;
    totalDays: number;
    items: CampaignStructureItem[];
  };
  emailBlocks: Array<{
    position: number;
    subject: string;
    body: string;
    emailMode: 'initial' | 'follow-up';
  }>;
  delayBlocks: Array<{
    position: number;
    delayDays: number;
  }>;
  leadsWithIcebreakers: LeadWithIcebreaker[];
  icebreakerStats: {
    generated: number; // Story 22.2: premium + standard (icebreakers com texto gerado)
    premium: number; // Story 22.2: gerados via posts reais do LinkedIn (Apify + icebreaker_premium_generation)
    standard: number; // Story 22.2: gerados via caminho standard (icebreaker_generation) ou fallback
    failed: number;
    skipped: number;
  };
  totalLeads: number;
  /**
   * Story 22.16: `campaigns.id` da linha local gravada por este step.
   *
   * O `agent_steps.output` e o UNICO canal entre um step e o seguinte — sem este campo o
   * export nao teria como saber qual linha carimbar com o `external_campaign_id`.
   * `null`/ausente = a persistencia local falhou (fail-open); o export simplesmente nao
   * escreve nada.
   */
  campaignId?: string | null;
}

// === Export Step Output (Story 17.4 AC #1, #2) ===

export interface ExportStepOutput {
  externalCampaignId: string;
  campaignName: string;
  totalEmails: number;
  leadsUploaded: number;
  duplicatedLeads: number;
  invalidEmails: number;
  accountsAdded: number;
  platform: 'instantly';
  accounts: Array<{ email: string; first_name?: string; last_name?: string }>;
  /** Story 22.16: propagado do create_campaign para o activate. */
  campaignId?: string | null;
}

// === Activate Step Output (Story 17.4 AC #3, #4) ===

export interface ActivateStepOutput {
  externalCampaignId: string;
  campaignName: string;
  activated: boolean;
  activatedAt: string;
  /** Story 22.16: propagado do export; a linha local que virou `status: "active"`. */
  campaignId?: string | null;
}

// === Execution lifecycle (Story 22.10) ===

/**
 * Status dos quais uma execucao NAO sai. Fonte unica das guardas de:
 * - PATCH /executions/[id]           -> 409 INVALID_TRANSITION (nao ha como descancelar)
 * - POST  .../steps/[n]/execute      -> 409 EXECUTION_NOT_ACTIVE (nada roda/gasta apos o fim)
 * - POST  .../steps/[n]/approve      -> 409 EXECUTION_NOT_ACTIVE (o ultimo approve
 *                                       sobrescreveria 'cancelled' com 'completed')
 *
 * `paused` NAO e terminal de proposito: e escrito SO em erro do pipeline e o retry
 * legitimo depende dele.
 */
export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'completed',
  'failed',
  'cancelled',
];

export function isTerminalExecutionStatus(status: string): boolean {
  return (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

// === Step Labels (Story 17.1 AC #5) ===

export const STEP_LABELS: Record<StepType, string> = {
  search_companies: 'Busca de Empresas',
  search_leads: 'Busca de Leads',
  create_campaign: 'Criacao de Campanha',
  export: 'Exportacao',
  activate: 'Ativacao',
};
