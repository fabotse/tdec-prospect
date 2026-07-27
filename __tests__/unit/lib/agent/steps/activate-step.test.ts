/**
 * Unit Tests for ActivateStep
 * Story 17.4 - AC: #3, #4
 *
 * Tests: happy path, input validation, API key missing,
 * Instantly API errors, confirmation message, cost calculation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivateStep } from "@/lib/agent/steps/activate-step";
import { createChainBuilder } from "../../../../helpers/mock-supabase";
import type { StepInput } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";

// ==============================================
// MOCKS
// ==============================================

const mockActivateCampaign = vi.fn();
const mockAddAccountsToCampaign = vi.fn();
const mockGetCampaignStatus = vi.fn();

vi.mock("@/lib/services/instantly", () => ({
  InstantlyService: class MockInstantlyService {
    activateCampaign = mockActivateCampaign;
    addAccountsToCampaign = mockAddAccountsToCampaign;
    getCampaignStatus = mockGetCampaignStatus;
  },
}));

const mockGetServiceApiKey = vi.fn().mockResolvedValue("decrypted-instantly-key");

vi.mock("@/lib/agent/steps/step-utils", () => ({
  getServiceApiKey: (...args: unknown[]) => mockGetServiceApiKey(...args),
}));

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";
const EXECUTION_ID = "exec-001";

const defaultBriefing = {
  technology: "React",
  jobTitles: ["CTO"],
  location: "Brasil",
  companySize: "50-200",
  industry: "saas",
  productSlug: null,
  mode: "guided" as const,
  skipSteps: [],
};

function createPreviousStepOutput() {
  return {
    externalCampaignId: "instantly-camp-123",
    campaignName: "Campanha React Outbound",
    leadsUploaded: 15,
    duplicatedLeads: 0,
    invalidEmails: 0,
    accountsAdded: 2,
    platform: "instantly",
  };
}

function createMockSupabase(apiConfigData: unknown = { encrypted_key: "enc-key" }) {
  const apiConfigsChain = createChainBuilder({
    data: apiConfigData,
    error: null,
  });

  const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
  const stepsChain = createChainBuilder({ data: { id: "step-5" }, error: null });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "api_configs") return apiConfigsChain;
    if (table === "agent_messages") return messagesChain;
    if (table === "agent_steps") return stepsChain;
    return createChainBuilder();
  });

  return { from: mockFrom, apiConfigsChain, messagesChain, stepsChain };
}

function createDefaultInput(previousStepOutput?: Record<string, unknown>): StepInput {
  return {
    executionId: EXECUTION_ID,
    briefing: defaultBriefing,
    previousStepOutput: previousStepOutput ?? createPreviousStepOutput() as unknown as Record<string, unknown>,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("ActivateStep (Story 17.4 AC #3, #4)", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockActivateCampaign.mockResolvedValue(undefined);
    mockAddAccountsToCampaign.mockResolvedValue({ success: true, accountsAdded: 2 });
    // Story 22.18 (AC4b/AC6): pre-flight de status. Default = campanha em Rascunho COM
    // conta de envio, ou seja, o caminho feliz de hoje.
    mockGetCampaignStatus.mockResolvedValue({
      campaignId: "instantly-camp-123",
      name: "Campanha React Outbound",
      status: 0,
      statusLabel: "Rascunho",
      emailList: ["sender1@company.com"],
    });
  });

  // 5.14 - Happy path
  describe("happy path", () => {
    it("activates campaign and returns output with activated: true", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data.externalCampaignId).toBe("instantly-camp-123");
      expect(data.campaignName).toBe("Campanha React Outbound");
      expect(data.activated).toBe(true);
      expect(data.activatedAt).toBeDefined();
      expect(typeof data.activatedAt).toBe("string");
    });

    it("calls activateCampaign with correct params", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockActivateCampaign).toHaveBeenCalledWith({
        apiKey: "decrypted-instantly-key",
        campaignId: "instantly-camp-123",
      });
    });
  });

  // 5.15 - Input validation: no externalCampaignId
  describe("input validation", () => {
    it("throws when previousStepOutput is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input: StepInput = {
        executionId: EXECUTION_ID,
        briefing: defaultBriefing,
        previousStepOutput: undefined,
      };

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "Output do step anterior e obrigatorio para ativacao",
        isRetryable: false,
      });
    });

    it("throws when externalCampaignId is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (prevOutput as any).externalCampaignId;
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "externalCampaignId e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });

    it("throws when campaignName is missing", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = createPreviousStepOutput();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (prevOutput as any).campaignName;
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "campaignName e obrigatorio no output do step anterior",
        isRetryable: false,
      });
    });
  });

  // 5.16 - Instantly API error -> retryable
  describe("Instantly API errors", () => {
    it("maps Instantly API error to retryable PipelineError", async () => {
      mockActivateCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 502, "Bad gateway")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_ACTIVATE_ERROR",
        isRetryable: true,
        externalService: "instantly",
      });
    });
  });

  // 5.17 - API key not configured
  describe("API key errors", () => {
    it("throws terminal error when Instantly API key not configured", async () => {
      mockGetServiceApiKey.mockRejectedValueOnce(
        new Error("API key do Instantly nao configurada")
      );
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        message: "API key do Instantly nao configurada",
        isRetryable: false,
      });
    });
  });

  // 5.18 - Confirmation message sent
  describe("confirmation message", () => {
    it("sends confirmation message to agent_messages", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      // Should insert two messages: progress + confirmation
      const insertCalls = mockSupabase.messagesChain.insert.mock.calls;
      const messages = insertCalls.map((call: unknown[]) => call[0] as Record<string, unknown>);

      const progressMsg = messages.find(
        (m) => (m.content as string).includes("Ativando campanha")
      );
      expect(progressMsg).toBeDefined();
      expect(progressMsg?.role).toBe("system");

      const confirmMsg = messages.find(
        (m) => (m.content as string).includes("ativa no Instantly com 15 leads")
      );
      expect(confirmMsg).toBeDefined();
      expect(confirmMsg?.role).toBe("agent");
      expect(confirmMsg?.content).toBe(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 15 leads"
      );
    });
  });

  // ==============================================
  // Story 22.17
  // ==============================================

  describe("Story 22.17 - pluralizacao (AC4)", () => {
    it("diz 'com 1 lead' no singular", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput({
        ...(createPreviousStepOutput() as unknown as Record<string, unknown>),
        leadsUploaded: 1,
      });

      await step.run(input);

      const contents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(contents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 1 lead"
      );
    });

    it("diz 'com N leads' no plural (e 0 leads)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);

      await step.run(createDefaultInput());
      const contents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(contents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 15 leads"
      );

      vi.clearAllMocks();
      mockSupabase = createMockSupabase();
      mockActivateCampaign.mockResolvedValue(undefined);
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 0,
        statusLabel: "Rascunho",
        emailList: ["sender1@company.com"],
      });
      const zeroStep = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      await zeroStep.run(
        createDefaultInput({
          ...(createPreviousStepOutput() as unknown as Record<string, unknown>),
          leadsUploaded: 0,
          selectedAccounts: undefined,
        })
      );
      const zeroContents = mockSupabase.messagesChain.insert.mock.calls.map(
        (call: unknown[]) => String((call[0] as Record<string, unknown>).content)
      );
      expect(zeroContents).toContain(
        "Campanha 'Campanha React Outbound' ativa no Instantly com 0 leads"
      );
    });
  });

  describe("Story 22.17 - aprovacao ex-ante (AC2)", () => {
    it("nao exige post-approval (a aprovacao foi no gate de ativacao)", () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      expect(step.requiresPostApproval()).toBe(false);
    });

    it("em modo guiado conclui o step e NAO abre um novo gate", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = { ...createDefaultInput(), mode: "guided" as const };

      await step.run(input);

      const statuses = mockSupabase.stepsChain.update.mock.calls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status
      );
      expect(statuses).toContain("completed");
      expect(statuses).not.toContain("awaiting_approval");

      const gateInsert = mockSupabase.messagesChain.insert.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .find(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.messageType ===
            "approval_gate"
        );
      expect(gateInsert).toBeUndefined();
    });
  });

  // ==============================================
  // Story 22.18 (AC3): carimbo DURAVEL do gate — quem carimba e QUANDO
  // ==============================================

  describe("Story 22.18 (AC3) - carimbo do gate de ativacao", () => {
    /** Mock com um approval_gate de `export` disponivel para ser carimbado. */
    function createSupabaseWithExportGate() {
      const messagesChain = createChainBuilder({
        data: [
          {
            id: "gate-msg-1",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 4,
              approvalData: { stepType: "export" },
            },
          },
        ],
        error: null,
      });
      const stepsChain = createChainBuilder({ data: { id: "step-5" }, error: null });
      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "agent_messages") return messagesChain;
        if (table === "agent_steps") return stepsChain;
        return createChainBuilder();
      });
      return { from, messagesChain, stepsChain };
    }

    it("carimba activationOutcome='activated' DEPOIS de a campanha ficar ativa", async () => {
      const supabase = createSupabaseWithExportGate();
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      await step.run(createDefaultInput());

      const stamped = supabase.messagesChain.update.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .some(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.activationOutcome ===
            "activated"
        );
      expect(stamped).toBe(true);
    });

    it("NAO carimba quando a ativacao FALHA (o card tem que voltar re-armado)", async () => {
      mockActivateCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 502, "Bad gateway")
      );
      const supabase = createSupabaseWithExportGate();
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      await expect(step.run(createDefaultInput())).rejects.toMatchObject({
        code: "STEP_ACTIVATE_ERROR",
      });

      expect(supabase.messagesChain.update).not.toHaveBeenCalled();
    });

    it("falha no carimbo NAO derruba a ativacao (fail-open)", async () => {
      const supabase = createSupabaseWithExportGate();
      supabase.messagesChain.update = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      const result = await step.run(createDefaultInput());

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).activated).toBe(true);
    });
  });

  // ==============================================
  // Story 22.18 (AC4): ativacao IDEMPOTENTE do nosso lado
  // ==============================================

  describe("Story 22.18 (AC4) - idempotencia", () => {
    /** Mock em que o SELECT de agent_steps devolve um output (e custo) ja gravado. */
    function createSupabaseWithStepOutput(
      output: Record<string, unknown> | null,
      cost: Record<string, number> | null = null
    ) {
      const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
      const stepsChain = createChainBuilder({ data: { output, cost }, error: null });
      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "agent_messages") return messagesChain;
        if (table === "agent_steps") return stepsChain;
        return createChainBuilder();
      });
      return { from, messagesChain, stepsChain };
    }

    // --- (4a) guarda barata, sem rede ---

    it("(4a) NAO chama activateCampaign quando o output do proprio step ja tem activated:true", async () => {
      const supabase = createSupabaseWithStepOutput(
        {
          externalCampaignId: "instantly-camp-123",
          campaignName: "Campanha React Outbound",
          activated: true,
          activatedAt: "2026-07-20T10:00:00.000Z",
        },
        { instantly_activate: 1 }
      );
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      const result = await step.run(createDefaultInput());

      expect(mockActivateCampaign).not.toHaveBeenCalled();
      const data = result.data as Record<string, unknown>;
      expect(data.activated).toBe(true);
      expect(data.activatedAt).toBe("2026-07-20T10:00:00.000Z");
      // Story 22.18 (code review, P3): o custo JA gravado e preservado. Devolver
      // `{ instantly_activate: 0 }` aqui fazia o `saveCheckpoint` APAGAR o registro da
      // ativacao real que aconteceu na tentativa anterior.
      expect(result.cost).toEqual({ instantly_activate: 1 });
    });

    // Story 22.18 (code review, P3): o atalho tambem carimba — senao, se o carimbo da
    // primeira ativacao falhou (fail-open), o card ficaria re-armado para sempre.
    it("(4a) o atalho CARIMBA o gate (durabilidade auto-curavel)", async () => {
      // Gate do export presente (como na producao) + output ja com activated:true.
      const messagesChain = createChainBuilder({
        data: [
          {
            id: "gate-msg-1",
            metadata: {
              messageType: "approval_gate",
              stepNumber: 4,
              approvalData: { stepType: "export" },
            },
          },
        ],
        error: null,
      });
      const stepsChain = createChainBuilder({
        data: {
          output: {
            externalCampaignId: "instantly-camp-123",
            campaignName: "Campanha React Outbound",
            activated: true,
          },
          cost: { instantly_activate: 1 },
        },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "agent_messages") return messagesChain;
          if (table === "agent_steps") return stepsChain;
          return createChainBuilder();
        }),
      };
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      await step.run(createDefaultInput());

      expect(mockActivateCampaign).not.toHaveBeenCalled();
      const stamped = messagesChain.update.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .some(
          (arg) =>
            (arg.metadata as Record<string, unknown> | undefined)?.activationOutcome ===
            "activated"
        );
      expect(stamped).toBe(true);
    });

    // Story 22.18 (code review, P4): guardrail invertido — `activated: true` de OUTRA
    // campanha nao pode calar a ativacao da campanha atual.
    it("(4a) NAO atalha quando o activated:true e de outra campanha", async () => {
      const supabase = createSupabaseWithStepOutput({
        externalCampaignId: "instantly-camp-ANTIGA",
        campaignName: "Campanha antiga",
        activated: true,
      });
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: "instantly-camp-123" })
      );
    });

    it("(4a) segue normalmente quando o output do step nao tem activated", async () => {
      const supabase = createSupabaseWithStepOutput({ error: { code: "STEP_ACTIVATE_ERROR" } });
      const step = new ActivateStep(5, supabase as never, TENANT_ID);

      await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalled();
    });

    // --- (4b) a que importa: erro parcial (o output foi sobrescrito por { error }) ---

    it("(4b) NAO chama activateCampaign quando a campanha ja esta Active (1)", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 1,
        statusLabel: "Ativa",
        emailList: ["sender1@company.com"],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const result = await step.run(createDefaultInput());

      expect(mockActivateCampaign).not.toHaveBeenCalled();
      expect((result.data as Record<string, unknown>).activated).toBe(true);
      // Story 22.18 (code review, P5): nenhuma chamada foi feita — o custo tem que dizer
      // isso. Contar 1 aqui registrava uma chamada ao Instantly que nunca existiu.
      expect(result.cost).toEqual({ instantly_activate: 0 });
    });

    // Story 22.18 (code review, P1): Paused(2) e Completed(3) sao os estados em que
    // "resume" e DESTRUTIVO — reenviar a sequencia inteira para quem ja recebeu tudo, ou
    // anular uma pausa feita a mao dentro do Instantly. A versao original so barrava 1 e
    // 4, deixando os dois casos perigosos cairem direto no POST /activate.
    it.each([
      [2, "Pausada"],
      [3, "Concluida"],
    ])(
      "(4b/P1) NAO chama activateCampaign quando a campanha esta em status %i (%s)",
      async (status, statusLabel) => {
        mockGetCampaignStatus.mockResolvedValue({
          campaignId: "instantly-camp-123",
          name: "Campanha React Outbound",
          status,
          statusLabel,
          emailList: ["sender1@company.com"],
        });

        const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
        const result = await step.run(createDefaultInput());

        expect(mockActivateCampaign).not.toHaveBeenCalled();
        expect(result.cost).toEqual({ instantly_activate: 0 });
      }
    );

    // Guardrail invertido do P1: a guarda nova nao pode engolir a ativacao legitima.
    it("(4b/P1) CHAMA activateCampaign quando a campanha esta em Draft (0)", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 0,
        statusLabel: "Rascunho",
        emailList: ["sender1@company.com"],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const result = await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalledTimes(1);
      expect(result.cost).toEqual({ instantly_activate: 1 });
    });

    it("(4b) NAO chama activateCampaign quando a campanha esta RunningSubsequences (4)", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 4,
        statusLabel: "Executando subsequencias",
        emailList: ["sender1@company.com"],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      await step.run(createDefaultInput());

      expect(mockActivateCampaign).not.toHaveBeenCalled();
    });

    it("(4b) CHAMA activateCampaign quando a campanha esta Draft (0)", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 0,
        statusLabel: "Rascunho",
        emailList: ["sender1@company.com"],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalled();
    });

    it("(4b) falha na leitura de status NAO bloqueia a ativacao (fail-open)", async () => {
      mockGetCampaignStatus.mockRejectedValue(
        new ExternalServiceError("instantly", 500, "Erro no GET")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const result = await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("(4b) le o status DEPOIS do attach das contas selecionadas", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };

      await step.run(createDefaultInput(prevOutput as unknown as Record<string, unknown>));

      const attachOrder = mockAddAccountsToCampaign.mock.invocationCallOrder[0];
      const statusOrder = mockGetCampaignStatus.mock.invocationCallOrder[0];
      expect(attachOrder).toBeLessThan(statusOrder);
    });
  });

  // ==============================================
  // Story 22.18 (AC6): zero contas de envio nao e sucesso — GUARDA DE SERVIDOR
  // ==============================================

  describe("Story 22.18 (AC6) - guarda de servidor: campanha sem remetente", () => {
    it("RECUSA ativar quando o email_list da campanha esta vazio", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 0,
        statusLabel: "Rascunho",
        emailList: [],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);

      await expect(step.run(createDefaultInput())).rejects.toMatchObject({
        code: "STEP_EXECUTION_ERROR",
        isRetryable: false,
      });
      expect(mockActivateCampaign).not.toHaveBeenCalled();
    });

    it("a mensagem de erro explica o que fazer", async () => {
      mockGetCampaignStatus.mockResolvedValue({
        campaignId: "instantly-camp-123",
        name: "Campanha React Outbound",
        status: 0,
        statusLabel: "Rascunho",
        emailList: [],
      });

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);

      await expect(step.run(createDefaultInput())).rejects.toMatchObject({
        message: expect.stringContaining("conta de envio"),
      });
    });

    it("ativa normalmente quando ha pelo menos uma conta de envio", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);

      const result = await step.run(createDefaultInput());

      expect(mockActivateCampaign).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("guardrail invertido: leitura de status indisponivel NAO inventa bloqueio", async () => {
      mockGetCampaignStatus.mockRejectedValue(
        new ExternalServiceError("instantly", 503, "indisponivel")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const result = await step.run(createDefaultInput());

      expect(result.success).toBe(true);
      expect(mockActivateCampaign).toHaveBeenCalled();
    });
  });

  // 5.19 - Cost calculated correctly
  describe("cost calculation", () => {
    it("calculates cost correctly", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      const result = await step.run(input);

      expect(result.cost).toEqual({
        instantly_activate: 1,
      });
    });
  });

  // ==============================================
  // Story 17.9: selectedAccounts handling
  // ==============================================

  describe("Story 17.9 - selectedAccounts", () => {
    it("calls addAccountsToCampaign with selectedAccounts before activating (AC #2)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com", "sender2@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await step.run(input);

      expect(mockAddAccountsToCampaign).toHaveBeenCalledWith({
        apiKey: "decrypted-instantly-key",
        campaignId: "instantly-camp-123",
        accountEmails: ["sender1@company.com", "sender2@company.com"],
      });
      // addAccountsToCampaign called BEFORE activateCampaign
      const addOrder = mockAddAccountsToCampaign.mock.invocationCallOrder[0];
      const activateOrder = mockActivateCampaign.mock.invocationCallOrder[0];
      expect(addOrder).toBeLessThan(activateOrder);
    });

    it("does NOT call addAccountsToCampaign when selectedAccounts is absent (autopilot, AC #3)", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const input = createDefaultInput();

      await step.run(input);

      expect(mockAddAccountsToCampaign).not.toHaveBeenCalled();
      expect(mockActivateCampaign).toHaveBeenCalled();
    });

    it("does NOT call addAccountsToCampaign when selectedAccounts is empty", async () => {
      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: [],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await step.run(input);

      expect(mockAddAccountsToCampaign).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 22.12: attach de contas na ativacao real FALHA-RAPIDO com msg especifica
  // ==============================================

  describe("Story 22.12 - attach failure on real activation (AC #4, #5)", () => {
    it("blocks activation with a SPECIFIC message when attach fails (not 'Erro interno')", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 404, "Erro interno. Tente novamente.")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        message: expect.stringContaining("anexar as contas de envio"),
      });

      // fail-fast: ativar sem conta = campanha inerte -> NAO ativa
      expect(mockActivateCampaign).not.toHaveBeenCalled();
    });

    it("does not leak the generic 'Erro interno. Tente novamente.' message on attach failure", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 404, "Erro interno. Tente novamente.")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      let caught: unknown;
      try {
        await step.run(input);
      } catch (e) {
        caught = e;
      }
      const message = (caught as { message: string }).message;
      expect(message).not.toContain("Erro interno");
    });

    it("preserves retryability of the underlying attach error (502 -> retryable)", async () => {
      mockAddAccountsToCampaign.mockRejectedValue(
        new ExternalServiceError("instantly", 502, "Bad gateway")
      );

      const step = new ActivateStep(5, mockSupabase as never, TENANT_ID);
      const prevOutput = {
        ...createPreviousStepOutput(),
        selectedAccounts: ["sender1@company.com"],
      };
      const input = createDefaultInput(prevOutput as unknown as Record<string, unknown>);

      await expect(step.run(input)).rejects.toMatchObject({
        code: "STEP_ACTIVATE_ERROR",
        isRetryable: true,
        externalService: "instantly",
        message: expect.stringContaining("anexar as contas de envio"),
      });
    });
  });
});
