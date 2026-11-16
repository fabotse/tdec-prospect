"use server";

/**
 * Server Actions: Contatos conhecidos
 * Story: 25.1 - Contatos conhecidos
 *
 * Leitura: qualquer membro do tenant. Escrita e busca de LinkedIn: só admin
 * (hasAdminAccess aqui + RLS is_admin() no banco). Tudo é normalizado de novo no servidor.
 *
 * A busca de LinkedIn é sob demanda (um clique do gestor = uma chamada `treg.web.search`),
 * nunca em lote nem em job, e não grava nada: quem grava é o add/update depois que o gestor
 * confirma um candidato. Para o Treg vão só nome + empresa/domínio.
 */

import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { hasAdminAccess } from "@/lib/auth/capabilities";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { isPersonalEmailDomain } from "@/lib/agent/account-suppression";
import { logApiUsage } from "@/lib/services/usage-logger";
import { TregService, TREG_ENDPOINTS } from "@/lib/services/treg";
import { normalizeSuppressionValue } from "@/lib/utils/suppression";
import {
  buildLinkedinQuery,
  normalizeKnownContactInput,
  normalizeLinkedinProfileUrl,
  parseKnownContactRelation,
  pickLinkedinCandidates,
} from "@/lib/utils/known-contacts";
import { uuidSchema, type ActionResult } from "@/types/knowledge-base";
import {
  KNOWN_CONTACTS_IMPORT_MAX_ROWS,
  KNOWN_CONTACT_ERRORS,
  knownContactInputSchema,
  type KnownContact,
  type KnownContactImportReport,
  type KnownContactImportRow,
  type KnownContactImportSkipped,
  type KnownContactInput,
  type LinkedinCandidate,
  type LinkedinLookupInput,
  type NormalizedKnownContact,
} from "@/types/known-contact";

const TABLE = "known_contacts";
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
/** Lookup de existentes vai na URL do GET: chunk menor para não estourar limite (414). */
const LOOKUP_CHUNK_SIZE = 100;
const ADMIN_ONLY = "Apenas gestores e diretores podem alterar os contatos conhecidos";
const TABLE_MISSING = "Os contatos conhecidos ainda não estão disponíveis neste ambiente";
const DUPLICATE = "Já existe um contato com esse LinkedIn";
const NOT_ELIGIBLE =
  "Só uma oportunidade com reunião marcada e lead cadastrado pode virar contato conhecido";

/** Busca de LinkedIn (Treg): teto por chamada, timeout e meta. ("use server": não exportar.) */
const LINKEDIN_LOOKUP_CONFIG = {
  maxCostUsd: 0.01,
  timeoutMs: 45_000,
  limit: 10,
  feature: "contatos-conhecidos-25-1",
} as const;

const LOOKUP_ERRORS = {
  missingKey: "Chave do Treg não configurada. Configure em Configurações → Integrações.",
  decryptKey: "Erro ao ler a chave do Treg. Reconfigure em Configurações → Integrações.",
  timeout: "A busca do LinkedIn não respondeu a tempo.",
  failed: "A busca do LinkedIn falhou",
  empty: "Nenhum perfil do LinkedIn encontrado para esse nome e empresa.",
} as const;

interface DbError {
  code?: string;
  message?: string;
}

/** Tabela ainda não criada (migration 00075 não aplicada). */
function isMissingTable(error: DbError | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function isUniqueViolation(error: DbError | null | undefined): boolean {
  return error?.code === "23505";
}

/** Minúsculo, sem acento, espaços colapsados. */
function foldKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Chave de dedup de contato SEM LinkedIn: nome + empresa (ou domínio). */
function noLinkedinKey(c: {
  full_name: string;
  company_name: string | null;
  company_domain: string | null;
}): string {
  return `${foldKey(c.full_name)}|${foldKey(c.company_name || c.company_domain)}`;
}

function dbErrorMessage(error: DbError | null | undefined, fallback: string): string {
  return isMissingTable(error) ? TABLE_MISSING : fallback;
}

type AdminCheck =
  | { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getCurrentUserProfile>>> }
  | { ok: false; error: string };

async function requireAdmin(): Promise<AdminCheck> {
  const profile = await getCurrentUserProfile();
  if (!profile) return { ok: false, error: "Não autenticado" };
  if (!hasAdminAccess(profile.role)) return { ok: false, error: ADMIN_ONLY };
  return { ok: true, profile };
}

/** Valida o formato (zod) e normaliza. */
function validateInput(
  input: KnownContactInput
): { ok: true; data: NormalizedKnownContact } | { ok: false; error: string } {
  const validated = knownContactInputSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? "Dados inválidos" };
  }
  return normalizeKnownContactInput(validated.data);
}

