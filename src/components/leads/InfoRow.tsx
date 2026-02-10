/**
 * InfoRow Component
 * Story 4.3: Lead Detail View & Interaction History
 *
 * Shared component for displaying lead information with optional copy and link actions.
 */

"use client";

import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils/clipboard";

interface InfoRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  copyable?: boolean;
  href?: string;
  external?: boolean;
}

/**
 * Display lead info with optional copy action or external link
 * AC: #2 - Display lead info with optional copy action
 */
export function InfoRow({
  icon: Icon,
  label,
  value,
  copyable = false,
  href,
  external = false,
}: InfoRowProps) {
  if (!value) return null;

  const content = (
    <div className="flex items-start gap-2 text-sm min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <span className="font-medium break-words min-w-0">{value}</span>
    </div>
  );

  if (href) {
    return (
      <div className="flex items-center justify-between gap-2 py-2">
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{value}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        ) : (
          content
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      {content}
      {copyable && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => copyToClipboard(value)}
        >
          <Copy className="h-3 w-3 mr-1" />
          Copiar
        </Button>
      )}
    </div>
  );
}
