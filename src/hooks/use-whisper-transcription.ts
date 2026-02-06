/**
 * Whisper Transcription Hook
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #7 - Audio is sent for transcription
 * AC: #8 - Whisper processes the audio and returns text
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { isAPIError } from "@/types/api";

// ==============================================
// API FUNCTION
// ==============================================

async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch("/api/ai/transcribe", {
    method: "POST",
    body: formData,
  });

  const result = await response.json();

  if (isAPIError(result)) {
    throw new Error(result.error.message);
  }

  return result.data.text;
}

// ==============================================
// HOOK
// ==============================================

interface UseWhisperTranscriptionReturn {
  transcribe: (audioBlob: Blob) => void;
  transcribeAsync: (audioBlob: Blob) => Promise<string>;
  isTranscribing: boolean;
  transcribedText: string | null;
  error: string | null;
  reset: () => void;
}

/**
 * Hook for transcribing audio using OpenAI Whisper API
 */
export function useWhisperTranscription(): UseWhisperTranscriptionReturn {
  const mutation = useMutation({
    mutationFn: transcribeAudio,
  });

  return {
    transcribe: mutation.mutate,
    transcribeAsync: mutation.mutateAsync,
    isTranscribing: mutation.isPending,
    transcribedText: mutation.data ?? null,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    reset: mutation.reset,
  };
}
