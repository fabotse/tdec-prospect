/**
 * Voice Recording Hook
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #6 - Visual indicator that recording is active (pulsing red dot)
 * AC: #6 - Browser requests microphone permission if not already granted
 * AC: #7 - Capture audio using MediaRecorder API
 * AC: #9 - Handle microphone permission denial gracefully
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ==============================================
// TYPES
// ==============================================

export type PermissionState = "prompt" | "granted" | "denied" | "unknown";
export type RecordingState = "idle" | "recording" | "stopped";

interface UseVoiceRecordingReturn {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isRecording: boolean;
  recordingState: RecordingState;
  audioBlob: Blob | null;
  permissionState: PermissionState;
  error: string | null;
  clearRecording: () => void;
}

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const VOICE_ERROR_MESSAGES = {
  PERMISSION_DENIED:
    "Permissão de microfone negada. Verifique as configurações do navegador.",
  ACCESS_ERROR: "Erro ao acessar o microfone. Tente novamente.",
  NOT_SUPPORTED: "Seu navegador não suporta gravação de áudio.",
};

// ==============================================
// HOOK
// ==============================================

/**
 * Hook for recording audio using MediaRecorder API
 * Handles microphone permissions and provides audio blob for transcription
 */
export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [permissionState, setPermissionState] =
    useState<PermissionState>("unknown");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Check microphone permission on mount
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      setPermissionState("unknown");
      return;
    }

    let permissionStatus: PermissionStatus | null = null;

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        permissionStatus = result;
        setPermissionState(result.state as PermissionState);

        // Handler for permission changes
        const handleChange = () => {
          setPermissionState(result.state as PermissionState);
        };
        result.onchange = handleChange;
      })
      .catch(() => setPermissionState("unknown"));

    // Cleanup: remove permission listener on unmount
    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    // Check browser support
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(VOICE_ERROR_MESSAGES.NOT_SUPPORTED);
      return;
    }

    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionState("granted");

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setRecordingState("stopped");

        // Stop all tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = () => {
        setError(VOICE_ERROR_MESSAGES.ACCESS_ERROR);
        setRecordingState("idle");
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecordingState("recording");
    } catch (err) {
      // Handle permission denied
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPermissionState("denied");
        setError(VOICE_ERROR_MESSAGES.PERMISSION_DENIED);
      } else {
        setError(VOICE_ERROR_MESSAGES.ACCESS_ERROR);
      }
      setRecordingState("idle");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [recordingState]);

  const clearRecording = useCallback(() => {
    setAudioBlob(null);
    setRecordingState("idle");
    setError(null);
    chunksRef.current = [];
  }, []);

  return {
    startRecording,
    stopRecording,
    isRecording: recordingState === "recording",
    recordingState,
    audioBlob,
    permissionState,
    error,
    clearRecording,
  };
}
