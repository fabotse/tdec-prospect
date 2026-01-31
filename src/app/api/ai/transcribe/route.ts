/**
 * Whisper Transcription API Route
 * Story: 3.4 - AI Conversational Search
 *
 * POST /api/ai/transcribe
 * Accepts audio file and returns transcribed text using OpenAI Whisper.
 *
 * AC: #7, #8 - Whisper transcription for voice input
 * AC: #9 - Portuguese error messages for permission/transcription errors
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { AIService, AI_ERROR_MESSAGES } from "@/lib/ai";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { TranscriptionResponse } from "@/types/ai-search";

// ==============================================
// CONSTANTS
// ==============================================

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB (Whisper limit)
const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
];

// ==============================================
// POST /api/ai/transcribe
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }

    // 2. Get audio file from FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Arquivo de áudio não fornecido",
          },
        },
        { status: 400 }
      );
    }

    // 3. Validate file type
    const fileType = audioFile.type || "audio/webm";
    // Check if the file type matches any allowed type (exact match or prefix match for codec variants)
    const isValidType = ALLOWED_AUDIO_TYPES.some(
      (allowedType) =>
        fileType === allowedType || fileType.startsWith(`${allowedType};`)
    );
    if (!isValidType) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "INVALID_FILE_TYPE",
            message: AI_ERROR_MESSAGES.INVALID_AUDIO,
          },
        },
        { status: 400 }
      );
    }

    // 4. Validate file size
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: AI_ERROR_MESSAGES.AUDIO_TOO_LARGE,
          },
        },
        { status: 400 }
      );
    }

    // 5. Transcribe audio
    const aiService = new AIService();
    const transcribedText = await aiService.transcribeAudio(audioFile);

    // 6. Return transcription
    return NextResponse.json<APISuccessResponse<TranscriptionResponse>>({
      data: { text: transcribedText },
    });
  } catch (error) {
    console.error("[Transcription API Route] Error:", error);

    const message =
      error instanceof Error
        ? error.message
        : AI_ERROR_MESSAGES.TRANSCRIPTION_ERROR;

    return NextResponse.json<APIErrorResponse>(
      {
        error: {
          code: "TRANSCRIPTION_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
