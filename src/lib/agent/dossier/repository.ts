/**
 * Dossie da conta — persistencia
 * Story: 24.19 - Dossie da conta
 *
 * Tabelas da migration 00073 (RLS por tenant; INSERT liberado a qualquer membro, sem
 * UPDATE/DELETE). Todas as funcoes DEVOLVEM o erro, nunca lancam: sem a migration
 * aplicada, o step segue `completed` com `flags.persistFailed`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DossierFact, DossierStatus } from "./facts";

function errorText(error: unknown): string {
  if (!error) return "erro desconhecido";
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "erro desconhecido";
}

// ==============================================
// REUSE
// ==============================================

export interface ReusableDossier {
  id: string;
  companyName: string | null;
  factsCount: number;
}

/**
 * Dossie `complete`, nao expirado, do mesmo tenant + dominio (o mais novo). Um `complete`
 * sem nenhum fato gravado (insert dos fatos falhou) nao e reaproveitado.
 */
export async function findReusableDossier(
  supabase: SupabaseClient,
  tenantId: string,
  domain: string,
  now: Date = new Date()
): Promise<{ dossier: ReusableDossier | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("account_dossiers")
      .select("id, company_name")
      .eq("tenant_id", tenantId)
      .eq("company_domain", domain)
      .eq("status", "complete")
      .gt("expires_at", now.toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);
    if (error) return { dossier: null, error: errorText(error) };
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id?: unknown; company_name?: unknown }
      | null
      | undefined;
    if (!row || typeof row.id !== "string") return { dossier: null };

    const { data: facts, error: factsError } = await supabase
      .from("account_dossier_facts")
      .select("id")
      .eq("dossier_id", row.id)
      .eq("tenant_id", tenantId);
    if (factsError) return { dossier: null, error: errorText(factsError) };
    const factsCount = Array.isArray(facts) ? facts.length : 0;
    if (factsCount === 0) return { dossier: null };

    return {
      dossier: {
        id: row.id,
        companyName: typeof row.company_name === "string" ? row.company_name : null,
        factsCount,
      },
    };
  } catch (error) {
    return { dossier: null, error: errorText(error) };
  }
}

// ==============================================
// SAVE
// ==============================================

export interface SaveDossierParams {
  tenantId: string;
  executionId: string | null;
  domain: string;
  companyName: string | null;
  status: DossierStatus;
  failedSources: string[];
  costUsd: number;
  facts: DossierFact[];
  researchedAt: Date;
  reuseDays: number;
}

function factRows(tenantId: string, dossierId: string, facts: DossierFact[]) {
  return facts.map((fact) => ({
    dossier_id: dossierId,
    tenant_id: tenantId,
    kind: fact.kind,
    fato: fact.fato,
    fonte_url: fact.fonte_url,
    data: fact.data,
    confianca: fact.confianca,
    lead_apollo_id: fact.lead_apollo_id ?? null,
    lead_email: fact.lead_email ?? null,
  }));
}

