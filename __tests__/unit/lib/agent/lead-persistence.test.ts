/**
 * Unit Tests for lead-persistence (Story 22.15)
 *
 * REGRA DESTE ARQUIVO (nao negociavel, ver Verification da spec): o banco fake e semeado
 * SUJO. Um banco que so recebe estado limpo certifica a implementacao contra as premissas
 * do autor, nao contra o Postgres:
 *
 * - emails gravados em CAIXA MISTA (nenhuma rota do produto normaliza `leads.email`);
 * - linha LEGADA sem `apollo_id` para uma pessoa que agora chega com `apolloId`;
 * - `ilike` com semantica REAL de curinga (`_` e `%`), para provar que o match final e
 *   reconferido em memoria;
 * - falhas injetadas DEPOIS da primeira escrita (associacao e update de icebreaker).
 *
 * Um teste chamado "case-insensitive" que semeia a linha ja em minusculas passaria com
 * uma comparacao 100% case-sensitive: nao vale.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistApprovedLeads,
  normalizeSegmentName,
  splitLeadName,
} from "@/lib/agent/lead-persistence";
import type { LeadWithIcebreaker } from "@/types/agent";
import {
  FakeDb,
  createFakeSupabase,
  FAKE_TENANT as TENANT,
  FAKE_OTHER_TENANT as OTHER_TENANT,
  type FakeSegment,
} from "../../../helpers/fake-leads-db";

// ==============================================
// HELPERS
// ==============================================

function lead(overrides: Partial<LeadWithIcebreaker> = {}): LeadWithIcebreaker {
  return {
    name: "Maria Souza Lima",
    title: "CTO",
    companyName: "Acme",
    email: "maria@acme.com",
    linkedinUrl: null,
    apolloId: "apollo-1",
    icebreaker: "Icebreaker novo",
    ...overrides,
  };
}

function run(db: FakeDb, leads: LeadWithIcebreaker[], segmentName = "Teste Atibaia") {
  return persistApprovedLeads({
    supabase: createFakeSupabase(db),
    tenantId: TENANT,
    segmentName,
    leads,
  });
}

// ==============================================
// TESTS
// ==============================================

describe("normalizeSegmentName (Story 22.15)", () => {
  it("faz trim e devolve null para vazio/whitespace", () => {
    expect(normalizeSegmentName("  Teste Atibaia  ")).toBe("Teste Atibaia");
    expect(normalizeSegmentName("   ")).toBeNull();
    expect(normalizeSegmentName("")).toBeNull();
  });

  it("devolve null para valor NAO-string (JSONB com mais de um escritor)", () => {
    expect(normalizeSegmentName(null)).toBeNull();
    expect(normalizeSegmentName(undefined)).toBeNull();
    expect(normalizeSegmentName(42)).toBeNull();
    expect(normalizeSegmentName({ nome: "x" })).toBeNull();
    expect(normalizeSegmentName(["Teste"])).toBeNull();
  });

  it("trunca em 100 chars (segments.name e VARCHAR(100))", () => {
    const truncated = normalizeSegmentName("a".repeat(250));
    expect(truncated).toHaveLength(100);
  });

  it("trunca por CODE POINT, nunca partindo um par substituto ao meio", () => {
    // 99 chars + 1 emoji (2 unidades UTF-16): slice(0,100) cru deixaria surrogate solto.
    const name = `${"a".repeat(99)}🚀🚀`;
    const truncated = normalizeSegmentName(name) as string;

    expect([...truncated]).toHaveLength(100);
    expect(truncated.endsWith("🚀")).toBe(true);
    // nenhum surrogate solto sobrevive
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncated)).toBe(false);
  });
});

describe("splitLeadName (Story 22.15)", () => {
  it("primeiro token vira first_name, o resto last_name (mesma quebra do ExportStep)", () => {
    expect(splitLeadName("Maria Souza Lima", null)).toEqual({
      firstName: "Maria",
      lastName: "Souza Lima",
    });
    expect(splitLeadName("Maria", null)).toEqual({ firstName: "Maria", lastName: null });
  });

  it("sem nome usavel cai para o email NORMALIZADO, nunca para um placeholder", () => {
    expect(splitLeadName(null, "maria@acme.com")).toEqual({
      firstName: "maria@acme.com",
      lastName: null,
    });
    expect(splitLeadName("   ", "maria@acme.com").firstName).toBe("maria@acme.com");
    // nada de "Lead" fabricado
    expect(splitLeadName(null, "maria@acme.com").firstName).not.toBe("Lead");
  });

  it("preserva o nome mascarado que sobreviveu ao enrichment (nao fabrica valor)", () => {
    expect(splitLeadName("Amanda Re***l", "x@y.com")).toEqual({
      firstName: "Amanda",
      lastName: "Re***l",
    });
  });

  it("cai para o PROXIMO fallback quando o anterior esta vazio (first_name nunca vazio)", () => {
    // `first_name` e NOT NULL mas ACEITA '': uma linha sem identidade nenhuma em Meus Leads.
    expect(splitLeadName("", null, "apollo-9")).toEqual({
      firstName: "apollo-9",
      lastName: null,
    });
    expect(splitLeadName(null, "maria@x.com", "apollo-9").firstName).toBe("maria@x.com");
    expect(splitLeadName(null, "  ", "apollo-9").firstName).toBe("apollo-9");
  });
});

describe("persistApprovedLeads (Story 22.15)", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lead novo com apolloId: insere, associa e grava icebreaker", async () => {
    const result = await run(db, [lead()]);

    expect(result.inserted).toBe(1);
    expect(result.reused).toBe(0);
    expect(result.associated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.degraded).toBe(false);

    expect(db.leads).toHaveLength(1);
    expect(db.leads[0]).toMatchObject({
      tenant_id: TENANT,
      apollo_id: "apollo-1",
      first_name: "Maria",
      last_name: "Souza Lima",
      email: "maria@acme.com",
      icebreaker: "Icebreaker novo",
    });
    expect(db.leads[0].icebreaker_generated_at).toBeTruthy();
    expect(db.associations).toEqual([{ segment_id: result.segmentId, lead_id: db.leads[0].id }]);
  });

  it("lead ja existente por apolloId: nao insere, atualiza icebreaker e associa", async () => {
    const seeded = db.seedLead({ apollo_id: "apollo-1", email: "maria@acme.com", icebreaker: "antigo" });

    const result = await run(db, [lead()]);

    expect(result.inserted).toBe(0);
    expect(result.reused).toBe(1);
    expect(result.associated).toBe(1);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].icebreaker).toBe("Icebreaker novo");
    expect(db.associations).toEqual([{ segment_id: result.segmentId, lead_id: seeded.id }]);
  });

  it("dedupe por email e case-insensitive contra o valor ARMAZENADO em caixa mista", async () => {
    // Linha suja: gravada por import-csv com a caixa CRUA do CSV do usuario.
    db.seedLead({ apollo_id: null, email: "Maria@Acme.COM", first_name: "Maria" });

    const result = await run(db, [lead({ apolloId: null, email: "maria@acme.com" })]);

    expect(result.inserted).toBe(0);
    expect(result.reused).toBe(1);
    expect(db.leads).toHaveLength(1);
  });

  it("cruzamento apollo-x-email: quem veio de CSV (sem apollo_id) NAO vira linha nova", async () => {
    // O caso caro: a pessoa ja esta na base sem apollo_id e agora chega COM apolloId.
    const legacy = db.seedLead({ apollo_id: null, email: "Maria@Acme.COM" });

    const result = await run(db, [lead({ apolloId: "apollo-novo" })]);

    expect(result.inserted).toBe(0);
    expect(result.reused).toBe(1);
    expect(db.leads).toHaveLength(1);
    expect(db.associations).toEqual([{ segment_id: result.segmentId, lead_id: legacy.id }]);
  });

  it("nao confunde pessoas por causa do curinga `_` do ilike (match reconferido em memoria)", async () => {
    // `ana_lima@x.com` como PADRAO casaria `anaZlima@x.com` no ilike: pessoa diferente.
    db.seedLead({ apollo_id: null, email: "anaZlima@x.com" });

    const result = await run(db, [lead({ apolloId: null, email: "ana_lima@x.com", name: "Ana Lima" })]);

    expect(result.inserted).toBe(1);
    expect(result.reused).toBe(0);
    expect(db.leads).toHaveLength(2);
  });

  it("ignora leads de OUTRO tenant na deduplicacao (isolamento)", async () => {
    db.seedLead({ tenant_id: OTHER_TENANT, apollo_id: "apollo-1", email: "maria@acme.com" });

    const result = await run(db, [lead()]);

    expect(result.inserted).toBe(1);
    expect(db.leads.filter((l) => l.tenant_id === TENANT)).toHaveLength(1);
  });

  it("dedupe DENTRO do lote: o mesmo contato por chaves diferentes e UM lead", async () => {
    const result = await run(db, [
      lead({ apolloId: "apollo-1", email: null, name: "Maria Souza" }),
      lead({ apolloId: null, email: "MARIA@acme.com", name: "Maria Souza Lima" }),
      lead({ apolloId: "apollo-1", email: "maria@acme.com" }),
    ]);

    expect(result.inserted).toBe(1);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].apollo_id).toBe("apollo-1");
    expect(db.leads[0].email).toBe("maria@acme.com");
    expect(db.associations).toHaveLength(1);
  });

  it("NAO funde duas pessoas do Apollo que compartilham email (conflito de identidade)", async () => {
    // (apollo-1, sem email) + (apollo-1, X) + (apollo-2, X): a uniao por email e
    // TRANSITIVA e juntaria os tres num so. O merge entao descartaria `apollo-2` em
    // silencio — o lead sumiria sem sequer entrar em `skipped`.
    const result = await run(db, [
      lead({ apolloId: "apollo-1", email: null, name: "Maria Souza" }),
      lead({ apolloId: "apollo-1", email: "contato@acme.com", name: "Maria Souza" }),
      lead({ apolloId: "apollo-2", email: "contato@acme.com", name: "Jose Silva" }),
    ]);

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(db.leads.map((l) => l.apollo_id).sort()).toEqual(["apollo-1", "apollo-2"]);
    expect(db.associations).toHaveLength(2);
  });

  it("NAO colapsa duas pessoas do Apollo na MESMA linha legada do banco", async () => {
    // Irmao do teste acima, do lado do BANCO. A linha legada (CSV, sem apollo_id) tem o
    // email que os dois registros compartilham: sem a regra de posse, os dois casavam com
    // ela, o segundo saia de `pending` e o lead aprovado NAO chegava em Meus Leads — sem
    // entrar em `skipped`, sem bolha, sem rastro.
    const legacy = db.seedLead({ apollo_id: null, email: "Contato@Acme.COM" });

    const result = await run(db, [
      lead({ apolloId: "apollo-1", email: "contato@acme.com", name: "Maria Souza" }),
      lead({ apolloId: "apollo-2", email: "contato@acme.com", name: "Jose Silva" }),
    ]);

    // A pessoa nova entra como linha propria; ninguem some.
    expect(result.inserted).toBe(1);
    expect(result.reused).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.degraded).toBe(false);
    expect(db.leads).toHaveLength(2);
    expect(db.leads.map((l) => l.apollo_id)).toContain("apollo-2");
    // Os DOIS leads aprovados aparecem no segmento da campanha.
    expect(db.associations).toHaveLength(2);
    expect(db.associations.map((a) => a.lead_id)).toContain(legacy.id);
  });

  it("linha ocupada por outro apollo NAO impede reusar a linha livre com o mesmo email", async () => {
    // `leads` nao tem unique de email: o MESMO endereco aparece em varias linhas (uma do
    // Apollo, uma do CSV). Guardando so a primeira candidata, o match desistia assim que
    // ela ja pertencia a outra pessoa — e o lead virava INSERT, a duplicata que este
    // modulo existe para evitar, mesmo com a linha legada livre logo atras.
    db.seedLead({ apollo_id: "apollo-9", email: "contato@acme.com" });
    const legacy = db.seedLead({ apollo_id: null, email: "Contato@Acme.COM" });

    const result = await run(db, [
      lead({ apolloId: "apollo-2", email: "contato@acme.com", name: "Jose Silva" }),
    ]);

    expect(result.inserted).toBe(0);
    expect(result.reused).toBe(1);
    expect(db.leads).toHaveLength(2); // nenhuma linha nova
    expect(db.associations.map((a) => a.lead_id)).toEqual([legacy.id]);
  });

  it("insert sem RETURNING utilizavel: degrada em vez de anunciar sucesso limpo", async () => {
    // A linha pode ter sido gravada e nao voltar no payload (politica de SELECT
    // restritiva, `return=minimal`). Sem reconciliacao, o helper devolvia
    // `{inserted:0, degraded:false}` com leads orfaos na base e o step nao dizia nada.
    const supabase = createFakeSupabase(db);
    const original = supabase.from.bind(supabase);
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      const builder = original(table) as unknown as Record<string, unknown>;
      if (table !== "leads") return builder as never;
      const insert = builder.insert as (payload: unknown) => Record<string, unknown>;
      builder.insert = (payload: unknown) => {
        const chain = insert(payload);
        const select = chain.select as (cols: string) => unknown;
        chain.select = (cols: string) => {
          const promise = select(cols) as Promise<{ data: unknown; error: unknown }>;
          // grava de verdade, mas devolve payload vazio
          return promise.then(() => ({ data: [], error: null })) as never;
        };
        return chain;
      };
      return builder as never;
    });

    const result = await persistApprovedLeads({
      supabase,
      tenantId: TENANT,
      segmentName: "Teste Atibaia",
      leads: [lead()],
    });

    expect(db.leads).toHaveLength(1); // a linha ESTA na base
    expect(result.degraded).toBe(true); // e o resultado nao mente
  });

  it("dois registros que casam com a MESMA linha do banco viram UMA associacao e UM reused", async () => {
    // A linha do banco tem apollo_id E email; o lote traz um registro so com o apolloId e
    // outro so com o email — nao compartilham chave, entao o dedupe do lote nao os une.
    // Sem deduplicar os ids, o insert em lead_segments viola unique_lead_per_segment
    // contra a PROPRIA duplicata e o chunk inteiro vira degraded.
    const seeded = db.seedLead({ apollo_id: "apollo-1", email: "Maria@Acme.COM" });

    const result = await run(db, [
      lead({ apolloId: "apollo-1", email: null, name: "Maria Souza" }),
      lead({ apolloId: null, email: "maria@acme.com", name: "Maria Souza Lima" }),
    ]);

    expect(result.reused).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.associated).toBe(1);
    expect(result.degraded).toBe(false);
    expect(db.associations).toEqual([{ segment_id: result.segmentId, lead_id: seeded.id }]);
    // e um unico UPDATE de icebreaker para a linha
    expect(db.log.filter((e) => e.table === "leads" && e.op === "update")).toHaveLength(1);
  });

  it("escapa os metacaracteres do LIKE no email (um `%` de CSV nao vira varredura da tabela)", async () => {
    db.seedLead({ apollo_id: null, email: "ab@x.com" });

    const result = await run(db, [
      lead({ apolloId: null, email: "a%@x.com", name: "A Percent" }),
    ]);

    // nao casou com a outra pessoa...
    expect(result.inserted).toBe(1);
    expect(result.reused).toBe(0);
    // ...e o padrao enviado ao banco esta escapado (o defeito so e visivel na QUERY:
    // a reconferencia em memoria mascararia o resultado de uma varredura completa).
    // Na URL o `\` do LIKE aparece DOBRADO: o parser de string do PostgREST consome um
    // nivel e entrega `a\%@x.com` ao operador, que casa um `%` literal.
    // Os `%` das PONTAS sao os curingas de proposito (o valor gravado pode ter espaco em
    // volta); o `%` do MEIO, que vem do email, esta escapado.
    const orQuery = db.log.find((e) => e.table === "leads" && e.op === "select" && e.or);
    expect(orQuery?.or).toBe(String.raw`email.ilike."%a\\%@x.com%"`);
  });

  it("acha o lead cujo email gravado tem espaco em volta (create-batch grava sem trim)", async () => {
    // `POST /api/leads/create-batch` valida email como `z.string().nullable()` e grava
    // `lead.email ?? null` CRU: ha linhas com espaco em volta na base do cliente. Com um
    // padrao ancorado a linha nao voltava na query e o lead era INSERIDO de novo.
    const seeded = db.seedLead({ apollo_id: null, email: "  Maria@Acme.COM " });

    const result = await run(db, [lead({ apolloId: null })]);

    expect(result.reused).toBe(1);
    expect(result.inserted).toBe(0);
    expect(db.leads).toHaveLength(1);
    expect(db.associations).toEqual([{ segment_id: result.segmentId, lead_id: seeded.id }]);
  });

  it("escapa os metacaracteres do LIKE no nome do segmento ('Leads 50% off')", async () => {
    const seeded = db.seedSegment("leads 50% off");

    const result = await run(db, [lead()], "Leads 50% off");

    expect(result.segmentId).toBe(seeded.id);
    expect(db.segments).toHaveLength(1);
    // Valor CRU, sem aspas: num filtro `ilike` AVULSO o PostgREST nao desfaz valor
    // citado (so dentro de `or=(...)`), entao aspas viravam texto do pattern e a busca
    // nunca achava o segmento. Os `%` das PONTAS sao os curingas do padrao nao-ancorado
    // (nome gravado com espaco em volta); o `%` do MEIO e o do nome e vai escapado — sem
    // isso a busca varreria a tabela `segments` inteira do tenant.
    const segmentQuery = db.log.find((e) => e.table === "segments" && e.op === "select");
    expect(segmentQuery?.ilike?.[0]).toEqual(["name", String.raw`%Leads 50\% off%`]);
  });

  it("acha o segmento existente quando o nome vem com aspas do LLM", async () => {
    // Sem citar o valor, o PostgREST leria a `"` inicial como abertura de valor citado e a
    // removeria: a busca procurava outro texto, nao achava o segmento, batia na unique no
    // insert e o usuario recebia a bolha de falha total.
    const seeded = db.seedSegment('"Teste Atibaia"');

    const result = await run(db, [lead()], '"Teste Atibaia"');

    expect(result.segmentId).toBe(seeded.id);
    expect(result.degraded).toBe(false);
    expect(db.segments).toHaveLength(1);
  });

  it("lead so com apolloId (sem nome e sem email): first_name recebe o apollo_id, nunca vazio", async () => {
    const result = await run(db, [
      lead({ name: "", email: null, apolloId: "apollo-only", companyName: "Acme" }),
    ]);

    expect(result.inserted).toBe(1);
    expect(db.leads[0].first_name).toBe("apollo-only");
    expect(db.leads[0].first_name).not.toBe("");
    expect(db.leads[0].email).toBeNull();
  });

  it("lead sem apolloId e sem email: nao persistido, contabilizado como skipped", async () => {
    const result = await run(db, [
      lead(),
      lead({ apolloId: null, email: null, name: "Fantasma" }),
      lead({ apolloId: "  ", email: "   ", name: "Fantasma 2" }),
    ]);

    expect(result.skipped).toBe(2);
    expect(result.inserted).toBe(1);
    expect(db.leads).toHaveLength(1);
  });

  it("nenhum lead persistivel: NAO cria segmento (nada de segmento vazio sequestrando o nome)", async () => {
    const result = await run(db, [lead({ apolloId: null, email: null })]);

    expect(result.segmentId).toBeNull();
    expect(result.skipped).toBe(1);
    expect(result.degraded).toBe(false);
    expect(db.segments).toHaveLength(0);
    expect(db.log.some((entry) => entry.op === "insert")).toBe(false);
  });

  it("reusa o segmento existente mesmo com caixa diferente (o LLM varia a caixa entre turnos)", async () => {
    const seeded = db.seedSegment("teste atibaia");

    const result = await run(db, [lead()], "Teste Atibaia");

    expect(result.segmentId).toBe(seeded.id);
    expect(db.segments).toHaveLength(1);
  });

  it("reusa o segmento gravado com espaco em volta (POST /api/segments grava o nome CRU)", async () => {
    // `z.string().min(1).max(100)` sem `.trim()`: o usuario cria "Teste Atibaia " pela
    // tela de Leads. Com padrao ancorado a busca nao acha, a unique e byte-exata e deixa
    // o insert passar — o tenant fica com dois segmentos identicos aos olhos e os leads
    // vao para o que o usuario NAO estava olhando.
    const seeded = db.seedSegment("Teste Atibaia ");

    const result = await run(db, [lead()], "Teste Atibaia");

    expect(result.segmentId).toBe(seeded.id);
    expect(db.segments).toHaveLength(1);
  });

  it("nao reusa segmento de outro tenant", async () => {
    db.seedSegment("Teste Atibaia", OTHER_TENANT);

    const result = await run(db, [lead()], "Teste Atibaia");

    expect(db.segments).toHaveLength(2);
    expect(db.segments.find((s) => s.id === result.segmentId)?.tenant_id).toBe(TENANT);
  });

  it("trunca o nome do segmento em 100 chars antes do insert", async () => {
    const result = await run(db, [lead()], "N".repeat(250));

    expect(result.segmentName).toHaveLength(100);
    expect(db.segments[0].name).toHaveLength(100);
  });

  it("colisao unique concorrente no segmento: re-seleciona e segue", async () => {
    // O select inicial nao acha; o insert bate na unique (outra execucao criou antes).
    const raced = db.seedSegment("Teste Atibaia");
    // Simula a corrida: esconde a linha do primeiro select; ela reaparece antes do insert.
    const hidden = db.segments.pop() as FakeSegment;
    let selects = 0;
    const supabase = createFakeSupabase(db);
    const originalFrom = supabase.from.bind(supabase);
    (supabase as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      if (table === "segments") {
        selects += 1;
        if (selects === 2) db.segments.push(hidden); // reaparece antes do insert
      }
      return originalFrom(table);
    };

    const result = await persistApprovedLeads({
      supabase,
      tenantId: TENANT,
      segmentName: "Teste Atibaia",
      leads: [lead()],
    });

    expect(result.segmentId).toBe(raced.id);
    expect(result.degraded).toBe(false);
    expect(db.segments).toHaveLength(1);
  });

  it("23505 no insert de leads: re-seleciona e insere so o que falta (o lote nao morre)", async () => {
    const supabase = createFakeSupabase(db);
    const originalFrom = supabase.from.bind(supabase);
    let leadInserts = 0;

    (supabase as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const builder = originalFrom(table) as unknown as Record<string, unknown>;
      if (table !== "leads") return builder;
      const originalInsert = builder.insert as (payload: unknown) => unknown;
      builder.insert = (payload: unknown) => {
        leadInserts += 1;
        // Antes do PRIMEIRO insert, uma execucao concorrente grava o apollo-1.
        if (leadInserts === 1) {
          db.seedLead({ apollo_id: "apollo-1", email: "maria@acme.com" });
        }
        return originalInsert(payload);
      };
      return builder;
    };

    const result = await persistApprovedLeads({
      supabase,
      tenantId: TENANT,
      segmentName: "Teste Atibaia",
      leads: [lead(), lead({ apolloId: "apollo-2", email: "jose@acme.com", name: "Jose Silva" })],
    });

    // O concorrente ficou como reusado, o segundo lead foi inserido — ninguem se perdeu.
    expect(result.inserted).toBe(1);
    expect(result.reused).toBe(1);
    expect(result.associated).toBe(2);
    expect(result.degraded).toBe(false);
    expect(db.leads).toHaveLength(2);
  });

  it("23505 em lead_segments: ja associado, segue sem falha total", async () => {
    const seeded = db.seedLead({ apollo_id: "apollo-1", email: "maria@acme.com" });
    const segment = db.seedSegment("Teste Atibaia");
    const supabase = createFakeSupabase(db);
    const originalFrom = supabase.from.bind(supabase);

    (supabase as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const builder = originalFrom(table) as unknown as Record<string, unknown>;
      if (table !== "lead_segments") return builder;
      const originalInsert = builder.insert as (payload: unknown) => unknown;
      builder.insert = (payload: unknown) => {
        // Corrida: alguem associou entre o select e o insert.
        if (!db.associations.some((a) => a.lead_id === seeded.id)) {
          db.associations.push({ segment_id: segment.id, lead_id: seeded.id });
        }
        return originalInsert(payload);
      };
      return builder;
    };

    const result = await persistApprovedLeads({
      supabase,
      tenantId: TENANT,
      segmentName: "Teste Atibaia",
      leads: [lead()],
    });

    expect(result.degraded).toBe(false);
    expect(db.associations).toHaveLength(1);
  });

  it("idempotencia: re-executar o step nao duplica lead nem associacao", async () => {
    const first = await run(db, [lead(), lead({ apolloId: "apollo-2", email: "jose@acme.com", name: "Jose Silva" })]);
    expect(first.inserted).toBe(2);

    const second = await run(db, [lead(), lead({ apolloId: "apollo-2", email: "jose@acme.com", name: "Jose Silva" })]);

    expect(second.inserted).toBe(0);
    expect(second.reused).toBe(2);
    expect(second.associated).toBe(0);
    expect(second.segmentId).toBe(first.segmentId);
    expect(db.leads).toHaveLength(2);
    expect(db.segments).toHaveLength(1);
    expect(db.associations).toHaveLength(2);
  });

  // ==============================================
  // CONTRATO DE FALHA PARCIAL
  // ==============================================

  it("falha ANTES de qualquer escrita: LANCA (o step decide o fail-open)", async () => {
    db.fail("leads", "select", { code: "42501", message: "permission denied for table leads" });

    await expect(run(db, [lead()])).rejects.toThrow(/permission denied/);
    expect(db.leads).toHaveLength(0);
    expect(db.segments).toHaveLength(0);
  });

  it("falha no insert de leads (nada salvo antes): LANCA e NAO deixa segmento orfao", async () => {
    db.fail("leads", "insert", { code: "42501", message: "permission denied for table leads" });

    await expect(run(db, [lead()])).rejects.toThrow(/permission denied/);
    // Um segmento vazio criado antes do insert sequestraria o nome pela
    // `unique_segment_name_per_tenant` — e a reimportacao manual que a bolha pede
    // colidiria com ele.
    expect(db.segments).toHaveLength(0);
  });

  it("falha no segmento com leads NOVOS: degrada (os leads ja estao salvos), nao lanca", async () => {
    // Irmao do teste de leads JA na base: aqui nada preexistia, mas o insert de leads
    // funcionou. A tabela `leads` estava saudavel — abortar tudo por causa do segmento
    // mandaria reimportar leads que acabaram de ser gravados.
    db.fail("segments", "insert", { code: "08006", message: "connection failure" }, 5);

    const result = await run(db, [lead()]);

    expect(result.degraded).toBe(true);
    expect(result.segmentId).toBeNull();
    expect(result.inserted).toBe(1);
    expect(db.leads).toHaveLength(1);
  });

  it("erro de NOT NULL vem como error do supabase-js (nunca excecao) e respeita o fail-open", async () => {
    // O supabase-js devolve `{ data: null, error }`; uma excecao escaparia por cima do
    // contrato de falha parcial. Com um lead JA na base, isto tem que degradar.
    db.seedLead({ apollo_id: "apollo-ja", email: "ja@acme.com" });
    db.fail("leads", "insert", {
      code: "23502",
      message: 'null value in column "first_name" violates not-null constraint',
    });

    const result = await run(db, [
      lead({ apolloId: "apollo-ja", email: "ja@acme.com" }),
      lead({ apolloId: "apollo-novo", email: "novo@acme.com", name: "Novo Lead" }),
    ]);

    expect(result.degraded).toBe(true);
    expect(result.reused).toBe(1);
  });

  it("falha DEPOIS da primeira escrita (associacao): NAO lanca, devolve degraded", async () => {
    db.fail("lead_segments", "insert", { code: "08006", message: "connection failure" }, 5);

    const result = await run(db, [lead()]);

    // Os leads ESTAO salvos: mandar reimportar aqui e o que duplica a base do cliente.
    expect(result.degraded).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.associated).toBe(0);
    expect(db.leads).toHaveLength(1);
  });

  it("falha DEPOIS da primeira escrita (update de icebreaker): NAO lanca, devolve degraded", async () => {
    db.seedLead({ apollo_id: "apollo-1", email: "Maria@Acme.COM", icebreaker: "antigo" });
    db.fail("leads", "update", { code: "08006", message: "connection failure" }, 5);

    const result = await run(db, [lead()]);

    expect(result.degraded).toBe(true);
    expect(result.reused).toBe(1);
    expect(result.associated).toBe(1); // a associacao (o que importa) sobreviveu
    expect(db.leads[0].icebreaker).toBe("antigo");
  });

  it("falha no segmento com leads JA na base: degraded, nunca a bolha de falha total", async () => {
    db.seedLead({ apollo_id: "apollo-1", email: "Maria@Acme.COM" });
    db.fail("segments", "insert", { code: "08006", message: "connection failure" }, 5);

    const result = await run(db, [lead()]);

    expect(result.degraded).toBe(true);
    expect(result.segmentId).toBeNull();
    expect(result.reused).toBe(1);
  });

  // ==============================================
  // VOLUME
  // ==============================================

  it("fatia queries e inserts em blocos para lotes grandes (importedLeads sem teto)", async () => {
    const many: LeadWithIcebreaker[] = Array.from({ length: 230 }, (_, i) =>
      lead({
        apolloId: `apollo-${i}`,
        email: `lead${i}@acme.com`,
        name: `Lead ${i} Sobrenome`,
      })
    );

    const result = await run(db, many);

    expect(result.inserted).toBe(230);
    expect(result.associated).toBe(230);
    expect(db.leads).toHaveLength(230);

    const leadInserts = db.log.filter((e) => e.table === "leads" && e.op === "insert");
    expect(leadInserts).toHaveLength(3); // 100 + 100 + 30
    for (const entry of leadInserts) {
      expect((entry.payload as unknown[]).length).toBeLessThanOrEqual(100);
    }

    // A LEITURA tambem e fatiada: 230 emails num unico `or=(...)` viram ~8 KB de URL e o
    // gateway/PostgREST recusa — a query lanca na Fase 1 e o usuario recebe "importe-os
    // manualmente" justamente nos lotes grandes de CSV que o chunking existe para servir.
    const emailQueries = db.log.filter((e) => e.table === "leads" && e.op === "select" && e.or);
    expect(emailQueries).toHaveLength(5); // 230 / 50
    for (const entry of emailQueries) {
      expect((entry.or ?? "").split("email.ilike.").length - 1).toBeLessThanOrEqual(50);
    }

    // A busca por `apollo_id` e fatiada pelo MESMO motivo: 230 ids num unico
    // `apollo_id=in.(...)` sao varios KB de URL. Sem este assert, remover o `chunk()`
    // daqui passa verde e lanca na Fase 1 em producao — antes de qualquer escrita, entao
    // o usuario recebe "importe-os manualmente" nos lotes que o chunking existe para servir.
    const apolloQueries = db.log.filter(
      (e) => e.table === "leads" && e.op === "select" && !e.or
    );
    expect(apolloQueries).toHaveLength(3); // 100 + 100 + 30
    for (const entry of apolloQueries) {
      const [, values] = entry.in?.find(([column]) => column === "apollo_id") ?? [];
      expect(values?.length ?? 0).toBeLessThanOrEqual(100);
    }

    const associationInserts = db.log.filter(
      (e) => e.table === "lead_segments" && e.op === "insert"
    );
    expect(associationInserts).toHaveLength(3); // 100 + 100 + 30

    // A LEITURA das associacoes existentes tambem: un-chunkada ela lanca DEPOIS dos leads
    // gravados, vira `degraded` silencioso e os leads ficam em Meus Leads mas FORA do
    // segmento pedido.
    const associationQueries = db.log.filter(
      (e) => e.table === "lead_segments" && e.op === "select"
    );
    expect(associationQueries).toHaveLength(3); // 100 + 100 + 30
    for (const entry of associationQueries) {
      const [, values] = entry.in?.find(([column]) => column === "lead_id") ?? [];
      expect(values?.length ?? 0).toBeLessThanOrEqual(100);
    }
  });

  it("lead cuja geracao de icebreaker falhou (null) NAO apaga o icebreaker ja gravado", async () => {
    // `generateIcebreakers` empurra `{ ...lead, icebreaker: null }` a cada falha, entao
    // esta entrada e rotineira. Sem o guard, o lead reusado receberia
    // `icebreaker: null, icebreaker_generated_at: <agora>` por cima de um icebreaker bom.
    db.seedLead({
      apollo_id: "apollo-1",
      email: "Maria@Acme.COM",
      icebreaker: "Icebreaker antigo",
      icebreaker_generated_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await run(db, [lead({ icebreaker: null })]);

    expect(result.reused).toBe(1);
    expect(db.leads[0].icebreaker).toBe("Icebreaker antigo");
    expect(db.leads[0].icebreaker_generated_at).toBe("2026-01-01T00:00:00.000Z");
    expect(db.log.filter((e) => e.table === "leads" && e.op === "update")).toHaveLength(0);
  });

  it("lead inedito sem icebreaker entra com icebreaker_generated_at null", async () => {
    const result = await run(db, [lead({ icebreaker: null })]);

    expect(result.inserted).toBe(1);
    expect(db.leads[0].icebreaker).toBeNull();
    expect(db.leads[0].icebreaker_generated_at).toBeNull();
  });

  it("recusa nome de segmento vazio antes de qualquer escrita", async () => {
    await expect(run(db, [lead()], "   ")).rejects.toThrow(/segmento/i);
    expect(db.leads).toHaveLength(0);
  });
});
