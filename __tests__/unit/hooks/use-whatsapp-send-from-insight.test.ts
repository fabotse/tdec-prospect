/**
 * Unit tests for useWhatsAppSendFromInsight hook
 * Story 13.7 AC#2, AC#5
 *
 * Tests: loading state, success with toast, error with toast,
 *        cache invalidation (insights + insights-new-count)
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server action
const mockSendWhatsAppFromInsight = vi.fn();
vi.mock("@/actions/whatsapp", () => ({
  sendWhatsAppFromInsight: (...args: unknown[]) => mockSendWhatsAppFromInsight(...args),
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

// Mock react-query
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

import { useWhatsAppSendFromInsight } from "@/hooks/use-whatsapp-send-from-insight";

// ==============================================
// FIXTURES
// ==============================================

const validParams = {
  leadId: "550e8400-e29b-41d4-a716-446655440001",
  insightId: "550e8400-e29b-41d4-a716-446655440002",
  phone: "5511999999999",
  message: "Ola!",
};

const mockMessage = {
  id: "msg-1",
  tenant_id: "tenant-1",
  campaign_id: null,
  lead_id: validParams.leadId,
  phone: validParams.phone,
  message: validParams.message,
  status: "sent" as const,
  external_message_id: "MSG-1",
  external_zaap_id: "ZAAP-1",
  error_message: null,
  sent_at: "2026-02-28T12:00:00Z",
  created_at: "2026-02-28T12:00:00Z",
  updated_at: "2026-02-28T12:00:00Z",
};

// ==============================================
// TESTS
// ==============================================

describe("useWhatsAppSendFromInsight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state: not sending, no error, no result", () => {
    const { result } = renderHook(() => useWhatsAppSendFromInsight());

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResult).toBeNull();
    expect(typeof result.current.send).toBe("function");
  });

  describe("successful send", () => {
    it("returns true and sets lastResult on success", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

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
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockToastSuccess).toHaveBeenCalledWith("Mensagem WhatsApp enviada com sucesso!");
    });

    it("calls sendWhatsAppFromInsight with correct params", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockSendWhatsAppFromInsight).toHaveBeenCalledWith(validParams);
    });

    it("invalidates whatsapp-messages and lead-tracking queries on success", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["whatsapp-messages"] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["lead-tracking"] });
    });

    it("AC #5: invalidates insights and insights-new-count queries on success", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: true, data: mockMessage });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["insights"] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["insights-new-count"] });
    });

    it("does NOT invalidate queries on error", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({ success: false, error: "Erro" });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe("error from action", () => {
    it("returns false and sets error on action failure", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({
        success: false,
        error: "Z-API não configurado",
      });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.send(validParams);
      });

      expect(sendResult!).toBe(false);
      expect(result.current.error).toBe("Z-API não configurado");
      expect(result.current.lastResult).toBeNull();
    });

    it("shows error toast with reason", async () => {
      mockSendWhatsAppFromInsight.mockResolvedValue({
        success: false,
        error: "Lead não encontrado",
      });
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

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
      mockSendWhatsAppFromInsight.mockRejectedValue(new Error("Network failure"));
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.send(validParams);
      });

      expect(sendResult!).toBe(false);
      expect(result.current.error).toBe("Network failure");
    });

    it("shows error toast for thrown errors", async () => {
      mockSendWhatsAppFromInsight.mockRejectedValue(new Error("Connection lost"));
      const { result } = renderHook(() => useWhatsAppSendFromInsight());

      await act(async () => {
        await result.current.send(validParams);
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Falha ao enviar mensagem WhatsApp: Connection lost"
      );
    });
  });

  it("clears previous error on new send attempt", async () => {
    mockSendWhatsAppFromInsight.mockResolvedValueOnce({ success: false, error: "Erro" });
    const { result } = renderHook(() => useWhatsAppSendFromInsight());

    await act(async () => {
      await result.current.send(validParams);
    });
    expect(result.current.error).toBe("Erro");

    mockSendWhatsAppFromInsight.mockResolvedValueOnce({ success: true, data: mockMessage });
    await act(async () => {
      await result.current.send(validParams);
    });
    expect(result.current.error).toBeNull();
  });
});
