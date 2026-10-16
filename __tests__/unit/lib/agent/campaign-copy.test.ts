/**
 * Story 24.6: regra de copy do agente (variaveis de lead, plano de follow-up e limpeza).
 */

import { describe, it, expect } from "vitest";
import {
  TEMPLATE_LEAD_VARIABLES,
  SUPPORTED_EMAIL_VARIABLES,
  buildFollowUpPlan,
  cleanAgentEmailCopy,
  cleanIcebreakerText,
  findUnsupportedCopyTokens,
} from "@/lib/agent/campaign-copy";

function planSequence(total: number) {
  const used: string[] = [];
  const plans = [];
  for (let n = 2; n <= total; n++) {
    const plan = buildFollowUpPlan(n, total, used);
    used.push(plan.angle);
    plans.push(plan);
  }
  return plans;
}

describe("TEMPLATE_LEAD_VARIABLES", () => {
  it("deixa todas as variaveis de lead vazias (MODO TEMPLATE)", () => {
    expect(TEMPLATE_LEAD_VARIABLES).toEqual({
      lead_name: "",
      lead_title: "",
      lead_company: "",
      lead_industry: "",
      lead_location: "",
      icebreaker: "",
    });
  });

  it("aceita so as quatro variaveis do Instantly", () => {
    expect([...SUPPORTED_EMAIL_VARIABLES]).toEqual(["first_name", "company_name", "title", "ice_breaker"]);
  });
});

describe("buildFollowUpPlan", () => {
  it("4 e-mails: INSIGHT DO SETOR, PERGUNTA, ENCERRAMENTO com numeracao entre e-mails", () => {
    const plans = planSequence(4);

    expect(plans.map((p) => p.angle)).toEqual(["INSIGHT DO SETOR", "PERGUNTA", "ENCERRAMENTO"]);
    expect(plans[0].sequencePosition).toContain("Email 2 de 4");
    expect(plans[1].sequencePosition).toContain("Email 3 de 4");
    expect(plans[2].sequencePosition).toContain("Email 4 de 4");
    expect(plans[2].sequencePosition).toContain("ÚLTIMO");
    expect(plans[0].sequencePosition).not.toContain("ÚLTIMO");
  });

  it("estrategias sempre preenchidas e diferentes entre posicoes", () => {
    const plans = planSequence(4);

    for (const plan of plans) {
      expect(plan.followUpStrategy.trim()).not.toBe("");
      expect(plan.subjectStrategy.trim()).not.toBe("");
    }
    expect(new Set(plans.map((p) => p.followUpStrategy)).size).toBe(plans.length);
    expect(new Set(plans.map((p) => p.subjectStrategy)).size).toBe(plans.length);
  });

  it("toda estrategia proibe referenciar o e-mail anterior, inventar dados e usar colchetes", () => {
    for (const plan of planSequence(8)) {
      expect(plan.followUpStrategy).toMatch(/NÃO mencione nem pergunte sobre e-mails anteriores/);
      expect(plan.followUpStrategy).toMatch(/NÃO invente números/);
      expect(plan.followUpStrategy).toMatch(/NÃO use colchetes/);
      expect(plan.followUpStrategy).not.toMatch(/\{\{(?!first_name|company_name|title|ice_breaker)\w+\}\}/);
      expect(plan.subjectStrategy).toMatch(/Não use 'RE:'/);
    }
  });

  it("cita os angulos ja usados para evitar repeticao", () => {
    const plan = buildFollowUpPlan(3, 4, ["INSIGHT DO SETOR"]);
    expect(plan.angle).toBe("PERGUNTA");
    expect(plan.followUpStrategy).toContain("Ângulos já usados nesta sequência: INSIGHT DO SETOR");
    expect(buildFollowUpPlan(2, 4, []).followUpStrategy).not.toContain("Ângulos já usados");
  });

  it("8 e-mails: 2..7 percorrem os 5 angulos do meio (7 volta ao 1o) e 8 encerra", () => {
    expect(planSequence(8).map((p) => p.angle)).toEqual([
      "INSIGHT DO SETOR",
      "PERGUNTA",
      "RECURSO ÚTIL",
      "CUSTO DE NÃO AGIR",
      "OUTRA PERSPECTIVA",
      "INSIGHT DO SETOR",
      "ENCERRAMENTO",
    ]);
  });

  it("8 e-mails: o e-mail 7 (volta ao INSIGHT) nao manda evitar o proprio angulo", () => {
    const seventh = planSequence(8)[5];
    expect(seventh.angle).toBe("INSIGHT DO SETOR");
    const used = seventh.followUpStrategy.match(/Ângulos já usados nesta sequência: ([^.]*)\./)?.[1] ?? "";
    expect(used).toBe("PERGUNTA, RECURSO ÚTIL, CUSTO DE NÃO AGIR, OUTRA PERSPECTIVA");
    expect(used).not.toContain("INSIGHT DO SETOR");
  });

  it("follow-ups nao liberam {{ice_breaker}} (so do 1o e-mail)", () => {
    for (const plan of planSequence(4)) {
      expect(plan.followUpStrategy).toContain("{{first_name}}, {{company_name}} e {{title}}");
      expect(plan.followUpStrategy).toMatch(/não use \{\{ice_breaker\}\}/);
    }
  });

  it("2 e-mails: o follow-up e o encerramento", () => {
    const plan = buildFollowUpPlan(2, 2);
    expect(plan.angle).toBe("ENCERRAMENTO");
    expect(plan.sequencePosition).toContain("Email 2 de 2");
  });

  it("so 1 e-mail: nenhum plano (posicao 1 e invalida)", () => {
    expect(planSequence(1)).toEqual([]);
    expect(() => buildFollowUpPlan(1, 1)).toThrow(RangeError);
    expect(() => buildFollowUpPlan(5, 4)).toThrow(RangeError);
  });
});

