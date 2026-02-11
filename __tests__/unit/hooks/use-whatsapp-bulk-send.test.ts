/**
 * Unit tests for useWhatsAppBulkSend hook
 * Story 11.6 AC#5, AC#7
 *
 * Tests: start with N leads, progress updates, cancel mid-send,
 * individual failures continue, interval applied, jitter randomized,
 * onLeadSent callback, empty leads array, reset
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock server action
const mockSendWhatsAppMessage = vi.fn();
vi.mock("@/actions/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

// Mock react-query (Story 11.7 AC#9 — cache invalidation)
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

import {
  useWhatsAppBulkSend,
  type BulkSendLead,
} from "@/hooks/use-whatsapp-bulk-send";

// ==============================================
// FIXTURES
// ==============================================

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

function createLeads(count: number): BulkSendLead[] {
  return Array.from({ length: count }, (_, i) => ({
    leadEmail: `lead-${i}@test.com`,
    phone: `+551199900000${i}`,
    firstName: `Lead`,
    lastName: `${i}`,
  }));
}

const defaultParams = {
  campaignId: CAMPAIGN_ID,
  leads: createLeads(3),
  message: "Olá, tudo bem?",
  intervalMs: 60000,
};

function makeSuccessResult(leadEmail: string) {
  return {
    success: true as const,
    data: {
      id: `msg-${leadEmail}`,
      tenant_id: "tenant-1",
      campaign_id: CAMPAIGN_ID,
      lead_id: `lead-id-${leadEmail}`,
      phone: "+5511999999999",
      message: "Olá",
      status: "sent" as const,
      external_message_id: "MSG-1",
      external_zaap_id: "ZAAP-1",
      error_message: null,
      sent_at: "2026-02-11T12:00:00Z",
      created_at: "2026-02-11T12:00:00Z",
      updated_at: "2026-02-11T12:00:00Z",
    },
  };
}

function makeFailureResult(error: string) {
  return { success: false as const, error };
}

// ==============================================
// TESTS
// ==============================================

describe("useWhatsAppBulkSend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Default: all sends succeed
    mockSendWhatsAppMessage.mockImplementation((input: { leadEmail: string }) =>
      Promise.resolve(makeSuccessResult(input.leadEmail))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial state: not running, no progress", () => {
    const { result } = renderHook(() => useWhatsAppBulkSend());

    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isCancelled).toBe(false);
    expect(result.current.progress).toEqual({
      total: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      current: 0,
    });
    expect(result.current.leadStatuses.size).toBe(0);
    expect(result.current.leadErrors.size).toBe(0);
  });

  describe("start and progress", () => {
    it("processes all leads and marks complete", async () => {
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start(defaultParams);
      });

      // After first send, need to advance timer for interval
      // Lead 0 sent, waiting for interval before lead 1
      await act(async () => {
        vi.advanceTimersByTime(70000); // > 60000 * 1.2
      });

      // Lead 1 sent, waiting for interval before lead 2
      await act(async () => {
        vi.advanceTimersByTime(70000);
      });

      // Lead 2 is last — NO interval after last lead
      await act(async () => {
        await startPromise;
      });

      expect(result.current.isComplete).toBe(true);
      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress.sent).toBe(3);
      expect(result.current.progress.failed).toBe(0);
      expect(result.current.progress.total).toBe(3);
      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
    });

    it("calls sendWhatsAppMessage with correct params for each lead", async () => {
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 1000,
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      await act(async () => {
        await startPromise;
      });

      expect(mockSendWhatsAppMessage).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        leadEmail: leads[0].leadEmail,
        phone: leads[0].phone,
        message: "Olá, tudo bem?",
      });
      expect(mockSendWhatsAppMessage).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        leadEmail: leads[1].leadEmail,
        phone: leads[1].phone,
        message: "Olá, tudo bem?",
      });
    });

    it("updates lead statuses progressively", async () => {
      const leads = createLeads(2);
      let resolveFirst: () => void;
      const firstSendPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      mockSendWhatsAppMessage.mockImplementationOnce(
        (input: { leadEmail: string }) =>
          firstSendPromise.then(() => makeSuccessResult(input.leadEmail))
      );
      mockSendWhatsAppMessage.mockImplementation(
        (input: { leadEmail: string }) =>
          Promise.resolve(makeSuccessResult(input.leadEmail))
      );

      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        result.current.start({ ...defaultParams, leads, intervalMs: 1000 });
      });

      // First lead is "sending"
      expect(result.current.leadStatuses.get(leads[0].leadEmail)).toBe("sending");
      expect(result.current.leadStatuses.get(leads[1].leadEmail)).toBe("pending");

      // Resolve first send
      await act(async () => {
        resolveFirst!();
      });

      expect(result.current.leadStatuses.get(leads[0].leadEmail)).toBe("sent");

      // Advance timer for interval
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // Wait for second send
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.leadStatuses.get(leads[1].leadEmail)).toBe("sent");
    });

    it("calls onLeadSent callback after each successful send", async () => {
      const onLeadSent = vi.fn();
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 1000,
          onLeadSent,
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      await act(async () => {
        await startPromise;
      });

      expect(onLeadSent).toHaveBeenCalledTimes(2);
      expect(onLeadSent).toHaveBeenCalledWith(leads[0].leadEmail);
      expect(onLeadSent).toHaveBeenCalledWith(leads[1].leadEmail);
    });

    it("does NOT call onLeadSent for failed sends", async () => {
      const onLeadSent = vi.fn();
      mockSendWhatsAppMessage.mockResolvedValue(makeFailureResult("Z-API error"));

      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads: createLeads(1),
          onLeadSent,
        });
      });

      await act(async () => {
        await startPromise;
      });

      expect(onLeadSent).not.toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("continues to next lead when one fails", async () => {
      const leads = createLeads(3);
      // Second lead fails
      mockSendWhatsAppMessage
        .mockImplementationOnce((input: { leadEmail: string }) =>
          Promise.resolve(makeSuccessResult(input.leadEmail))
        )
        .mockImplementationOnce(() =>
          Promise.resolve(makeFailureResult("Z-API não configurado"))
        )
        .mockImplementationOnce((input: { leadEmail: string }) =>
          Promise.resolve(makeSuccessResult(input.leadEmail))
        );

      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 1000,
        });
      });

      // Advance timers for all intervals
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await act(async () => {
        await startPromise;
      });

      expect(result.current.isComplete).toBe(true);
      expect(result.current.progress.sent).toBe(2);
      expect(result.current.progress.failed).toBe(1);
      expect(result.current.leadStatuses.get(leads[1].leadEmail)).toBe("failed");
      expect(result.current.leadErrors.get(leads[1].leadEmail)).toBe("Z-API não configurado");
      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
    });

    it("stores error message for failed leads", async () => {
      mockSendWhatsAppMessage.mockResolvedValue(
        makeFailureResult("Lead não encontrado")
      );

      const leads = createLeads(1);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
        });
      });

      await act(async () => {
        await startPromise;
      });

      expect(result.current.leadStatuses.get(leads[0].leadEmail)).toBe("failed");
      expect(result.current.leadErrors.get(leads[0].leadEmail)).toBe(
        "Lead não encontrado"
      );
    });
  });

  describe("cancel", () => {
    it("stops the queue when cancel is called", async () => {
      const leads = createLeads(3);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 5000,
        });
      });

      // First send completes, now waiting for interval
      // Cancel during the interval
      await act(async () => {
        result.current.cancel();
      });

      // Advance past what would be the full interval
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.isCancelled).toBe(true);
      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress.sent).toBe(1);
      expect(result.current.progress.cancelled).toBe(2);

      // Remaining leads should be cancelled
      expect(result.current.leadStatuses.get(leads[1].leadEmail)).toBe("cancelled");
      expect(result.current.leadStatuses.get(leads[2].leadEmail)).toBe("cancelled");
    });

    it("marks already sent leads as sent even after cancel", async () => {
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 5000,
        });
      });

      // First lead already sent
      await act(async () => {
        result.current.cancel();
      });

      expect(result.current.leadStatuses.get(leads[0].leadEmail)).toBe("sent");
    });
  });

  describe("isWaiting state", () => {
    it("sets isWaiting true during interval between sends", async () => {
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 60000,
        });
      });

      // After first send, hook should be waiting for interval
      expect(result.current.isWaiting).toBe(true);

      // Advance past interval
      await act(async () => {
        vi.advanceTimersByTime(75000);
      });

      // After interval resolves and second send completes, not waiting anymore
      expect(result.current.isWaiting).toBe(false);
    });

    it("clears isWaiting on cancel", async () => {
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 60000,
        });
      });

      expect(result.current.isWaiting).toBe(true);

      await act(async () => {
        result.current.cancel();
      });

      expect(result.current.isWaiting).toBe(false);
    });

    it("isWaiting is false for last lead (no interval after last)", async () => {
      const leads = createLeads(1);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        await result.current.start({
          ...defaultParams,
          leads,
        });
      });

      expect(result.current.isWaiting).toBe(false);
      expect(result.current.isComplete).toBe(true);
    });
  });

  describe("interval and jitter", () => {
    it("applies interval between sends (not after last)", async () => {
      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 60000,
        });
      });

      // First lead sent immediately, second waits for interval
      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);

      // Advance by minimum jitter (60000 - 20% = 48000)
      await act(async () => {
        vi.advanceTimersByTime(47000);
      });

      // Should NOT have sent second yet (48000 minimum)
      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);

      // Advance past maximum jitter (60000 + 20% = 72000)
      await act(async () => {
        vi.advanceTimersByTime(30000); // total 77000ms
      });

      await act(async () => {
        await startPromise;
      });

      // Now second should be sent
      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
    });

    it("produces jitter within ±20% range", async () => {
      // Seed Math.random to produce a known value
      const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0); // min jitter: -20%

      const leads = createLeads(2);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
          intervalMs: 60000,
        });
      });

      // With Math.random() = 0, jitter = 60000 + (0 * 2 - 1) * 0.2 * 60000 = 60000 - 12000 = 48000
      await act(async () => {
        vi.advanceTimersByTime(48001);
      });

      await act(async () => {
        await startPromise;
      });

      expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
      mockRandom.mockRestore();
    });
  });

  describe("reset", () => {
    it("clears all state after reset", async () => {
      const leads = createLeads(1);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      let startPromise: Promise<void>;
      await act(async () => {
        startPromise = result.current.start({
          ...defaultParams,
          leads,
        });
      });

      await act(async () => {
        await startPromise;
      });

      expect(result.current.isComplete).toBe(true);

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.isComplete).toBe(false);
      expect(result.current.isCancelled).toBe(false);
      expect(result.current.progress).toEqual({
        total: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        current: 0,
      });
      expect(result.current.leadStatuses.size).toBe(0);
      expect(result.current.leadErrors.size).toBe(0);
    });
  });

  describe("empty leads", () => {
    it("completes immediately with empty leads array", async () => {
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        await result.current.start({
          ...defaultParams,
          leads: [],
        });
      });

      expect(result.current.isComplete).toBe(true);
      expect(result.current.progress.total).toBe(0);
      expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });

  describe("cache invalidation (AC 11.7 #9)", () => {
    it("invalidates whatsapp-messages and leadTracking queries after bulk complete", async () => {
      const leads = createLeads(1);
      const { result } = renderHook(() => useWhatsAppBulkSend());

      await act(async () => {
        await result.current.start({
          ...defaultParams,
          leads,
        });
      });

      expect(result.current.isComplete).toBe(true);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["whatsapp-messages"] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["lead-tracking"] });
    });
  });
});
