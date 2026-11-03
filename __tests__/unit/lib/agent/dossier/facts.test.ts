/**
 * Dossie da conta — regras deterministicas dos fatos (Story 24.19)
 */

import { describe, it, expect } from "vitest";
import {
  THEIRSTACK_SOURCE_URL,
  companyMentionTokens,
  corporateEmailDomain,
  domainBrand,
  dossierStatus,
  isOwnPost,
  isoDate,
  isThirdPartyLinkedInUrl,
  jobFacts,
  mentionsCompany,
  newsFacts,
  normalizeCompanyKey,
  pickSiteDomain,
  postFacts,
  recentPosts,
  siteFact,
  technologyFacts,
} from "@/lib/agent/dossier/facts";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const CTX = { companyName: "Bradesco Seguros", domain: "bradescoseguros.com.br", now: NOW, windowDays: 90 };

describe("normalizeCompanyKey / domainBrand / tokens", () => {
  it("normaliza nome (acento, pontuacao, sufixo societario)", () => {
    expect(normalizeCompanyKey("Aché Laboratórios S.A.")).toBe("ache laboratorios");
    expect(normalizeCompanyKey("  Banco X LTDA ")).toBe("banco x");
    expect(normalizeCompanyKey(null)).toBe("");
  });

  it("marca do dominio ignora subdominio e sufixos publicos", () => {
    expect(domainBrand("ri.bradescoseguros.com.br")).toBe("bradescoseguros");
    expect(domainBrand("https://www.embraer.com/")).toBe("embraer");
    expect(domainBrand("grupo-x.com.br")).toBe("grupox");
  });

  it("tokens: palavras significativas do nome + marca do dominio", () => {
    expect(companyMentionTokens("Bradesco Seguros", "bradescoseguros.com.br")).toEqual([
      { kind: "name", words: ["bradesco"] },
      { kind: "brand", value: "bradescoseguros" },
    ]);
    const tokens = companyMentionTokens("Bradesco Seguros", "bradescoseguros.com.br");
    expect(mentionsCompany("Grupo Bradesco Seguros anuncia novo CISO", tokens)).toBe(true);
    expect(mentionsCompany("Itaú anuncia lucro", tokens)).toBe(false);
  });

  it("nome com varias palavras exige TODAS como palavra inteira; a marca sozinha ainda vale", () => {
    const tokens = companyMentionTokens("Porto Seguro", "portoseguro.com.br");
    expect(tokens).toEqual([
      { kind: "name", words: ["porto", "seguro"] },
      { kind: "brand", value: "portoseguro" },
    ]);
    expect(mentionsCompany("Chuva forte atinge Porto Alegre", tokens)).toBe(false);
    expect(mentionsCompany("Porto Seguro anuncia resultado", tokens)).toBe(true);
    // So a marca do dominio (sem o nome) ainda conta.
    const brandOnly = companyMentionTokens("Empresa Desconhecida", "embraer.com");
    expect(mentionsCompany("Embraer recebe pedido de 26 jatos", brandOnly)).toBe(true);
  });

  it("isoDate usa o fuso de Sao Paulo (coleta depois das 21h BRT nao vira amanha)", () => {
    expect(isoDate(new Date("2026-11-04T01:30:00.000Z"))).toBe("2026-11-03");
    expect(isoDate(new Date("2026-11-04T03:30:00.000Z"))).toBe("2026-11-04");
  });

  it("dominio corporativo do e-mail ignora webmail", () => {
    expect(corporateEmailDomain("joao@BancoX.com.br")).toBe("bancox.com.br");
    expect(corporateEmailDomain("joao@gmail.com")).toBeNull();
    expect(corporateEmailDomain(null)).toBeNull();
  });
});

describe("pickSiteDomain", () => {
  const results = [
    { url: "https://www.facebook.com/marfrig", title: "Marfrig" },
    { url: "https://br.indeed.com/cmp/marfrig", title: "Vagas" },
    { url: "https://ri.marfrig.com.br/", title: "RI Marfrig" },
    { url: "https://www.marfrig.com/", title: "Marfrig Global" },
  ];

  it("ignora redes sociais e portais de vaga e prefere a marca do e-mail", () => {
    expect(pickSiteDomain(results, "marfrig.com.br")).toBe("marfrig.com.br");
  });

  it("sem e-mail corporativo, aceita host cuja marca cita o nome", () => {
    expect(pickSiteDomain(results, null, "Marfrig")).toBe("marfrig.com.br");
  });

  it("sem marca do e-mail nem nome que bata: null (evita homonimo)", () => {
    expect(pickSiteDomain([{ url: "https://sequoia.com", title: "Sequoia Capital" }], null, "Transportes Rapido")).toBeNull();
    expect(pickSiteDomain([{ url: "https://www.instagram.com/x" }], "x.com.br", "X")).toBeNull();
    expect(pickSiteDomain("nao e array", null)).toBeNull();
  });
});

