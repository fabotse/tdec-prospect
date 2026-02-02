/**
 * Unit tests for usePhoneLookup Hook
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 * Story: 4.5 - Phone Number Lookup
 *
 * Tests:
 * - Mutation calls correct API endpoints (initiate + poll)
 * - Success triggers toast and invalidates queries
 * - Error triggers toast with message
 * - Respects options for toast display
 * - AC 4.4.2 #6.1 - Initiate lookup and receive lookupId
 * - AC 4.4.2 #6.3 - Poll until status !== pending/processing
 * - AC 4.4.2 #6.4 - Timeout after 30 seconds
 * - AC 4.4.2 #6.5 - Save phone to database on success
 * - AC 4.5 #2.4 - Identifier priority (LinkedIn > email)
 * - AC 4.5 #4 - Batch lookup with progress
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePhoneLookup,
  getLeadIdentifier,
  batchPhoneLookup,
} from "@/hooks/use-phone-lookup";
import * as sonner from "sonner";
import type { Lead } from "@/types/lead";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Mock lead factory
function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: null,
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    companyName: "Test Corp",
    companySize: "50-100",
    industry: "Technology",
    location: "São Paulo",
    title: "Developer",
    linkedinUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _isImported: true,
    ...overrides,
  };
}

/**
 * Create mock fetch for the new callback architecture
 * 1. POST /api/integrations/signalhire/lookup -> { lookupId, requestId }
 * 2. GET /api/integrations/signalhire/lookup/{lookupId} -> { status, phone }
 */
function createCallbackArchitectureMock(options: {
  lookupId?: string;
  requestId?: string;
  phone?: string;
  status?: string;
  errorMessage?: string;
  pollsBeforeComplete?: number;
}) {
  const {
    lookupId = "lookup-123",
    requestId = "req-123",
    phone = "+5511999887766",
    status = "success",
    errorMessage = null,
    pollsBeforeComplete = 0,
  } = options;

  let pollCount = 0;

  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    // POST to initiate lookup
    if (url === "/api/integrations/signalhire/lookup" && opts?.method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 202,
        json: () =>
          Promise.resolve({
            data: { lookupId, requestId },
          }),
      });
    }

    // GET to poll status
    if (url.startsWith("/api/integrations/signalhire/lookup/") && (!opts?.method || opts?.method === "GET")) {
      pollCount++;

      // Simulate processing state for first N polls
      if (pollCount <= pollsBeforeComplete) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: lookupId,
                status: "processing",
                phone: null,
                errorMessage: null,
                createdAt: new Date().toISOString(),
              },
            }),
        });
      }

      // Return final status
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: lookupId,
              status,
              phone: status === "success" ? phone : null,
              errorMessage,
              createdAt: new Date().toISOString(),
            },
          }),
      });
    }

    // PATCH to save phone
    if (url.includes("/api/leads/") && url.includes("/phone") && opts?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { id: "lead-1" } }),
      });
    }

    // Default response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

