"use server";

/**
 * Server Actions: Lista de supressão
 * Story: 23.5 - Lista de supressão: cadastro e import
 *
 * Leitura: qualquer membro do tenant. Escrita: só admin (hasAdminAccess aqui + RLS
 * is_admin() no banco). O valor é sempre normalizado de novo no servidor.
 * Nenhum caminho de envio lê esta lista ainda (isso é a 23.6).
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { hasAdminAccess } from "@/lib/auth/capabilities";
import { normalizeSuppressionValue, parseSuppressionReason } from "@/lib/utils/suppression";
import { uuidSchema, type ActionResult } from "@/types/knowledge-base";
import {
  SUPPRESSION_IMPORT_MAX_ROWS,
  SUPPRESSION_SKIP_REASONS,
  suppressionEntryInputSchema,
  type SuppressionEntry,
  type SuppressionEntryInput,
  type SuppressionEntryType,
  type SuppressionImportReport,
  type SuppressionImportRow,
  type SuppressionImportSkipped,
} from "@/types/suppression";

const TABLE = "suppression_entries";
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
/** Lookup de existentes vai na URL do GET: chunk menor para não estourar limite (414). */
const LOOKUP_CHUNK_SIZE = 100;
const ADMIN_ONLY = "Apenas gestores e diretores podem alterar a lista de supressão";
const TABLE_MISSING = "A lista de supressão ainda não está disponível neste ambiente";

interface DbError {
  code?: string;
  message?: string;
}

