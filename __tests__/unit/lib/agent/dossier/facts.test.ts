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
  cleanSiteText,
  isOutsideBrazil,
  isOwnPost,
  isoDate,
  looksSpanish,
  mentionsBrazil,
  mentionsForeignPlace,
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

describe("siteFact — menu da pagina (FEL-57)", () => {
  const about =
    "Somos uma empresa brasileira de seguranca da informacao com mais de 20 anos de mercado, atendendo bancos, seguradoras e o varejo com SOC 24x7, resposta a incidentes e consultoria em nuvem. ";
  const NAV = "Pular para o conteúdo Fale com um especialista Login PT EN ES…";

  it("exemplo real: menu numa linha so, colado no texto, sai do fato", () => {
    const fact = siteFact({ output: { pages: [{ title: "Acme Sec", markdown: `${NAV} ${about.repeat(2)}` }] } }, "https://acme.com.br", NOW, 500);
    expect(fact).not.toBeNull();
    expect(fact!.fato.startsWith("Acme Sec — Somos uma empresa brasileira")).toBe(true);
    for (const junk of ["Pular para o conteúdo", "Fale com um especialista", "Login", "PT EN ES"]) {
      expect(fact!.fato).not.toContain(junk);
    }
  });

  it("menu em linhas de markdown (skip link, CTA, login, idiomas) sai; o conteudo fica", () => {
    const markdown = [
      "[Pular para o conteúdo](#main)",
      "* [Fale com um especialista](/contato)",
      "* [Login](/login)",
      "[PT](/pt) | [EN](/en) | [ES](/es)",
      "Menu",
      `# Seguranca para o seu negocio`,
      about,
      about,
    ].join("\n");
    const text = cleanSiteText(markdown);
    expect(text.startsWith("Seguranca para o seu negocio Somos uma empresa")).toBe(true);
    expect(text).not.toMatch(/Pular|especialista|Login|\bPT\b|\bEN\b|\bES\b|Menu/);
  });

  it("frases comerciais com palavras de menu ficam intactas (sem evidencia de navegacao)", () => {
    for (const phrase of [
      "Soluções em segurança para empresas.",
      "Home office seguro para times distribuidos.",
      "A empresa",
      "Suporte ao cliente e especialistas para empresas de todos os portes.",
      "Fale com um especialista e agende uma demonstração do nosso SOC.",
      "Contato direto com o time de resposta a incidentes.",
    ]) {
      expect(cleanSiteText(`${phrase} ${about}`).startsWith(phrase)).toBe(true);
      // Tambem como linha propria (titulo/paragrafo curto), nao so colada no texto.
      expect(cleanSiteText(`${phrase}\n${about}`).startsWith(phrase)).toBe(true);
    }
  });

  it("regressao: skip link numa linha nao corta a linha de conteudo seguinte", () => {
    const text = cleanSiteText("[Pular para o conteúdo](#main)\nSuporte ao cliente e especialistas para empresas de todos os portes.");
    expect(text).toBe("Suporte ao cliente e especialistas para empresas de todos os portes.");
    // Seletor de idioma numa linha tambem nao corta a linha seguinte.
    expect(cleanSiteText("PT EN ES\nFale com um especialista e agende uma demonstração.")).toBe(
      "Fale com um especialista e agende uma demonstração."
    );
    // O exemplo original (tudo numa linha so) continua limpo.
    expect(cleanSiteText(`${NAV} ${about}`).startsWith("Somos uma empresa brasileira")).toBe(true);
  });

  it("menu com separadores e linha so de links sai; paragrafo com link no meio fica", () => {
    const text = cleanSiteText(
      ["Home | Sobre | Soluções | Contato", "[Blog](/blog) [Carreiras](/carreiras)", `Conheça a [plataforma](/p) que protege bancos. ${about}`].join("\n")
    );
    expect(text.startsWith("Conheça a plataforma que protege bancos.")).toBe(true);
  });

  it("<script>/<style> multilinha (e comentario HTML) nao vazam para o texto, em HTML e em markdown", () => {
    const html = [
      "<html><head><style>",
      "body { color: red; }",
      ".menu { display: none; }",
      "</style>",
      '<script type="text/javascript">',
      "window.dataLayer = window.dataLayer || [];",
      "function gtag(){dataLayer.push(arguments);}",
      "</script><!-- comentario",
      "multilinha -->",
      `</head><body><p>${about}</p></body></html>`,
    ].join("\n");
    const fromHtml = cleanSiteText(html);
    expect(fromHtml.startsWith("Somos uma empresa brasileira")).toBe(true);
    expect(fromHtml).not.toMatch(/color|display|dataLayer|gtag|comentario|multilinha/);

    const markdown = `# Acme\n\n<script>\nvar x = 1;\nconsole.log(x);\n</script>\n\n${about}\n<style>\n.a{b:c}\n</style>`;
    const fromMarkdown = cleanSiteText(markdown);
    expect(fromMarkdown).not.toMatch(/var x|console|\.a\{|b:c/);
    expect(fromMarkdown).toContain("Somos uma empresa brasileira");
  });

  it("sobrou pouco depois da limpeza: usa a meta description / og:description", () => {
    const description = "Consultoria em seguranca da informacao e SOC 24x7 para bancos e seguradoras no Brasil.";
    const viaMeta = siteFact(
      { output: { pages: [{ title: "Acme Sec", markdown: `${NAV}\nBem-vindo`, metadata: { "og:description": description } }] } },
      "https://acme.com.br",
      NOW,
      500
    );
    expect(viaMeta!.fato).toBe(`Acme Sec — ${description}`);
    const viaDescription = siteFact(
      { output: { pages: [{ markdown: NAV, description }] } },
      "https://acme.com.br",
      NOW,
      500
    );
    expect(viaDescription!.fato).toBe(description);
  });

  it("so menu e sem description util: sem fato", () => {
    expect(siteFact({ output: { pages: [{ title: "Acme", markdown: NAV.repeat(10) }] } }, "https://acme.com.br", NOW, 500)).toBeNull();
    expect(
      siteFact({ output: { pages: [{ markdown: NAV, metadata: { description: "curta" } }] } }, "https://acme.com.br", NOW, 500)
    ).toBeNull();
  });
});

describe("newsFacts — fora do Brasil (FEL-57)", () => {
  const ctx = { companyName: "Santos Brasil", domain: "santosbrasil.com.br", now: NOW, windowDays: 90 };
  const acme = { companyName: "Acme", domain: "acme.com.br", now: NOW, windowDays: 90 };

  it("caso da issue (dataportuaria.com, espanhol, fato de porto estrangeiro): descartado", () => {
    // Evidencia que derruba: cita porto/pais estrangeiro (San Antonio, Chile), nao cita o
    // Brasil nem localidade brasileira (o nome "Santos Brasil" nao conta) E a publicacao
    // e estrangeira (texto em espanhol).
    const exa = {
      results: [
        {
          url: "https://dataportuaria.com/noticia/santos-brasil-chile",
          title: "Santos Brasil anunció una nueva inversión en el puerto de San Antonio, Chile",
          text: "La compañía informó que el proyecto del terminal de contenedores estará listo en 2027.",
          publishedDate: "2026-10-01T00:00:00.000Z",
        },
        {
          url: "https://valor.globo.com/empresas/santos-brasil",
          title: "Santos Brasil anuncia investimento de R$ 1 bilhão no terminal de Santos",
          publishedDate: "2026-10-02T00:00:00.000Z",
        },
      ],
    };
    expect(newsFacts(exa, ctx, 5).map((f) => f.fonte_url)).toEqual(["https://valor.globo.com/empresas/santos-brasil"]);
  });

  it("dataportuaria.com em espanhol sobre o porto de SANTOS fica (fato brasileiro, publicacao estrangeira)", () => {
    const exa = {
      results: [
        {
          url: "https://dataportuaria.com/noticia/santos-brasil-anuncio",
          title: "Santos Brasil anunció una nueva inversión en el puerto de Santos para ampliar su terminal",
          text: "La compañía informó que el proyecto de expansión del terminal de contenedores estará listo en 2027.",
          publishedDate: "2026-10-01T00:00:00.000Z",
        },
      ],
    };
    expect(newsFacts(exa, ctx, 5)).toHaveLength(1);
  });

  it("regressao: fonte .pt em espanhol sobre Santos/Vitoria (com e sem acento) fica, em noticias e vagas", () => {
    const titles = [
      "Acme amplía su terminal en Santos",
      "Acme amplía su terminal en Vitória",
      "Acme amplía su terminal en Vitoria",
      "Acme amplía su terminal en Paranaguá",
      "Acme invierte en el puerto de Itajaí y en Suape",
      "Acme abre oficina en São Francisco do Sul",
      "Acme llega a Pecém con nuevo terminal",
    ];
    const news = { results: titles.map((title, i) => ({ url: `https://eco.sapo.pt/${i}`, title, publishedDate: "2026-10-01" })) };
    expect(newsFacts(news, acme, 10)).toHaveLength(titles.length);

    const jobs = {
      results: [
        { url: "https://eco.sapo.pt/v1", title: "Oportunidades: analista de redes en Acme, Santos", publishedDate: "2026-10-20" },
        { url: "https://eco.sapo.pt/v2", title: "Oportunidades: analista de redes en Acme, Vitória", publishedDate: "2026-10-20" },
      ],
    };
    expect(jobFacts(jobs, acme, 5).map((f) => f.fonte_url)).toEqual(["https://eco.sapo.pt/v1", "https://eco.sapo.pt/v2"]);
  });

  it("lista ampliada: porto/cidade brasileira (com e sem acento) segura a noticia mesmo citando lugar estrangeiro", () => {
    const places = ["Santos", "Vitória", "Vitoria", "Paranaguá", "Paranagua", "Itajaí", "Suape", "Pecém", "Rio Grande", "Itaguaí", "São Francisco do Sul", "Manaus", "Campinas", "Natal", "Goiânia"];
    for (const place of places) {
      const title = `Acme cierra la operación en Buenos Aires y amplía su terminal en ${place}`;
      expect(mentionsBrazil(title, "Acme", "acme.com.br")).toBe(true);
      expect(isOutsideBrazil("https://eco.sapo.pt/x", { title }, acme)).toBe(false);
    }
    // Sem o lugar brasileiro, o mesmo texto cai (fato e publicacao estrangeiros).
    expect(isOutsideBrazil("https://eco.sapo.pt/x", { title: "Acme cierra la operación en Buenos Aires" }, acme)).toBe(true);
  });

  it("na duvida fica: espanhol/ccTLD estrangeiro SEM lugar nenhum e portugues citando outro pais", () => {
    const exa = {
      results: [
        { url: "https://eco.sapo.pt/a", title: "Acme amplía su terminal de contenedores", publishedDate: "2026-10-01" },
        { url: "https://news.com/b", title: "El grupo Acme anunció los resultados del año", publishedDate: "2026-10-01" },
        // Veiculo brasileiro em .com, portugues, fato com a Argentina: fica.
        { url: "https://valor.globo.com/c", title: "Acme fecha contrato de exportação com a Argentina", publishedDate: "2026-10-01" },
        { url: "https://exame.com/d", title: "Acme exporta para a China e o Chile", publishedDate: "2026-10-01" },
      ],
    };
    expect(newsFacts(exa, acme, 5)).toHaveLength(4);
  });

  it("cobertura estrangeira de fato brasileiro fica; fato estrangeiro em publicacao estrangeira cai", () => {
    const exa = {
      results: [
        { url: "https://www.eleconomista.com.mx/a", title: "Santos Brasil amplía su terminal en São Paulo", publishedDate: "2026-10-01" },
        { url: "https://eco.sapo.pt/b", title: "Operadora brasileira Santos Brasil compra terminal", publishedDate: "2026-10-01" },
        { url: "https://www.elpais.es/c", title: "Santos Brasil invierte en el puerto", text: "La inversión en Rio de Janeiro suma 300 millones.", publishedDate: "2026-10-01" },
        { url: "https://news.com/d", title: "El grupo Santos Brasil anunció una inversión en Buenos Aires con los socios", publishedDate: "2026-10-01" },
        { url: "https://news.com/e", title: "El fondo de El Salvador compra parte de Santos Brasil y sus terminales", publishedDate: "2026-10-01" },
        { url: "https://www.clarin.com.ar/f", title: "Santos Brasil amplia terminal en Bahía Blanca", publishedDate: "2026-10-01" },
      ],
    };
    expect(newsFacts(exa, ctx, 10).map((f) => f.fonte_url)).toEqual([
      "https://www.eleconomista.com.mx/a",
      "https://eco.sapo.pt/b",
      "https://www.elpais.es/c",
    ]);
  });

  it("mentionsBrazil / mentionsForeignPlace ignoram o nome da empresa e a marca do dominio", () => {
    expect(mentionsBrazil("Santos Brasil amplia terminal", "Santos Brasil", "santosbrasil.com.br")).toBe(false);
    expect(mentionsBrazil("Santos Brasil amplia terminal em Pernambuco", "Santos Brasil", "santosbrasil.com.br")).toBe(true);
    expect(mentionsBrazil("Empresa brasileña invierte", null, "x.com")).toBe(true);
    expect(mentionsBrazil("Banco do Brasil lucra", "Banco do Brasil", "bb.com.br")).toBe(false);
    expect(mentionsBrazil("Acme llega a Vitória", "Acme", "acme.com.br")).toBe(true);
    expect(mentionsBrazil("Acme abre planta en Bahía Blanca", "Acme", "acme.com.br")).toBe(false);
    expect(mentionsForeignPlace("Banco de Chile lucra", "Banco de Chile", "bancochile.cl")).toBe(false);
    expect(mentionsForeignPlace("A Acme usa IA no atendimento", "Acme", "acme.com.br")).toBe(false);
  });

  it("vagas seguem o mesmo filtro", () => {
    const exa = {
      results: [
        { url: "https://empleos.com/1", title: "Oportunidades: analista de seguridad de la información y redes en Santos Brasil, Buenos Aires", publishedDate: "2026-10-20" },
        { url: "https://gupy.io/2", title: "Vaga Analista de Segurança da Informação - Santos Brasil", publishedDate: "2026-10-20" },
        { url: "https://empleos.com/3", title: "Oportunidades: analista de seguridad de la información y redes en Santos Brasil, São Paulo", publishedDate: "2026-10-20" },
      ],
    };
    expect(jobFacts(exa, ctx, 5).map((f) => f.fonte_url)).toEqual(["https://gupy.io/2", "https://empleos.com/3"]);
  });

  it("detector de idioma e .br: na duvida, nao e espanhol; .br nunca cai", () => {
    expect(looksSpanish("¿Qué pasa con el puerto?")).toBe(true);
    expect(looksSpanish("El grupo anunció los resultados del año")).toBe(true);
    expect(looksSpanish("Grupo anuncia os resultados do ano e a expansão")).toBe(false);
    expect(looksSpanish("Santos Brasil")).toBe(false);
    expect(looksSpanish("")).toBe(false);
    expect(isOutsideBrazil("https://foo.com.br/x", { title: "El grupo anunció en Buenos Aires los resultados" }, ctx)).toBe(false);
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

describe("siteFact — menu colado no inicio do texto (FEL-77)", () => {
  const body =
    "Contrate a gestão de contratos que acelera vendas, reduz riscos e organiza toda a operação jurídica da sua empresa, com assinatura eletrônica, alertas de vencimento e relatórios completos para o time. ";
  const CONTRAKTOR_NAV = "Produtos Soluções Recursos Parceiros Preços Entrar Teste grátis";

  it("caso real da Contraktor: menu sem quebra de linha sai do fato", () => {
    const fact = siteFact(
      { output: { pages: [{ title: "Contraktor", markdown: `${CONTRAKTOR_NAV} ${body.repeat(2)}` }] } },
      "https://contraktor.com.br",
      NOW,
      500
    );
    expect(fact).not.toBeNull();
    expect(fact!.fato.startsWith("Contraktor — Contrate a gestão de contratos")).toBe(true);
    for (const junk of ["Produtos", "Soluções Recursos", "Parceiros", "Preços", "Entrar", "Teste grátis"]) {
      expect(fact!.fato).not.toContain(junk);
    }
  });

  it.each([
    ["so com login", "Produtos Soluções Recursos Parceiros Preços Entrar"],
    ["com Fale com vendas", "Produtos Soluções Planos Clientes Blog Fale com vendas Entrar"],
    ["com Fale conosco e Sobre", "Sobre Produtos Clientes Contato Fale conosco"],
    ["em ingles", "Products Solutions Resources Partners Pricing Login"],
    ["em ingles com CTA", "Products Solutions Resources Partners Pricing Login Start free trial"],
  ])("menu %s no inicio sai", (_label, nav) => {
    expect(cleanSiteText(`${nav} ${body}`)).toBe(body.trim());
  });

  it("menu sem CTA: corta os itens seguidos de outro item; o ultimo fica (na duvida, nao corta)", () => {
    // "Preços" antes de "Contrate" pode ser comeco comercial: sobra de menu > cortar conteudo.
    expect(cleanSiteText(`Produtos Soluções Recursos Parceiros Preços ${body}`)).toBe(`Preços ${body}`.trim());
  });

  it("rodada 1 do Codex: palavra comercial seguida de nome proprio depois do menu NAO e cortada", () => {
    const commercial = "Produtos Microsoft para sua empresa crescer com segurança e produtividade em todos os times. ";
    expect(cleanSiteText(`Home Produtos Soluções Recursos ${commercial}${body}`)).toBe(`${commercial}${body}`.trim());
  });

  it.each([
    "Soluções completas para gestão de contratos em uma única plataforma.",
    "Produtos Microsoft para sua empresa crescer com segurança.",
    "Teste grátis por 14 dias, sem cartão de crédito.",
    "Planos a partir de R$ 99 por mês para equipes pequenas.",
    "Clientes como Ambev e iFood confiam na Contraktor.",
    "Recursos de assinatura eletrônica e alertas de vencimento.",
  ])("frase comercial DEPOIS do menu da Contraktor fica inteira: %s", (phrase) => {
    expect(cleanSiteText(`${CONTRAKTOR_NAV} ${phrase} ${body}`)).toBe(`${phrase} ${body}`.trim());
  });

  it.each([
    "Produtos Microsoft para sua empresa crescer com segurança.",
    "Soluções completas para gestão de contratos.",
    "Planos a partir de R$ 99 por mês.",
  ])("frase comercial depois de menu SEM CTA fica inteira: %s", (phrase) => {
    const result = cleanSiteText(`Home Produtos Soluções Recursos Parceiros ${phrase} ${body}`);
    expect(result.endsWith(`${phrase} ${body}`.trim())).toBe(true);
  });

  it("menu colado depois do skip link (limpeza do FEL-57) tambem sai", () => {
    expect(cleanSiteText(`Pular para o conteúdo ${CONTRAKTOR_NAV} ${body}`)).toBe(body.trim());
  });

  it("frases comerciais que comecam com palavras de menu NAO sao cortadas", () => {
    for (const phrase of [
      "Soluções completas para gestão de contratos em uma única plataforma.",
      "Produtos e serviços para a gestão de contratos.",
      "Produtos Contraktor ajudam times jurídicos a crescer.",
      "Recursos de assinatura eletrônica e alertas de vencimento.",
      "Planos a partir de R$ 99 por mês para equipes pequenas.",
      "Teste grátis por 14 dias, sem cartão de crédito.",
      "Clientes como Ambev e iFood confiam na Contraktor.",
      "Products and solutions for contract management teams.",
    ]) {
      expect(cleanSiteText(`${phrase} ${body}`).startsWith(phrase)).toBe(true);
    }
  });

  it("menos de 4 itens de menu no inicio: nada e cortado", () => {
    const text = `Produtos Soluções Preços ${body}`;
    expect(cleanSiteText(text)).toBe(text.trim());
  });

  it("item de menu seguido de minuscula encerra a sequencia (comeco de frase fica)", () => {
    expect(cleanSiteText(`Blog Contato Login Clientes Planos a partir de R$ 99 por mês. ${body}`)).toBe(
      `Planos a partir de R$ 99 por mês. ${body}`.trim()
    );
  });

  it("so menu: nada sobra e o fallback de hoje (description) continua valendo", () => {
    expect(cleanSiteText(CONTRAKTOR_NAV)).toBe(CONTRAKTOR_NAV);
    const description = "Plataforma de gestão de contratos com assinatura eletrônica para empresas no Brasil.";
    const fact = siteFact(
      { output: { pages: [{ title: "Contraktor", markdown: `${CONTRAKTOR_NAV} Bem-vindo`, description }] } },
      "https://contraktor.com.br",
      NOW,
      500
    );
    expect(fact!.fato).toBe(`Contraktor — ${description}`);
  });
});
