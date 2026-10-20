/**
 * useKnowledgeBaseProofs Hook Tests
 * Story 24.7: Seção de Provas na Knowledge Base
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/actions/knowledge-base", () => ({
  getProofs: vi.fn(),
  createProof: vi.fn(),
  updateProof: vi.fn(),
  deleteProof: vi.fn(),
}));

import { getProofs, createProof, updateProof, deleteProof } from "@/actions/knowledge-base";
import { useKnowledgeBaseProofs } from "@/hooks/use-knowledge-base-proofs";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, invalidateSpy, Wrapper };
}

const proof = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "t1",
  proof_type: "case" as const,
  text: "Acme reduziu 30% do retrabalho",
  sector: null,
  is_authorized: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const input = {
  proof_type: "case" as const,
  text: "Acme reduziu 30% do retrabalho",
  is_authorized: true,
};

describe("useKnowledgeBaseProofs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProofs).mockResolvedValue({ success: true, data: [proof] });
  });

  it("loads proofs", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proofs).toEqual([proof]);
    expect(result.current.error).toBeNull();
  });

  it("exposes the action error", async () => {
    vi.mocked(getProofs).mockResolvedValue({ success: false, error: "Erro ao buscar provas" });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });

    // O hook usa retry: 1 (mesmo padrão do de ice breakers), então espera a 2ª tentativa
    await waitFor(() => expect(result.current.error).toBe("Erro ao buscar provas"), {
      timeout: 3000,
    });
    expect(result.current.proofs).toEqual([]);
  });

  it("create invalidates proofs and KB context", async () => {
    vi.mocked(createProof).mockResolvedValue({ success: true, data: proof });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const res = await result.current.createProof(input);
      expect(res.success).toBe(true);
    });

    expect(createProof).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledge-base", "proofs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledge-base", "context"] });
  });

  it("update calls action with id and invalidates context", async () => {
    vi.mocked(updateProof).mockResolvedValue({ success: true, data: proof });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateProof(proof.id, input);
    });

    expect(updateProof).toHaveBeenCalledWith(proof.id, input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledge-base", "context"] });
  });

  it("does not invalidate when the action fails", async () => {
    vi.mocked(createProof).mockResolvedValue({
      success: false,
      error: "Apenas administradores podem adicionar provas",
    });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const res = await result.current.createProof(input);
      expect(res).toEqual({
        success: false,
        error: "Apenas administradores podem adicionar provas",
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("delete removes the proof from the cache and invalidates context", async () => {
    vi.mocked(deleteProof).mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnowledgeBaseProofs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.proofs).toHaveLength(1));

    await act(async () => {
      await result.current.deleteProof(proof.id);
    });

    expect(deleteProof).toHaveBeenCalledWith(proof.id);
    await waitFor(() => expect(result.current.proofs).toEqual([]));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledge-base", "context"] });
  });
});
