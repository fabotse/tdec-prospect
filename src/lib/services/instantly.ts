/**
 * Instantly Service
 * Story: 2.3 - Integration Connection Testing
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * Instantly API V2 integration for email campaign automation.
 * Provides: testConnection, createCampaign, addAccountsToCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus
 *
 * API Docs: https://developer.instantly.ai/getting-started/authorization
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import type {
  CreateCampaignParams,
  CreateCampaignResult,
  CreateCampaignRequest,
  CreateCampaignResponse,
  AddLeadsParams,
  AddLeadsResult,
  BulkAddLeadsRequest,
  BulkAddLeadsResponse,
  ActivateCampaignParams,
  ActivateCampaignResponse,
  GetCampaignStatusParams,
  CampaignStatusResult,
  GetCampaignResponse,
  InstantlySequenceStep,
  InstantlyLead,
  ListAccountsParams,
  ListAccountsResult,
  ListAccountsResponse,
  ListCampaignsResponse,
  AddAccountsParams,
  AddAccountsResult,
  UpdateCampaignRequest,
  UpdateCampaignResponse,
  UpdateLeadInterestStatusParams,
  UpdateLeadInterestStatusResult,
  FindLeadIdByEmailParams,
  DeleteLeadParams,
  DeleteLeadResult,
  InstantlyLeadListItem,
  InstantlyLeadListLookupResponse,
} from "@/types/instantly";

// ==============================================
// CONSTANTS
// ==============================================

const INSTANTLY_API_BASE = "https://api.instantly.ai";
const INSTANTLY_ACCOUNTS_ENDPOINT = "/api/v2/accounts";
const INSTANTLY_CAMPAIGNS_ENDPOINT = "/api/v2/campaigns";
const INSTANTLY_LEADS_ADD_ENDPOINT = "/api/v2/leads/add";
const INSTANTLY_LEADS_ENDPOINT = "/api/v2/leads";
const INSTANTLY_LEADS_LIST_ENDPOINT = "/api/v2/leads/list";
const INSTANTLY_INTEREST_STATUS_ENDPOINT = "/api/v2/leads/update-interest-status";
const RATE_LIMIT_DELAY_MS = 150;
const GATEWAY_ERROR_CODES = new Set([502, 503, 504]);
const GATEWAY_VERIFY_DELAY_MS = 3000;
const LEAD_LOOKUP_PAGE_SIZE = 100;
const MAX_LEAD_LOOKUP_PAGES = 50;

export const MAX_LEADS_PER_BATCH = 1000;

export const INSTANTLY_CAMPAIGN_STATUS_LABELS: Record<number, string> = {
  0: "Rascunho",
  1: "Ativa",
  2: "Pausada",
  3: "Concluída",
  4: "Executando subsequências",
  [-99]: "Conta suspensa",
  [-1]: "Contas com problema",
  [-2]: "Proteção de bounce",
};

/**
 * Story 21.9 — escala de status do LEAD dentro da campanha (item.status do
 * POST /api/v2/leads/list). NÃO confundir com INSTANTLY_CAMPAIGN_STATUS_LABELS
 * acima (escala de CAMPANHA — valores diferentes para os mesmos números).
 */
export const INSTANTLY_LEAD_STATUS_LABELS: Record<number, string> = {
  1: "Ativa",
  2: "Pausada",
  3: "Concluída",
  [-1]: "Bounce",
  [-2]: "Descadastrado",
  [-3]: "Pulado",
};

// ==============================================
// HELPERS
// ==============================================

function buildDefaultSchedule() {
  return {
    schedules: [
      {
        name: "Horário Comercial",
        timing: { from: "09:00", to: "17:00" },
        days: {
          "0": false,
          "1": true,
          "2": true,
          "3": true,
          "4": true,
          "5": true,
          "6": false,
        },
        timezone: "America/Sao_Paulo",
      },
    ],
  };
}

/**
 * Story 22.18 (AC5): chave de COMPARACAO de conta de envio.
 *
 * Normaliza `trim` + caixa apenas para COMPARAR. O valor enviado no `email_list`
 * preserva a grafia original — baixar tudo para `toLowerCase()` no payload seria
 * apostar que o Instantly e case-insensitive no e-mail da conta, aposta que a
 * Story 22.12 explicitamente recusou fazer sem confirmar.
 */
function accountKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Uniao deduplicada de contas preservando a ordem (existentes primeiro) e a grafia
 * original do PRIMEIRO ocorrido de cada conta.
 */
function mergeEmailList(
  existing: string[] | undefined | null,
  incoming: string[]
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const raw of [...(existing ?? []), ...incoming]) {
    if (typeof raw !== "string") continue;
    const key = accountKey(raw);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    // Story 22.18 (code review, P7): envia `trim()`, nao `raw`.
    //
    // A AC5 dizia "normaliza trim + case apenas para COMPARAR, preservando a grafia
    // original" — mas "grafia" ali e CAIXA (o ponto que a 22.12 se recusou a assumir
    // como insensivel). Espaco em branco nao e grafia, e sujeira de entrada: mandar
    // `"  a@x.com  "` literal no `email_list` cria um remetente que o Instantly
    // provavelmente nao reconhece, e a verificacao pos-escrita nao pega porque ela
    // compara normalizado. A caixa continua preservada.
    merged.push(raw.trim());
  }

  return merged;
}

/**
 * Contas pedidas que NAO estao presentes no estado resultante (comparacao normalizada).
 *
 * Story 22.18 (code review, P7): aplica os MESMOS filtros do `mergeEmailList`.
 * Sem isso, uma entrada vazia/whitespace (descartada pelo merge, logo jamais enviada) ou
 * um valor nao-string continuavam sendo EXIGIDOS aqui — a primeira garantia um 2o PATCH
 * inutil seguido de erro terminal com nome vazio ("nao registrou as contas: "), e o
 * segundo estourava `TypeError: email.trim is not a function` mascarado como falha de
 * attach. As duas funcoes precisam concordar sobre o que e uma conta pedida.
 */