describe("siteFact", () => {
  const longText = "A Bradesco Seguros oferece seguros de vida, saude, auto e residencia para pessoas e empresas em todo o Brasil. ".repeat(4);

  it("fato = titulo + trecho (<= max), fonte do site, data de hoje, confianca alta", () => {
    const fact = siteFact(
      { output: { pages: [{ title: "Bradesco Seguros", markdown: `# Bem-vindo\n\n![logo](x.png) [Saiba mais](https://x) ${longText}` }] } },
      "https://bradescoseguros.com.br",
      NOW,
      500
    );
    expect(fact).not.toBeNull();
    expect(fact!.kind).toBe("site");
    expect(fact!.fonte_url).toBe("https://bradescoseguros.com.br");
    expect(fact!.data).toBe("2026-11-03");
    expect(fact!.confianca).toBe("alta");
    expect(fact!.fato.startsWith("Bradesco Seguros — ")).toBe(true);
    expect(fact!.fato.length).toBeLessThanOrEqual(500);
    expect(fact!.fato).not.toContain("![");
    expect(fact!.fato).not.toContain("https://");
  });

  it("menos de 200 caracteres uteis: sem fato", () => {
    expect(siteFact({ output: { pages: [{ markdown: "curto" }] } }, "https://x.com", NOW, 500)).toBeNull();
    expect(siteFact({ output: { pages: [] } }, "https://x.com", NOW, 500)).toBeNull();
    expect(siteFact(null, "https://x.com", NOW, 500)).toBeNull();
  });
});

describe("newsFacts", () => {
  const exa = {
    results: [
      { url: "https://valor.globo.com/a", title: "Grupo Bradesco Seguros anuncia novo CISO", publishedDate: "2026-09-28T10:00:00.000Z" },
      { url: "https://exame.com/b", title: "Seguradoras ampliam investimento", text: "A Bradesco Seguros lidera...", publishedDate: "2026-10-10T00:00:00Z" },
      { url: "https://x.com/c", title: "Sem mencao a ninguem", publishedDate: "2026-10-10T00:00:00Z" },
      { url: "https://www.linkedin.com/posts/fulano", title: "Bradesco Seguros contrata", publishedDate: "2026-10-10T00:00:00Z" },
      { url: "https://old.com/d", title: "Bradesco Seguros em 2025", publishedDate: "2025-01-01T00:00:00Z" },
      { url: "https://nodate.com/e", title: "Bradesco Seguros sem data" },
      { url: "ftp://bad/f", title: "Bradesco Seguros ftp", publishedDate: "2026-10-10T00:00:00Z" },
    ],
  };

  it("mantem so noticias datadas na janela que citam a empresa, fora de redes sociais", () => {
    const facts = newsFacts(exa, CTX, 5);
    expect(facts.map((f) => f.fonte_url)).toEqual(["https://valor.globo.com/a", "https://exame.com/b"]);
    expect(facts[0]).toMatchObject({ kind: "news", confianca: "alta", data: "2026-09-28" });
    expect(facts[1]).toMatchObject({ confianca: "media", data: "2026-10-10" });
  });

  it("respeita o maximo e trunca o titulo em 200", () => {
    const many = {
      results: Array.from({ length: 8 }, (_, i) => ({
        url: `https://n.com/${i}`,
        title: `Bradesco Seguros ${"x".repeat(300)}`,
        publishedDate: "2026-10-01",
      })),
    };
    const facts = newsFacts(many, CTX, 5);
    expect(facts).toHaveLength(5);
    expect(facts[0].fato.length).toBeLessThanOrEqual(200);
  });
});

