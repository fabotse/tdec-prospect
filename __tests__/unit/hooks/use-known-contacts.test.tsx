/**
 * useKnownContacts Hook Tests
 * Story 25.1 - Contatos conhecidos
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/actions/known-contacts", () => ({
  getKnownContacts: vi.fn(),
  addKnownContact: vi.fn(),
  updateKnownContact: vi.fn(),
  removeKnownContact: vi.fn(),
  importKnownContacts: vi.fn(),
  addKnownContactFromOpportunity: vi.fn(),
  findKnownContactLinkedin: vi.fn(),
}));

import {
  getKnownContacts,
  addKnownContact,
  updateKnownContact,
  removeKnownContact,
  importKnownContacts,
  addKnownContactFromOpportunity,
  findKnownContactLinkedin,
} from "@/actions/known-contacts";
import {
  useKnownContacts,
  useAddKnownContactFromOpportunity,
  KNOWN_CONTACTS_QUERY_KEY,
} from "@/hooks/use-known-contacts";
import type { KnownContact } from "@/types/known-contact";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, invalidateSpy, Wrapper };
}

const contact: KnownContact = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "t1",
  full_name: "João",
  title: null,
  company_name: "Acme",
  company_domain: null,
  linkedin_url: null,
  relation_type: "cliente_atual",
  source: "manual",
  lead_id: null,
  created_by: null,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T10:00:00Z",
};

const input = { fullName: "João", companyName: "Acme", relationType: "cliente_atual" as const };

describe("useKnownContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKnownContacts).mockResolvedValue({ success: true, data: [contact] });
  });

  it("carrega os contatos", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useKnownContacts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.contacts).toEqual([contact]);
    expect(result.current.error).toBeNull();
  });

  it("erro da action vira `error`", async () => {
    vi.mocked(getKnownContacts).mockResolvedValue({ success: false, error: "indisponível" });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useKnownContacts(), { wrapper: Wrapper });
    // O hook faz 1 retry (com o atraso padrão do react-query).
    await waitFor(() => expect(result.current.error).toBe("indisponível"), { timeout: 4000 });
  });

  it("add/update/remove com sucesso invalidam; falha não", async () => {
    vi.mocked(addKnownContact).mockResolvedValueOnce({ success: true, data: contact });
    vi.mocked(updateKnownContact).mockResolvedValueOnce({ success: false, error: "x" });
    vi.mocked(removeKnownContact).mockResolvedValueOnce({ success: true });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnownContacts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.addContact(input));
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await act(() => result.current.updateContact(contact.id, input));
    expect(updateKnownContact).toHaveBeenCalledWith(contact.id, input);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await act(() => result.current.removeContact(contact.id));
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("import invalida mesmo com erro (onSettled)", async () => {
    vi.mocked(importKnownContacts).mockResolvedValueOnce({ success: false, error: "parcial" });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnownContacts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.importContacts([]));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KNOWN_CONTACTS_QUERY_KEY });
  });

  it("busca de LinkedIn repassa a entrada e não invalida", async () => {
    vi.mocked(findKnownContactLinkedin).mockResolvedValueOnce({
      success: true,
      data: { candidates: [] },
    });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useKnownContacts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const lookup = { fullName: "João", companyName: "Acme" };
    await act(() => result.current.findLinkedin(lookup));
    expect(findKnownContactLinkedin).toHaveBeenCalledWith(lookup);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useAddKnownContactFromOpportunity", () => {
  it("chama a action e invalida a lista no sucesso", async () => {
    vi.mocked(addKnownContactFromOpportunity).mockResolvedValueOnce({
      success: true,
      data: { alreadyKnown: false },
    });
    const { Wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useAddKnownContactFromOpportunity(), {
      wrapper: Wrapper,
    });

    await act(() => result.current.mutateAsync("opp-1"));
    expect(addKnownContactFromOpportunity).toHaveBeenCalledWith("opp-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KNOWN_CONTACTS_QUERY_KEY });
  });
});
