/**
 * EmailBlock Component
 * Story 5.3: Email Block Component
 * Story 6.2: AI Text Generation in Builder
 *
 * AC 5.3: #1 - Arrastar Email Block para Canvas
 * AC 5.3: #2 - Visual do Email Block (Estilo Attio)
 * AC 5.3: #3 - Selecionar Email Block
 * AC 5.3: #4 - Drag Handle para Reposicionamento
 * AC 5.3: #5 - Campos Editaveis (Placeholder)
 *
 * AC 6.2: #1 - Generate Button in Email Block
 * AC 6.2: #2 - Error Handling
 * AC 6.2: #3 - Streaming UI Experience
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import type { EmailBlockData } from "@/types/email-block";
import { useAIGenerate, DEFAULT_GENERATION_VARIABLES } from "@/hooks/use-ai-generate";
import { AIGenerateButton } from "./AIGenerateButton";

interface EmailBlockProps {
  block: BuilderBlock;
  stepNumber: number;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function EmailBlock({ block, stepNumber, dragHandleProps }: EmailBlockProps) {
  const selectedBlockId = useBuilderStore((state) => state.selectedBlockId);
  const selectBlock = useBuilderStore((state) => state.selectBlock);
  const updateBlock = useBuilderStore((state) => state.updateBlock);

  const isSelected = selectedBlockId === block.id;
  // Safely extract email block data from the generic block data
  const rawData = block.data as Record<string, unknown>;
  const blockData: EmailBlockData = {
    subject: typeof rawData.subject === "string" ? rawData.subject : "",
    body: typeof rawData.body === "string" ? rawData.body : "",
  };

  const [subject, setSubject] = useState(blockData.subject);
  const [body, setBody] = useState(blockData.body);

  // AI Generation hook (Story 6.2)
  const {
    generate,
    phase: aiPhase,
    text: streamingText,
    error: aiError,
    reset: resetAI,
    isGenerating,
  } = useAIGenerate();

  // Track which field is being generated
  const [generatingField, setGeneratingField] = useState<"subject" | "body" | null>(null);

  // Sync local state when block.data changes externally (undo/redo, server sync)
  useEffect(() => {
    setSubject(blockData.subject);
    setBody(blockData.body);
  }, [blockData.subject, blockData.body]);

  // Update fields progressively during streaming (AC 6.2 #3)
  // NOTE: Only update local state for UI feedback - store update happens on generation complete
  // to avoid infinite loop (blockData in deps causes: updateBlock → block.data changes → blockData recreated → effect fires → ∞)
  useEffect(() => {
    if (aiPhase === "streaming" && streamingText && generatingField) {
      if (generatingField === "subject") {
        setSubject(streamingText);
      } else if (generatingField === "body") {
        setBody(streamingText);
      }
    }
  }, [aiPhase, streamingText, generatingField]);

  // Update store when subject changes
  const handleSubjectChange = (value: string) => {
    setSubject(value);
    updateBlock(block.id, {
      data: { ...blockData, subject: value },
    });
  };

  // Update store when body changes
  const handleBodyChange = (value: string) => {
    setBody(value);
    updateBlock(block.id, {
      data: { ...blockData, body: value },
    });
  };

  // Handle block selection
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectBlock(block.id);
  };

  /**
   * Handle AI text generation (AC 6.2 #1)
   * Generates both subject and body sequentially
   */
  const handleGenerate = useCallback(async () => {
    // Clear any previous error state (AC 6.2 #2)
    resetAI();

    try {
      // Generate subject first
      setGeneratingField("subject");
      const generatedSubject = await generate({
        promptKey: "email_subject_generation",
        variables: DEFAULT_GENERATION_VARIABLES,
        stream: true,
      });

      // Update subject in store after complete generation
      setSubject(generatedSubject);
      updateBlock(block.id, {
        data: { subject: generatedSubject, body },
      });

      // Small delay before generating body for better UX
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Reset for body generation
      resetAI();

      // Generate body
      setGeneratingField("body");
      const generatedBody = await generate({
        promptKey: "email_body_generation",
        variables: DEFAULT_GENERATION_VARIABLES,
        stream: true,
      });

      // Update body in store after complete generation
      // Use generatedSubject directly to avoid stale closure (Code Review Fix M3)
      setBody(generatedBody);
      updateBlock(block.id, {
        data: { subject: generatedSubject, body: generatedBody },
      });

      setGeneratingField(null);
    } catch {
      // Error is handled by the hook (AC 6.2 #2)
      setGeneratingField(null);
    }
  }, [generate, resetAI, block.id, updateBlock, body]);

  return (
    <motion.div
      data-testid={`email-block-${block.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        // Card styling - Attio-inspired clean design
        "w-full max-w-lg",
        "rounded-lg border bg-card",
        "shadow-sm transition-all duration-200",
        // Selection state
        isSelected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-border/80 hover:shadow-md",
        // Cursor
        "cursor-pointer",
        // Pulse animation during generation (AC 6.2 #3)
        isGenerating && "animate-pulse"
      )}
    >
      {/* Block Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        {/* Drag Handle */}
        <div
          data-testid="drag-handle"
          className="cursor-grab hover:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Arrastar para reordenar"
          {...dragHandleProps}
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Icon */}
        <div className="rounded-lg p-2 bg-blue-500/10">
          <Mail className="h-5 w-5 text-blue-500" />
        </div>

        {/* Title */}
        <div className="flex-1">
          <p className="font-medium text-sm">Step {stepNumber}</p>
          <p className="text-xs text-muted-foreground">Email</p>
        </div>
      </div>

      {/* Block Content */}
      <div className="p-4 space-y-4">
        {/* Subject Field */}
        <div className="space-y-1">
          <Label
            htmlFor={`subject-${block.id}`}
            className="mb-2 block text-muted-foreground"
          >
            Assunto
          </Label>
          <Input
            id={`subject-${block.id}`}
            data-testid="email-subject-input"
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Assunto do email"
            className="bg-background/50"
            maxLength={200}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Body Field */}
        <div className="space-y-1">
          <Label
            htmlFor={`body-${block.id}`}
            className="mb-2 block text-muted-foreground"
          >
            Conteudo
          </Label>
          <Textarea
            id={`body-${block.id}`}
            data-testid="email-body-input"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Conteudo do email..."
            className={cn(
              "bg-background/50 min-h-[100px] resize-none",
              // Cursor blink effect during body streaming (AC 6.2 #3)
              generatingField === "body" && aiPhase === "streaming" && "caret-primary"
            )}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* AI Generate Section (Story 6.2) */}
        <div className="flex flex-col items-end gap-2">
          {/* Error message inline (AC 6.2 #2) */}
          {aiError && (
            <p
              data-testid="ai-error-message"
              className="text-sm text-destructive"
            >
              {aiError}
            </p>
          )}

          {/* Generate Button (AC 6.2 #1) */}
          <AIGenerateButton
            phase={aiPhase}
            error={aiError}
            onClick={handleGenerate}
            disabled={isGenerating}
          />

          {/* Streaming status indicator (AC 6.2 #3) */}
          {isGenerating && (
            <p
              data-testid="ai-generating-status"
              className="text-xs text-muted-foreground animate-pulse"
            >
              Gerando texto personalizado...
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
