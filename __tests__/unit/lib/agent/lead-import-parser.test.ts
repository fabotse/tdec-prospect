/**
 * LeadImportParser Tests
 * Story 17.11 - AC: #1, #2
 *
 * Tests: parsing de leads em diversos formatos, validacao, deduplicacao
 */

import { describe, it, expect } from "vitest";
import { parseLeadInput } from "@/lib/agent/lead-import-parser";

describe("parseLeadInput", () => {
  it("deve parsear apenas emails e extrair nome do email", () => {
    const input = "joao.silva@empresa.com\nmaria@acme.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted[0].email).toBe("joao.silva@empresa.com");
    expect(result.accepted[0].name).toBe("Joao Silva");
    expect(result.accepted[0].companyName).toBe("Empresa");
    expect(result.accepted[1].email).toBe("maria@acme.com");
    expect(result.accepted[1].name).toBe("Maria");
  });

  it("deve parsear formato nome,email", () => {
    const input = "Joao Silva, joao@empresa.com\nMaria Santos, maria@acme.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].name).toBe("Joao Silva");
    expect(result.accepted[0].email).toBe("joao@empresa.com");
    expect(result.accepted[0].title).toBeNull();
    expect(result.accepted[1].name).toBe("Maria Santos");
  });

  it("deve parsear formato completo nome,cargo,empresa,email", () => {
    const input = "Joao Silva, CTO, Empresa X, joao@empresa.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].name).toBe("Joao Silva");
    expect(result.accepted[0].title).toBe("CTO");
    expect(result.accepted[0].companyName).toBe("Empresa X");
    expect(result.accepted[0].email).toBe("joao@empresa.com");
    expect(result.accepted[0].linkedinUrl).toBeNull();
    expect(result.accepted[0].apolloId).toBeNull();
  });

  it("deve parsear formato nome,cargo,email", () => {
    const input = "Ana Lima, Head de TI, ana@corp.com.br";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].name).toBe("Ana Lima");
    expect(result.accepted[0].title).toBe("Head de TI");
    expect(result.accepted[0].email).toBe("ana@corp.com.br");
  });

  it("deve detectar CSV com header e ignorar header", () => {
    const input = "nome,cargo,empresa,email\nJoao,CTO,Acme,joao@acme.com\nMaria,CEO,Beta,maria@beta.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].name).toBe("Joao");
    expect(result.accepted[0].title).toBe("CTO");
    expect(result.accepted[0].companyName).toBe("Acme");
  });

  it("deve parsear mix de formatos na mesma entrada", () => {
    const input = [
      "joao@empresa.com",
      "Maria Santos, maria@acme.com",
      "Pedro Lima, CTO, Empresa Z, pedro@empresa.com",
    ].join("\n");

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(3);
    expect(result.accepted[0].name).toBe("Joao");
    expect(result.accepted[1].name).toBe("Maria Santos");
    expect(result.accepted[2].title).toBe("CTO");
  });

  it("deve rejeitar linhas com emails invalidos", () => {
    const input = "Joao Silva, sem-email\nMaria, maria@acme.com\napenas texto";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].email).toBe("maria@acme.com");
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toBe("Email invalido ou ausente");
    expect(result.rejected[1].reason).toBe("Email invalido ou ausente");
  });

  it("deve ignorar linhas vazias sem contar como rejeitadas", () => {
    const input = "joao@empresa.com\n\n\nmaria@acme.com\n  \n";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it("deve rejeitar emails duplicados mantendo o primeiro", () => {
    const input = "Joao, joao@empresa.com\nJoao Duplicado, joao@empresa.com\nMaria, maria@acme.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].name).toBe("Joao");
    expect(result.accepted[1].name).toBe("Maria");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("Email duplicado");
  });

  it("deve deduplica emails case-insensitive", () => {
    const input = "Joao, joao@empresa.com\nJoao Alt, JOAO@EMPRESA.COM";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("Email duplicado");
  });

  it("deve suportar separador tab", () => {
    const input = "Joao Silva\tCTO\tjoao@empresa.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].name).toBe("Joao Silva");
    expect(result.accepted[0].title).toBe("CTO");
  });

  it("deve suportar separador ponto-e-virgula", () => {
    const input = "Ana Lima;Head de TI;Empresa Y;ana@empresa.com";

    const result = parseLeadInput(input);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].name).toBe("Ana Lima");
    expect(result.accepted[0].title).toBe("Head de TI");
    expect(result.accepted[0].companyName).toBe("Empresa Y");
  });

  it("deve retornar resultado vazio para input vazio", () => {
    const result = parseLeadInput("");

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("deve extrair companyName do dominio do email quando nao fornecido", () => {
    const input = "joao@microsoft.com";

    const result = parseLeadInput(input);

    expect(result.accepted[0].companyName).toBe("Microsoft");
  });

  it("deve usar companyName do dominio quando formato nome,email sem empresa", () => {
    const input = "Joao Silva, joao@google.com";

    const result = parseLeadInput(input);

    expect(result.accepted[0].name).toBe("Joao Silva");
    expect(result.accepted[0].companyName).toBe("Google");
  });
});
