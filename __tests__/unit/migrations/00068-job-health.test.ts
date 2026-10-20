// @vitest-environment node
/**
 * Tests for migration 00068_job_health_and_error_logs.sql
 * Story 23.3 - Saude dos jobs e registro de erros com a infraestrutura atual
 *
 * Executa o SQL real da migration num Postgres em WASM (PGlite), sobre stubs minimos
 * do schema do Supabase (auth.uid, tenants, profiles, app_notifications da 00055,
 * is_admin/get_current_tenant_id) e das extensoes (cron.job, cron.job_run_details,
 * cron.schedule/unschedule, net._http_response). Nao ha Postgres local nem banco de teste.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PGlite } from "@electric-sql/pglite";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const GESTOR = "10000000-0000-0000-0000-000000000001";
const SDR = "10000000-0000-0000-0000-000000000002";
const SDR_T2 = "10000000-0000-0000-0000-000000000003"; // tenant 2 so tem SDR
const PLATFORM = "10000000-0000-0000-0000-000000000004"; // gestor do T1 + platform admin
const GESTOR_T2 = "10000000-0000-0000-0000-000000000005"; // gestor sem platform admin no tenant

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  role text NOT NULL
);

CREATE FUNCTION public.get_current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE FUNCTION public.is_admin() RETURNS boolean AS $$
BEGIN
  RETURN COALESCE((SELECT role IN ('gestor', 'diretor') FROM public.profiles WHERE id = auth.uid()), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- app_notifications como na 00055
CREATE TABLE public.app_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their tenant app notifications"
  ON public.app_notifications FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());
GRANT USAGE ON SCHEMA public TO authenticated;

-- trigger de imutabilidade como na 00060 (a 00068 substitui a funcao)
CREATE FUNCTION public.enforce_app_notifications_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.type IS DISTINCT FROM OLD.type OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'app_notifications é imutável exceto read_at';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enforce_app_notifications_immutable
  BEFORE UPDATE ON public.app_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_app_notifications_immutable();

CREATE POLICY "Users can update their tenant app notifications"
  ON public.app_notifications FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- pg_cron
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  schedule text NOT NULL,
  command text NOT NULL,
  jobname text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE cron.job_run_details (
  jobid bigint,
  runid bigserial PRIMARY KEY,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);
CREATE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) RETURNS bigint
LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (p_name, p_schedule, p_command) RETURNING jobid
$$;
CREATE FUNCTION cron.unschedule(p_name text) RETURNS boolean
LANGUAGE sql AS $$
  WITH d AS (DELETE FROM cron.job WHERE jobname = p_name RETURNING 1) SELECT EXISTS (SELECT 1 FROM d)
$$;

-- pg_net
CREATE SCHEMA net;
CREATE TABLE net._http_response (
  id bigserial PRIMARY KEY,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz NOT NULL DEFAULT now()
);
`;

function loadMigration(): string {
  const sql = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/00068_job_health_and_error_logs.sql"),
    "utf-8"
  );
  // pg_cron nao existe no PGlite: o schema `cron` vem dos stubs.
  return sql.replace(/^CREATE EXTENSION IF NOT EXISTS pg_cron;$/m, "");
}

describe("Migration 00068: saude dos jobs + error_logs (PGlite)", () => {
  let db: PGlite;
  let migration: string;
  /** SQL sem linhas de comentario. */
  let code: string;

  async function count(sql: string): Promise<number> {
    const res = await db.query<{ n: number }>(`SELECT (${sql})::int AS n`);
    return res.rows[0].n;
  }

  async function check(): Promise<number> {
    const res = await db.query<{ n: number }>(
      "SELECT public.check_scheduled_jobs_health() AS n"
    );
    return res.rows[0].n;
  }

  async function jobId(name: string): Promise<number> {
    const res = await db.query<{ jobid: number }>(
      "SELECT jobid::int AS jobid FROM cron.job WHERE jobname = $1",
      [name]
    );
    return res.rows[0].jobid;
  }

  async function run(name: string, status: string, minutesAgo: number, msg: string | null = null) {
    await db.query(
      `INSERT INTO cron.job_run_details (jobid, status, return_message, start_time, end_time)
       VALUES ($1, $2, $3, now() - make_interval(mins => $4), now() - make_interval(mins => $4))`,
      [await jobId(name), status, msg, minutesAgo]
    );
  }

  /** Historico saudavel: sucesso ha 1 min e ha 20 min. */
  async function healthy(name: string) {
    await run(name, "succeeded", 20);
    await run(name, "succeeded", 1);
  }

  async function asUser(uid: string, fn: () => Promise<void>) {
    await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE; RESET test.uid;");
    }
  }

  beforeAll(async () => {
    migration = loadMigration();
    code = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(migration);
    // Idempotente: aplicar de novo nao quebra nem duplica o cron.
    await db.exec(migration);
    // No Supabase os default privileges dao isso ao `authenticated`.
    await db.exec(`
      GRANT SELECT, UPDATE ON public.app_notifications TO authenticated;
      GRANT SELECT ON public.error_logs TO authenticated;
    `);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE public.app_notifications, public.error_logs, cron.job_run_details,
               net._http_response, public.platform_admins, public.profiles, public.tenants CASCADE;
      DELETE FROM cron.job WHERE jobname <> 'job-health-check';
      INSERT INTO public.tenants (id, name) VALUES ('${T1}', 'Cliente'), ('${T2}', 'Sem gestor');
      INSERT INTO public.profiles (id, tenant_id, role) VALUES
        ('${GESTOR}', '${T1}', 'gestor'),
        ('${SDR}', '${T1}', 'sdr'),
        ('${SDR_T2}', '${T2}', 'sdr'),
        ('${PLATFORM}', '${T1}', 'gestor'),
        ('${GESTOR_T2}', '${T2}', 'gestor');
      INSERT INTO public.platform_admins (user_id) VALUES ('${PLATFORM}');
      SELECT cron.schedule('monitor-leads-cron', '*/5 * * * *', 'SELECT 1');
      SELECT cron.schedule('reply-sweep-cron', '*/5 * * * *', 'SELECT 1');
      SELECT cron.schedule('agent-stuck-steps-sweep', '*/2 * * * *', 'SELECT 1');
    `);
  });

  // ---------------------------------------------------------------------------
  // Estrutura / seguranca do texto
  // ---------------------------------------------------------------------------

  describe("texto da migration", () => {
    it("e so aditiva: sem DROP de tabela/coluna, UPDATE/DELETE ou alter_job", () => {
      expect(code).not.toMatch(/DROP\s+TABLE/i);
      expect(code).not.toMatch(/DROP\s+COLUMN/i);
      expect(code).not.toMatch(/^\s*UPDATE\s/im);
      expect(code).not.toMatch(/^\s*DELETE\s/im);
      expect(code).not.toMatch(/cron\.alter_job/i);
    });

    it("so desagenda o proprio job (nunca os existentes)", () => {
      const unschedules = code.match(/cron\.unschedule\('([^']+)'\)/g) ?? [];
      expect(unschedules).toEqual(["cron.unschedule('job-health-check')"]);
      expect(code).not.toMatch(/monitor-leads-cron|reply-sweep-cron|agent-stuck-steps-sweep/);
    });

    it("agenda job-health-check a cada 15 min, uma vez so (idempotente)", async () => {
      const res = await db.query<{ schedule: string; command: string }>(
        "SELECT schedule, command FROM cron.job WHERE jobname = 'job-health-check'"
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].schedule).toBe("*/15 * * * *");
      expect(res.rows[0].command).toContain("public.check_scheduled_jobs_health()");
    });

    it("documenta pre-check, rollback e o diagnostico do monitor-leads", () => {
      expect(migration).toContain("PRE-CHECK");
      expect(migration).toContain("ROLLBACK");
      expect(migration).toContain("next_run_at");
      expect(migration).toContain("unique_monitoring_config_per_tenant");
      expect(migration).toContain("timeout_milliseconds");
    });

    it("funcao de check e SECURITY DEFINER com search_path fixo", () => {
      expect(code).toMatch(
        /check_scheduled_jobs_health\(\)\s+RETURNS INTEGER\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // job_health_max_silence
  // ---------------------------------------------------------------------------

  describe("job_health_max_silence", () => {
    it.each([
      ["*/5 * * * *", 15],
      ["*/2 * * * *", 15],
      ["*/10 * * * *", 30],
      ["*/15 * * * *", 45],
      ["* * * * *", 15],
      ["30 seconds", 15],
      ["0 * * * *", 180],
      ["15 * * * *", 180],
      ["0 9 * * 1", 25 * 60],
      ["0 3 * * *", 25 * 60],
    ])("%s -> %i min", async (schedule, minutes) => {
      const res = await db.query<{ m: number }>(
        "SELECT (EXTRACT(EPOCH FROM public.job_health_max_silence($1)) / 60)::int AS m",
        [schedule]
      );
      expect(res.rows[0].m).toBe(minutes);
    });
  });

  // ---------------------------------------------------------------------------
  // check_scheduled_jobs_health
  // ---------------------------------------------------------------------------

  describe("check_scheduled_jobs_health", () => {
    beforeEach(async () => {
      await healthy("monitor-leads-cron");
      await healthy("reply-sweep-cron");
      await healthy("agent-stuck-steps-sweep");
    });

    it("TUDO_OK: nada gravado, retorna 0", async () => {
      await db.query("INSERT INTO net._http_response (status_code, timed_out) VALUES (200, false)");
      // falha antiga (fora da janela de 15 min) nao conta
      await run("reply-sweep-cron", "failed", 40, "old");
      await db.query(
        "INSERT INTO net._http_response (error_msg, created) VALUES ('old', now() - interval '1 hour')"
      );

      expect(await check()).toBe(0);
      expect(await count("SELECT count(*) FROM public.error_logs")).toBe(0);
      expect(await count("SELECT count(*) FROM public.app_notifications")).toBe(0);
    });

    it("JOB_FALHOU: error_logs + notificacao platform so para o tenant do platform admin", async () => {
      await run("reply-sweep-cron", "failed", 3, "ERROR: boom");

      expect(await check()).toBe(1);

      const logs = await db.query<{ tenant_id: string | null; source: string; route: string; message: string }>(
        "SELECT tenant_id, source, route, message FROM public.error_logs"
      );
      expect(logs.rows).toEqual([
        {
          tenant_id: null,
          source: "cron",
          route: "pg_cron/reply-sweep-cron",
          message: "Falhou 1 vez(es) desde a ultima verificacao: ERROR: boom",
        },
      ]);

      const notes = await db.query<{ tenant_id: string; type: string; audience: string; payload: Record<string, string> }>(
        "SELECT tenant_id, type, audience, payload FROM public.app_notifications"
      );
      expect(notes.rows).toHaveLength(1);
      expect(notes.rows[0]).toMatchObject({
        tenant_id: T1,
        type: "job_com_falha",
        audience: "platform",
        payload: { key: "job:reply-sweep-cron", job: "reply-sweep-cron" },
      });
      expect(notes.rows[0].payload.detail).toContain("ERROR: boom");
    });

    it("cooldown 24h: 2a deteccao grava so error_logs", async () => {
      await run("reply-sweep-cron", "failed", 3, "boom");

      await check();
      await check();

      expect(await count("SELECT count(*) FROM public.error_logs")).toBe(2);
      expect(await count("SELECT count(*) FROM public.app_notifications")).toBe(1);

      // passada a janela de 24h, notifica de novo
      await db.exec(
        "ALTER TABLE public.app_notifications DISABLE TRIGGER USER; " +
          "UPDATE public.app_notifications SET created_at = now() - interval '25 hours'; " +
          "ALTER TABLE public.app_notifications ENABLE TRIGGER USER;"
      );
      await check();
      expect(await count("SELECT count(*) FROM public.app_notifications")).toBe(2);
    });

    it("JOB_PARADO: */5 sem sucesso ha > 15 min notifica e loga, ambos com cooldown", async () => {
      await db.exec("DELETE FROM cron.job_run_details");
      await healthy("reply-sweep-cron");
      await healthy("agent-stuck-steps-sweep");
      await run("monitor-leads-cron", "succeeded", 40);
      await run("monitor-leads-cron", "succeeded", 30);

      expect(await check()).toBe(1);
      const log = await db.query<{ route: string; message: string }>(
        "SELECT route, message FROM public.error_logs"
      );
      expect(log.rows).toEqual([
        {
          route: "pg_cron/monitor-leads-cron",
          message: "Sem execucao bem-sucedida ha mais de 15 min",
        },
      ]);
      const notes = await db.query<{ payload: Record<string, string> }>(
        "SELECT payload FROM public.app_notifications"
      );
      expect(notes.rows).toHaveLength(1);
      expect(notes.rows[0].payload).toMatchObject({
        key: "parado:monitor-leads-cron",
        job: "monitor-leads-cron",
        detail: "Sem execucao bem-sucedida ha mais de 15 min",
      });

      // 2a passada: nada novo (cooldown nos dois)
      expect(await check()).toBe(0);
      expect(await count("SELECT count(*) FROM public.error_logs")).toBe(1);
      expect(await count("SELECT count(*) FROM public.app_notifications")).toBe(1);
    });

    it("job recem-criado sem historico nao e considerado parado", async () => {
      await db.exec("SELECT cron.schedule('novo-job', '*/5 * * * *', 'SELECT 1')");
      expect(await check()).toBe(0);
    });

    it("job inativo e ignorado", async () => {
      await db.exec("UPDATE cron.job SET active = false WHERE jobname = 'reply-sweep-cron'");
      await run("reply-sweep-cron", "failed", 2, "boom");
      expect(await check()).toBe(0);
    });

    it("HTTP_FALHOU: contagem + 1o erro, notificacao chave http com cooldown", async () => {
      await db.exec(`
        INSERT INTO net._http_response (status_code, timed_out, error_msg, created) VALUES
          (NULL, NULL, 'Timeout of 5000 ms reached', now() - interval '10 minutes'),
          (NULL, NULL, 'Timeout of 5000 ms reached', now() - interval '5 minutes'),
          (502, false, NULL, now() - interval '2 minutes'),
          (200, false, NULL, now() - interval '1 minute');
      `);

      expect(await check()).toBe(1);
      const log = await db.query<{ route: string; message: string }>(
        "SELECT route, message FROM public.error_logs"
      );
      expect(log.rows[0].route).toBe("pg_net/http");
      expect(log.rows[0].message).toBe(
        "3 chamada(s) HTTP do pg_net falharam desde a ultima verificacao. 1o erro: Timeout of 5000 ms reached"
      );
      const notes = await db.query<{ payload: Record<string, string> }>(
        "SELECT payload FROM public.app_notifications"
      );
      expect(notes.rows).toHaveLength(1);
      expect(notes.rows[0].payload).toMatchObject({ key: "http", job: "Chamadas HTTP (pg_net)" });

      // HTTP: error_logs a cada passada, notificacao so 1x em 24h
      expect(await check()).toBe(1);
      expect(await count("SELECT count(*) FROM public.error_logs")).toBe(2);
      expect(await count("SELECT count(*) FROM public.app_notifications")).toBe(1);
    });

    it("marca d'agua: falha anterior a execucao previa do check nao conta de novo", async () => {
      await db.query(
        `INSERT INTO cron.job_run_details (jobid, status, start_time, end_time)
         VALUES ($1, 'succeeded', now() - interval '15 minutes', now() - interval '15 minutes')`,
        [await jobId("job-health-check")]
      );
      await run("reply-sweep-cron", "failed", 16, "ja reportada");
      await db.query(
        "INSERT INTO net._http_response (error_msg, created) VALUES ('ja reportada', now() - interval '16 minutes')"
      );
      expect(await check()).toBe(0);

      await run("reply-sweep-cron", "failed", 14, "nova");
      expect(await check()).toBe(1);
      const log = await db.query<{ message: string }>("SELECT message FROM public.error_logs");
      expect(log.rows[0].message).toBe("Falhou 1 vez(es) desde a ultima verificacao: nova");
    });

    it("marca d'agua limitada a 1h atras", async () => {
      await db.query(
        `INSERT INTO cron.job_run_details (jobid, status, start_time, end_time)
         VALUES ($1, 'succeeded', now() - interval '5 hours', now() - interval '5 hours')`,
        [await jobId("job-health-check")]
      );
      await run("reply-sweep-cron", "failed", 90, "antiga");
      await run("reply-sweep-cron", "failed", 50, "recente");
      await check();
      const log = await db.query<{ message: string }>("SELECT message FROM public.error_logs");
      expect(log.rows[0].message).toBe("Falhou 1 vez(es) desde a ultima verificacao: recente");
    });

    it("redige segredos de return_message e error_msg antes de gravar", async () => {
      await run(
        "reply-sweep-cron",
        "failed",
        3,
        "401 Authorization: Bearer abc.def https://x.supabase.co/f?apikey=123 jwt eyJhbGc.eyJzdWI.sig"
      );
      await db.query(
        "INSERT INTO net._http_response (error_msg, created) VALUES ('GET https://h.com/p?token=9 Basic dXNlcjpw', now() - interval '1 minute')"
      );
      await check();
      const res = await db.query<{ message: string }>(
        "SELECT message FROM public.error_logs ORDER BY route"
      );
      const all = res.rows.map((r) => r.message).join(" | ");
      expect(all).not.toMatch(/abc\.def|apikey=123|eyJ|token=9|dXNlcjpw/);
      expect(all).toContain("Bearer [redacted]");
      expect(all).toContain("https://x.supabase.co/f?[redacted]");
      expect(all).toContain("Basic [redacted]");
      const notes = await db.query<{ detail: string }>(
        "SELECT payload->>'detail' AS detail FROM public.app_notifications"
      );
      expect(notes.rows.map((r) => r.detail).join(" ")).not.toMatch(/abc\.def|eyJ|token=9/);
    });

    it("job ativo sem jobname nao aborta o check", async () => {
      await db.exec("INSERT INTO cron.job (schedule, command) VALUES ('*/5 * * * *', 'SELECT 1')");
      const res = await db.query<{ jobid: number }>(
        "SELECT jobid::int AS jobid FROM cron.job WHERE jobname IS NULL"
      );
      const id = res.rows[0].jobid;
      await db.query(
        `INSERT INTO cron.job_run_details (jobid, status, return_message, start_time, end_time)
         VALUES ($1, 'failed', 'boom', now() - interval '2 minutes', now() - interval '2 minutes')`,
        [id]
      );
      expect(await check()).toBe(1);
      const log = await db.query<{ route: string }>("SELECT route FROM public.error_logs");
      expect(log.rows[0].route).toBe(`pg_cron/jobid:${id}`);
    });

    it("mensagem truncada em 500 caracteres", async () => {
      await run("reply-sweep-cron", "failed", 3, "x".repeat(2000));
      await check();
      expect(await count("SELECT max(length(message)) FROM public.error_logs")).toBe(500);
    });

    it("nao chamavel por anon/authenticated", async () => {
      await asUser(GESTOR, async () => {
        await expect(db.query("SELECT public.check_scheduled_jobs_health()")).rejects.toThrow(
          /permission denied/
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // RLS: policy RESTRICTIVE + error_logs
  // ---------------------------------------------------------------------------

  describe("RLS (SDR x gestor)", () => {
    beforeEach(async () => {
      await db.exec(`
        INSERT INTO public.app_notifications (tenant_id, type, payload, audience) VALUES
          ('${T1}', 'nova_oportunidade', '{}', NULL),
          ('${T1}', 'job_com_falha', '{"key":"http"}', 'platform'),
          ('${T1}', 'alerta_gestor', '{}', 'admin');
        INSERT INTO public.error_logs (tenant_id, source, route, message) VALUES
          (NULL, 'cron', 'pg_net/http', 'plataforma'),
          ('${T1}', 'api', '/api/a', 'do tenant 1'),
          ('${T2}', 'api', '/api/b', 'do tenant 2');
      `);
    });

    it("SDR nao ve job_com_falha nem alerta de gestor, mas ve as demais notificacoes", async () => {
      await asUser(SDR, async () => {
        const res = await db.query<{ type: string }>(
          "SELECT type FROM public.app_notifications ORDER BY type"
        );
        expect(res.rows.map((r) => r.type)).toEqual(["nova_oportunidade"]);
      });
    });

    it("gestor do cliente (sem platform admin) nao ve job_com_falha", async () => {
      await asUser(GESTOR, async () => {
        const res = await db.query<{ type: string }>(
          "SELECT type FROM public.app_notifications ORDER BY type"
        );
        expect(res.rows.map((r) => r.type)).toEqual(["alerta_gestor", "nova_oportunidade"]);
      });
    });

    it("platform admin ve job_com_falha", async () => {
      await asUser(PLATFORM, async () => {
        const res = await db.query<{ type: string }>(
          "SELECT type FROM public.app_notifications ORDER BY type"
        );
        expect(res.rows.map((r) => r.type)).toEqual([
          "alerta_gestor",
          "job_com_falha",
          "nova_oportunidade",
        ]);
      });
    });

    it("SDR nao le error_logs", async () => {
      await asUser(SDR, async () => {
        expect(await count("SELECT count(*) FROM public.error_logs")).toBe(0);
      });
    });

    it("gestor do cliente nao le error_logs", async () => {
      await asUser(GESTOR, async () => {
        expect(await count("SELECT count(*) FROM public.error_logs")).toBe(0);
      });
    });

    it("platform admin le error_logs", async () => {
      await asUser(PLATFORM, async () => {
        const res = await db.query<{ message: string }>(
          "SELECT message FROM public.error_logs ORDER BY message"
        );
        expect(res.rows.map((r) => r.message)).toEqual(["do tenant 1", "do tenant 2", "plataforma"]);
      });
    });

    it("is_platform_admin: true so para quem esta em platform_admins", async () => {
      for (const [uid, expected] of [[PLATFORM, true], [GESTOR, false], [SDR, false]] as const) {
        await asUser(uid, async () => {
          const res = await db.query<{ ok: boolean }>("SELECT public.is_platform_admin() AS ok");
          expect(res.rows[0].ok).toBe(expected);
        });
      }
    });

    it("authenticated nao le nem escreve platform_admins direto", async () => {
      await db.exec("GRANT SELECT, INSERT ON public.platform_admins TO authenticated;");
      await asUser(GESTOR, async () => {
        expect(await count("SELECT count(*) FROM public.platform_admins")).toBe(0);
        await expect(
          db.query(`INSERT INTO public.platform_admins (user_id) VALUES ('${GESTOR}')`)
        ).rejects.toThrow();
      });
    });

    it("authenticated nao escreve em error_logs", async () => {
      await asUser(GESTOR, async () => {
        await expect(
          db.query(
            "INSERT INTO public.error_logs (source, route, message) VALUES ('api', '/x', 'y')"
          )
        ).rejects.toThrow();
      });
    });

    it("audience e imutavel (trigger da 00060 estendido)", async () => {
      await asUser(PLATFORM, async () => {
        await expect(
          db.query("UPDATE public.app_notifications SET audience = NULL WHERE audience = 'platform'")
        ).rejects.toThrow(/imutável/);
      });
      await asUser(SDR, async () => {
        await expect(
          db.query("UPDATE public.app_notifications SET audience = 'admin' WHERE audience IS NULL")
        ).rejects.toThrow(/imutável/);
        // marcar como lida continua permitido
        await db.query("UPDATE public.app_notifications SET read_at = now() WHERE audience IS NULL");
      });
    });

    it("audience so aceita 'admin', 'platform' ou NULL", async () => {
      await db.query(
        `INSERT INTO public.app_notifications (tenant_id, type, audience) VALUES ('${T1}', 'x', 'platform')`
      );
      await expect(
        db.query(
          `INSERT INTO public.app_notifications (tenant_id, type, audience) VALUES ('${T1}', 'x', 'sdr')`
        )
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe("seed de platform_admins", () => {
    it("so insere o Fabossi se o profile existe, sem duplicar", async () => {
      expect(code).toMatch(
        /INSERT INTO public\.platform_admins \(user_id\)\s+SELECT p\.id FROM public\.profiles p WHERE p\.id = '61d07b17-57bd-4c0f-bd5d-35bf2d2ccb6d'\s+ON CONFLICT \(user_id\) DO NOTHING;/
      );
      // No PGlite o profile nao existe: a migration aplicada 2x nao inseriu nada nem quebrou.
      const fabossi = "61d07b17-57bd-4c0f-bd5d-35bf2d2ccb6d";
      expect(await count(`SELECT count(*) FROM public.platform_admins WHERE user_id = '${fabossi}'`)).toBe(0);
    });
  });
});