describe("jobFacts", () => {
  it("exige termo de vaga + termo de area + mencao, descarta LinkedIn de terceiros", () => {
    const exa = {
      results: [
        { url: "https://gupy.io/1", title: "Vaga Analista de Segurança da Informação - Bradesco Seguros", publishedDate: "2026-10-20" },
        { url: "https://gupy.io/2", title: "Vaga Analista Financeiro - Bradesco Seguros", publishedDate: "2026-10-20" },
        { url: "https://www.linkedin.com/in/fulano", title: "Hiring Cloud Engineer at Bradesco Seguros", publishedDate: "2026-10-20" },
        { url: "https://jobs.com/3", title: "Oportunidade Cloud Engineer", text: "na Bradesco Seguros", publishedDate: "2026-10-21" },
        { url: "https://jobs.com/4", title: "Vaga DevSecOps em outra empresa", publishedDate: "2026-10-21" },
      ],
    };
    const facts = jobFacts(exa, CTX, 5);
    expect(facts.map((f) => f.fonte_url)).toEqual(["https://gupy.io/1", "https://jobs.com/3"]);
    expect(facts.every((f) => f.kind === "job" && f.confianca === "media")).toBe(true);
  });

  it("'redes' de infraestrutura conta; 'redes sociais' nao", () => {
    const exa = {
      results: [
        { url: "https://j.com/1", title: "Vaga Analista de Redes Sociais - Bradesco Seguros", publishedDate: "2026-10-20" },
        { url: "https://j.com/2", title: "Vaga Social Media rede social - Bradesco Seguros", publishedDate: "2026-10-20" },
        { url: "https://j.com/3", title: "Vaga Analista de Redes e Telecom - Bradesco Seguros", publishedDate: "2026-10-20" },
      ],
    };
    expect(jobFacts(exa, CTX, 5).map((f) => f.fonte_url)).toEqual(["https://j.com/3"]);
  });

  it("identifica post/perfil de terceiro no LinkedIn", () => {
    expect(isThirdPartyLinkedInUrl("https://www.linkedin.com/posts/abc")).toBe(true);
    expect(isThirdPartyLinkedInUrl("https://br.linkedin.com/in/abc")).toBe(true);
    expect(isThirdPartyLinkedInUrl("https://www.linkedin.com/jobs/view/1")).toBe(false);
  });
});

describe("technologyFacts", () => {
  it("so high/medium, sem duplicata, fonte TheirStack, confianca mapeada", () => {
    const facts = technologyFacts(
      [
        { technology: { name: "AWS" }, confidence: "high" },
        { technology: { name: "Fortinet" }, confidence: "medium" },
        { technology: { name: "Moda" }, confidence: "low" },
        { technology: { name: "aws" }, confidence: "high" },
        { technology: { name: "" }, confidence: "high" },
      ],
      "2026-11-01",
      10
    );
    expect(facts).toEqual([
      { kind: "technology", fato: "AWS", fonte_url: THEIRSTACK_SOURCE_URL, data: "2026-11-01", confianca: "alta" },
      { kind: "technology", fato: "Fortinet", fonte_url: THEIRSTACK_SOURCE_URL, data: "2026-11-01", confianca: "media" },
    ]);
    expect(technologyFacts(null, "2026-11-01", 10)).toEqual([]);
  });
});

describe("posts", () => {
  const posts = [
    { postUrl: "https://linkedin.com/feed/update/1", text: "Falando sobre zero trust e SOC " + "y".repeat(400), publishedAt: "2026-10-01T00:00:00Z" },
    { postUrl: "https://linkedin.com/feed/update/2", text: "Post antigo", publishedAt: "2025-01-01T00:00:00Z" },
    { postUrl: "", text: "Sem url", publishedAt: "2026-10-01T00:00:00Z" },
  ];

  it("recentPosts filtra janela, url e texto; postFacts limita 280 e leva o lead", () => {
    const recent = recentPosts(posts, NOW, 90, 10);
    expect(recent).toHaveLength(1);
    const facts = postFacts(recent, { apolloId: "ap-1", email: "a@b.com" }, NOW, 90);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "post",
      confianca: "alta",
      data: "2026-10-01",
      lead_apollo_id: "ap-1",
      lead_email: "a@b.com",
      fonte_url: "https://linkedin.com/feed/update/1",
    });
    expect(facts[0].fato.length).toBeLessThanOrEqual(280);
  });
});

describe("isOwnPost", () => {
  it("sem autor: assume o proprio lead; com autor: exige primeiro e ultimo nome", () => {
    expect(isOwnPost({}, "Rui Silva")).toBe(true);
    expect(isOwnPost({ authorName: "Rui Carlos Silva" }, "Rui Silva")).toBe(true);
    expect(isOwnPost({ authorName: "Ana Souza" }, "Rui Silva")).toBe(false);
    expect(isOwnPost({ authorName: "Rui Souza" }, "Rui Silva")).toBe(false);
    expect(isOwnPost({ authorName: "Joao" }, "")).toBe(false);
  });
});

describe("dossierStatus", () => {
  const fact = { kind: "site" as const, fato: "x", fonte_url: "https://x.com", data: "2026-11-03", confianca: "alta" as const };
  it("empty sem fatos; partial com fonte falha; complete senao", () => {
    expect(dossierStatus([], ["news"])).toBe("empty");
    expect(dossierStatus([], [])).toBe("empty");
    expect(dossierStatus([fact], ["news"])).toBe("partial");
    expect(dossierStatus([fact], [])).toBe("complete");
  });
});
