import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Tests for migration 00067_sweep_stuck_agent_steps.sql
 * Story: 24.1 - Etapa travada e destravada sozinha
 *
 * Teste estrutural: le o .sql como texto, sem executar contra banco.
 */
describe("Migration 00067: sweep_stuck_agent_steps", () => {
  let sql: string;
  /** SQL sem as linhas de comentario (`-- ...`). */
  let code: string;

  beforeAll(() => {
    const migrationPath = resolve(
      __dirname,
      "../../../supabase/migrations/00067_sweep_stuck_agent_steps.sql"
    );
    sql = readFileSync(migrationPath, "utf-8");
    code = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
  });

  it("cria a funcao com CREATE OR REPLACE e limite padrao de 10 minutos", () => {
    expect(code).toContain("CREATE OR REPLACE FUNCTION public.sweep_stuck_agent_steps(");
    expect(code).toContain("p_timeout INTERVAL DEFAULT INTERVAL '10 minutes'");
    expect(code).toContain("RETURNS INTEGER");
    expect(code).toContain("LANGUAGE plpgsql");
  });

  it("fixa o search_path (linter function_search_path_mutable)", () => {
    expect(code).toMatch(/LANGUAGE plpgsql\s+SET search_path = ''\s+AS \$fn\$/);
  });

  it("nao usa SECURITY DEFINER", () => {
    expect(code).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("faz CAS do step em status = 'running' com started_at (fallback created_at)", () => {
    expect(code).toMatch(/FOR r IN\s+UPDATE public\.agent_steps/);
    expect(code).toContain("WHERE s.status = 'running'");
    expect(code).toContain("COALESCE(s.started_at, s.created_at) < now() - p_timeout");
    expect(code).toContain("SET status = 'failed'");
  });

  it("grava STEP_INTERRUPTED retryable com a mensagem esperada", () => {
    expect(code).toContain("'STEP_INTERRUPTED'");
    expect(code).toContain("'isRetryable', true");
    expect(code).toContain("Etapa interrompida — tente novamente");
    expect(code).toContain("'stepNumber', s.step_number");
    expect(code).toContain("'stepType', s.step_type");
  });

  it("preserva o output parcial (objeto || error)", () => {
    expect(code).toContain(
      "CASE WHEN jsonb_typeof(s.output) = 'object' THEN s.output ELSE '{}'::jsonb END"
    );
    expect(code).toMatch(/END\s*\|\|\s*jsonb_build_object\(\s*'error'/);
  });

  it("pausa a execucao so se ainda estiver running (CAS) e so entao insere a bolha", () => {
    expect(code).toContain("UPDATE public.agent_executions e");
    expect(code).toContain("SET status = 'paused'");
    expect(code).toContain("AND e.status = 'running'");
    expect(code).toContain("GET DIAGNOSTICS v_paused = ROW_COUNT");
    expect(code).toMatch(/IF v_paused > 0 THEN\s+[\s\S]*INSERT INTO public\.agent_messages/);
  });

  it("a bolha segue o formato de Orchestrator.sendErrorMessage", () => {
    expect(code).toContain("'system'");
    expect(code).toContain("'messageType', 'error'");
    expect(code).toContain("'stepNumber', r.step_number");
    expect(code).toContain('Clique em "Tentar novamente" na etapa para refazer.');
  });

  it("mapeia os mesmos labels de STEP_LABELS", () => {
    for (const label of [
      "Busca de Empresas",
      "Busca de Leads",
      "Criacao de Campanha",
      "Exportacao",
      "Ativacao",
    ]) {
      expect(code).toContain(label);
    }
  });

  it("revoga EXECUTE de PUBLIC, anon e authenticated e comenta a funcao", () => {
    expect(code).toContain(
      "REVOKE EXECUTE ON FUNCTION public.sweep_stuck_agent_steps(INTERVAL) FROM PUBLIC, anon, authenticated"
    );
    expect(code).toContain("COMMENT ON FUNCTION public.sweep_stuck_agent_steps(INTERVAL)");
  });

  it("agenda o cron de forma idempotente a cada 2 minutos", () => {
    expect(code).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(code).toContain("SELECT cron.unschedule('agent-stuck-steps-sweep')");
    expect(code).toContain(
      "WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-stuck-steps-sweep')"
    );
    expect(code).toMatch(/'agent-stuck-steps-sweep',\s*'\*\/2 \* \* \* \*'/);
    expect(code).toContain("SELECT public.sweep_stuck_agent_steps();");
  });

  it("e aditiva: sem DROP TABLE, DELETE FROM ou ALTER TABLE", () => {
    expect(code).not.toMatch(/DROP\s+TABLE/i);
    expect(code).not.toMatch(/DELETE\s+FROM/i);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
  });

  it("documenta o rollback em comentario", () => {
    expect(sql).toContain("ROLLBACK");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.sweep_stuck_agent_steps(INTERVAL)");
  });
});
