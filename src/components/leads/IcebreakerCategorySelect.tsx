/**
 * Icebreaker Category Select
 * Story 9.1: AC #1 - Category selection for icebreaker focus
 *
 * Dropdown/select with 4 categories in Portuguese.
 * Default: "Empresa" pre-selected.
 * Shows warning badge when "Post/LinkedIn" selected and lead has no posts.
 */

"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ICEBREAKER_CATEGORIES } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";

interface IcebreakerCategorySelectProps {
  value: IcebreakerCategory;
  onValueChange: (value: IcebreakerCategory) => void;
  /** When true, shows warning for Post/LinkedIn category */
  showPostWarning?: boolean;
  disabled?: boolean;
}

export function IcebreakerCategorySelect({
  value,
  onValueChange,
  showPostWarning = false,
  disabled = false,
}: IcebreakerCategorySelectProps) {
  const selectedCategory = ICEBREAKER_CATEGORIES.find((cat) => cat.value === value);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground">
        Categoria do Ice Breaker
      </label>
      <Select
        value={value}
        onValueChange={(v) => onValueChange(v as IcebreakerCategory)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="w-full"
          data-testid="icebreaker-category-select"
        >
          <SelectValue placeholder="Selecione a categoria" />
        </SelectTrigger>
        <SelectContent>
          {ICEBREAKER_CATEGORIES.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedCategory && (
        <p className="text-xs text-muted-foreground">
          {selectedCategory.description}
        </p>
      )}
      {showPostWarning && value === "post" && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="icebreaker-post-warning"
        >
          Lead sem posts do LinkedIn — será gerado com foco no perfil
        </p>
      )}
    </div>
  );
}

