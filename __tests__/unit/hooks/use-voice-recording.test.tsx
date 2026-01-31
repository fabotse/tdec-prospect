/**
 * Voice Recording Hook Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #6 - Visual indicator that recording is active
 * AC: #7 - Audio capture using MediaRecorder API
 * AC: #9 - Handle microphone permission denial gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVoiceRecording } from "@/hooks/use-voice-recording";

// Mock MediaRecorder
class MockMediaRecorder {
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stream: MediaStream;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

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

  static isTypeSupported(mimeType: string) {
    return mimeType === "audio/webm;codecs=opus" || mimeType === "audio/webm";
  }
}

// Mock MediaStream
class MockMediaStream {
  private tracks: { stop: () => void }[] = [{ stop: vi.fn() }];

  getTracks() {
    return this.tracks;
  }
}

describe("useVoiceRecording", () => {
  const mockGetUserMedia = vi.fn();
  const mockQueryPermissions = vi.fn();

  beforeEach(() => {
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
      state: "prompt",
      onchange: null,
    });

    // Mock MediaRecorder
    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state correctly", () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingState).toBe("idle");
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.startRecording).toBe("function");
    expect(typeof result.current.stopRecording).toBe("function");
    expect(typeof result.current.clearRecording).toBe("function");
  });

  it("starts recording when startRecording is called", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingState).toBe("recording");
    expect(result.current.permissionState).toBe("granted");
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("returns audioBlob after recording stops", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    await waitFor(() => {
      expect(result.current.recordingState).toBe("stopped");
    });

    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(result.current.isRecording).toBe(false);
  });

  it("handles permission denied error", async () => {
    const permissionError = new DOMException(
      "Permission denied",
      "NotAllowedError"
    );
    mockGetUserMedia.mockRejectedValueOnce(permissionError);

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.permissionState).toBe("denied");
    expect(result.current.error).toBe(
      "Permissão de microfone negada. Verifique as configurações do navegador."
    );
    expect(result.current.recordingState).toBe("idle");
    expect(result.current.isRecording).toBe(false);
  });

  it("handles microphone access error", async () => {
    const accessError = new Error("Device not found");
    mockGetUserMedia.mockRejectedValueOnce(accessError);

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(
      "Erro ao acessar o microfone. Tente novamente."
    );
    expect(result.current.recordingState).toBe("idle");
  });

  it("clears recording on clearRecording", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    await waitFor(() => {
      expect(result.current.audioBlob).not.toBeNull();
    });

    act(() => {
      result.current.clearRecording();
    });

    expect(result.current.audioBlob).toBeNull();
    expect(result.current.recordingState).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("tracks recording state correctly", async () => {
    const mockStream = new MockMediaStream();
    mockGetUserMedia.mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useVoiceRecording());

    // Initial state
    expect(result.current.recordingState).toBe("idle");

    // Start recording
    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.recordingState).toBe("recording");

    // Stop recording
    act(() => {
      result.current.stopRecording();
    });

    await waitFor(() => {
      expect(result.current.recordingState).toBe("stopped");
    });
  });

  it("handles unsupported browser gracefully", async () => {
    // Remove mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceRecording());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(
      "Seu navegador não suporta gravação de áudio."
    );
  });
});
