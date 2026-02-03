/**
 * EmailBlock Component
 * Story 5.3: Email Block Component
 * Story 6.2: AI Text Generation in Builder
 * Story 6.6: Personalized Icebreakers
 * Story 6.7: Inline Text Editing
 * Story 6.8: Text Regeneration
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
 *
 * AC 6.6: #2 - Real Lead Data in Generation
 * AC 6.6: #3 - Icebreaker Generation Flow
 * AC 6.6: #7 - UI Feedback During Generation
 *
 * AC 6.7: #1 - Inline Subject Editing
 * AC 6.7: #2 - Inline Body Editing
 * AC 6.7: #3 - Debounced Auto-Save with flush on blur
 *
 * AC 6.8: #1 - Regenerate Button Visibility
 * AC 6.8: #6 - Reset to Initial State
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Mail, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Label } from "@/components/ui/label";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import type { EmailBlockData } from "@/types/email-block";
import { useAIGenerate } from "@/hooks/use-ai-generate";
import { useKnowledgeBaseContext } from "@/hooks/use-knowledge-base-context";
import { useDebouncedCallback } from "@/hooks/use-debounce";
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
  const productId = useBuilderStore((state) => state.productId);
  // Story 6.6 AC #2: Get preview lead for personalized generation
  const previewLead = useBuilderStore((state) => state.previewLead);

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

  // Knowledge Base context for AI generation (Story 6.3)
  const { variables: kbVariables, isLoading: kbLoading } = useKnowledgeBaseContext();

  // Story 6.6 AC #2: Merge KB variables with real lead data when available
  const mergedVariables = useMemo(() => {
    if (!previewLead) {
      return kbVariables;
    }
    // Override KB placeholders with real lead data
    return {
      ...kbVariables,
      lead_name: previewLead.firstName,
      lead_title: previewLead.title || kbVariables.lead_title || "Profissional",
      lead_company: previewLead.companyName || kbVariables.lead_company || "",
    };
  }, [kbVariables, previewLead]);

  // Story 6.8 AC #1, #6: Determine if content has been generated
  // Shows "Regenerar" when BOTH subject AND body have content
  // Returns to "Gerar com IA" when either is empty (AC #6)
  const hasContent = useMemo(() => {
    return subject.trim() !== "" && body.trim() !== "";
  }, [subject, body]);

  // Track which field is being generated
  // Story 6.6 AC #3: Added "icebreaker" phase for 3-phase generation
  const [generatingField, setGeneratingField] = useState<"icebreaker" | "subject" | "body" | null>(null);

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

  // Story 6.7 AC #3: Debounced store updates
  const [debouncedUpdateSubject, flushSubject] = useDebouncedCallback(
    (value: string) => {
      updateBlock(block.id, {
        data: { ...blockData, subject: value },
      });
    },
    { delay: 500 }
  );

  const [debouncedUpdateBody, flushBody] = useDebouncedCallback(
    (value: string) => {
      updateBlock(block.id, {
        data: { ...blockData, body: value },
      });
    },
    { delay: 500 }
  );

  // Update local state immediately, debounce store update (AC #3)
  const handleSubjectChange = (value: string) => {
    setSubject(value);
    debouncedUpdateSubject(value);
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    debouncedUpdateBody(value);
  };

  // Story 6.7 AC #3: Flush on blur to prevent data loss
  const handleSubjectBlur = () => {
    flushSubject();
  };

  const handleBodyBlur = () => {
    flushBody();
  };

  // Handle block selection
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectBlock(block.id);
  };

  /**
   * Handle AI text generation (AC 6.2 #1)
   * Story 6.6 AC #3: Generates in order: Icebreaker → Subject → Body
   * AC 6.3 #1: Uses KB context variables
   */
  const handleGenerate = useCallback(async () => {
    // Clear any previous error state (AC 6.2 #2)
    resetAI();

    try {
      // Story 6.6 AC #3: Generate icebreaker FIRST
      setGeneratingField("icebreaker");
      const generatedIcebreaker = await generate({
        promptKey: "icebreaker_generation",
        variables: mergedVariables,
        stream: true,
        productId,
      });

      // Small delay before generating subject for better UX
      await new Promise((resolve) => setTimeout(resolve, 300));
      resetAI();

      // Generate subject using KB context (AC 6.3 #1), product context (Story 6.5), and real lead data (Story 6.6)
      setGeneratingField("subject");
      const generatedSubject = await generate({
        promptKey: "email_subject_generation",
        variables: mergedVariables,
        stream: true,
        productId,
      });

      // Update local state immediately for UI feedback (streaming already shows progress)
      // CR-M1 FIX: Removed intermediate store update to avoid stale closure issue
      // Store will be updated after body generation completes with both subject and body
      setSubject(generatedSubject);

      // Small delay before generating body for better UX
      await new Promise((resolve) => setTimeout(resolve, 300));
      resetAI();

      // Story 6.6 AC #3: Generate body WITH icebreaker context
      setGeneratingField("body");
      const generatedBody = await generate({
        promptKey: "email_body_generation",
        variables: { ...mergedVariables, icebreaker: generatedIcebreaker },
        stream: true,
        productId,
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
  }, [generate, resetAI, block.id, updateBlock, mergedVariables, productId]);

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
        {/* Subject Field with Character Count (Story 6.7 AC #5) */}
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
            onBlur={handleSubjectBlur}
            placeholder="Assunto do email"
            className="bg-background/50"
            maxLength={200}
            aria-describedby={`subject-count-${block.id}`}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Character count (AC #5) */}
          <p
            id={`subject-count-${block.id}`}
            data-testid="subject-char-count"
            className={cn(
              "text-xs text-right",
              subject.length > 60
                ? "text-amber-500"
                : "text-muted-foreground"
            )}
          >
            {subject.length}/60 caracteres
          </p>
        </div>

        {/* Body Field */}
        <div className="space-y-1">
          <Label
            htmlFor={`body-${block.id}`}
            className="mb-2 block text-muted-foreground"
          >
            Conteudo
          </Label>
          {/* Story 6.7 AC #4: Auto-expanding textarea */}
          <AutoResizeTextarea
            id={`body-${block.id}`}
            data-testid="email-body-input"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onBlur={handleBodyBlur}
            placeholder="Conteudo do email..."
            className={cn(
              "bg-background/50",
              // Cursor blink effect during body streaming (AC 6.2 #3)
              generatingField === "body" && aiPhase === "streaming" && "caret-primary"
            )}
            minHeight={100}
            maxHeight={400}
            onClick={(e) => e.stopPropagation()}
            aria-label="Conteudo do email, expande automaticamente"
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

          {/* Generate Button (AC 6.2 #1, AC 6.3 #1, AC 6.8 #1) */}
          <AIGenerateButton
            phase={aiPhase}
            error={aiError}
            onClick={handleGenerate}
            disabled={isGenerating || kbLoading}
            hasContent={hasContent}
          />

          {/* KB Loading indicator (AC 6.3 #4) */}
          {kbLoading && (
            <p
              data-testid="kb-loading-status"
              className="text-xs text-muted-foreground"
            >
              Carregando contexto...
            </p>
          )}

          {/* Streaming status indicator (AC 6.2 #3, AC 6.6 #7) */}
          {/* CR-L2 FIX: Added phase-specific data-testid for better testability */}
          {isGenerating && (
            <p
              data-testid={`ai-generating-status${generatingField ? `-${generatingField}` : ""}`}
              className="text-xs text-muted-foreground animate-pulse"
            >
              {generatingField === "icebreaker" &&
                `Gerando quebra-gelo para ${previewLead?.firstName || "lead"}...`}
              {generatingField === "subject" && "Gerando assunto..."}
              {generatingField === "body" && "Gerando conteudo..."}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
