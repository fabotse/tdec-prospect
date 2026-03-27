/**
 * Agent Types
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #3 - Tipos do agente disponiveis para importacao
 */

// === Enums / Unions ===

export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
export type ExecutionMode = 'guided' | 'autopilot';
export type StepType = 'search_companies' | 'search_leads' | 'create_campaign' | 'export' | 'activate';
export type StepStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'completed' | 'failed' | 'skipped';
export type MessageRole = 'user' | 'agent' | 'system';
export type MessageType = 'text' | 'approval_gate' | 'progress' | 'error' | 'cost_estimate' | 'summary';

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
    generated: number;
    failed: number;
    skipped: number;
  };
  totalLeads: number;
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
}

// === Activate Step Output (Story 17.4 AC #3, #4) ===

export interface ActivateStepOutput {
  externalCampaignId: string;
  campaignName: string;
  activated: boolean;
  activatedAt: string;
}

// === Step Labels (Story 17.1 AC #5) ===

export const STEP_LABELS: Record<StepType, string> = {
  search_companies: 'Busca de Empresas',
  search_leads: 'Busca de Leads',
  create_campaign: 'Criacao de Campanha',
  export: 'Exportacao',
  activate: 'Ativacao',
};