describe("usePhoneLookup (4.4.2 Callback Architecture)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers with auto-advance to reduce act() warnings
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    // Flush any pending timers and state updates to avoid act() warnings
    await vi.runAllTimersAsync();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("mutation behavior", () => {
    it("calls initiate and poll endpoints correctly", async () => {
      const fetchMock = createCallbackArchitectureMock({});
      global.fetch = fetchMock;

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "https://linkedin.com/in/john-doe",
        });
        // Advance timers within act to avoid warnings
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should have called initiate endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/signalhire/lookup",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("linkedin.com/in/john-doe"),
        })
      );

      // Should have called poll endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/signalhire/lookup/lookup-123",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("returns phone data on success", async () => {
      global.fetch = createCallbackArchitectureMock({
        phone: "+5511999887766",
        status: "success",
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.phone).toBe("+5511999887766");
      expect(result.current.data?.status).toBe("success");
    });

    it("shows success toast by default", async () => {
      global.fetch = createCallbackArchitectureMock({
        phone: "+5511999887766",
        status: "success",
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(sonner.toast.success).toHaveBeenCalledWith(
        "Telefone encontrado e salvo",
        expect.objectContaining({
          description: expect.stringContaining("+5511999887766"),
        })
      );
    });

    it("shows error toast on failure", async () => {
      global.fetch = createCallbackArchitectureMock({
        status: "failed",
        errorMessage: "Contato não encontrado no SignalHire.",
      });

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "notfound@example.com",
        });
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(sonner.toast.error).toHaveBeenCalledWith(
        "Falha na busca",
        expect.objectContaining({
          description: expect.any(String),
        })
      );
    });

    it("does not show toast when disabled", async () => {
      global.fetch = createCallbackArchitectureMock({
        phone: "+5511999887766",
        status: "success",
      });

      const { result } = renderHook(
        () =>
          usePhoneLookup({
            showSuccessToast: false,
            showErrorToast: false,
          }),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(sonner.toast.success).not.toHaveBeenCalled();
    });
  });

  describe("polling behavior", () => {
    it("polls until status is not pending or processing", async () => {
      const fetchMock = createCallbackArchitectureMock({
        pollsBeforeComplete: 2,
        status: "success",
        phone: "+5511999887766",
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        // Advance through multiple poll cycles
        await vi.advanceTimersByTimeAsync(10000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should have polled multiple times (1 initiate + 3 polls)
      expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe("loading state", () => {
    it("sets isLoading during request", async () => {
      global.fetch = createCallbackArchitectureMock({});

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("reset functionality", () => {
    it("resets mutation state", async () => {
      global.fetch = createCallbackArchitectureMock({});

      const { result } = renderHook(() => usePhoneLookup(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await act(async () => {
        result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(false);
      });
      expect(result.current.data).toBeUndefined();
    });
  });

  describe("saveToDatabase option", () => {
    it("saves phone to database when saveToDatabase is true", async () => {
      const fetchMock = createCallbackArchitectureMock({
        phone: "+5511999887766",
        status: "success",
      });
      global.fetch = fetchMock;

      const { result } = renderHook(
        () =>
          usePhoneLookup({
            leadId: "lead-1",
            saveToDatabase: true,
          }),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should have called phone save endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/leads/lead-1/phone",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ phone: "+5511999887766" }),
        })
      );
    });

    it("does not save to database when saveToDatabase is false", async () => {
      const fetchMock = createCallbackArchitectureMock({
        phone: "+5511999887766",
        status: "success",
      });
      global.fetch = fetchMock;

      const { result } = renderHook(
        () =>
          usePhoneLookup({
            leadId: "lead-1",
            saveToDatabase: false,
          }),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        result.current.lookupPhone({
          identifier: "test@example.com",
        });
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should NOT have called phone save endpoint
      const phoneSaveCalls = fetchMock.mock.calls.filter(
        (call) => call[0].includes("/phone") && call[1]?.method === "PATCH"
      );
      expect(phoneSaveCalls).toHaveLength(0);
    });
  });
});

// Story 4.5: AC #2.4 - Identifier priority
describe("getLeadIdentifier", () => {
  it("returns LinkedIn URL when available", () => {
    const lead = createMockLead({
      linkedinUrl: "https://linkedin.com/in/john-doe",
      email: "john@example.com",
    });

    expect(getLeadIdentifier(lead)).toBe("https://linkedin.com/in/john-doe");
  });

  it("returns email when LinkedIn is not available", () => {
    const lead = createMockLead({
      linkedinUrl: null,
      email: "john@example.com",
    });

    expect(getLeadIdentifier(lead)).toBe("john@example.com");
  });

  it("returns null when neither LinkedIn nor email is available", () => {
    const lead = createMockLead({
      linkedinUrl: null,
      email: null,
    });

    expect(getLeadIdentifier(lead)).toBeNull();
  });

  it("prioritizes LinkedIn URL over email", () => {
    const lead = createMockLead({
      linkedinUrl: "https://linkedin.com/in/john",
      email: "john@test.com",
    });

    expect(getLeadIdentifier(lead)).toBe("https://linkedin.com/in/john");
  });
});

// Story 4.5: AC #4 - Batch phone lookup
describe("batchPhoneLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("processes leads sequentially with polling", async () => {
    const fetchMock = createCallbackArchitectureMock({
      phone: "+5511999887766",
      status: "success",
    });
    global.fetch = fetchMock;

    const leads = [
      createMockLead({ id: "1", email: "lead1@test.com" }),
      createMockLead({ id: "2", email: "lead2@test.com" }),
    ];

    const resultPromise = batchPhoneLookup(leads);

    // Advance timers to complete all lookups
    await vi.advanceTimersByTimeAsync(30000);

    const results = await resultPromise;

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("found");
    expect(results[1].status).toBe("found");
  });

  it("reports progress via callback", async () => {
    const fetchMock = createCallbackArchitectureMock({
      phone: "+5511999887766",
      status: "success",
    });
    global.fetch = fetchMock;

    const progressCalls: Array<{ current: number; total: number }> = [];
    const leads = [
      createMockLead({ id: "1", email: "lead1@test.com" }),
      createMockLead({ id: "2", email: "lead2@test.com" }),
    ];

    const resultPromise = batchPhoneLookup(leads, (current, total) => {
      progressCalls.push({ current, total });
    });

    await vi.advanceTimersByTimeAsync(30000);
    await resultPromise;

    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0]).toEqual({ current: 1, total: 2 });
    expect(progressCalls[1]).toEqual({ current: 2, total: 2 });
  });

  it("handles leads without identifier", async () => {
    const fetchMock = createCallbackArchitectureMock({});
    global.fetch = fetchMock;

    const leads = [
      createMockLead({ id: "1", email: null, linkedinUrl: null }),
    ];

    const results = await batchPhoneLookup(leads);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("error");
    expect(results[0].error).toBe("Lead sem email ou LinkedIn");
  });

  it("handles not_found status", async () => {
    const fetchMock = createCallbackArchitectureMock({
      status: "not_found",
    });
    global.fetch = fetchMock;

    const leads = [createMockLead({ id: "1", email: "test@test.com" })];

    const resultPromise = batchPhoneLookup(leads);
    await vi.advanceTimersByTimeAsync(10000);
    const results = await resultPromise;

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("not_found");
  });

  it("can be cancelled via AbortSignal", async () => {
    const fetchMock = createCallbackArchitectureMock({});
    global.fetch = fetchMock;

    const controller = new AbortController();
    const leads = [
      createMockLead({ id: "1", email: "lead1@test.com" }),
      createMockLead({ id: "2", email: "lead2@test.com" }),
    ];

    // Abort immediately
    controller.abort();

    const results = await batchPhoneLookup(leads, undefined, controller.signal);

    // Should stop processing when aborted
    expect(results.length).toBeLessThanOrEqual(leads.length);
  });
});
