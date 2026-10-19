/**
 * Tests: prompts honestos — problema primeiro, provas só da KB
 * Story 24.8
 *
 * - Todos os 7 prompts de copy têm a REGRA DE PROVAS (com lista: só a lista; sem lista: nenhuma)
 * - Nenhum traz prova social, escassez, números/cases inventados nem "Dedique 70%"
 * - Corpo inicial abre pelo problema do lead e termina com CTA de baixo atrito
 */

import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import type { PromptKey } from "@/types/ai-prompt";

/** Cópia simplificada do interpolateTemplate do prompt-manager.ts (padrão dos testes vizinhos). */
function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, varName, ifContent, elseContent) => {
      const value = variables[varName];
      return value && value.trim() !== "" ? ifContent : (elseContent ?? "");
    }
  );
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => variables[varName] ?? match);
  return result;
}

const HONEST_PROMPT_KEYS: PromptKey[] = [
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_premium_generation",
  "icebreaker_generation",
  "follow_up_email_generation",
  "follow_up_subject_generation",
  "campaign_structure_generation",
];

const BASE_VARIABLES: Record<string, string> = {
  company_context: "Empresa remetente",
  tone_style: "casual",
  pain_points: "Retrabalho no fechamento",
  product_name: "Produto X",
  product_description: "Descrição",
};

const PROOF = "- Case: Acme reduziu 30% do retrabalho";

const FORBIDDEN_OLD_TEXT = [
  "Prova Social",
  "Escassez",
  "Dedique 70%",
  "40%",
  "ROI comprovado",
  "viu meu email",
  "case de sucesso",
];

describe.each(HONEST_PROMPT_KEYS)("Story 24.8: %s", (key) => {
  const template = CODE_DEFAULT_PROMPTS[key].template;

  it("sem provas (vazio): proíbe citar números/cases e não vaza a variável", () => {
    const rendered = interpolateTemplate(template, { ...BASE_VARIABLES, authorized_proofs: "" });
    expect(rendered).toContain("nenhuma prova foi fornecida");
    expect(rendered).toContain(
      "NÃO cite números, porcentagens, cases, clientes, resultados nem certificações"
    );
    expect(rendered).not.toContain("{{authorized_proofs}}");
    expect(rendered).not.toContain("PROVAS AUTORIZADAS");
    expect(rendered).toContain("A REGRA DE PROVAS prevalece sobre os exemplos e as diretrizes de escrita");
  });

  it("sem provas (variável ausente): cai no {{else}}", () => {
    const rendered = interpolateTemplate(template, BASE_VARIABLES);
    expect(rendered).toContain("nenhuma prova foi fornecida");
    expect(rendered).not.toContain("{{authorized_proofs}}");
    expect(rendered).not.toContain("{{#if");
  });

  it("com provas: lista aparece e só ela pode ser citada", () => {
    const rendered = interpolateTemplate(template, { ...BASE_VARIABLES, authorized_proofs: PROOF });
    expect(rendered).toContain(PROOF);
    expect(rendered).toContain("PROVAS AUTORIZADAS (LISTA FECHADA");
    expect(rendered).toContain("só cite números, cases, clientes ou certificações que estejam EXATAMENTE nesta lista");
    expect(rendered).not.toContain("nenhuma prova foi fornecida");
    expect(rendered).toContain("A REGRA DE PROVAS prevalece sobre os exemplos e as diretrizes de escrita");
    expect(rendered).toContain("NÃO podem ser copiados");
  });

  it.each(FORBIDDEN_OLD_TEXT)("não contém o texto antigo %j", (text) => {
    expect(template.toLowerCase()).not.toContain(text.toLowerCase());
  });
});

describe("Story 24.8: email_body_generation abre pelo problema do lead", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("ordem [QUEBRA-GELO] < [PROBLEMA DO LEAD] < [TRANSIÇÃO] < [CONTEÚDO PRODUTO] < [CTA]", () => {
    const quebraGelo = template.indexOf("[QUEBRA-GELO]");
    const problema = template.indexOf("[PROBLEMA DO LEAD]");
    const transicao = template.indexOf("[TRANSIÇÃO]");
    const produto = template.indexOf("[CONTEÚDO PRODUTO]");
    const cta = template.indexOf("[CTA]");
    expect(quebraGelo).toBeGreaterThan(-1);
    expect(problema).toBeGreaterThan(quebraGelo);
    expect(transicao).toBeGreaterThan(problema);
    expect(produto).toBeGreaterThan(transicao);
    expect(cta).toBeGreaterThan(produto);
  });

  it("produto limitado a no máximo 2 frases como resposta à dor", () => {
    expect(template).toContain("No máximo 2 frases");
    expect(template).toContain("como resposta à dor");
  });

  it("CTA de baixo atrito, sem pedir reunião", () => {
    const ctaSection = template.slice(template.indexOf("[CTA]"), template.indexOf("[FECHAMENTO]"));
    expect(ctaSection).toContain("sim/não");
    expect(ctaSection).toContain("NÃO peça reunião");
    expect(ctaSection).not.toContain("10 min");
  });

  it("ordem problema-primeiro e CTA de baixo atrito prevalecem sobre os exemplos", () => {
    expect(template).toContain(
      "Esta ordem e o CTA de baixo atrito prevalecem sobre os exemplos e as diretrizes de escrita"
    );
    expect(template).toContain("Exceção: a ordem dos blocos (problema do lead antes do produto)");
  });
});

describe("Story 24.8: follow_up_subject_generation sem RE:", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_subject_generation.template;

  it("proíbe RE:/FW: e não sugere RE: como exemplo", () => {
    expect(template).toContain('NUNCA use "RE:", "FW:"');
    expect(template).not.toContain("Use \"RE:\"");
    expect(template).not.toContain("RE: Proposta");
  });
});

describe("Story 24.8: campaign_structure_generation", () => {
  const template = CODE_DEFAULT_PROMPTS.campaign_structure_generation.template;

  it("sequências partem do problema, sem oferta direta nem última chance", () => {
    expect(template).toContain("Problema -> Insight -> Pergunta -> Recurso util -> Encerramento");
    expect(template).not.toContain("Oferta Direta");
    expect(template).not.toContain("Ultima Chance");
  });

  it("Case só com prova autorizada", () => {
    expect(template).toContain('"Case" SOMENTE se houver prova autorizada');
  });
});
