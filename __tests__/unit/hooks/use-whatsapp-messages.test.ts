/**
 * Unit Tests for useWhatsAppMessages hook
 * Story 11.7 AC#1 — Fetch WhatsApp message history
 *
 * Tests: loading state, data return, filter by leadEmail, error handling,
 * empty state, campaign mode, lead mode, disabled state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWhatsAppMessages } from "@/hooks/use-whatsapp-messages";

global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const campaignId = "campaign-uuid-001";
const leadEmail = "joao@example.com";

const mockCampaignMessages = [
  {
    id: "msg-1",
    lead_email: "joao@example.com",
    lead_name: "João Silva",
    phone: "+5511999991234",
    message: "Olá João...",
    status: "sent",
    sent_at: "2026-02-10T14:32:00Z",
    created_at: "2026-02-10T14:32:00Z",
  },
];

const mockLeadMessages = [
  {
    id: "msg-1",
    phone: "+5511999991234",
    message: "Olá João...",
    status: "sent",
    campaign_name: "Outbound Q1",
    sent_at: "2026-02-10T14:32:00Z",
    created_at: "2026-02-10T14:32:00Z",
  },
  {
    id: "msg-2",
    phone: "+5511999991234",
    message: "Boa tarde...",
    status: "failed",
    campaign_name: "Outbound Q4",
    sent_at: null,
    created_at: "2026-02-09T10:00:00Z",
  },
];

describe("useWhatsAppMessages (Story 11.7 AC#1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("campaign mode", () => {
    it("starts in loading state and returns messages", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaignMessages }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(campaignId),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].lead_email).toBe("joao@example.com");
      expect(fetch).toHaveBeenCalledWith(
        `/api/campaigns/${campaignId}/whatsapp-messages`
      );
    });

    it("passes leadEmail filter in campaign mode", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaignMessages }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(campaignId, leadEmail),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(fetch).toHaveBeenCalledWith(
        `/api/campaigns/${campaignId}/whatsapp-messages?leadEmail=${encodeURIComponent(leadEmail)}`
      );
    });
  });

  describe("lead mode (all campaigns)", () => {
    it("fetches messages across all campaigns for a lead", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockLeadMessages }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(undefined, leadEmail),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].campaign_name).toBe("Outbound Q1");
      expect(fetch).toHaveBeenCalledWith(
        `/api/leads/whatsapp-messages?email=${encodeURIComponent(leadEmail)}`
      );
    });
  });

  describe("error handling", () => {
    it("returns error on failed response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Erro ao buscar mensagens WhatsApp" }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(campaignId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.error).not.toBeNull());

      expect(result.current.error?.message).toBe("Erro ao buscar mensagens WhatsApp");
      expect(result.current.messages).toEqual([]);
    });
  });

  describe("empty state", () => {
    it("returns empty array when no messages", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(campaignId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.messages).toEqual([]);
    });
  });

  describe("disabled state", () => {
    it("does not fetch when neither campaignId nor leadEmail provided", () => {
      renderHook(
        () => useWhatsAppMessages(undefined, undefined),
        { wrapper: createWrapper() }
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    it("does not fetch when enabled is false", () => {
      renderHook(
        () => useWhatsAppMessages(campaignId, undefined, { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("refetch", () => {
    it("exposes refetch function", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCampaignMessages }),
      } as Response);

      const { result } = renderHook(
        () => useWhatsAppMessages(campaignId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(typeof result.current.refetch).toBe("function");
    });
  });
});
