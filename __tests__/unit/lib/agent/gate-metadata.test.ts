/**
 * Unit Tests for stampLatestApprovalGate
 * Story 22.18 (AC3) — carimbo duravel do gate, generalizado a partir da 22.13.
 */

import { describe, it, expect, vi } from "vitest";
import { stampLatestApprovalGate } from "@/lib/agent/gate-metadata";
import { createChainBuilder } from "../../../helpers/mock-supabase";

const EXECUTION_ID = "exec-001";

function createDb(rows: unknown) {
  const messagesChain = createChainBuilder({ data: rows, error: null });
  const from = vi.fn().mockReturnValue(messagesChain);
  return { db: { from } as never, messagesChain, from };
}

describe("stampLatestApprovalGate (Story 22.18 AC3)", () => {
  it("espalha o patch preservando o metadata existente", async () => {
    const { db, messagesChain } = createDb([
      {
        id: "gate-1",
        metadata: { messageType: "approval_gate", stepNumber: 4, rejected: true },
      },
    ]);

    const stamped = await stampLatestApprovalGate(db, EXECUTION_ID, {
      activationOutcome: "deferred",
    });

    expect(stamped).toBe(true);
    expect(messagesChain.update).toHaveBeenCalledWith({
      metadata: {
        messageType: "approval_gate",
        stepNumber: 4,
        rejected: true,
        activationOutcome: "deferred",
      },
    });
  });

  it("filtra pelo stepNumber quando informado", async () => {
    const { db, messagesChain } = createDb([{ id: "gate-1", metadata: {} }]);

    await stampLatestApprovalGate(db, EXECUTION_ID, { rejected: true }, { stepNumber: 4 });

    expect(messagesChain.eq).toHaveBeenCalledWith("metadata->>stepNumber", "4");
  });

  it("NAO carimba quando o gate mais recente e de outro tipo de step", async () => {
    const { db, messagesChain } = createDb([
      {
        id: "gate-1",
        metadata: { messageType: "approval_gate", approvalData: { stepType: "search_leads" } },
      },
    ]);

    const stamped = await stampLatestApprovalGate(
      db,
      EXECUTION_ID,
      { activationOutcome: "activated" },
      { stepType: "export" }
    );

    expect(stamped).toBe(false);
    expect(messagesChain.update).not.toHaveBeenCalled();
  });

  it("carimba quando o tipo do gate casa com o filtro", async () => {
    const { db, messagesChain } = createDb([
      {
        id: "gate-1",
        metadata: { messageType: "approval_gate", approvalData: { stepType: "export" } },
      },
    ]);

    const stamped = await stampLatestApprovalGate(
      db,
      EXECUTION_ID,
      { activationOutcome: "activated" },
      { stepType: "export" }
    );

    expect(stamped).toBe(true);
    expect(messagesChain.update).toHaveBeenCalled();
  });

  it("devolve false (sem lancar) quando nao existe gate", async () => {
    const { db, messagesChain } = createDb([]);

    const stamped = await stampLatestApprovalGate(db, EXECUTION_ID, { rejected: true });

    expect(stamped).toBe(false);
    expect(messagesChain.update).not.toHaveBeenCalled();
  });

  it("fail-open: erro na leitura nao lanca", async () => {
    const messagesChain = createChainBuilder({ data: null, error: null });
    messagesChain.select = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    const db = { from: vi.fn().mockReturnValue(messagesChain) } as never;

    await expect(
      stampLatestApprovalGate(db, EXECUTION_ID, { rejected: true })
    ).resolves.toBe(false);
  });

  it("fail-open: erro devolvido pelo update vira false, nao excecao", async () => {
    const messagesChain = createChainBuilder({ data: null, error: null });
    let call = 0;
    messagesChain.then = (resolve: (v: unknown) => unknown) => {
      call += 1;
      return Promise.resolve(
        call === 1
          ? { data: [{ id: "gate-1", metadata: {} }], error: null }
          : { data: null, error: { message: "write failed" } }
      ).then(resolve);
    };
    const db = { from: vi.fn().mockReturnValue(messagesChain) } as never;

    await expect(
      stampLatestApprovalGate(db, EXECUTION_ID, { rejected: true })
    ).resolves.toBe(false);
  });
});
