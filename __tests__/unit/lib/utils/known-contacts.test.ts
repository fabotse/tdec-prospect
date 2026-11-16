/**
 * Known contacts utils tests
 * Story 25.1 - Contatos conhecidos
 */

import { describe, it, expect } from "vitest";
import {
  buildLinkedinQuery,
  normalizeKnownContactInput,
  normalizeLinkedinProfileUrl,
  parseKnownContactRelation,
  parseKnownContactsCsv,
  pickLinkedinCandidates,
  KNOWN_CONTACTS_CSV_MISSING_COLUMN,
} from "@/lib/utils/known-contacts";
import { KNOWN_CONTACT_ERRORS } from "@/types/known-contact";

describe("normalizeLinkedinProfileUrl", () => {
  it.each([
    ["https://br.linkedin.com/in/Joao-Silva/?trk=x", "https://www.linkedin.com/in/joao-silva"],
    ["https://www.linkedin.com/in/joao-silva", "https://www.linkedin.com/in/joao-silva"],
    ["linkedin.com/in/joao-silva/", "https://www.linkedin.com/in/joao-silva"],
    ["www.linkedin.com/in/joao-silva#about", "https://www.linkedin.com/in/joao-silva"],
    ["http://linkedin.com/in/joao-silva", "https://www.linkedin.com/in/joao-silva"],
    ["  https://pt.linkedin.com/in/joao-silva/en  ", "https://www.linkedin.com/in/joao-silva"],
    ["https://www.linkedin.com/in/jo%C3%A3o-silva", "https://www.linkedin.com/in/joão-silva"],
    ["https://WWW.LINKEDIN.COM/IN/ABC", "https://www.linkedin.com/in/abc"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeLinkedinProfileUrl(raw)).toBe(expected);
  });

  it.each([
    ["linkedin.com/company/x"],
    ["joao"],
    [""],
    ["   "],
    ["https://www.linkedin.com/in/"],
    ["https://evil.com/in/joao"],
    ["https://linkedin.com.evil.com/in/joao"],
    ["ftp://linkedin.com/in/joao"],
    ["https://www.linkedin.com/pub/joao"],
    ["https://www.linkedin.com/in/%E0%A4%A"],
  ])("%s → null", (raw) => {
    expect(normalizeLinkedinProfileUrl(raw)).toBeNull();
  });

  it("não string → null", () => {
    expect(normalizeLinkedinProfileUrl(null)).toBeNull();
    expect(normalizeLinkedinProfileUrl(undefined)).toBeNull();
  });
});

describe("parseKnownContactRelation", () => {
  it.each([
    ["cliente_atual", "cliente_atual"],
    ["Cliente atual", "cliente_atual"],
    ["cliente", "cliente_atual"],
    ["CLIENTE", "cliente_atual"],
    ["ex cliente", "ex_cliente"],
    ["Ex-cliente", "ex_cliente"],
    ["ex_cliente", "ex_cliente"],
    ["parceiro", "parceiro"],
    ["Reunião marcada", "reuniao_marcada"],
    ["reuniao_marcada", "reuniao_marcada"],
  ])("%s → %s", (raw, expected) => {
    expect(parseKnownContactRelation(raw)).toBe(expected);
  });

  it.each([["fornecedor"], [""], ["  "]])("%s → null", (raw) => {
    expect(parseKnownContactRelation(raw)).toBeNull();
  });
});

describe("normalizeKnownContactInput", () => {
  const base = {
    fullName: "  João   Silva ",
    title: " CTO ",
    companyName: " Acme ",
    companyDomain: "",
    linkedinUrl: "https://br.linkedin.com/in/Joao-Silva/?trk=x",
    relationType: "cliente_atual",
  };

  it("normaliza nome, cargo, empresa e LinkedIn", () => {
    expect(normalizeKnownContactInput(base)).toEqual({
      ok: true,
      data: {
        full_name: "João Silva",
        title: "CTO",
        company_name: "Acme",
        company_domain: null,
        linkedin_url: "https://www.linkedin.com/in/joao-silva",
        relation_type: "cliente_atual",
      },
    });
  });

  it("domínio normalizado e LinkedIn vazio vira null", () => {
    const res = normalizeKnownContactInput({
      ...base,
      companyName: "",
      companyDomain: "https://www.Acme.com.br/contato",
      linkedinUrl: " ",
    });
    expect(res).toMatchObject({
      ok: true,
      data: { company_name: null, company_domain: "acme.com.br", linkedin_url: null },
    });
  });

  it.each([
    [{ fullName: " " }, KNOWN_CONTACT_ERRORS.missingName],
    [{ companyName: "", companyDomain: "" }, KNOWN_CONTACT_ERRORS.missingCompany],
    [{ companyDomain: "joao@acme.com" }, KNOWN_CONTACT_ERRORS.invalidDomain],
    [{ companyDomain: "nao e dominio" }, KNOWN_CONTACT_ERRORS.invalidDomain],
    [{ linkedinUrl: "linkedin.com/company/x" }, KNOWN_CONTACT_ERRORS.invalidLinkedin],
    [{ linkedinUrl: "joao" }, KNOWN_CONTACT_ERRORS.invalidLinkedin],
    [{ relationType: "outro" }, "Relação inválida"],
  ])("rejeita %o", (override, error) => {
    expect(normalizeKnownContactInput({ ...base, ...override })).toEqual({ ok: false, error });
  });
});

