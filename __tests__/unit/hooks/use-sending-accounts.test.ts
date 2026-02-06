/**
 * useSendingAccounts Hook Tests
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 * AC: #4 - Sending account selection
 *
 * Tests: loading, success, error, refetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSendingAccounts } from "@/hooks/use-sending-accounts";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockAccounts = [
  { email: "sender1@company.com", first_name: "Ana", last_name: "Silva" },
  { email: "sender2@company.com", first_name: "João" },
];

describe("useSendingAccounts", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts in loading state and fetches accounts on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    });

    const { result } = renderHook(() => useSendingAccounts());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accounts).toEqual(mockAccounts);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/instantly/accounts");
  });

  it("returns empty array when no accounts configured", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useSendingAccounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure (non-ok response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "API key do Instantly não configurada" }),
    });

    const { result } = renderHook(() => useSendingAccounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("API key do Instantly não configurada");
    expect(result.current.accounts).toEqual([]);
  });

  it("sets error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSendingAccounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.accounts).toEqual([]);
  });

  it("refetch re-fetches accounts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    });

    const { result } = renderHook(() => useSendingAccounts());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accounts).toHaveLength(2);

    const updatedAccounts = [...mockAccounts, { email: "sender3@company.com" }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(updatedAccounts),
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.accounts).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // M1 fix: enabled parameter
  it("does not fetch when enabled is false", async () => {
    const { result } = renderHook(() => useSendingAccounts({ enabled: false }));

    // Should not be loading and should not have called fetch
    expect(result.current.isLoading).toBe(false);
    expect(result.current.accounts).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches when enabled changes from false to true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccounts),
    });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSendingAccounts({ enabled }),
      { initialProps: { enabled: false } }
    );

    expect(mockFetch).not.toHaveBeenCalled();

    // Re-render with enabled=true
    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accounts).toEqual(mockAccounts);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
