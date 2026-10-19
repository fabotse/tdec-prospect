/**
 * Agent Usage Logging — Story 24.10
 *
 * So servidor. Toda chamada paga do agente vira UMA linha em `api_usage_logs` por
 * operacao (padrao do revisor da 24.9), com `tenantId` e `metadata.executionId`
 * (sem coluna nova). `logApiUsage` nunca lanca; este wrapper tambem nao.
 */

import { logApiUsage } from "@/lib/services/usage-logger";
import type { UsageServiceName, UsageStatus } from "@/types/api-usage";
import type { StepType } from "@/types/agent";
import type { AIProvider } from "@/lib/ai/providers/base-provider";

export interface AgentUsageLogParams {
  tenantId: string;
  executionId?: string | null;
  stepType?: StepType;
  serviceName: UsageServiceName;
  requestType: string;
  status: UsageStatus;
  /** Chamadas externas feitas nesta operacao. */
  calls: number;
  durationMs?: number;
  errorMessage?: string;
  estimatedCost?: number;
  postsFetched?: number;
  metadata?: Record<string, unknown>;
}

/** Loga uma operacao do agente. Nunca lanca. */
export async function logAgentUsage(params: AgentUsageLogParams): Promise<void> {
  try {
    const metadata: Record<string, unknown> = {
      ...(params.metadata ?? {}),
      calls: params.calls,
      source: "agent",
    };
    if (params.executionId) metadata.executionId = params.executionId;
    if (params.stepType) metadata.stepType = params.stepType;

    await logApiUsage({
      tenantId: params.tenantId,
      serviceName: params.serviceName,
      requestType: params.requestType,
      status: params.status,
      errorMessage: params.errorMessage,
      estimatedCost: params.estimatedCost,
      postsFetched: params.postsFetched,
      durationMs: params.durationMs,
      metadata,
    });
  } catch (error) {
    console.error("[logAgentUsage] Falha ao logar uso:", error);
  }
}

export interface ProviderUsage {
  calls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  models: string[];
}

/**
 * Embrulha um provider de IA num proxy que conta chamadas de `generateText`, tokens e
 * modelos. O comportamento da chamada nao muda (mesmos argumentos, mesmo retorno, mesmo
 * erro). Cada invocacao conta como 1 chamada, inclusive as que falharam.
 */
export function trackProviderUsage<T extends AIProvider>(
  provider: T
): { provider: T; getUsage: () => ProviderUsage } {
  const usage = {
    calls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    models: new Set<string>(),
  };

  const tracked = new Proxy(provider, {
    get(target, prop, receiver) {
      if (prop === "generateText") {
        return async (...args: Parameters<AIProvider["generateText"]>) => {
          usage.calls++;
          try {
            const result = await target.generateText(args[0], args[1]);
            usage.promptTokens += result.usage?.promptTokens ?? 0;
            usage.completionTokens += result.usage?.completionTokens ?? 0;
            if (result.model) usage.models.add(result.model);
            return result;
          } catch (error) {
            usage.failedCalls++;
            throw error;
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    provider: tracked,
    getUsage: () => ({
      calls: usage.calls,
      failedCalls: usage.failedCalls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      models: [...usage.models],
    }),
  };
}
