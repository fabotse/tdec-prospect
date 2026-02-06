/**
 * PreviewNavigation Component
 * Story 5.8: Campaign Preview
 *
 * AC #4: Navegar entre emails no preview
 *
 * Barra de navegacao entre emails no preview.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewNavigationProps {
  currentIndex: number;
  totalEmails: number;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Preview Navigation - Barra com botoes Anterior/Proximo
 */
export function PreviewNavigation({
  currentIndex,
  totalEmails,
  onPrevious,
  onNext,
}: PreviewNavigationProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b">
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevious}
        disabled={currentIndex === 0}
        aria-label="Email anterior"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">
        Email {currentIndex + 1} de {totalEmails}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={currentIndex === totalEmails - 1}
        aria-label="Proximo email"
      >
        Proximo
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}
