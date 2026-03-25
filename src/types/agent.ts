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

// === Pipeline Types ===

export interface StepInput {
  executionId: string;
  briefing: ParsedBriefing;
  previousStepOutput?: Record<string, unknown>;
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

export const AGENT_ERROR_CODES = {
  BRIEFING_PARSE_ERROR: 'Nao consegui interpretar o briefing',
  STEP_EXECUTION_ERROR: 'Erro ao executar etapa do pipeline',
  STEP_TIMEOUT: 'Etapa demorou demais para responder',
  APPROVAL_TIMEOUT: 'Aprovacao expirou',
  COST_ESTIMATE_ERROR: 'Erro ao calcular estimativa de custo',
  EXECUTION_RESUME_ERROR: 'Erro ao retomar execucao',
} as const;
