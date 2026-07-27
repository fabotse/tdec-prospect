/**
 * Unit Tests for POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve
 * Story 17.5 - AC: #2, #4
 *
 * Tests: happy path, step not awaiting_approval (409), step not found (404),
 * approvedData merge (leads filtrados)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChainBuilder } from "../../../../../../helpers/mock-supabase";

// ==============================================
// MOCKS
// ==============================================

const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const executionsChain = createChainBuilder({
  data: { id: "exec-001", tenant_id: "tenant-1" },
  error: null,
});

const stepsChain = createChainBuilder({
  data: {
    step_number: 1,
    step_type: "search_companies",
    status: "awaiting_approval",
    output: { companies: [{ name: "Acme" }], totalFound: 1 },
  },
  error: null,
});

const messagesChain = createChainBuilder({ data: { id: "msg-1" }, error: null });
const updateChain = createChainBuilder({ data: null, error: null });

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "agent_executions") return executionsChain;
  if (table === "agent_steps") {
    // Return stepsChain for select, updateChain for update
    return {
      ...stepsChain,
      update: vi.fn().mockReturnValue(updateChain),
    };
  }
  if (table === "agent_messages") return messagesChain;
  return createChainBuilder();
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { POST } from "@/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route";

// ==============================================
// HELPERS
// ==============================================

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mockProfile = { tenant_id: "tenant-1", id: "user-1" };

function createRequest(body?: unknown): NextRequest {
  if (body) {
    return new NextRequest("http://localhost/api/agent/executions/x/steps/1/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest("http://localhost/api/agent/executions/x/steps/1/approve", {
    method: "POST",
  });
}

function createParams(executionId = VALID_UUID, stepNumber = "1") {
  return { params: Promise.resolve({ executionId, stepNumber }) };
}

// ==============================================
// TESTS
// ==============================================

describe("POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // Reset chains
    executionsChain.select = vi.fn().mockReturnValue(executionsChain);
    executionsChain.eq = vi.fn().mockReturnValue(executionsChain);
    executionsChain.single = vi.fn().mockReturnValue(executionsChain);
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: { id: VALID_UUID, tenant_id: "tenant-1" }, error: null }).then(resolve);

    stepsChain.select = vi.fn().mockReturnValue(stepsChain);
    stepsChain.eq = vi.fn().mockReturnValue(stepsChain);
    stepsChain.single = vi.fn().mockReturnValue(stepsChain);
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: {
          step_number: 1,
          step_type: "search_companies",
          status: "awaiting_approval",
          output: { companies: [{ name: "Acme" }], totalFound: 1 },
        },
        error: null,
      }).then(resolve);

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") return stepsChain;
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });
  });

  // 9.4 - Happy path
  it("approves step and returns nextStep (9.4)", async () => {
    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      stepNumber: 1,
      status: "approved",
      nextStep: 2,
    });
  });

  // Auth
  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // Invalid UUID
  it("returns 400 for invalid executionId", async () => {
    const res = await POST(createRequest(), createParams("not-a-uuid"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  // Invalid stepNumber
  it("returns 400 for invalid stepNumber", async () => {
    const res = await POST(createRequest(), createParams(VALID_UUID, "abc"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_PARAMS");
  });

  // 9.6 - Step not found
  it("returns 404 when step not found (9.6)", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // ==============================================
  // Story 22.10 — guarda anti-race de execucao terminal (AC4)
  // ==============================================

  // Repontar o select da execucao respeitando a assinatura do chain builder
  // (o padrao mais frouxo usado no resto do arquivo nao type-checa).
  function stubExecution(execution: Record<string, unknown>) {
    executionsChain.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: execution, error: null }).then(resolve);
  }

  it.each(["cancelled", "completed", "failed"])(
    "returns 409 EXECUTION_NOT_ACTIVE quando a execucao esta '%s' (Story 22.10 AC4)",
    async (terminalStatus) => {
      stubExecution({
        id: VALID_UUID,
        tenant_id: "tenant-1",
        status: terminalStatus,
        total_steps: 1,
      });

      const res = await POST(createRequest(), createParams());
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("EXECUTION_NOT_ACTIVE");
      // o step NUNCA foi aprovado -> o bloco de "ultimo step" nao roda e o
      // status 'cancelled' nao e sobrescrito por 'completed'
      expect(stepsChain.update).not.toHaveBeenCalled();
    }
  );

  it("aprova normalmente quando a execucao esta RUNNING (guarda nao afeta o caminho feliz)", async () => {
    stubExecution({ id: VALID_UUID, tenant_id: "tenant-1", status: "running", total_steps: 5 });

    const res = await POST(createRequest(), createParams());
    expect(res.status).toBe(200);
  });

  it("aprova normalmente quando a execucao esta PAUSED (retry de erro segue valido)", async () => {
    stubExecution({ id: VALID_UUID, tenant_id: "tenant-1", status: "paused", total_steps: 5 });

    const res = await POST(createRequest(), createParams());
    expect(res.status).toBe(200);
  });

  // 9.5 - Step not awaiting_approval -> 409
  it("returns 409 when step is not awaiting_approval (9.5)", async () => {
    stepsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: {
          step_number: 1,
          step_type: "search_companies",
          status: "completed",
          output: {},
        },
        error: null,
      }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  // ==============================================
  // Story 22.18 (AC2): o 409 de status de step vira DISCRIMINADOR ESTRUTURADO
  // ==============================================

  describe("Story 22.18 (AC2) - 409 estruturado", () => {
    function mockStepStatus(status: string, output: Record<string, unknown> = {}) {
      stepsChain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: { step_number: 4, step_type: "export", status, output },
          error: null,
        }).then(resolve);
    }

    it("devolve currentStatus='approved' e code STEP_ALREADY_APPROVED quando o step ja foi aprovado", async () => {
      mockStepStatus("approved", { selectedAccounts: ["a@x.com"] });

      const res = await POST(createRequest(), createParams());
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("STEP_ALREADY_APPROVED");
      expect(json.error.currentStatus).toBe("approved");
    });

    it.each(["running", "failed", "completed", "skipped", "pending"])(
      "devolve currentStatus='%s' com code CONFLICT (o cliente NAO pode seguir adiante)",
      async (status) => {
        mockStepStatus(status);

        const res = await POST(createRequest(), createParams());
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.error.code).toBe("CONFLICT");
        expect(json.error.currentStatus).toBe(status);
      }
    );

    it("expoe a intencao persistida (activationDeferred) para a retomada nao trocar de caminho", async () => {
      mockStepStatus("approved", { activationDeferred: true });

      const res = await POST(createRequest(), createParams());
      const json = await res.json();

      expect(json.error.activationDeferred).toBe(true);
    });

    it("activationDeferred=false quando a aprovacao persistida foi ATIVAR", async () => {
      mockStepStatus("approved", { selectedAccounts: ["a@x.com"] });

      const res = await POST(createRequest(), createParams());
      const json = await res.json();

      expect(json.error.activationDeferred).toBe(false);
    });
  });

  // ==============================================
  // Story 22.18 (AC3): o APPROVE carimba o `deferred` (ali ele E a acao completa)
  // ==============================================

  // Story 22.18 (code review, D1): o approve NAO carimba mais NENHUM desfecho.
  //
  // A AC3 mandava carimbar `deferred` aqui, sob o argumento de que "ali o approve E a
  // acao completa". Isso e factualmente falso: anexar as contas, pular o step e concluir
  // a execucao acontecem no `POST .../execute`, que so e disparado DEPOIS desta rota
  // responder. Carimbado aqui, um `execute` que falhasse deixava o card desabilitado
  // sobre um step ainda `pending` — o mesmo defeito da AC1, no botao "Ativar Depois", e
  // com a retomada da AC2 inalcancavel. Quem carimba `deferred` agora e o ramo defer do
  // orchestrator, depois de a execucao ser escrita como `completed`.
  describe("Story 22.18 (code review, D1) - o approve nao carimba desfecho", () => {
    function mockGateMessageLookup() {
      messagesChain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: "gate-msg-1",
              metadata: { messageType: "approval_gate", stepNumber: 1 },
            },
          ],
          error: null,
        }).then(resolve);
    }

    function stampedOutcomes(): unknown[] {
      return messagesChain.update.mock.calls
        .map((call: unknown[]) => call[0] as Record<string, unknown>)
        .map((arg) => (arg.metadata as Record<string, unknown> | undefined)?.activationOutcome)
        .filter((v) => v !== undefined);
    }

    it("NAO carimba 'deferred' no approve (o defer ainda nem rodou)", async () => {
      mockGateMessageLookup();

      await POST(
        createRequest({ approvedData: { activate: false, deferred: true } }),
        createParams()
      );

      expect(stampedOutcomes()).toEqual([]);
    });

    it("NAO carimba 'activated' no approve (a ativacao ainda nem disparou)", async () => {
      mockGateMessageLookup();

      await POST(
        createRequest({ approvedData: { activate: true, selectedAccounts: ["a@x.com"] } }),
        createParams()
      );

      expect(stampedOutcomes()).toEqual([]);
    });

    it("o adiamento continua respondendo 200 normalmente", async () => {
      mockGateMessageLookup();

      const res = await POST(
        createRequest({ approvedData: { activate: false, deferred: true } }),
        createParams()
      );

      expect(res.status).toBe(200);
    });
  });

  // 9.7 - approvedData merge (leads filtrados)
  it("merges approvedData.leads into output when provided (9.7)", async () => {
    const approvedLeads = [{ name: "John", email: "john@acme.com" }];

    await POST(
      createRequest({ approvedData: { leads: approvedLeads } }),
      createParams()
    );

    // Verify update was called with merged output containing approvedLeads
    expect(stepsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        completed_at: expect.any(String),
        output: expect.objectContaining({
          approvedLeads: approvedLeads,
        }),
      })
    );
  });

  // Execution not found / wrong tenant
  it("returns 404 when execution not found or wrong tenant", async () => {
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const res = await POST(createRequest(), createParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // ==============================================
  // Story 17.6 Tests
  // ==============================================

  // Task 3.1 - Merge emailBlocks editados
  it("merges approvedData.emailBlocks into output (Story 17.6 Task 3.1)", async () => {
    const editedEmailBlocks = [
      { position: 0, subject: "Assunto editado", body: "Corpo editado", emailMode: "initial" },
    ];

    // Mock steps chain to return update method
    const mockUpdate = vi.fn().mockReturnValue(updateChain);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: mockUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    await POST(
      createRequest({ approvedData: { emailBlocks: editedEmailBlocks } }),
      createParams()
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        output: expect.objectContaining({
          emailBlocks: editedEmailBlocks,
        }),
      })
    );
  });

  // Task 3.2 - Activation deferred
  it("sets activationDeferred in output when activate:false and deferred:true (Story 17.6 Task 3.2)", async () => {
    const mockUpdate = vi.fn().mockReturnValue(updateChain);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: mockUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    await POST(
      createRequest({ approvedData: { activate: false, deferred: true } }),
      createParams()
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          activationDeferred: true,
        }),
      })
    );
  });

  // Story 17.9 Task 3.1 - selectedAccounts merge
  it("merges approvedData.selectedAccounts into output (Story 17.9 Task 3.1)", async () => {
    const selectedAccounts = ["sender1@company.com", "sender2@company.com"];

    const mockUpdate = vi.fn().mockReturnValue(updateChain);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: mockUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    await POST(
      createRequest({ approvedData: { activate: true, selectedAccounts } }),
      createParams()
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        output: expect.objectContaining({
          selectedAccounts,
        }),
      })
    );
  });

  // Task 3.3 - Retrocompatibilidade: sem approvedData, comportamento identico ao 17-5
  it("preserves existing behavior when approvedData has no emailBlocks or activation flags (Story 17.6 Task 3.3)", async () => {
    const mockUpdate = vi.fn().mockReturnValue(updateChain);
    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") return executionsChain;
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: mockUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    // No body at all
    await POST(createRequest(), createParams());

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        output: expect.objectContaining({
          companies: [{ name: "Acme" }],
          totalFound: 1,
        }),
      })
    );
  });

  // Task 4.1 - Completion on last step
  it("marks execution as completed when approving the last step (Story 17.6 Task 4.1)", async () => {
    // Override execution to have total_steps = 1 so stepNumber 1 is the last step
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: { id: VALID_UUID, tenant_id: "tenant-1", total_steps: 1, status: "running" },
        error: null,
      }).then(resolve);

    const executionUpdate = vi.fn().mockReturnValue(createChainBuilder({ data: null, error: null }));
    const stepsUpdate = vi.fn().mockReturnValue(updateChain);

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return {
          ...executionsChain,
          update: executionUpdate,
        };
      }
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: stepsUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest(), createParams(VALID_UUID, "1"));
    expect(res.status).toBe(200);

    // Verify execution was updated to completed
    expect(executionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        completed_at: expect.any(String),
      })
    );
  });

  // Task 4.2 - Activation deferred in result_summary
  it("includes activationDeferred and campaignName in result_summary when deferred on last step (Story 17.6 Task 4.2)", async () => {
    executionsChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: { id: VALID_UUID, tenant_id: "tenant-1", total_steps: 1, status: "running" },
        error: null,
      }).then(resolve);

    const executionUpdate = vi.fn().mockReturnValue(createChainBuilder({ data: null, error: null }));
    const stepsUpdate = vi.fn().mockReturnValue(updateChain);

    mockFrom.mockImplementation((table: string) => {
      if (table === "agent_executions") {
        return {
          ...executionsChain,
          update: executionUpdate,
        };
      }
      if (table === "agent_steps") {
        return {
          ...stepsChain,
          update: stepsUpdate,
        };
      }
      if (table === "agent_messages") return messagesChain;
      return createChainBuilder();
    });

    await POST(
      createRequest({ approvedData: { activate: false, deferred: true } }),
      createParams(VALID_UUID, "1")
    );

    expect(executionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        result_summary: expect.objectContaining({ activationDeferred: true, campaignName: expect.any(String) }),
      })
    );
  });
});
