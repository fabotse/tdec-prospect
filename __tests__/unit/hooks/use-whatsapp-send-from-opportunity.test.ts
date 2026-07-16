/**
 * Tests for useWhatsAppSendFromOpportunity
 * Story 21.5: Ações do Card — AC #3, #7
 *
 * Espelha use-whatsapp-send-from-insight.test.ts. Diferença: invalida
 * ["opportunities"] / ["opportunities-new-count"] (o auto-mark `contacted`
 * decrementa o badge `new` da sidebar).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSendWhatsAppFromOpportunity = vi.fn();
vi.mock("@/actions/whatsapp", () => ({
  sendWhatsAppFromOpportunity: (...args: unknown[]) =>
    mockSendWhatsAppFromOpportunity(...args),
}));

import { toast } from "sonner";
import { useWhatsAppSendFromOpportunity } from "@/hooks/use-whatsapp-send-from-opportunity";

const params = {
  opportunityId: "opp-1",
  leadId: "lead-1",
  phone: "5511999999999",
  message: "Ola!",
};

const sentMessage = {
  id: "msg-1",
  status: "sent",
  external_message_id: "MSG-1",
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useWhatsAppSendFromOpportunity(), {
    wrapper: createWrapper(queryClient),
  });
  return { result, invalidateSpy };
}

describe("useWhatsAppSendFromOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna true e repassa os parâmetros ao server action no sucesso", async () => {
    mockSendWhatsAppFromOpportunity.mockResolvedValue({ success: true, data: sentMessage });
    const { result } = setup();

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.send(params);
    });

    expect(returned).toBe(true);
    expect(mockSendWhatsAppFromOpportunity).toHaveBeenCalledWith(params);
    expect(toast.success).toHaveBeenCalledWith("Mensagem WhatsApp enviada com sucesso!");
  });

  it("invalida ['opportunities'] e ['opportunities-new-count'] no sucesso (auto-mark decrementa o badge)", async () => {
    mockSendWhatsAppFromOpportunity.mockResolvedValue({ success: true, data: sentMessage });
    const { result, invalidateSpy } = setup();

    await act(async () => {
      await result.current.send(params);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["opportunities"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["opportunities-new-count"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["whatsapp-messages"] });
  });

  it("expõe lastResult após o envio", async () => {
    mockSendWhatsAppFromOpportunity.mockResolvedValue({ success: true, data: sentMessage });
    const { result } = setup();

    await act(async () => {
      await result.current.send(params);
    });

    await waitFor(() => {
      expect(result.current.lastResult).toEqual(sentMessage);
    });
  });

  it("retorna false e mostra toast de erro quando o action falha", async () => {
    mockSendWhatsAppFromOpportunity.mockResolvedValue({
      success: false,
      error: "Instancia desconectada",
    });
    const { result, invalidateSpy } = setup();

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.send(params);
    });

    expect(returned).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Falha ao enviar mensagem WhatsApp: Instancia desconectada"
    );
    // Nada mudou no servidor → não invalida
    expect(invalidateSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.error).toBe("Instancia desconectada");
    });
  });

  it("retorna false quando o action lança (erro de rede)", async () => {
    mockSendWhatsAppFromOpportunity.mockRejectedValue(new Error("network down"));
    const { result } = setup();

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.send(params);
    });

    expect(returned).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Falha ao enviar mensagem WhatsApp: network down"
    );
  });

  it("isSending volta a false ao terminar", async () => {
    mockSendWhatsAppFromOpportunity.mockResolvedValue({ success: true, data: sentMessage });
    const { result } = setup();

    await act(async () => {
      await result.current.send(params);
    });

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
    });
  });
});