function findMissingAccounts(resultList: string[], requested: string[]): string[] {
  const present = new Set(
    resultList.filter((e) => typeof e === "string").map(accountKey)
  );
  const missing: string[] = [];
  const alreadyReported = new Set<string>();

  for (const email of requested) {
    if (typeof email !== "string") continue;
    const key = accountKey(email);
    if (key.length === 0) continue;
    if (present.has(key) || alreadyReported.has(key)) continue;
    alreadyReported.add(key);
    missing.push(email.trim());
  }

  return missing;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert plain text email body to HTML for Instantly API.
 * Instantly renders HTML by default (text_only: false), so we need
 * proper HTML tags for line breaks to display correctly.
 *
 * - Double newlines (\n\n) become paragraph breaks
 * - Single newlines (\n) become <br> tags
 * - Template variables {{...}} are preserved as-is
 * - HTML entities in text are escaped to prevent injection
 *
 * @param text - Plain text body (may contain \n and {{variables}})
 * @returns HTML-formatted string safe for Instantly email body
 */
export function textToEmailHtml(text: string): string {
  if (!text) return "";

  // Escape HTML entities (preserves {{variables}} since they don't use < or >)
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Split on double newlines to get paragraphs
  const paragraphs = escaped.split(/\n\n+/);

  // Convert single newlines to <br> within each paragraph, wrap in <p> tags
  return paragraphs
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// ==============================================
// INSTANTLY SERVICE
// ==============================================

/**
 * Instantly API V2 service
 * Used for email campaign deployment and management
 *
 * Authentication: Bearer token in Authorization header
 * Note: V1 API is deprecated, using V2 with Bearer token
 */
export class InstantlyService extends ExternalService {
  readonly name = "instantly";

  /**
   * Test connection to Instantly API V2
   * Uses the accounts endpoint to verify API key validity
   *
   * @param apiKey - Instantly V2 API key
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      // V2 API uses Bearer token authentication
      const url = `${INSTANTLY_API_BASE}${INSTANTLY_ACCOUNTS_ENDPOINT}?limit=1`;

      await this.request<ListAccountsResponse>(url, {
        method: "GET",
        headers: buildAuthHeaders(apiKey),
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Instantly")
      );
    }
  }

  /**
   * Create a campaign in Instantly
   * Story 7.2: AC #2
   *
   * Creates campaign in Draft status (0) with email sequences.
   * Campaign schedule defaults to Brazilian business hours (09-17, Mon-Fri).
   *
   * @param params - Campaign name, API key, and email sequences with delays
   * @returns Campaign ID, name, and status
   */
  async createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult> {
    const { apiKey, name, sequences, sendingAccounts } = params;

    const steps: InstantlySequenceStep[] = sequences.map((seq, index) => ({
      type: "email" as const,
      delay: index < sequences.length - 1 ? sequences[index + 1].delayDays : 0,
      variants: [{
        subject: seq.subject,
        body: textToEmailHtml(seq.body),
      }],
    }));

    const requestBody: CreateCampaignRequest = {
      name,
      campaign_schedule: buildDefaultSchedule(),
      sequences: [{ steps }],
      stop_on_reply: true,
      open_tracking: true,
      link_tracking: true,
      ...(sendingAccounts && sendingAccounts.length > 0 && {
        email_list: sendingAccounts,
      }),
    };

    const url = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}`;

    try {
      const response = await this.request<CreateCampaignResponse>(url, {
        method: "POST",
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(requestBody),
      });

      return {
        campaignId: response.id,
        name: response.name,
        status: response.status,
      };
    } catch (error) {
      // Gateway errors (502/503/504): Instantly may have created the campaign
      // despite the gateway timing out. Verify before reporting failure.
      if (
        error instanceof ExternalServiceError &&
        GATEWAY_ERROR_CODES.has(error.statusCode)
      ) {
        await delay(GATEWAY_VERIFY_DELAY_MS);
        const found = await this.findRecentCampaignByName(apiKey, name);
        if (found) {
          return found;
        }
      }
      throw error;
    }
  }

  /**
   * Search for a recently created campaign by exact name.
   * Used as a fallback after gateway errors (502/503/504) to verify
   * if the campaign was actually created despite the error response.
   *
   * @returns CreateCampaignResult if found, null otherwise
   */
  private async findRecentCampaignByName(
    apiKey: string,
    name: string
  ): Promise<CreateCampaignResult | null> {
    try {
      const searchUrl = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}?search=${encodeURIComponent(name)}&limit=5`;
      const response = await this.request<ListCampaignsResponse>(searchUrl, {
        method: "GET",
        headers: buildAuthHeaders(apiKey),
      });

      const match = response.items.find((c) => c.name === name);
      if (match) {
        return { campaignId: match.id, name: match.name, status: match.status };
      }
      return null;
    } catch {
      // If verification also fails, return null so the original error is thrown
      return null;
    }
  }

  /**
   * Add sending accounts to an Instantly campaign
   * Story 7.5: AC #1 — reescrito na Story 22.12
   *
   * O antigo POST /api/v2/account-campaign-mappings NAO EXISTE na v2 (404 real
   * "Route POST:/api/v2/account-campaign-mappings not found"). O mecanismo
   * canonico e PATCH /api/v2/campaigns/{id} com `email_list` (doc oficial:
   * "List of accounts to use for sending emails").
   *
   * Caminho defensivo (replace-safe): a doc NAO especifica se o PATCH substitui
   * ou mescla `email_list`. Lemos a campanha (GET), mesclamos o `email_list`
   * existente com as contas novas (uniao deduplicada) e enviamos o PATCH. Isso e
   * seguro sob AMBAS as semanticas: um PATCH-replace recebe o conjunto completo
   * (nao derruba contas ja anexadas, ex.: as do createCampaign autopilot); um
   * PATCH-merge e idempotente. 1 GET + 1 PATCH no lugar do loop de N POSTs.
   *
   * @param params - API key, campaign ID, and account emails
   * @returns Success status and count of accounts added
   */
  async addAccountsToCampaign(params: AddAccountsParams): Promise<AddAccountsResult> {
    const { apiKey, campaignId, accountEmails } = params;

    if (accountEmails.length === 0) {
      return { success: true, accountsAdded: 0 };
    }

    const campaignUrl = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}/${campaignId}`;

    // 1) Ler o email_list atual para nao sobrescrever contas ja anexadas.
    const current = await this.request<GetCampaignResponse>(campaignUrl, {
      method: "GET",
      headers: buildAuthHeaders(apiKey),
    });

    // 2) Mesclar (uniao deduplicada, preservando ordem: existentes primeiro).
    //    `current?` blinda contra um corpo GET nulo (ex.: 200 com JSON `null`).
    const mergedEmailList = mergeEmailList(current?.email_list, accountEmails);

    // 3) PATCH com o conjunto completo.
    const patched = await this.patchEmailList(apiKey, campaignUrl, mergedEmailList);

    // 4) Story 22.18 (AC5): VERIFICAR o resultado da escrita.
    //
    // O corpo da resposta do PATCH ja traz `email_list` (o Campaign object atualizado) e
    // era simplesmente descartado — usa-lo mantem o caminho feliz em 1 GET + 1 PATCH.
    // O GET extra so acontece se o corpo nao trouxer o campo.
    let resultList = await this.resolveEmailList(apiKey, campaignUrl, patched);
    let missing = findMissingAccounts(resultList, accountEmails);

    if (missing.length > 0) {
      // Lost update: alguem escreveu `email_list` entre o nosso GET e o nosso PATCH.
      // Refazemos o merge UMA vez, partindo do estado que acabamos de observar.
      const retryList = mergeEmailList(resultList, accountEmails);
      const retried = await this.patchEmailList(apiKey, campaignUrl, retryList);
      resultList = await this.resolveEmailList(apiKey, campaignUrl, retried);
      missing = findMissingAccounts(resultList, accountEmails);
    }

    if (missing.length > 0) {
      // Terminal de proposito: devolver `{ success: true }` com conta faltando seria o
      // fracasso silencioso que esta verificacao existe para matar. Quem chama decide o
      // que fazer — na ativacao REAL isso BLOQUEIA (Story 22.12 AC4); no ramo defer o
      // orchestrator apenas liga `accountsAttachFailed`.
      // Story 22.18 (code review, P8): 422, nao 502.
      //
      // `BaseStep.isRetryableStatus` trata 502 como RETRYABLE, entao a UI oferecia
      // "tentar novamente" para uma condicao que, por construcao, nao passa: a corrida de
      // lost-update ja foi refeita uma vez acima: se a conta continua ausente depois
      // disso, a causa e deterministica (conta fora do workspace, endereco recusado). Cada
      // nova tentativa queimaria 2 PATCH + ate 2 GET sem chance de mudar o resultado.
      throw new ExternalServiceError(
        "instantly",
        422,
        `O Instantly nao registrou as contas de envio: ${missing.join(", ")}`,
        { missingAccounts: missing, requested: accountEmails }
      );
    }

    return { success: true, accountsAdded: accountEmails.length };
  }

  /** PATCH /campaigns/{id} com o email_list completo (Story 22.12/22.18). */
  private async patchEmailList(
    apiKey: string,
    campaignUrl: string,
    emailList: string[]
  ): Promise<UpdateCampaignResponse | null> {
    const requestBody: UpdateCampaignRequest = { email_list: emailList };

    return this.request<UpdateCampaignResponse>(campaignUrl, {
      method: "PATCH",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Story 22.18 (AC5): estado resultante do `email_list` apos uma escrita.
   * Prefere o corpo do PATCH (gratis); so faz um GET extra se ele nao trouxer o campo.
   */
  private async resolveEmailList(
    apiKey: string,
    campaignUrl: string,
    patched: UpdateCampaignResponse | null
  ): Promise<string[]> {
    if (Array.isArray(patched?.email_list)) return patched.email_list;

    try {
      const verified = await this.request<GetCampaignResponse>(campaignUrl, {
        method: "GET",
        headers: buildAuthHeaders(apiKey),
      });
      return Array.isArray(verified?.email_list) ? verified.email_list : [];
    } catch (verifyError) {
      // Story 22.18 (code review, P9): o PATCH deu 2xx; foi a LEITURA de conferencia que
      // caiu. Continuamos bloqueando (nao sabemos o estado, e declarar sucesso as cegas e
      // exatamente o fracasso silencioso que a AC5 existe para matar), mas o erro precisa
      // dizer a verdade: antes, esta falha virava "O Instantly nao registrou as contas de
      // envio: <lista>" — uma afirmacao FALSA sobre contas que muito provavelmente estao
      // anexadas, e que manda o usuario reanexa-las a mao.
      throw new ExternalServiceError(
        "instantly",
        422,
        "Nao consegui confirmar as contas de envio no Instantly: a escrita foi aceita, mas a leitura de conferencia falhou. Verifique as contas da campanha no Instantly antes de ativar.",
        {
          cause: verifyError instanceof Error ? verifyError.message : verifyError,
          verificationFailed: true,
        }
      );
    }
  }

  /**
   * Add leads to an Instantly campaign in batches
   * Story 7.2: AC #3
   *
   * Splits leads into chunks of MAX_LEADS_PER_BATCH (1000).
   * Filters leads without email. Maps internal fields to Instantly format.
   * Rate limiting: 150ms delay between batch requests.
   *
   * @param params - Campaign ID, API key, and leads array
   * @returns Aggregated results across all batches
   */
  async addLeadsToCampaign(params: AddLeadsParams): Promise<AddLeadsResult> {
    const { apiKey, campaignId, leads } = params;

    // Filter leads without email
    const validLeads = leads.filter((lead) => lead.email);

    // Map internal leads to Instantly format
    const instantlyLeads: InstantlyLead[] = validLeads.map((lead) => {
      const mapped: InstantlyLead = { email: lead.email };

      if (lead.firstName) mapped.first_name = lead.firstName;
      if (lead.lastName) mapped.last_name = lead.lastName;
      if (lead.companyName) mapped.company_name = lead.companyName;
      if (lead.phone) mapped.phone = lead.phone;

      // Custom variables for non-native fields
      const customVars: Record<string, string> = {};
      if (lead.title) customVars.title = lead.title;
      if (lead.icebreaker) customVars.ice_breaker = lead.icebreaker;

      if (Object.keys(customVars).length > 0) {
        mapped.custom_variables = customVars;
      }

      return mapped;
    });

    // Split into batches
    const batches: InstantlyLead[][] = [];
    for (let i = 0; i < instantlyLeads.length; i += MAX_LEADS_PER_BATCH) {
      batches.push(instantlyLeads.slice(i, i + MAX_LEADS_PER_BATCH));
    }

    // Aggregate results (-1 = unknown/not queried)
    let totalUploaded = 0;
    let totalDuplicated = 0;
    let totalInvalidEmails = 0;
    let lastRemainingInPlan = -1;

    const url = `${INSTANTLY_API_BASE}${INSTANTLY_LEADS_ADD_ENDPOINT}`;

    for (let i = 0; i < batches.length; i++) {
      if (i > 0) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

      const requestBody: BulkAddLeadsRequest = {
        campaign_id: campaignId,
        skip_if_in_campaign: false,
        skip_if_in_workspace: false,
        verify_leads_on_import: false,
        leads: batches[i],
      };

      try {
        const response = await this.request<BulkAddLeadsResponse>(url, {
          method: "POST",
          headers: buildAuthHeaders(apiKey),
          body: JSON.stringify(requestBody),
        });

        totalUploaded += response.leads_uploaded;
        totalDuplicated += response.duplicated_leads;
        totalInvalidEmails += response.invalid_email_count;
        lastRemainingInPlan = response.remaining_in_plan;
      } catch (error) {
        if (error instanceof ExternalServiceError) {
          throw new ExternalServiceError(
            error.serviceName,
            error.statusCode,
            error.message,
            {
              partialResults: {
                leadsUploaded: totalUploaded,
                duplicatedLeads: totalDuplicated,
                invalidEmails: totalInvalidEmails,
                remainingInPlan: lastRemainingInPlan,
              },
              batchesCompleted: i,
              totalBatches: batches.length,
            }
          );
        }
        throw error;
      }
    }

    return {
      leadsUploaded: totalUploaded,
      duplicatedLeads: totalDuplicated,
      invalidEmails: totalInvalidEmails,
      remainingInPlan: lastRemainingInPlan,
    };
  }

  /**
   * Activate a campaign in Instantly
   * Story 7.2: AC #4
   *
   * ATENCAO: o endpoint e "Activate (start), **or resume** a campaign" — chamar de novo
   * numa campanha ja ativa pode RETOMAR a sequencia. Quem chama e responsavel pela
   * idempotencia (ver ActivateStep, Story 22.18 AC4).
   *
   * Story 22.18 (AC7): esta funcao devolvia `{ success: response.success }` e o tipo
   * declarava `{ success: boolean }` — mas a API v2 responde o *Campaign object*, sem
   * nenhum campo `success`. Ou seja, o unico consumidor possivel receberia `undefined`
   * disfarcado de boolean. Ninguem usava o retorno (o `ActivateStep` ignora e a rota
   * `/api/instantly/campaign/[id]/activate`, orfa, foi removida), entao o contrato passa
   * a nao afirmar nada: erro vira excecao, sucesso vira retorno vazio.
   *
   * @param params - API key and campaign ID
   */
  async activateCampaign(params: ActivateCampaignParams): Promise<void> {
    const { apiKey, campaignId } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}/${campaignId}/activate`;

    await this.request<ActivateCampaignResponse>(url, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({}),
    });
  }

  /**
   * List sending accounts configured in Instantly
   * Story 7.4: AC #4
   *
   * @param params - API key and optional limit (default 100)
   * @returns List of sending accounts with email, first_name, last_name
   */
  async listAccounts(params: ListAccountsParams): Promise<ListAccountsResult> {
    const { apiKey, limit = 100 } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_ACCOUNTS_ENDPOINT}?limit=${limit}`;

    const response = await this.request<ListAccountsResponse>(url, {
      method: "GET",
      headers: buildAuthHeaders(apiKey),
    });

    return {
      accounts: response.items,
      totalCount: response.total_count,
    };
  }

  /**
   * Get campaign status from Instantly
   * Story 7.2: AC #4
   *
   * @param params - API key and campaign ID
   * @returns Campaign status with PT-BR label
   */
  async getCampaignStatus(params: GetCampaignStatusParams): Promise<CampaignStatusResult> {
    const { apiKey, campaignId } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}/${campaignId}`;

    const response = await this.request<GetCampaignResponse>(url, {
      method: "GET",
      headers: buildAuthHeaders(apiKey),
    });

    return {
      campaignId: response.id,
      name: response.name,
      status: response.status,
      statusLabel: INSTANTLY_CAMPAIGN_STATUS_LABELS[response.status] ?? "Desconhecido",
      // Story 22.18 (AC6): o GET cru sempre trouxe `email_list` e o mapper descartava.
      // Expor aqui deixa a guarda de servidor ("campanha sem remetente nao ativa")
      // reaproveitar exatamente a mesma leitura do pre-flight de status da AC4b.
      // `undefined` (campo ausente na resposta) e DIFERENTE de `[]` (campanha sem
      // conta): so o segundo autoriza bloquear a ativacao.
      emailList: Array.isArray(response.email_list) ? response.email_list : undefined,
    };
  }

  /**
   * Update a lead's interest status in a campaign (Story 21.9 — "Parar sequência").
   * POST /api/v2/leads/update-interest-status
   *
   * O Instantly responde 202 ("background job submitted") — validado em smoke test
   * real (2026-07-16): em segundos o lead sai de status 1 (ativo) para 3 (concluída)
   * e a sequência para. `response.ok` cobre 2xx, então 202 é sucesso no base-service.
   *
   * @param params - API key, external campaign ID, lead email and interest value
   *   (1 = Interested, -1 = Not Interested)
   * @returns accepted=true quando o job foi aceito (efeito é assíncrono)
   */
  async updateLeadInterestStatus(
    params: UpdateLeadInterestStatusParams
  ): Promise<UpdateLeadInterestStatusResult> {
    const { apiKey, campaignId, leadEmail, interestValue } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_INTEREST_STATUS_ENDPOINT}`;

    await this.request<{ message?: string }>(url, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({
        campaign_id: campaignId,
        lead_email: leadEmail,
        interest_value: interestValue,
      }),
    });

    return { accepted: true };
  }

  /**
   * Resolve the Instantly-internal lead ID by email within a campaign (Story 21.9).
   * POST /api/v2/leads/list
   *
   * Fast-path: `search` server-side (NÃO validado para e-mail no smoke test —
   * por isso o match é sempre re-verificado client-side por e-mail normalizado).
   * Fallback obrigatório: paginação completa (`limit` + `starting_after`)
   * comparando `item.email` normalizado, com teto de páginas + warning
   * (padrão do sweep 21.2).
   *
   * @returns Instantly lead ID, ou null se o lead não está na campanha
   */
  async findLeadIdByEmail(params: FindLeadIdByEmailParams): Promise<string | null> {
    const { apiKey, campaignId, email } = params;
    const target = email.trim().toLowerCase();
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_LEADS_LIST_ENDPOINT}`;

    const matchByEmail = (items: InstantlyLeadListItem[]): string | null => {
      for (const item of items) {
        if ((item.email ?? "").trim().toLowerCase() === target) {
          return item.id;
        }
      }
      return null;
    };

    // Fast-path: busca server-side.
    const searchResponse = await this.request<InstantlyLeadListLookupResponse>(url, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({
        campaign: campaignId,
        search: email,
        limit: LEAD_LOOKUP_PAGE_SIZE,
      }),
    });

    const fastMatch = matchByEmail(searchResponse.items ?? []);
    if (fastMatch) return fastMatch;

    // Fallback: paginação completa sem `search`.
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    do {
      // Throttle entre páginas (padrão dos demais métodos paginados — ex.
      // addAccountsToCampaign): evita que uma rajada de POSTs /leads/list leve 429
      // no meio da varredura de uma campanha grande (Review 21.9, patch P3).
      if (pageCount > 0) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

      const body: Record<string, unknown> = {
        campaign: campaignId,
        limit: LEAD_LOOKUP_PAGE_SIZE,
      };
      if (cursor) body.starting_after = cursor;

      const response = await this.request<InstantlyLeadListLookupResponse>(url, {
        method: "POST",
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(body),
      });

      const match = matchByEmail(response.items ?? []);
      if (match) return match;

      cursor = response.next_starting_after ?? undefined;
      pageCount++;
    } while (cursor && pageCount < MAX_LEAD_LOOKUP_PAGES);

    // Teto atingido COM cursor remanescente = varredura INCONCLUSIVA (o lead pode existir
    // além do teto). Isso NÃO é "não encontrado": devolver null aqui faria a rota dizer
    // "pode já ter sido removido" para um lead que ainda está ativo e recebendo follow-up.
    // Lança erro distinto para o caller surfacear uma mensagem honesta (Review 21.9, patch P1).
    if (cursor) {
      console.warn(
        `[InstantlyService] findLeadIdByEmail atingiu o teto de ${MAX_LEAD_LOOKUP_PAGES} páginas com cursor remanescente — varredura inconclusiva.`
      );
      throw new ExternalServiceError(
        this.name,
        502,
        "Não foi possível localizar o lead: a campanha excede o limite de varredura automática. Remova o lead pelo painel do Instantly."
      );
    }

    return null;
  }

  /**
   * Delete a lead from Instantly (Story 21.9 — "Remover do Instantly").
   * DELETE /api/v2/leads/{id} — responde 200 com o objeto do lead removido;
   * GET posterior devolve 404 (remoção real, validada em smoke test 2026-07-16).
   *
   * Remove o lead e o histórico dele no INSTANTLY — os dados locais
   * (leads/campaign_leads) são preservados pelo caller (rota da 21.9).
   *
   * @param params - API key and Instantly-internal lead ID
   */
  async deleteLead(params: DeleteLeadParams): Promise<DeleteLeadResult> {
    const { apiKey, leadId } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_LEADS_ENDPOINT}/${encodeURIComponent(leadId)}`;

    await this.request<Record<string, unknown>>(url, {
      method: "DELETE",
      headers: buildAuthHeaders(apiKey),
    });

    return { deleted: true };
  }
}

