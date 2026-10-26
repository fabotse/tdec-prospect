/**
 * useSuppressionList Hook Tests
 * Story 23.5 - Lista de supressão: cadastro e import
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/actions/suppression", () => ({
  getSuppressionEntries: vi.fn(),
  addSuppressionEntry: vi.fn(),
  removeSuppressionEntry: vi.fn(),
  importSuppressionEntries: vi.fn(),
}));

import {
  getSuppressionEntries,
  addSuppressionEntry,
  removeSuppressionEntry,
  importSuppressionEntries,
} from "@/actions/suppression";
import { useSuppressionList, SUPPRESSION_QUERY_KEY } from "@/hooks/use-suppression-list";
import type { SuppressionEntry } from "@/types/suppression";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, invalidateSpy, Wrapper };
}

const entry: SuppressionEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "t1",
  entry_type: "domain",
  value: "empresa.com",
  reason: "cliente",
  source: "manual",
  created_by: null,
  created_at: "2026-10-26T10:00:00Z",
};

describe("useSuppressionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSuppressionEntries).mockResolvedValue({ success: true, data: [entry] });
  });

  it("carrega as entradas", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSuppressionList(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.error).toBeNull();
  });

  it("expõe o erro da action", async () => {
    vi.mocked(getSuppressionEntries).mockResolvedValue({ success: false, error: "falhou" });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSuppressionList(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBe("falhou"), { timeout: 3000 });
    expect(result.current.entries).toEqual([]);
  });

  it("add invalida a lista, inclusive quando duplicado", async () => {
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useSuppressionList(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(addSuppressionEntry).mockResolvedValueOnce({ success: true, data: { duplicate: true } });
    await act(async () => {
      await result.current.addEntry({ value: "empresa.com", reason: "cliente" });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SUPPRESSION_QUERY_KEY });
    invalidateSpy.mockClear();

    vi.mocked(addSuppressionEntry).mockResolvedValueOnce({
      success: true,
      data: { duplicate: false, entry },
    });
    await act(async () => {
      await result.current.addEntry({ value: "outra.com", reason: "cliente" });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SUPPRESSION_QUERY_KEY });
  });

  it("remove tira da cache e invalida", async () => {
    vi.mocked(removeSuppressionEntry).mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy, queryClient } = setup();
    const { result } = renderHook(() => useSuppressionList(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(getSuppressionEntries).mockResolvedValue({ success: true, data: [] });
    await act(async () => {
      await result.current.removeEntry(entry.id);
    });
    expect(removeSuppressionEntry).toHaveBeenCalledWith(entry.id);
    expect(queryClient.getQueryData(SUPPRESSION_QUERY_KEY)).toEqual([]);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("import invalida sempre (inclusive erro de import parcial)", async () => {
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useSuppressionList(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const rows = [{ line: 2, value: "a.com", reason: "cliente" }];

    vi.mocked(importSuppressionEntries).mockResolvedValueOnce({
      success: false,
      error: "Erro ao importar a lista. Tente novamente. (500 linhas já tinham entrado)",
    });
    await act(async () => {
      await result.current.importEntries(rows);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SUPPRESSION_QUERY_KEY });
    invalidateSpy.mockClear();

    vi.mocked(importSuppressionEntries).mockResolvedValueOnce({
      success: true,
      data: { accepted: 1, skipped: [] },
    });
    await act(async () => {
      await result.current.importEntries(rows);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SUPPRESSION_QUERY_KEY });
  });
});
