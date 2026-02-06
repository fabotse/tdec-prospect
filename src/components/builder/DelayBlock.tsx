/**
 * DelayBlock Component
 * Story 5.4: Delay Block Component
 *
 * AC: #1 - Arrastar Delay Block para Canvas
 * AC: #2 - Visual do Delay Block (Estilo Attio)
 * AC: #3 - Selecionar Delay Block
 * AC: #4 - Editar Duracao do Delay
 * AC: #5 - Sugestao de Intervalos (FR16)
 * AC: #6 - Drag Handle para Reposicionamento
 */

"use client";

import { useState } from "react";
import { Clock, GripVertical, ChevronDown, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import {
  type DelayBlockData,
  type DelayUnit,
  DEFAULT_DELAY_BLOCK_DATA,
  DELAY_PRESETS,
  formatDelayDisplay,
} from "@/types/delay-block";

interface DelayBlockProps {
  block: BuilderBlock;
  stepNumber: number;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

/**
 * Delay block component for the campaign builder
 * Displays editable delay duration with preset options
 */
export function DelayBlock({ block, stepNumber, dragHandleProps }: DelayBlockProps) {
  const selectedBlockId = useBuilderStore((state) => state.selectedBlockId);
  const selectBlock = useBuilderStore((state) => state.selectBlock);
  const updateBlock = useBuilderStore((state) => state.updateBlock);
  const removeBlock = useBuilderStore((state) => state.removeBlock);

  const isSelected = selectedBlockId === block.id;

  // Safely extract delay block data from the generic block data
  const rawData = block.data as Record<string, unknown>;
  const blockData: DelayBlockData = {
    delayValue:
      typeof rawData.delayValue === "number"
        ? rawData.delayValue
        : DEFAULT_DELAY_BLOCK_DATA.delayValue,
    delayUnit:
      rawData.delayUnit === "days" || rawData.delayUnit === "hours"
        ? rawData.delayUnit
        : DEFAULT_DELAY_BLOCK_DATA.delayUnit,
  };

  const [delayValue, setDelayValue] = useState(blockData.delayValue);
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(blockData.delayUnit);
  const [isCustom, setIsCustom] = useState(false);

  // Sync local state when block.data changes externally (undo/redo, server sync)
  // React recommended pattern: adjust state during render instead of useEffect
  const [prevBlockData, setPrevBlockData] = useState(block.data);
  if (block.data !== prevBlockData) {
    setPrevBlockData(block.data);
    const raw = block.data as Record<string, unknown>;
    const newDelayValue =
      typeof raw.delayValue === "number"
        ? raw.delayValue
        : DEFAULT_DELAY_BLOCK_DATA.delayValue;
    const newDelayUnit =
      raw.delayUnit === "days" || raw.delayUnit === "hours"
        ? raw.delayUnit
        : DEFAULT_DELAY_BLOCK_DATA.delayUnit;
    setDelayValue(newDelayValue);
    setDelayUnit(newDelayUnit);
  }

  // Update store when delay changes
  const handleDelayChange = (value: number, unit: DelayUnit) => {
    setDelayValue(value);
    setDelayUnit(unit);
    updateBlock(block.id, {
      data: { ...blockData, delayValue: value, delayUnit: unit },
    });
  };

  // Handle preset selection
  const handlePresetSelect = (preset: (typeof DELAY_PRESETS)[number]) => {
    setIsCustom(false);
    handleDelayChange(preset.value, preset.unit);
  };

  // Handle custom value change
  const handleCustomValueChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 365) {
      handleDelayChange(numValue, delayUnit);
    }
  };

  // Handle unit change
  const handleUnitChange = (unit: DelayUnit) => {
    handleDelayChange(delayValue, unit);
  };

  // Handle block selection
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectBlock(block.id);
  };

  return (
    <motion.div
      data-testid={`delay-block-${block.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        // Card styling - Attio-inspired clean design (compact)
        "w-full max-w-md",
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
      <div className="flex items-center gap-3 p-4">
        {/* Drag Handle */}
        <div
          data-testid="drag-handle"
          className="cursor-grab hover:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Arrastar para reordenar"
          {...dragHandleProps}
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Delete Button */}
        <button
          data-testid="delete-block-button"
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remover bloco"
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(block.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="rounded-lg p-2 bg-accent">
          <Clock className="h-5 w-5 text-accent-foreground" />
        </div>

        {/* Title and Value */}
        <div className="flex-1">
          <p className="font-medium text-sm">Step {stepNumber}</p>
          <p className="text-xs text-muted-foreground">Aguardar</p>
        </div>

        {/* Delay Value Display / Edit */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={(e) => e.stopPropagation()}
              data-testid="delay-value-trigger"
              aria-label="Selecionar duracao do delay"
            >
              {formatDelayDisplay(delayValue, delayUnit)}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48"
            onClick={(e) => e.stopPropagation()}
          >
            {DELAY_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={`${preset.value}-${preset.unit}`}
                onClick={() => handlePresetSelect(preset)}
                className="flex items-center justify-between"
                data-testid={`preset-${preset.value}`}
              >
                <span>{preset.label}</span>
                {"recommended" in preset && preset.recommended && (
                  <span className="text-xs text-foreground font-medium">
                    Recomendado
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => setIsCustom(true)}
              data-testid="preset-custom"
            >
              Personalizado...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Custom Input (expandable) */}
      {isCustom && isSelected && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border/50 p-4"
        >
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min={1}
              max={365}
              value={delayValue}
              onChange={(e) => handleCustomValueChange(e.target.value)}
              className="w-20"
              onClick={(e) => e.stopPropagation()}
              data-testid="delay-custom-input"
            />
            <Select
              value={delayUnit}
              onValueChange={(value) => handleUnitChange(value as DelayUnit)}
            >
              <SelectTrigger
                className="w-24"
                onClick={(e) => e.stopPropagation()}
                data-testid="delay-unit-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">dias</SelectItem>
                <SelectItem value="hours">horas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Dica: Intervalos de 2-3 dias sao recomendados para follow-ups
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
