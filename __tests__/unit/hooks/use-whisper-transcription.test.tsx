/**
 * Whisper Transcription Hook Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #7 - Audio is sent for transcription
 * AC: #8 - Whisper processes the audio and returns text
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWhisperTranscription } from "@/hooks/use-whisper-transcription";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
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

describe("useWhisperTranscription", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("provides transcription functions and initial state", () => {
    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.transcribe).toBe("function");
    expect(typeof result.current.transcribeAsync).toBe("function");
    expect(typeof result.current.reset).toBe("function");
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.transcribedText).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transcribes audio blob successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { text: "Me busca 50 leads de tecnologia em SP" },
        }),
    });

    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    const audioBlob = new Blob(["audio data"], { type: "audio/webm" });

    let transcribedText: string | undefined;
    await act(async () => {
      transcribedText = await result.current.transcribeAsync(audioBlob);
    });

    expect(transcribedText).toBe("Me busca 50 leads de tecnologia em SP");

    // Wait for state to settle after mutation completes
    await waitFor(() => {
      expect(result.current.transcribedText).toBe(
        "Me busca 50 leads de tecnologia em SP"
      );
    });
    expect(result.current.isTranscribing).toBe(false);
  });

  it("tracks transcription loading state", async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockImplementationOnce(() => promise);

    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    const audioBlob = new Blob(["audio data"], { type: "audio/webm" });

    act(() => {
      result.current.transcribe(audioBlob);
    });

    // Should be transcribing
    await waitFor(() => {
      expect(result.current.isTranscribing).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ data: { text: "transcribed text" } }),
      });
    });

    await waitFor(() => {
      expect(result.current.isTranscribing).toBe(false);
    });
  });

  it("handles transcription errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: {
            code: "TRANSCRIPTION_ERROR",
            message: "Erro ao transcrever áudio",
          },
        }),
    });

    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    const audioBlob = new Blob(["audio data"], { type: "audio/webm" });

    await act(async () => {
      try {
        await result.current.transcribeAsync(audioBlob);
      } catch {
        // Expected to throw
      }
    });

    // Wait for error state to settle
    await waitFor(() => {
      expect(result.current.error).toBe("Erro ao transcrever áudio");
    });
    expect(result.current.transcribedText).toBeNull();
  });

  it("resets state on reset()", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { text: "some text" } }),
    });

    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    const audioBlob = new Blob(["audio data"], { type: "audio/webm" });

    await act(async () => {
      await result.current.transcribeAsync(audioBlob);
    });

    // Wait for state to settle
    await waitFor(() => {
      expect(result.current.transcribedText).toBe("some text");
    });

    act(() => {
      result.current.reset();
    });

    // Wait for reset to take effect
    await waitFor(() => {
      expect(result.current.transcribedText).toBeNull();
    });
    expect(result.current.error).toBeNull();
  });

  it("sends correct FormData to API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { text: "test" } }),
    });

    const { result } = renderHook(() => useWhisperTranscription(), {
      wrapper: createWrapper(),
    });

    const audioBlob = new Blob(["audio data"], { type: "audio/webm" });

    await act(async () => {
      await result.current.transcribeAsync(audioBlob);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/ai/transcribe", {
      method: "POST",
      body: expect.any(FormData),
    });

    // Verify FormData contains audio
    const call = mockFetch.mock.calls[0];
    const formData = call[1].body as FormData;
    expect(formData.get("audio")).toBeInstanceOf(Blob);
  });
});