describe("cleanAgentEmailCopy", () => {
  it("corpo sujo: normaliza variaveis e remove placeholders e literais vazados", () => {
    const dirty =
      "Oi {{Nome}},\n\n[Sua empresa] ajuda {{companyName}}.\n\nAbs,\n[Seu nome]\n{{follow_up_strategy}}";
    const clean = cleanAgentEmailCopy(dirty, "body");

    expect(clean).toBe("Oi {{first_name}},\n\najuda {{company_name}}.\n\nAbs,");
    expect(clean).not.toMatch(/[[\]]/);
    expect(clean).not.toContain("{{follow_up_strategy}}");
    expect(findUnsupportedCopyTokens(clean)).toEqual([]);
  });

  it("assunto sujo: prefixo, aspas, alias e colchete", () => {
    expect(
      cleanAgentEmailCopy('Assunto: "{{lead_name}}, ideia para [Empresa]"', "subject")
    ).toBe("{{first_name}}, ideia para");
  });

  it("aliases do agente viram as variaveis do Instantly e o resto sai", () => {
    const clean = cleanAgentEmailCopy(
      "{{lead_name}} da {{lead_company}} ({{lead_title}}) {{icebreaker}} {{firstName}} {{lead_industry}} {{subject_strategy}}",
      "body"
    );
    expect(clean).toBe("{{first_name}} da {{company_name}} ({{title}}) {{ice_breaker}} {{first_name}}");
  });

  it("'Nome'/'Empresa' como placeholder: no texto vira variavel, sozinho na linha sai", () => {
    const clean = cleanAgentEmailCopy("Oi Nome,\n\nVi que a Empresa.\n\nAbs,\nNome", "body");
    expect(clean).toBe("Oi {{first_name}},\n\nVi que a {{company_name}}.\n\nAbs,");
    expect(findUnsupportedCopyTokens(clean)).toEqual([]);
  });

  it("variavel com espacos e mapeada, nao apagada", () => {
    expect(cleanAgentEmailCopy("Oi {{Primeiro Nome}}, tudo bem na {{Nome da Empresa}}?", "body")).toBe(
      "Oi {{first_name}}, tudo bem na {{company_name}}?"
    );
  });

  it("assunto: remove {{ice_breaker}} e prefixos RE:/FW:/FWD:/ENC: repetidos", () => {
    expect(cleanAgentEmailCopy("{{ice_breaker}} Ideia para {{company_name}}", "subject")).toBe(
      "Ideia para {{company_name}}"
    );
    expect(cleanAgentEmailCopy("RE: re: Ideia rápida", "subject")).toBe("Ideia rápida");
    expect(cleanAgentEmailCopy("FW: Fwd: ENC: Ideia rápida", "subject")).toBe("Ideia rápida");
    expect(cleanAgentEmailCopy('"RE: Ideia"', "subject")).toBe("Ideia");
    expect(cleanAgentEmailCopy("Recado rápido", "subject")).toBe("Recado rápido");
  });

  it("corpo mantem {{ice_breaker}}", () => {
    expect(cleanAgentEmailCopy("Oi,\n\n{{ice_breaker}}", "body")).toBe("Oi,\n\n{{ice_breaker}}");
  });

  it("nao mexe em texto limpo", () => {
    const text = "Oi {{first_name}},\n\n{{ice_breaker}}\n\nComo a {{company_name}} lida com isso hoje?";
    expect(cleanAgentEmailCopy(text, "body")).toBe(text);
  });

  it("arruma espacos duplos, espaco antes de pontuacao e 3+ quebras", () => {
    expect(cleanAgentEmailCopy("Oi  {{lead_industry}} ,\n\n\n\nTudo bem ?", "body")).toBe("Oi,\n\nTudo bem?");
  });
});

describe("findUnsupportedCopyTokens", () => {
  it("texto limpo: vazio", () => {
    expect(
      findUnsupportedCopyTokens("Oi {{first_name}}, {{title}} na {{company_name}}.\n\n{{ice_breaker}}")
    ).toEqual([]);
  });

  it("texto sujo: lista variaveis invalidas, colchetes e Nome/Empresa", () => {
    const tokens = findUnsupportedCopyTokens(
      "Oi Nome, a Empresa {{lead_name}} [Seu nome] {{follow_up_strategy}} ]"
    );
    expect(tokens).toEqual(
      expect.arrayContaining(["Nome", "Empresa", "{{lead_name}}", "[Seu nome]", "{{follow_up_strategy}}", "]"])
    );
  });
});

describe("cleanIcebreakerText", () => {
  it("remove [...] e TODA {{x}} (inclusive as validas)", () => {
    expect(cleanIcebreakerText("Vi que a {{company_name}} cresceu com [proposta de valor] , [DETALHE]")).toBe(
      "Vi que a cresceu com,"
    );
  });

  it("texto limpo passa, so-placeholder vira null", () => {
    expect(cleanIcebreakerText("  Vi seu post sobre dados.  ")).toBe("Vi seu post sobre dados.");
    expect(cleanIcebreakerText("[DETALHE] {{lead_name}}")).toBeNull();
    expect(cleanIcebreakerText("")).toBeNull();
  });
});
