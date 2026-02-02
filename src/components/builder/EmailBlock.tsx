/**
 * EmailBlock Component
 * Story 5.3: Email Block Component
 *
 * AC: #1 - Arrastar Email Block para Canvas
 * AC: #2 - Visual do Email Block (Estilo Attio)
 * AC: #3 - Selecionar Email Block
 * AC: #4 - Drag Handle para Reposicionamento
 * AC: #5 - Campos Editaveis (Placeholder)
 */

"use client";

import { useState, useEffect } from "react";
import { Mail, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import type { EmailBlockData } from "@/types/email-block";

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

  // Sync local state when block.data changes externally (undo/redo, server sync)
  useEffect(() => {
    setSubject(blockData.subject);
    setBody(blockData.body);
  }, [blockData.subject, blockData.body]);

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
        "cursor-pointer"
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
            className="bg-background/50 min-h-[100px] resize-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </motion.div>
  );
}
