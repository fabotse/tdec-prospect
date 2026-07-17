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
  ActivateResult,
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
  AccountCampaignMappingRequest,
  AccountCampaignMappingResponse,
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
const INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT = "/api/v2/account-campaign-mappings";
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
   * Story 7.5: AC #1
   *
   * Uses POST /api/v2/account-campaign-mappings to associate
   * each sending account with the campaign.
   *
   * @param params - API key, campaign ID, and account emails
   * @returns Success status and count of accounts added
   */
  async addAccountsToCampaign(params: AddAccountsParams): Promise<AddAccountsResult> {
    const { apiKey, campaignId, accountEmails } = params;

    if (accountEmails.length === 0) {
      return { success: true, accountsAdded: 0 };
    }

    const url = `${INSTANTLY_API_BASE}${INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT}`;
    let accountsAdded = 0;

    for (let i = 0; i < accountEmails.length; i++) {
      if (i > 0) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

      const requestBody: AccountCampaignMappingRequest = {
        campaign_id: campaignId,
        email_account: accountEmails[i],
      };

      await this.request<AccountCampaignMappingResponse>(url, {
        method: "POST",
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(requestBody),
      });

      accountsAdded++;
    }

    return { success: true, accountsAdded };
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
   * @param params - API key and campaign ID
   * @returns Success status
   */
  async activateCampaign(params: ActivateCampaignParams): Promise<ActivateResult> {
    const { apiKey, campaignId } = params;
    const url = `${INSTANTLY_API_BASE}${INSTANTLY_CAMPAIGNS_ENDPOINT}/${campaignId}/activate`;

    const response = await this.request<ActivateCampaignResponse>(url, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({}),
    });

    return { success: response.success };
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