/**
 * Todos os contatos do tenant, mais recentes primeiro (páginas de 1000).
 */
export async function getKnownContacts(): Promise<ActionResult<KnownContact[]>> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    const supabase = await createClient();
    const contacts: KnownContact[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching known contacts:", error);
        return {
          success: false,
          error: dbErrorMessage(error, "Erro ao buscar os contatos conhecidos"),
        };
      }

      const page = (data ?? []) as KnownContact[];
      contacts.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return { success: true, data: contacts };
  } catch (error) {
    console.error("getKnownContacts error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Adiciona um contato manual (admin). LinkedIn já cadastrado → erro de duplicado.
 */
export async function addKnownContact(
  input: KnownContactInput
): Promise<ActionResult<KnownContact>> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const normalized = validateInput(input);
    if (!normalized.ok) return { success: false, error: normalized.error };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        ...normalized.data,
        tenant_id: auth.profile.tenant_id,
        source: "manual",
        created_by: auth.profile.id,
      })
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) return { success: false, error: DUPLICATE };
      console.error("Error adding known contact:", error);
      return {
        success: false,
        error: dbErrorMessage(error, "Erro ao adicionar o contato. Tente novamente."),
      };
    }

    return { success: true, data: data as KnownContact };
  } catch (error) {
    console.error("addKnownContact error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Edita um contato (admin). Origem, lead e autor não mudam.
 */
export async function updateKnownContact(
  id: string,
  input: KnownContactInput
): Promise<ActionResult<KnownContact>> {
  try {
    if (!uuidSchema.safeParse(id).success) {
      return { success: false, error: "ID inválido" };
    }

    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const normalized = validateInput(input);
    if (!normalized.ok) return { success: false, error: normalized.error };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE)
      .update(normalized.data)
      .eq("id", id)
      .eq("tenant_id", auth.profile.tenant_id)
      .select()
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) return { success: false, error: DUPLICATE };
      console.error("Error updating known contact:", error);
      return {
        success: false,
        error: dbErrorMessage(error, "Erro ao salvar o contato. Tente novamente."),
      };
    }
    if (!data) {
      return { success: false, error: "Contato não encontrado" };
    }

    return { success: true, data: data as KnownContact };
  } catch (error) {
    console.error("updateKnownContact error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Remove um contato (admin).
 */
export async function removeKnownContact(id: string): Promise<ActionResult<void>> {
  try {
    if (!uuidSchema.safeParse(id).success) {
      return { success: false, error: "ID inválido" };
    }

    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = await createClient();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("tenant_id", auth.profile.tenant_id);

    if (error) {
      console.error("Error removing known contact:", error);
      return {
        success: false,
        error: dbErrorMessage(error, "Erro ao remover o contato. Tente novamente."),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("removeKnownContact error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Importa linhas de CSV já lidas no cliente (admin; até 2000 linhas).
 * Normaliza de novo, descarta inválidas, LinkedIn repetido no arquivo e LinkedIn já
 * cadastrado, e insere o resto com `source='import_csv'` (sem busca de LinkedIn).
 */
export async function importKnownContacts(
  rows: KnownContactImportRow[]
): Promise<ActionResult<KnownContactImportReport>> {
  try {
    if (!Array.isArray(rows)) {
      return { success: false, error: "Dados inválidos" };
    }
    if (rows.length === 0) {
      return { success: false, error: "O arquivo não tem linhas para importar" };
    }
    if (rows.length > KNOWN_CONTACTS_IMPORT_MAX_ROWS) {
      return {
        success: false,
        error: `Máximo de ${KNOWN_CONTACTS_IMPORT_MAX_ROWS} linhas por import`,
      };
    }

    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    const { profile } = auth;

    const skipped: KnownContactImportSkipped[] = [];
    const seenLinkedin = new Set<string>();
    const seenNoLinkedin = new Set<string>();
    const candidates: Array<{ line: number; label: string; data: NormalizedKnownContact }> = [];

    rows.forEach((row, i) => {
      const line = Number.isInteger(row?.line) ? row.line : i + 2;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const label = str(row?.fullName).trim() || str(row?.linkedinUrl).trim();

      const rawRelation = str(row?.relation).trim();
      if (str(row?.fullName).trim() && !rawRelation) {
        skipped.push({ line, value: label, reason: KNOWN_CONTACT_ERRORS.missingRelation });
        return;
      }
      if (rawRelation && !parseKnownContactRelation(rawRelation)) {
        skipped.push({ line, value: label, reason: KNOWN_CONTACT_ERRORS.unknownRelation });
        return;
      }

      const normalized = normalizeKnownContactInput({
        fullName: row?.fullName,
        title: row?.title,
        companyName: row?.companyName,
        companyDomain: row?.companyDomain,
        linkedinUrl: row?.linkedinUrl,
        relationType: rawRelation,
      });
      if (!normalized.ok) {
        skipped.push({ line, value: label, reason: normalized.error });
        return;
      }

      const linkedin = normalized.data.linkedin_url;
      if (linkedin) {
        if (seenLinkedin.has(linkedin)) {
          skipped.push({ line, value: label, reason: KNOWN_CONTACT_ERRORS.duplicateInFile });
          return;
        }
        seenLinkedin.add(linkedin);
      } else {
        // Sem LinkedIn: dedup por nome + empresa/domínio (re-import ou retry não duplica).
        const key = noLinkedinKey(normalized.data);
        if (seenNoLinkedin.has(key)) {
          skipped.push({ line, value: label, reason: KNOWN_CONTACT_ERRORS.duplicateContactInFile });
          return;
        }
        seenNoLinkedin.add(key);
      }
      candidates.push({ line, label, data: normalized.data });
    });

    const supabase = await createClient();

    // LinkedIn já cadastrado no tenant
    const existing = new Set<string>();
    const linkedins = candidates
      .map((c) => c.data.linkedin_url)
      .filter((v): v is string => !!v);
    for (let i = 0; i < linkedins.length; i += LOOKUP_CHUNK_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("linkedin_url")
        .eq("tenant_id", profile.tenant_id)
        .in("linkedin_url", linkedins.slice(i, i + LOOKUP_CHUNK_SIZE));

      if (error) {
        console.error("Error checking existing known contacts:", error);
        return {
          success: false,
          error: dbErrorMessage(error, "Erro ao importar os contatos. Tente novamente."),
        };
      }
      for (const r of (data ?? []) as Array<{ linkedin_url: string | null }>) {
        if (r.linkedin_url) existing.add(r.linkedin_url);
      }
    }

    // Contatos sem LinkedIn já cadastrados no tenant (páginas de 1000)
    const existingNoLinkedin = new Set<string>();
    if (seenNoLinkedin.size > 0) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("full_name, company_name, company_domain")
          .eq("tenant_id", profile.tenant_id)
          .is("linkedin_url", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error("Error checking existing known contacts without LinkedIn:", error);
          return {
            success: false,
            error: dbErrorMessage(error, "Erro ao importar os contatos. Tente novamente."),
          };
        }
        const page = (data ?? []) as Array<{
          full_name: string;
          company_name: string | null;
          company_domain: string | null;
        }>;
        for (const r of page) existingNoLinkedin.add(noLinkedinKey(r));
        if (page.length < PAGE_SIZE) break;
      }
    }

    const toInsert = candidates.filter((c) => {
      const isExisting = c.data.linkedin_url
        ? existing.has(c.data.linkedin_url)
        : existingNoLinkedin.has(noLinkedinKey(c.data));
      if (isExisting) {
        skipped.push({
          line: c.line,
          value: c.label,
          reason: c.data.linkedin_url
            ? KNOWN_CONTACT_ERRORS.alreadyListed
            : KNOWN_CONTACT_ERRORS.contactAlreadyListed,
        });
        return false;
      }
      return true;
    });

    let accepted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from(TABLE).insert(
        chunk.map((c) => ({
          ...c.data,
          tenant_id: profile.tenant_id,
          source: "import_csv",
          created_by: profile.id,
        }))
      );

      if (error) {
        console.error("Error importing known contacts:", error);
        const base = isUniqueViolation(error)
          ? `${DUPLICATE} (outro gestor cadastrou durante o import)`
          : dbErrorMessage(error, "Erro ao importar os contatos. Tente novamente.");
        return {
          success: false,
          error: accepted > 0 ? `${base} (${accepted} linhas já tinham entrado)` : base,
        };
      }
      accepted += chunk.length;
    }

    skipped.sort((a, b) => a.line - b.line);
    return { success: true, data: { accepted, skipped } };
  } catch (error) {
    console.error("importKnownContacts error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

interface OpportunityLeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  title: string | null;
  linkedin_url: string | null;
}

/** Domínio corporativo do e-mail (e-mail pessoal ou inválido → null). */
function corporateEmailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const normalized = normalizeSuppressionValue(email.slice(at + 1));
  if (!normalized || normalized.type !== "domain") return null;
  return isPersonalEmailDomain(normalized.value) ? null : normalized.value;
}

/**
 * 1 clique: torna contato conhecido o lead de uma oportunidade com reunião marcada (admin).
 * Lê oportunidade e lead no servidor, pelo tenant. Idempotente por `lead_id`: lead que já é
 * contato (ou cujo LinkedIn já está cadastrado) → `{ alreadyKnown: true }`, nada é gravado.
 */
export async function addKnownContactFromOpportunity(
  opportunityId: string
): Promise<ActionResult<{ alreadyKnown: boolean; contact?: KnownContact }>> {
  try {
    if (!uuidSchema.safeParse(opportunityId).success) {
      return { success: false, error: "ID inválido" };
    }

    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    const { profile } = auth;

    const supabase = await createClient();
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select(
        "id, status, lead_id, lead:leads (id, first_name, last_name, email, company_name, title, linkedin_url)"
      )
      .eq("id", opportunityId)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();

    if (oppError) {
      console.error("Error reading opportunity for known contact:", oppError);
      return { success: false, error: "Erro ao ler a oportunidade. Tente novamente." };
    }
    if (!opportunity) {
      return { success: false, error: "Oportunidade não encontrada" };
    }

    const rawLead = (opportunity as { lead?: OpportunityLeadRow | OpportunityLeadRow[] | null })
      .lead;
    const lead = Array.isArray(rawLead) ? (rawLead[0] ?? null) : (rawLead ?? null);
    if ((opportunity as { status?: string }).status !== "meeting_booked" || !lead?.id) {
      return { success: false, error: NOT_ELIGIBLE };
    }

    const { data: existing, error: existingError } = await supabase
      .from(TABLE)
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("lead_id", lead.id)
      .limit(1);

    if (existingError) {
      console.error("Error checking known contact by lead:", existingError);
      return {
        success: false,
        error: dbErrorMessage(existingError, "Erro ao adicionar o contato. Tente novamente."),
      };
    }
    if ((existing ?? []).length > 0) {
      return { success: true, data: { alreadyKnown: true } };
    }

    const fullName = [lead.first_name, lead.last_name]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(" ");
    const companyName = (lead.company_name ?? "").trim() || null;
    const companyDomain = corporateEmailDomain(lead.email);
    if (!fullName) {
      return { success: false, error: "O lead não tem nome" };
    }
    if (!companyName && !companyDomain) {
      return { success: false, error: "O lead não tem empresa nem e-mail corporativo" };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        tenant_id: profile.tenant_id,
        full_name: fullName,
        title: (lead.title ?? "").trim() || null,
        company_name: companyName,
        company_domain: companyDomain,
        // LinkedIn do lead inválido não impede o clique: o contato fica sem LinkedIn.
        linkedin_url: normalizeLinkedinProfileUrl(lead.linkedin_url),
        relation_type: "reuniao_marcada",
        source: "oportunidade",
        lead_id: lead.id,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      // Mesmo lead (clique duplo) ou mesmo LinkedIn já cadastrado: já é contato conhecido.
      if (isUniqueViolation(error)) return { success: true, data: { alreadyKnown: true } };
      console.error("Error adding known contact from opportunity:", error);
      return {
        success: false,
        error: dbErrorMessage(error, "Erro ao adicionar o contato. Tente novamente."),
      };
    }

    return { success: true, data: { alreadyKnown: false, contact: data as KnownContact } };
  } catch (error) {
    console.error("addKnownContactFromOpportunity error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/** `Idempotency-Key` determinística: sha256 de `feature|tenant|endpoint|JSON(body)`. */
function buildLookupIdempotencyKey(tenantId: string, body: Record<string, unknown>): string {
  return createHash("sha256")
    .update(
      `${LINKEDIN_LOOKUP_CONFIG.feature}|${tenantId}|${TREG_ENDPOINTS.webSearch}|${JSON.stringify(body)}`
    )
    .digest("hex");
}

/**
 * Busca candidatos de perfil do LinkedIn para um contato (admin, sob demanda).
 * Uma chamada `treg.web.search` com teto de US$ 0,01; loga 1 linha em `api_usage_logs`.
 * Não grava nada no contato. Nunca lança: falha vira `{ success: false, error }`.
 */
export async function findKnownContactLinkedin(
  input: LinkedinLookupInput
): Promise<ActionResult<{ candidates: LinkedinCandidate[] }>> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return { success: false, error: auth.error };
    const tenantId = auth.profile.tenant_id;

    const fullName =
      typeof input?.fullName === "string" ? input.fullName.replace(/\s+/g, " ").trim() : "";
    if (!fullName) return { success: false, error: KNOWN_CONTACT_ERRORS.missingName };
    const companyName =
      typeof input?.companyName === "string"
        ? input.companyName.replace(/\s+/g, " ").trim()
        : "";
    const domain = normalizeSuppressionValue(
      typeof input?.companyDomain === "string" ? input.companyDomain : ""
    );
    const companyDomain = domain?.type === "domain" ? domain.value : "";
    if (!companyName && !companyDomain) {
      return { success: false, error: KNOWN_CONTACT_ERRORS.missingCompany };
    }

    const key = await readServiceApiKey(tenantId, "treg");
    if (key.status === "missing") return { success: false, error: LOOKUP_ERRORS.missingKey };
    if (key.status === "decrypt_error") return { success: false, error: LOOKUP_ERRORS.decryptKey };

    const body = {
      q: buildLinkedinQuery(fullName, companyName, companyDomain),
      limit: LINKEDIN_LOOKUP_CONFIG.limit,
    };
    const startedAt = Date.now();
    let result: Awaited<ReturnType<TregService["call"]>> | null = null;
    try {
      result = await new TregService().call(key.apiKey, TREG_ENDPOINTS.webSearch, body, {
        maxCostUsd: LINKEDIN_LOOKUP_CONFIG.maxCostUsd,
        idempotencyKey: buildLookupIdempotencyKey(tenantId, body),
        meta: `feature=${LINKEDIN_LOOKUP_CONFIG.feature},tenant=${tenantId}`,
        timeoutMs: LINKEDIN_LOOKUP_CONFIG.timeoutMs,
      });
    } catch (error) {
      // `call` não lança; isto é só cinto de segurança.
      console.error("findKnownContactLinkedin treg error:", error);
      result = null;
    }

    // Sem resposta (timeout/rede): custo DESCONHECIDO, contabilizado pelo teto da chamada.
    const costEstimated = !result || result.costUnknown === true || result.status === 0;
    const costMicro = costEstimated || !result ? null : Math.max(0, result.costMicro);
    const costUsd =
      costMicro === null ? LINKEDIN_LOOKUP_CONFIG.maxCostUsd : costMicro / 1_000_000;

    const candidates = result?.ok
      ? pickLinkedinCandidates(
          (result.json as { output?: { results?: unknown } } | null)?.output?.results
        )
      : [];

    let error: string | null = null;
    let logError: string | undefined;
    if (!result) {
      error = `${LOOKUP_ERRORS.failed}.`;
      logError = "erro inesperado";
    } else if (!result.ok) {
      const isTimeout = result.status === 0 && result.error?.startsWith("timeout");
      error = isTimeout
        ? LOOKUP_ERRORS.timeout
        : `${LOOKUP_ERRORS.failed}${result.status ? ` (HTTP ${result.status})` : ""}.`;
      logError = result.error ?? "erro";
    } else if (candidates.length === 0) {
      error = LOOKUP_ERRORS.empty;
      logError = "nenhum perfil /in/ nos resultados";
    }

    await logApiUsage({
      tenantId,
      serviceName: "treg",
      requestType: TREG_ENDPOINTS.webSearch,
      status: error ? "failed" : "success",
      errorMessage: logError,
      durationMs: result?.durationMs ?? Date.now() - startedAt,
      estimatedCost: costUsd,
      metadata: {
        feature: LINKEDIN_LOOKUP_CONFIG.feature,
        costUsd,
        costMicro,
        costEstimated,
        ...(costEstimated
          ? { costBasis: "reserved_cap", reservedUsd: LINKEDIN_LOOKUP_CONFIG.maxCostUsd }
          : {}),
        httpStatus: result?.status ?? 0,
        candidates: candidates.length,
      },
    });

    if (error) return { success: false, error };
    return { success: true, data: { candidates } };
  } catch (error) {
    console.error("findKnownContactLinkedin error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}
