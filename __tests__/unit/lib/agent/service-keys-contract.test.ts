/**
 * Contract Tests - Chaves de servico no runtime do agente
 * Story 22.9 - AC: #3, #5, #6
 *
 * POR QUE ESTE ARQUIVO EXISTE: a suite inteira mocka o Supabase e, por isso, NAO
 * simula RLS — foi exatamente esse ponto cego que deixou o bug do SDR chegar em
 * producao com 6.9k testes verdes (mesma classe das Stories 21.5 e 22.7).
 * Como um teste de integracao com RLS real nao e viavel neste harness (sem banco),
 * a prova de contrato aqui e ESTATICA e cobre as duas premissas que o mock nao ve:
 *
 *   1. A RLS de `api_configs` E admin-only (a premissa do bug) e continua INTOCADA
 *      — Settings -> Integracoes segue admin-only (AC3).
 *   2. NENHUM ponto do runtime do agente le `api_configs` com o client de sessao —
 *      a leitura e centralizada no helper server-only (AC5), entao nenhuma rota/step
 *      futuro reintroduz o bug sem quebrar este teste.
 *
 * A prova ponta-a-ponta com um usuario `sdr` real permanece o smoke manual (Task 5).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../../..");
const HELPER_PATH = "src/lib/agent/service-keys.ts";

/**
 * Varre um diretorio recursivamente devolvendo caminhos relativos ao PROJECT_ROOT.
 * `extensions` e explicito de proposito: a versao anterior filtrava so `.ts`/`.tsx`
 * e era reusada para varrer `supabase/migrations`, onde nunca casava nada — a
 * varredura de migrations passava por um `readdirSync` nao-recursivo em paralelo.
 */
function walk(relativeDir: string, extensions: string[] = [".ts", ".tsx"]): string[] {
  const absolute = join(PROJECT_ROOT, relativeDir);
  const entries = readdirSync(absolute);
  return entries.flatMap((entry) => {
    const relativeEntry = `${relativeDir}/${entry}`;
    if (statSync(join(PROJECT_ROOT, relativeEntry)).isDirectory()) {
      return walk(relativeEntry, extensions);
    }
    return extensions.some((ext) => relativeEntry.endsWith(ext)) ? [relativeEntry] : [];
  });
}

function read(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8");
}

/** Todos os arquivos do runtime do agente (rotas + libs). */
const AGENT_RUNTIME_FILES = [
  ...walk("src/app/api/agent"),
  ...walk("src/lib/agent"),
];

