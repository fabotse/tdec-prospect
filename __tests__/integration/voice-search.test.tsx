/**
 * Voice Search Integration Tests
 * Story: 3.4 - AI Conversational Search
 *
 * Tests the full voice search flow: record → transcribe → search
 * AC: #6, #7, #8, #9 - Voice input functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
  onerror: (() => void) | null = null;
  stream: MediaStream | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // Simulate audio data available
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(["mock audio data"], { type: "audio/webm" }),
      });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  static isTypeSupported(mimeType: string) {
    return mimeType === "audio/webm;codecs=opus" || mimeType === "audio/webm";
  }
}

// Mock MediaStream
class MockMediaStream {
  private tracks = [{ stop: vi.fn() }];

  getTracks() {
    return this.tracks;
  }
}

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Voice Search Flow", () => {
  const mockGetUserMedia = vi.fn();
  const mockQueryPermissions = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    // Mock navigator.permissions
    Object.defineProperty(navigator, "permissions", {
      value: { query: mockQueryPermissions },
      writable: true,
      configurable: true,
    });

    // Default permission state
    mockQueryPermissions.mockResolvedValue({
      state: "granted",
      onchange: null,
    });

    // Mock MediaRecorder
    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("completes full voice search flow (record → transcribe → search)", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock transcription response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { text: "leads de tecnologia em São Paulo" },
        }),
    });

    // Mock AI search response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [{ id: "1", firstName: "João", status: "novo" }],
            aiResult: {
              extractedFilters: {
                industries: ["technology"],
                locations: ["São Paulo, Brazil"],
              },
              confidence: 0.9,
              explanation: "Busca por tecnologia em SP",
              originalQuery: "leads de tecnologia em São Paulo",
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

    // 1. Click voice button to start recording
    const voiceButton = screen.getByTestId("voice-button");
    await userEvent.click(voiceButton);

    // 2. Verify recording started
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    // 3. Stop recording
    await userEvent.click(voiceButton);

    // 4. Wait for transcription to complete and search to execute
    await waitFor(
      () => {
        expect(screen.getByText("Tecnologia")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // 5. Verify transcription API was called
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/transcribe",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      })
    );

    // 6. Verify AI search API was called
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/search",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    // 7. Verify search results are displayed
    expect(screen.getByText("São Paulo, Brazil")).toBeInTheDocument();
  });

  it("handles microphone permission denial gracefully", async () => {
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError"
    );
    mockGetUserMedia.mockRejectedValue(permissionError);

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    // Click voice button
    const voiceButton = screen.getByTestId("voice-button");
    await userEvent.click(voiceButton);

    // Verify error message is shown
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-error")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Permissão de microfone negada/i)
    ).toBeInTheDocument();

    // Verify text input still works
    const input = screen.getByTestId("ai-search-input");
    expect(input).not.toBeDisabled();
  });

  it("shows appropriate phase messages during voice flow", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock both transcription and search to complete the flow
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { text: "test query" } }),
    });

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
              originalQuery: "test query",
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

    // Start recording
    const voiceButton = screen.getByTestId("voice-button");
    await userEvent.click(voiceButton);

    // Wait for recording to start (getUserMedia called)
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    // Verify button shows recording state (destructive variant and pulsing)
    await waitFor(() => {
      // The button should have data-testid and be in recording state
      const btn = screen.getByTestId("voice-button");
      expect(btn).toHaveClass("animate-pulse");
    });

    // Stop recording - this triggers transcription and search
    await userEvent.click(voiceButton);

    // Wait for the full flow to complete
    await waitFor(
      () => {
        // After transcription and search, the input should have the transcribed text
        const input = screen.getByTestId("ai-search-input") as HTMLInputElement;
        expect(input.value).toBe("test query");
      },
      { timeout: 3000 }
    );
  });

  it("recovers from transcription errors", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Transcription error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "TRANSCRIPTION_ERROR",
            message: "Erro ao transcrever áudio. Tente novamente.",
          },
        }),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    // Start and stop recording
    const voiceButton = screen.getByTestId("voice-button");
    await userEvent.click(voiceButton);
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });
    await userEvent.click(voiceButton);

    // Verify error is shown
    await waitFor(() => {
      expect(screen.getByTestId("ai-search-error")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Erro ao transcrever áudio/i)
    ).toBeInTheDocument();

    // Verify user can still use text input
    const input = screen.getByTestId("ai-search-input");
    expect(input).not.toBeDisabled();

    // User can type and search manually
    await userEvent.type(input, "manual search");
    expect(input).toHaveValue("manual search");
  });

  it("populates input with transcribed text", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock transcription
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { text: "CTOs de empresas de tecnologia" },
        }),
    });

    // Mock search (will be auto-triggered)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            leads: [],
            aiResult: {
              extractedFilters: { titles: ["CTO"], industries: ["technology"] },
              confidence: 0.85,
              explanation: "Busca por CTOs em tech",
              originalQuery: "CTOs de empresas de tecnologia",
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

    // Record voice
    const voiceButton = screen.getByTestId("voice-button");
    await userEvent.click(voiceButton);
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });
    await userEvent.click(voiceButton);

    // Verify input is populated with transcribed text
    await waitFor(() => {
      const input = screen.getByTestId("ai-search-input") as HTMLInputElement;
      expect(input.value).toBe("CTOs de empresas de tecnologia");
    });
  });

  it("disables voice button when permission is denied", async () => {
    // Set permission as denied
    mockQueryPermissions.mockResolvedValue({
      state: "denied",
      onchange: null,
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AISearchInput />
      </Wrapper>
    );

    await waitFor(() => {
      const voiceButton = screen.getByTestId("voice-button");
      expect(voiceButton).toBeDisabled();
    });
  });
});