/** Grava o dossie e os fatos. `dossierId` null = o dossie nao foi gravado. */
export async function saveDossier(
  supabase: SupabaseClient,
  params: SaveDossierParams
): Promise<{ dossierId: string | null; error?: string }> {
  try {
    const expiresAt = new Date(params.researchedAt.getTime() + params.reuseDays * 86_400_000);
    const { data, error } = await supabase
      .from("account_dossiers")
      .insert({
        tenant_id: params.tenantId,
        company_domain: params.domain,
        company_name: params.companyName,
        status: params.status,
        failed_sources: params.failedSources,
        execution_id: params.executionId,
        cost_usd: Number(params.costUsd.toFixed(6)),
        researched_at: params.researchedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();
    const dossierId = (data as { id?: unknown } | null)?.id;
    if (error || typeof dossierId !== "string") {
      return { dossierId: null, error: errorText(error ?? new Error("insert sem id")) };
    }

    if (params.facts.length > 0) {
      const factsResult = await insertFacts(supabase, params.tenantId, dossierId, params.facts);
      if (factsResult.error) return { dossierId, error: factsResult.error };
    }
    return { dossierId };
  } catch (error) {
    return { dossierId: null, error: errorText(error) };
  }
}

/** Acrescenta fatos a um dossie existente (posts de leads de um dossie reaproveitado). */
export async function insertFacts(
  supabase: SupabaseClient,
  tenantId: string,
  dossierId: string,
  facts: DossierFact[]
): Promise<{ error?: string }> {
  if (facts.length === 0) return {};
  try {
    const { error } = await supabase
      .from("account_dossier_facts")
      .insert(factRows(tenantId, dossierId, facts));
    return error ? { error: errorText(error) } : {};
  } catch (error) {
    return { error: errorText(error) };
  }
}

/**
 * Leads que JA tem posts (`kind='post'`) no dossie, por apollo_id e e-mail (minusculo).
 * Usado no reuso para nao buscar/gravar os mesmos posts de novo.
 */
export async function findPostLeadIdentifiers(
  supabase: SupabaseClient,
  tenantId: string,
  dossierId: string
): Promise<{ apolloIds: Set<string>; emails: Set<string>; error?: string }> {
  const apolloIds = new Set<string>();
  const emails = new Set<string>();
  try {
    const { data, error } = await supabase
      .from("account_dossier_facts")
      .select("lead_apollo_id, lead_email")
      .eq("dossier_id", dossierId)
      .eq("tenant_id", tenantId)
      .eq("kind", "post");
    if (error) return { apolloIds, emails, error: errorText(error) };
    for (const row of (Array.isArray(data) ? data : []) as { lead_apollo_id?: unknown; lead_email?: unknown }[]) {
      if (typeof row.lead_apollo_id === "string" && row.lead_apollo_id) apolloIds.add(row.lead_apollo_id);
      if (typeof row.lead_email === "string" && row.lead_email) emails.add(row.lead_email.trim().toLowerCase());
    }
    return { apolloIds, emails };
  } catch (error) {
    return { apolloIds, emails, error: errorText(error) };
  }
}

/**
 * Story 24.20: fatos de um dossie (somente leitura), para o gatilho de um dossie
 * reaproveitado. Linhas fora do formato sao descartadas. Nunca lanca.
 */
export async function readDossierFacts(
  supabase: SupabaseClient,
  tenantId: string,
  dossierId: string
): Promise<{ facts: DossierFact[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("account_dossier_facts")
      .select("kind, fato, fonte_url, data, confianca, lead_apollo_id, lead_email")
      .eq("dossier_id", dossierId)
      .eq("tenant_id", tenantId);
    if (error) return { facts: [], error: errorText(error) };
    const facts: DossierFact[] = [];
    for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
      if (
        typeof row.kind !== "string" ||
        typeof row.fato !== "string" ||
        typeof row.fonte_url !== "string" ||
        typeof row.data !== "string" ||
        typeof row.confianca !== "string"
      ) {
        continue;
      }
      facts.push({
        kind: row.kind as DossierFact["kind"],
        fato: row.fato,
        fonte_url: row.fonte_url,
        // `date` do Postgres ja vem YYYY-MM-DD; corta um eventual horario.
        data: row.data.slice(0, 10),
        confianca: row.confianca as DossierFact["confianca"],
        lead_apollo_id: typeof row.lead_apollo_id === "string" ? row.lead_apollo_id : null,
        lead_email: typeof row.lead_email === "string" ? row.lead_email : null,
      });
    }
    return { facts };
  } catch (error) {
    return { facts: [], error: errorText(error) };
  }
}

// ==============================================
// LEADS
// ==============================================

export interface DossierLeadRef {
  apolloId: string | null;
  email: string | null;
}

/**
 * Liga os leads da execucao ao dossie. Resolve `lead_id` por `apollo_id` ou e-mail ja
 * existentes no tenant; sem match, grava so os identificadores. Lead sem nenhum
 * identificador e ignorado (CHECK da tabela).
 */
export async function linkLeads(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    executionId: string | null;
    dossierId: string;
    leads: DossierLeadRef[];
  }
): Promise<{ linked: number; error?: string }> {
  // Leads gravados com caixa mista: o IN leva o valor original E o minusculo.
  const rawEmails = params.leads.map((lead) => lead.email?.trim()).filter((v): v is string => Boolean(v));
  const refs = params.leads
    .map((lead) => ({
      apolloId: lead.apolloId || null,
      email: lead.email ? lead.email.trim().toLowerCase() : null,
    }))
    .filter((lead) => lead.apolloId || lead.email);
  if (refs.length === 0) return { linked: 0 };

  try {
    const byApollo = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const apolloIds = refs.map((r) => r.apolloId).filter((v): v is string => Boolean(v));
    const emails = Array.from(
      new Set([...refs.map((r) => r.email).filter((v): v is string => Boolean(v)), ...rawEmails])
    );

    // Falha na leitura de `leads` nao impede o link: grava so os identificadores.
    if (apolloIds.length > 0) {
      const { data } = await supabase
        .from("leads")
        .select("id, apollo_id")
        .eq("tenant_id", params.tenantId)
        .in("apollo_id", apolloIds);
      for (const row of (Array.isArray(data) ? data : []) as { id?: unknown; apollo_id?: unknown }[]) {
        if (typeof row.id === "string" && typeof row.apollo_id === "string") {
          byApollo.set(row.apollo_id, row.id);
        }
      }
    }
    if (emails.length > 0) {
      const { data } = await supabase
        .from("leads")
        .select("id, email")
        .eq("tenant_id", params.tenantId)
        .in("email", emails);
      for (const row of (Array.isArray(data) ? data : []) as { id?: unknown; email?: unknown }[]) {
        if (typeof row.id === "string" && typeof row.email === "string") {
          byEmail.set(row.email.trim().toLowerCase(), row.id);
        }
      }
    }

    const rows = refs.map((ref) => ({
      dossier_id: params.dossierId,
      tenant_id: params.tenantId,
      execution_id: params.executionId,
      lead_id:
        (ref.apolloId ? byApollo.get(ref.apolloId) : undefined) ??
        (ref.email ? byEmail.get(ref.email) : undefined) ??
        null,
      lead_apollo_id: ref.apolloId,
      lead_email: ref.email,
    }));

    const { error } = await supabase.from("account_dossier_leads").insert(rows);
    if (error) return { linked: 0, error: errorText(error) };
    return { linked: rows.length };
  } catch (error) {
    return { linked: 0, error: errorText(error) };
  }
}
