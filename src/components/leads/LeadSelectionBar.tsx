/**
 * Lead Selection Bar
 * Story: 3.6 - Lead Selection (Individual & Batch)
 *
 * AC: #1 - Selection bar appears at bottom when leads selected
 * AC: #3 - Action buttons: "Criar Campanha", dropdown menu
 * AC: #5 - Clear selection functionality
 * AC: #6 - Bar not visible when no selection
 */

"use client";

import { useSelectionStore } from "@/stores/use-selection-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";

interface LeadSelectionBarProps {
  /** Optional: limit count display to visible leads only */
  visibleSelectedCount?: number;
}

export function LeadSelectionBar({
  visibleSelectedCount,
}: LeadSelectionBarProps) {
  const { selectedIds, clearSelection } = useSelectionStore();
  const router = useRouter();

  // Use visible count if provided, otherwise total selected
  const count = visibleSelectedCount ?? selectedIds.length;

  // Handle "Criar Campanha" action - pass selected IDs via query param
  const handleCreateCampaign = () => {
    const params = new URLSearchParams();
    params.set("leadIds", selectedIds.join(","));
    router.push(`/campaigns/new?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        >
          <div className="flex h-16 w-full items-center justify-between px-6 md:px-10">
            {/* Selection count */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {count} lead{count !== 1 ? "s" : ""} selecionado
                {count !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground"
              >
                Limpar
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button onClick={handleCreateCampaign}>Criar Campanha</Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Mais opções</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>
                    Adicionar ao Segmento (em breve)
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Exportar CSV (em breve)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSelection}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar barra de seleção</span>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