/** Tabela ainda não criada (migration 00071 não aplicada). */
function isMissingTable(error: DbError | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function isUniqueViolation(error: DbError | null | undefined): boolean {
  return error?.code === "23505";
}

function keyOf(type: SuppressionEntryType, value: string): string {
  return `${type}:${value}`;
}

/**
 * Todas as entradas do tenant, mais recentes primeiro (páginas de 1000).
 */
export async function getSuppressionEntries(): Promise<ActionResult<SuppressionEntry[]>> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    const supabase = await createClient();
    const entries: SuppressionEntry[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching suppression entries:", error);
        return {
          success: false,
          error: isMissingTable(error) ? TABLE_MISSING : "Erro ao buscar a lista de supressão",
        };
      }

      const page = (data ?? []) as SuppressionEntry[];
      entries.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return { success: true, data: entries };
  } catch (error) {
    console.error("getSuppressionEntries error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Adiciona uma entrada manual (admin). Valor já existente → `{ duplicate: true }`, nada é gravado.
 */
export async function addSuppressionEntry(
  input: SuppressionEntryInput
): Promise<ActionResult<{ duplicate: boolean; entry?: SuppressionEntry }>> {
  try {
    const validated = suppressionEntryInputSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const normalized = normalizeSuppressionValue(validated.data.value);
    if (!normalized) {
      return {
        success: false,
        error: "Valor inválido: informe um domínio (empresa.com.br) ou um e-mail",
      };
    }

    const profile = await getCurrentUserProfile();
    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }
    if (!hasAdminAccess(profile.role)) {
      return { success: false, error: ADMIN_ONLY };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        tenant_id: profile.tenant_id,
        entry_type: normalized.type,
        value: normalized.value,
        reason: validated.data.reason,
        source: "manual",
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return { success: true, data: { duplicate: true } };
      }
      console.error("Error adding suppression entry:", error);
      return {
        success: false,
        error: isMissingTable(error) ? TABLE_MISSING : "Erro ao adicionar à lista. Tente novamente.",
      };
    }

    return { success: true, data: { duplicate: false, entry: data as SuppressionEntry } };
  } catch (error) {
    console.error("addSuppressionEntry error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Remove uma entrada (admin).
 */
export async function removeSuppressionEntry(id: string): Promise<ActionResult<void>> {
  try {
    if (!uuidSchema.safeParse(id).success) {
      return { success: false, error: "ID inválido" };
    }

    const profile = await getCurrentUserProfile();
    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }
    if (!hasAdminAccess(profile.role)) {
      return { success: false, error: ADMIN_ONLY };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      console.error("Error removing suppression entry:", error);
      return {
        success: false,
        error: isMissingTable(error) ? TABLE_MISSING : "Erro ao remover da lista. Tente novamente.",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("removeSuppressionEntry error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Importa linhas de CSV já lidas no cliente (admin; até 5000 linhas).
 * Normaliza de novo, descarta inválidas, sem motivo, repetidas no arquivo e já existentes,
 * e insere o resto com `source='import_csv'`. Devolve o relatório.
 */
export async function importSuppressionEntries(
  rows: SuppressionImportRow[]
): Promise<ActionResult<SuppressionImportReport>> {
  try {
    if (!Array.isArray(rows)) {
      return { success: false, error: "Dados inválidos" };
    }
    if (rows.length === 0) {
      return { success: false, error: "O arquivo não tem linhas para importar" };
    }
    if (rows.length > SUPPRESSION_IMPORT_MAX_ROWS) {
      return {
        success: false,
        error: `Máximo de ${SUPPRESSION_IMPORT_MAX_ROWS} linhas por import`,
      };
    }

    const profile = await getCurrentUserProfile();
    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }
    if (!hasAdminAccess(profile.role)) {
      return { success: false, error: ADMIN_ONLY };
    }

    const skipped: SuppressionImportSkipped[] = [];
    const seen = new Set<string>();
    const candidates: Array<{
      line: number;
      raw: string;
      type: SuppressionEntryType;
      value: string;
      reason: NonNullable<ReturnType<typeof parseSuppressionReason>>;
    }> = [];

    rows.forEach((row, i) => {
      const line = Number.isInteger(row?.line) ? row.line : i + 2;
      const raw = typeof row?.value === "string" ? row.value : "";
      const normalized = normalizeSuppressionValue(raw);
      if (!normalized) {
        skipped.push({ line, value: raw, reason: SUPPRESSION_SKIP_REASONS.invalidValue });
        return;
      }
      const rawReason = typeof row?.reason === "string" ? row.reason.trim() : "";
      if (!rawReason) {
        skipped.push({ line, value: raw, reason: SUPPRESSION_SKIP_REASONS.missingReason });
        return;
      }
      const reason = parseSuppressionReason(rawReason);
      if (!reason) {
        skipped.push({ line, value: raw, reason: SUPPRESSION_SKIP_REASONS.unknownReason });
        return;
      }
      const key = keyOf(normalized.type, normalized.value);
      if (seen.has(key)) {
        skipped.push({ line, value: raw, reason: SUPPRESSION_SKIP_REASONS.duplicateInFile });
        return;
      }
      seen.add(key);
      candidates.push({ line, raw, type: normalized.type, value: normalized.value, reason });
    });

    const supabase = await createClient();

    // Já existentes no tenant
    const existing = new Set<string>();
    for (let i = 0; i < candidates.length; i += LOOKUP_CHUNK_SIZE) {
      const values = [
        ...new Set(candidates.slice(i, i + LOOKUP_CHUNK_SIZE).map((c) => c.value)),
      ];
      const { data, error } = await supabase
        .from(TABLE)
        .select("entry_type, value")
        .eq("tenant_id", profile.tenant_id)
        .in("value", values);

      if (error) {
        console.error("Error checking existing suppression entries:", error);
        return {
          success: false,
          error: isMissingTable(error) ? TABLE_MISSING : "Erro ao importar a lista. Tente novamente.",
        };
      }
      for (const r of (data ?? []) as Array<{ entry_type: SuppressionEntryType; value: string }>) {
        existing.add(keyOf(r.entry_type, r.value));
      }
    }

    const toInsert = candidates.filter((c) => {
      if (existing.has(keyOf(c.type, c.value))) {
        skipped.push({ line: c.line, value: c.raw, reason: SUPPRESSION_SKIP_REASONS.alreadyListed });
        return false;
      }
      return true;
    });

    let accepted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from(TABLE).insert(
        chunk.map((c) => ({
          tenant_id: profile.tenant_id,
          entry_type: c.type,
          value: c.value,
          reason: c.reason,
          source: "import_csv",
          created_by: profile.id,
        }))
      );

      if (error) {
        console.error("Error importing suppression entries:", error);
        const base = isMissingTable(error)
          ? TABLE_MISSING
          : "Erro ao importar a lista. Tente novamente.";
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
    console.error("importSuppressionEntries error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}
