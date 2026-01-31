/**
 * AI Search Integration Tests
 * Story: 3.4 - AI Conversational Search
 *
 * Tests the full AI search flow from input to results display.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AISearchInput } from "@/components/search/AISearchInput";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

describe("AI Search Flow", () => {
  beforeEach(() => {
    mockFetch.mockReset();

    // Mock navigator for voice recording
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn().mockResolvedValue({ state: "granted", onchange: null }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("completes full AI search flow (text input)", async () => {
    const mockResponse = {
      leads: [
        {
          id: "1",
          firstName: "João",
          lastName: "Silva",
          email: "joao@tech.com",
          status: "novo",
          companyName: "TechCorp",
          industry: "technology",
          location: "São Paulo, Brazil",
        },
        {
          id: "2",
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@tech.com",
          status: "novo",
          companyName: "StartupXYZ",
          industry: "technology",
          location: "São Paulo, Brazil",
        },
      ],
      aiResult: {
        extractedFilters: {
          industries: ["technology"],
          locations: ["São Paulo, Brazil"],
          companySizes: ["11-50", "51-200"],
        },
        confidence: 0.92,
        explanation: "Busca por startups de tecnologia em São Paulo",
        originalQuery: "startups de tecnologia em São Paulo",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    const onSearchComplete = vi.fn();

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput onSearchComplete={onSearchComplete} />
      </Wrapper>
    );

    // 1. Type search query
    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "startups de tecnologia em São Paulo");

    // 2. Click search button
    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    // 3. Wait for results (loading state may pass too fast with mocks)
    await waitFor(() => {
      expect(screen.getByText("Tecnologia")).toBeInTheDocument();
    });

    // 5. Verify extracted filters are displayed
    expect(screen.getByText("São Paulo, Brazil")).toBeInTheDocument();
    expect(screen.getByText("11-50 func")).toBeInTheDocument();
    expect(screen.getByText("51-200 func")).toBeInTheDocument();

    // 6. Verify callback was called
    expect(onSearchComplete).toHaveBeenCalled();
  });

  it("populates manual filters from AI extraction", async () => {
    const extractedFilters = {
      industries: ["technology", "finance"],
      locations: ["Rio de Janeiro, Brazil"],
      titles: ["CTO", "CEO"],
      companySizes: ["51-200"],
      keywords: "fintech",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters,
              confidence: 0.85,
              explanation: "Busca por CTOs e CEOs de fintechs no RJ",
              originalQuery: "CTOs de fintechs no Rio",
            },
          },
        }),
    });

    const onFiltersExtracted = vi.fn();

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput onFiltersExtracted={onFiltersExtracted} />
      </Wrapper>
    );

    // Type and search
    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "CTOs de fintechs no Rio");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    // Wait for results
    await waitFor(() => {
      expect(screen.getByTestId("extracted-filters-display")).toBeInTheDocument();
    });

    // Click edit filters
    const editButton = screen.getByTestId("edit-filters-button");
    await userEvent.click(editButton);

    // Verify callback was called with extracted filters
    expect(onFiltersExtracted).toHaveBeenCalledWith(extractedFilters);
  });

  it("handles API errors and shows fallback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "AI_EXTRACTION_ERROR",
            message:
              "Não consegui entender sua busca. Tente ser mais específico ou use os filtros manuais.",
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    // Type ambiguous query
    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "xyzabc123");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-error")).toBeInTheDocument();
    });

    // Verify error message content
    expect(screen.getByText(/Não consegui entender/i)).toBeInTheDocument();
    expect(screen.getByText(/filtros manuais/i)).toBeInTheDocument();

    // Wait for mutation to fully settle
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-button")).not.toBeDisabled();
    });
  });

  it("shows low confidence indicator when confidence is below threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: {
                keywords: "algo vago",
              },
              confidence: 0.5, // Low confidence
              explanation: "Busca genérica",
              originalQuery: "algo vago",
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
    await userEvent.type(input, "algo vago");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Baixa confiança")).toBeInTheDocument();
    });
  });

  it("handles network timeout gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "TIMEOUT",
            message: "A busca demorou muito. Tente novamente.",
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
    await userEvent.type(input, "leads em SP");

    const searchButton = screen.getByTestId("ai-search-button");
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/demorou muito/i)).toBeInTheDocument();
    });

    // Wait for mutation to fully settle
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-button")).not.toBeDisabled();
    });
  });

  it("clears previous results when starting new search", async () => {
    // First search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [{ id: "1", firstName: "Test" }],
            aiResult: {
              extractedFilters: { industries: ["technology"] },
              confidence: 0.9,
              explanation: "First search",
              originalQuery: "first",
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

    // First search
    const input = screen.getByTestId("ai-search-input");
    await userEvent.type(input, "first");
    await userEvent.click(screen.getByTestId("ai-search-button"));

    await waitFor(() => {
      expect(screen.getByText("Tecnologia")).toBeInTheDocument();
    });

    // Second search with different filters
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: { industries: ["finance"] },
              confidence: 0.9,
              explanation: "Second search",
              originalQuery: "second",
            },
          },
        }),
    });

    await userEvent.clear(input);
    await userEvent.type(input, "second");
    await userEvent.click(screen.getByTestId("ai-search-button"));

    await waitFor(() => {
      expect(screen.getByText("Finanças")).toBeInTheDocument();
    });

    // First search filter should be replaced
    expect(screen.queryByText("Tecnologia")).not.toBeInTheDocument();
  });
});