describe("parseKnownContactsCsv", () => {
  it("lê o formato completo com ; e acento no cabeçalho", () => {
    const csv =
      "﻿Nome;Cargo;Empresa;Domínio;LinkedIn;Relação\n" +
      "João;CTO;Acme;acme.com;linkedin.com/in/joao;cliente\n" +
      "\n" +
      "Maria;;Beta;;;parceiro\n";
    const res = parseKnownContactsCsv(csv);
    expect(res).toEqual({
      success: true,
      rows: [
        {
          line: 2,
          fullName: "João",
          title: "CTO",
          companyName: "Acme",
          companyDomain: "acme.com",
          linkedinUrl: "linkedin.com/in/joao",
          relation: "cliente",
        },
        {
          line: 4,
          fullName: "Maria",
          title: "",
          companyName: "Beta",
          companyDomain: "",
          linkedinUrl: "",
          relation: "parceiro",
        },
      ],
    });
  });

  it("aceita os nomes alternativos de coluna", () => {
    const res = parseKnownContactsCsv(
      "name,title,company,website,linkedin_url,tipo de relacao\nA,B,C,d.com,,ex cliente"
    );
    expect(res.success && res.rows[0]).toMatchObject({
      fullName: "A",
      title: "B",
      companyName: "C",
      companyDomain: "d.com",
      relation: "ex cliente",
    });
  });

  it.each([["empresa;relacao\nAcme;cliente"], ["nome;empresa\nJoão;Acme"], [""]])(
    "sem coluna de nome ou relação → erro",
    (csv) => {
      expect(parseKnownContactsCsv(csv)).toEqual({
        success: false,
        error: KNOWN_CONTACTS_CSV_MISSING_COLUMN,
      });
    }
  );
});

describe("buildLinkedinQuery", () => {
  it("usa a empresa quando há", () => {
    expect(buildLinkedinQuery("João Silva", "Acme", "acme.com")).toBe(
      '"João Silva" Acme site:linkedin.com/in'
    );
  });

  it("cai no domínio sem empresa e tira aspas do nome", () => {
    expect(buildLinkedinQuery('João "JJ" Silva', "", "acme.com")).toBe(
      '"João JJ Silva" acme.com site:linkedin.com/in'
    );
  });
});

describe("pickLinkedinCandidates", () => {
  it("só perfis /in/, deduplicados, máx. 5, com título e trecho", () => {
    const results = [
      { url: "https://www.linkedin.com/company/acme", title: "Acme", snippet: "empresa" },
      { url: "https://br.linkedin.com/in/joao", title: "João - CTO", snippet: "CTO na Acme" },
      { url: "https://www.linkedin.com/in/joao/", title: "dup", snippet: "dup" },
      { url: "https://www.linkedin.com/in/a" },
      { url: "https://www.linkedin.com/in/b", title: "B" },
      { url: "https://www.linkedin.com/in/c", title: "C" },
      { url: "https://www.linkedin.com/in/d", title: "D" },
      { url: "https://www.linkedin.com/in/e", title: "E" },
      null,
      { title: "sem url" },
    ];
    const out = pickLinkedinCandidates(results);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({
      url: "https://www.linkedin.com/in/joao",
      title: "João - CTO",
      snippet: "CTO na Acme",
    });
    expect(out[1]).toEqual({ url: "https://www.linkedin.com/in/a", title: "", snippet: "" });
    expect(out.map((c) => c.url)).not.toContain("https://www.linkedin.com/in/e");
  });

  it("não array → []", () => {
    expect(pickLinkedinCandidates(undefined)).toEqual([]);
    expect(pickLinkedinCandidates({ results: [] })).toEqual([]);
  });
});
