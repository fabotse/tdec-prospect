/**
 * AISearchInput Component Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #1 - Text input for natural language search
 * AC: #2 - Phase-specific loading messages
 * AC: #3 - Display extracted filters as badges
 * AC: #6 - Microphone button with visual indicator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AISearchInput } from "@/components/search/AISearchInput";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock MediaRecorder
class MockMediaRecorder {
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["audio"], { type: "audio/webm" }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  static isTypeSupported() {
    return true;
  }
}

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {}, // Suppress error logging in tests to avoid unhandled rejection warnings
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("AISearchInput", () => {
  beforeEach(() => {
    mockFetch.mockReset();

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
      configurable: true,
    });

    // Mock navigator.permissions
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn().mockResolvedValue({
          state: "granted",
          onchange: null,
        }),
      },
      writable: true,
      configurable: true,
    });

    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders input, search button, and voice button", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    expect(screen.getByTestId("ai-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("ai-search-button")).toBeInTheDocument();
    expect(screen.getByTestId("voice-button")).toBeInTheDocument();
  });

  it("disables search button when input is empty", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const searchButton = screen.getByTestId("ai-search-button");
    expect(searchButton).toBeDisabled();
  });

  it("enables search button when input has text", async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "leads de tecnologia");

    const searchButton = screen.getByTestId("ai-search-button");
    expect(searchButton).not.toBeDisabled();
  });

  it("shows loading state during search", async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockImplementationOnce(() => promise);

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "leads de tecnologia");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    // Should show loading message
    await waitFor(() => {
      expect(screen.getByText(/Entendendo sua busca.../i)).toBeInTheDocument();
    });

    // Resolve to cleanup
    resolvePromise!({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {},
              confidence: 0.9,
              explanation: "",
              originalQuery: "leads de tecnologia",
            },
          },
        }),
    });
  });

  it("displays extracted filters after search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {
                industries: ["technology"],
                locations: ["São Paulo, Brazil"],
              },
              confidence: 0.9,
              explanation: "Busca por tecnologia em SP",
              originalQuery: "leads de tecnologia em SP",
            },
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "leads de tecnologia em SP");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Tecnologia")).toBeInTheDocument();
      expect(screen.getByText("São Paulo, Brazil")).toBeInTheDocument();
    });
  });

  it("calls onFiltersExtracted when edit clicked", async () => {
    const onFiltersExtracted = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {
                industries: ["technology"],
              },
              confidence: 0.9,
              explanation: "",
              originalQuery: "tech leads",
            },
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput onFiltersExtracted={onFiltersExtracted} />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "tech leads");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByTestId("edit-filters-button")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("edit-filters-button"));

    expect(onFiltersExtracted).toHaveBeenCalledWith({
      industries: ["technology"],
    });
  });

  it("handles Enter key to submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {},
              confidence: 0.9,
              explanation: "",
              originalQuery: "test",
            },
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "test{enter}");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/search",
      expect.any(Object)
    );
  });

  it("shows mic icon when idle", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const voiceButton = screen.getByTestId("voice-button");
    expect(voiceButton).toBeInTheDocument();
    expect(voiceButton).not.toBeDisabled();
  });

  it("shows error message when search fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "AI_EXTRACTION_ERROR",
            message:
              "Não consegui entender sua busca. Tente ser mais específico.",
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "xyz");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    // Wait for error to appear and mutation to fully settle
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-error")).toBeInTheDocument();
    });

    expect(screen.getByText(/Não consegui entender/i)).toBeInTheDocument();

    // Wait for all pending promises to settle to avoid unhandled rejection
    await waitFor(() => {
      // Verify the search button is re-enabled (mutation settled)
      expect(screen.getByTestId("ai-search-button")).not.toBeDisabled();
    });
  });

  it("shows placeholder text", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    expect(
      screen.getByPlaceholderText(
        /Descreva os leads que você procura/i
      )
    ).toBeInTheDocument();
  });

  it("shows sparkle icon in search button", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    expect(screen.getByText("Buscar com IA")).toBeInTheDocument();
  });
});
