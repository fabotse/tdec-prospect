/**
 * Unit tests for useWhatsAppSend hook
 * Story 11.4 AC#3
 *
 * Tests: loading state, success with toast, error with toast, lastResult
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server action
const mockSendWhatsAppMessage = vi.fn();
vi.mock("@/actions/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

import { useWhatsAppSend } from "@/hooks/use-whatsapp-send";

// ==============================================
// FIXTURES
// ==============================================

const validParams = {
  campaignId: "550e8400-e29b-41d4-a716-446655440000",
  leadEmail: "lead@test.com",
  phone: "5511999999999",
  message: "Olá!",
};

const mockMessage = {
  id: "msg-1",
  tenant_id: "tenant-1",
  campaign_id: validParams.campaignId,
  lead_id: "lead-1",
  phone: validParams.phone,
  message: validParams.message,
  status: "sent" as const,
  external_message_id: "MSG-1",
  external_zaap_id: "ZAAP-1",
  error_message: null,
  sent_at: "2026-02-10T12:00:00Z",
  created_at: "2026-02-10T12:00:00Z",
  updated_at: "2026-02-10T12:00:00Z",
};

// ==============================================
// TESTS
// ==============================================

describe("useWhatsAppSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state: not sending, no error, no result", () => {
    const { result } = renderHook(() => useWhatsAppSend());

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResult).toBeNull();
    expect(typeof result.current.send).toBe("function");
  });

  describe("successful send", () => {
    it("returns true and sets lastResult on success", async () => {
      mockSendWhatsAppMessage.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSend());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.send(validParams);
      });

      expect(sendResult!).toBe(true);
      expect(result.current.lastResult).toEqual(mockMessage);
      expect(result.current.error).toBeNull();
      expect(result.current.isSending).toBe(false);
    });

    it("shows success toast", async () => {
      mockSendWhatsAppMessage.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSend());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith("Mensagem WhatsApp enviada com sucesso!");
    });

    it("calls sendWhatsAppMessage with correct params", async () => {
      mockSendWhatsAppMessage.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSend());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(validParams);
    });
  });

  describe("error from action", () => {
    it("returns false and sets error on action failure", async () => {
      mockSendWhatsAppMessage.mockResolvedValue({
        success: false,
        error: "Z-API não configurado",
      });
      const { result } = renderHook(() => useWhatsAppSend());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.send(validParams);
      });

      expect(sendResult!).toBe(false);
      expect(result.current.error).toBe("Z-API não configurado");
      expect(result.current.lastResult).toBeNull();
    });

    it("shows error toast with reason", async () => {
      mockSendWhatsAppMessage.mockResolvedValue({
        success: false,
        error: "Lead não encontrado",
      });
      const { result } = renderHook(() => useWhatsAppSend());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Falha ao enviar mensagem WhatsApp: Lead não encontrado"
      );
    });
  });

  describe("unexpected exception", () => {
    it("catches thrown errors and sets error state", async () => {
      mockSendWhatsAppMessage.mockRejectedValue(new Error("Network failure"));
      const { result } = renderHook(() => useWhatsAppSend());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.send(validParams);
      });

      expect(sendResult!).toBe(false);
      expect(result.current.error).toBe("Network failure");
    });

    it("shows error toast for thrown errors", async () => {
      mockSendWhatsAppMessage.mockRejectedValue(new Error("Connection lost"));
      const { result } = renderHook(() => useWhatsAppSend());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Falha ao enviar mensagem WhatsApp: Connection lost"
      );
    });
  });

  it("clears previous error on new send attempt", async () => {
    // First call fails
    mockSendWhatsAppMessage.mockResolvedValueOnce({ success: false, error: "Erro" });
    const { result } = renderHook(() => useWhatsAppSend());

    await act(async () => {
      await result.current.send(validParams);
    });
    expect(result.current.error).toBe("Erro");

    // Second call succeeds — error should be cleared
    mockSendWhatsAppMessage.mockResolvedValueOnce({ success: true, data: mockMessage });
    await act(async () => {
      await result.current.send(validParams);
    });
    expect(result.current.error).toBeNull();
  });
});