describe("Contrato: chaves de servico no runtime do agente (Story 22.9)", () => {
  describe("AC3 - a RLS admin-only de api_configs permanece intocada", () => {
    const rls = read("supabase/migrations/00005_api_configs_rls.sql");

    it("mantem a policy de SELECT gateada por is_admin() + tenant_id", () => {
      expect(rls).toContain('CREATE POLICY "Admins can view own tenant api configs"');
      expect(rls).toContain("tenant_id = public.get_current_tenant_id()");
      expect(rls).toContain("public.is_admin()");
    });

    it("nao existe migration afrouxando a RLS de api_configs (o fix e 100% de codigo, NFR5)", () => {
      const migrations = walk("supabase/migrations", [".sql"]);

      // Guarda mais ampla que so `POLICY`: afrouxar a RLS nao exige essa palavra —
      // `ALTER TABLE api_configs DISABLE ROW LEVEL SECURITY` ou um `GRANT` abrem a
      // tabela do mesmo jeito. NAO inclui `ALTER TABLE` solto de proposito: varias
      // migrations legitimas so acrescentam um `service_name` a um CHECK constraint.
      const LOOSENING = /POLICY|ROW\s+LEVEL\s+SECURITY|\bGRANT\b/i;

      const touchingApiConfigsRls = migrations.filter((file) => {
        const sql = read(file);
        return (
          LOOSENING.test(sql) &&
          /api_configs/i.test(sql) &&
          !file.includes("00005_api_configs_rls")
        );
      });

      expect(migrations.length).toBeGreaterThan(0);
      expect(touchingApiConfigsRls).toEqual([]);
    });
  });

  describe("AC5 - leitura de api_configs centralizada no helper server-only", () => {
    it("nenhum arquivo do runtime do agente consulta api_configs diretamente", () => {
      const offenders = AGENT_RUNTIME_FILES.filter(
        (file) => file !== HELPER_PATH && /from\(["']api_configs["']\)/.test(read(file))
      );

      expect(offenders).toEqual([]);
    });

    it("o helper e o unico ponto que le api_configs, e sempre com createAdminClient", () => {
      const helper = read(HELPER_PATH);

      expect(helper).toContain('from("api_configs")');
      expect(helper).toContain("createAdminClient");
      // Server-only: jamais o client de sessao (foi essa import que criou o bug).
      expect(helper).not.toContain("@/lib/supabase/server");
    });

    it("o helper aplica tenant_id e service_name na query (AC4)", () => {
      const helper = read(HELPER_PATH);

      expect(helper).toContain('.eq("tenant_id", tenantId)');
      expect(helper).toContain('.eq("service_name", serviceName)');
    });

    it("getServiceApiKey (step-utils) nao recebe mais um SupabaseClient do caller (Trap #2)", () => {
      const stepUtils = read("src/lib/agent/steps/step-utils.ts");

      // Nao importa o tipo do client (a assinatura antiga recebia um por parametro)...
      expect(stepUtils).not.toMatch(/from ["']@supabase\/supabase-js["']/);
      // ...e a assinatura atual so aceita tenantId + serviceName.
      expect(stepUtils).toMatch(
        /getServiceApiKey\(\s*tenantId: string,\s*serviceName: string,?\s*\)/
      );
      expect(stepUtils).toContain("requireServiceApiKey");
    });

    it("o runtime do agente injeta a chave do Apollo (o service le api_configs pela sessao)", () => {
      // ApolloService.getApiKey() cria o proprio client de SESSAO: sem a chave
      // injetada, o step morre com "API key nao configurada" para um `sdr`.
      //
      // A assercao anterior era `snippet.toContain(",")` — provava ARIDADE, nao
      // origem: `new ApolloService(tenantId, undefined)` passava. Aqui exigimos que
      // o 2o argumento seja uma variavel *ApiKey E que o arquivo importe o helper.
      const constructions = AGENT_RUNTIME_FILES.flatMap((file) => {
        // `[\s\S]*?` para nao quebrar se o prettier quebrar a chamada em linhas.
        const matches = read(file).match(/new ApolloService\([\s\S]*?\)/g) ?? [];
        return matches.map((snippet) => ({ file, snippet }));
      });

      expect(constructions.length).toBeGreaterThan(0);
      for (const { file, snippet } of constructions) {
        // 2o argumento e uma variavel de chave (ex.: `apolloApiKey`), nunca literal.
        expect(snippet).toMatch(/new ApolloService\(\s*[^,]+,\s*\w*[aA]piKey\s*\)/);
        // ...e essa variavel vem do helper server-only, nao de outra leitura.
        expect(read(file)).toContain("@/lib/agent/service-keys");
      }
    });
  });

  describe("AC5 - a guarda cobre tambem os services que leem api_configs por conta propria", () => {
    // POR QUE: o "ponto silencioso" que quase escapou (ApolloService) NAO vive em
    // `src/lib/agent` nem em `src/app/api/agent` — vive em `src/lib/services`, fora
    // do scan acima. Um step futuro fazendo `new SignalHireService(tenantId)`
    // reintroduziria o bug do SDR com a suite inteira verde.
    //
    // Esta lista e um INVENTARIO CONGELADO: services que ainda leem `api_configs`
    // com o client de SESSAO. Quem adicionar um novo tem que vir aqui e decidir
    // conscientemente (injetar a chave pelo helper ou aceitar admin-only).
    const KNOWN_SESSION_READERS = ["src/lib/services/apollo.ts", "src/lib/services/signalhire.ts"];

    it("nenhum service novo passa a ler api_configs pela sessao sem revisao", () => {
      const readers = walk("src/lib/services").filter((file) =>
        /from\(\s*["']api_configs["']\s*\)/.test(read(file))
      );

      expect(readers.sort()).toEqual([...KNOWN_SESSION_READERS].sort());
    });

    it("o unico service do inventario usado pelo agente (Apollo) aceita a chave por injecao", () => {
      // Construtor com parametro opcional `apiKey` = o runtime do agente consegue
      // injetar a chave lida por service-role em vez de depender da RLS.
      // `signalhire` esta no inventario mas NAO e usado pelo runtime do agente
      // (so por `api/integrations/signalhire/*`) — por isso nao exige injecao hoje.
      expect(read("src/lib/services/apollo.ts")).toMatch(/constructor\([^)]*apiKey\?: string/);

      const agentUsesSignalHire = AGENT_RUNTIME_FILES.some((file) =>
        /SignalHireService/.test(read(file))
      );
      expect(agentUsesSignalHire).toBe(false);
    });
  });

  describe("Trap #1 - o resto do pipeline continua sob RLS por tenant", () => {
    it("o orchestrator segue recebendo o client de SESSAO na rota de execucao", () => {
      const route = read(
        "src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts"
      );

      expect(route).toContain("createClient");
      expect(route).toContain("new DeterministicOrchestrator(supabase, apiKey)");
    });
  });
});
