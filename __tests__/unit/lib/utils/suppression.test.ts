/**
 * Suppression utils tests
 * Story 23.5 - Lista de supressão: cadastro e import
 */

import { describe, it, expect } from "vitest";
import {
  normalizeSuppressionValue,
  parseSuppressionReason,
  parseSuppressionCsv,
  SUPPRESSION_CSV_MISSING_COLUMN,
} from "@/lib/utils/suppression";
import { isNonAdminSettingsPath } from "@/lib/auth/settings-access";

describe("normalizeSuppressionValue", () => {
  it.each([
    ["https://WWW.Empresa.com.br/contato?x=1", "domain", "empresa.com.br"],
    ["@empresa.com", "domain", "empresa.com"],
    [" Joao@Empresa.COM ", "email", "joao@empresa.com"],
    ["empresa.com.br", "domain", "empresa.com.br"],
    ["http://empresa.com:8080/", "domain", "empresa.com"],
    ["www.empresa.com.", "domain", "empresa.com"],
    ["sub.empresa-x.com.br#a", "domain", "sub.empresa-x.com.br"],
    ["joao.silva+tag@empresa.com.br", "email", "joao.silva+tag@empresa.com.br"],
  ])("%s -> %s / %s", (raw, type, value) => {
    expect(normalizeSuppressionValue(raw)).toEqual({ type, value });
  });

  it.each(["empresa", "joao@", "a b.com", "", "   ", "joao@empresa", "a@b@c.com", "@", "jo ao@x.com"])(
    "invalido: %j",
    (raw) => {
      expect(normalizeSuppressionValue(raw)).toBeNull();
    }
  );

  it("rejeita não-string e valor longo demais", () => {
    expect(normalizeSuppressionValue(undefined)).toBeNull();
    expect(normalizeSuppressionValue(null)).toBeNull();
    expect(normalizeSuppressionValue(`${"a".repeat(330)}.com`)).toBeNull();
  });
});

describe("parseSuppressionReason", () => {
  it.each([
    ["cliente", "cliente"],
    ["Cliente", "cliente"],
    ["negociacao", "negociacao"],
    ["Negociação", "negociacao"],
    ["CONCORRENTE", "concorrente"],
    [" parceiro ", "parceiro"],
    ["opt_out", "opt_out"],
    ["opt-out", "opt_out"],
    ["optout", "opt_out"],
    ["Opt-Out", "opt_out"],
  ])("%s -> %s", (raw, reason) => {
    expect(parseSuppressionReason(raw)).toBe(reason);
  });

  it.each(["", "  ", "outro", "fornecedor"])("desconhecido/vazio: %j", (raw) => {
    expect(parseSuppressionReason(raw)).toBeNull();
  });
});

describe("parseSuppressionCsv", () => {
  it("lê valor;motivo com nº de linha", () => {
    const res = parseSuppressionCsv("valor;motivo\na.com;cliente\nb.com;parceiro\nc@d.com;opt-out");
    expect(res).toEqual({
      success: true,
      rows: [
        { line: 2, value: "a.com", reason: "cliente" },
        { line: 3, value: "b.com", reason: "parceiro" },
        { line: 4, value: "c@d.com", reason: "opt-out" },
      ],
    });
  });

  it("mantém o nº real da linha com linhas em branco, BOM e CRLF", () => {
    const res = parseSuppressionCsv("﻿Domínio,Motivo\r\na.com,cliente\r\n\r\nb.com,parceiro\r\n");
    expect(res.success && res.rows).toEqual([
      { line: 2, value: "a.com", reason: "cliente" },
      { line: 4, value: "b.com", reason: "parceiro" },
    ]);
  });

  it("aceita cabeçalhos alternativos (Website / reason) e tab", () => {
    const res = parseSuppressionCsv("Website\tReason\nhttps://x.com\tcliente");
    expect(res.success && res.rows).toEqual([{ line: 2, value: "https://x.com", reason: "cliente" }]);
  });

  it("com colunas de e-mail e domínio usa o e-mail quando preenchido", () => {
    const res = parseSuppressionCsv(
      "dominio;e-mail;motivo\nempresa.com;joao@empresa.com;cliente\noutra.com;;parceiro"
    );
    expect(res.success && res.rows.map((r) => r.value)).toEqual(["joao@empresa.com", "outra.com"]);
  });

  it("sem coluna de motivo devolve motivo vazio", () => {
    const res = parseSuppressionCsv("email\na@b.com");
    expect(res.success && res.rows).toEqual([{ line: 2, value: "a@b.com", reason: "" }]);
  });

  it("ignora linhas com todas as células vazias", () => {
    const res = parseSuppressionCsv("valor;motivo\n;\na.com;cliente");
    expect(res.success && res.rows).toEqual([{ line: 3, value: "a.com", reason: "cliente" }]);
  });

  it("cabeçalho sem coluna de valor -> erro", () => {
    expect(parseSuppressionCsv("nome;motivo\nfoo;cliente")).toEqual({
      success: false,
      error: SUPPRESSION_CSV_MISSING_COLUMN,
    });
    expect(parseSuppressionCsv("")).toEqual({
      success: false,
      error: SUPPRESSION_CSV_MISSING_COLUMN,
    });
  });
});

describe("isNonAdminSettingsPath", () => {
  it.each([
    ["/settings/suppression", true],
    ["/settings/suppression/x", true],
    ["/settings/suppression-x", false],
    ["/settings", false],
    ["/settings/integrations", false],
    [null, false],
  ])("%s -> %s", (path, expected) => {
    expect(isNonAdminSettingsPath(path)).toBe(expected);
  });
});
