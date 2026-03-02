"use client";

import Image from "next/image";
import { Copy, Check, MoreHorizontal, ExternalLink, Trash2, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { insightStatusLabels, insightStatusVariants } from "@/types/monitoring";
import type { InsightStatus } from "@/types/monitoring";
import type { InsightWithLead } from "@/hooks/use-lead-insights";

interface InsightsTableProps {
  insights: InsightWithLead[];
  onUpdateStatus: (insightId: string, status: InsightStatus) => void;
  onWhatsApp: (insight: InsightWithLead) => void;
  isPending: boolean;
}

export function InsightsTable({ insights, onUpdateStatus, onWhatsApp, isPending }: InsightsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="pb-3 pr-4 font-medium max-w-[220px]">Lead</th>
            <th className="pb-3 pr-4 font-medium">Post</th>
            <th className="pb-3 pr-4 font-medium">Sugestao de Abordagem</th>
            <th className="pb-3 pr-4 font-medium">Por que?</th>
            <th className="pb-3 pr-4 font-medium w-[100px]">Status</th>
            <th className="pb-3 pr-4 font-medium w-[120px]">Data</th>
            <th className="pb-3 font-medium w-[100px]">Acoes</th>
          </tr>
        </thead>
        <tbody>
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              onUpdateStatus={onUpdateStatus}
              onWhatsApp={onWhatsApp}
              isPending={isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightRow({
  insight,
  onUpdateStatus,
  onWhatsApp,
  isPending,
}: {
  insight: InsightWithLead;
  onUpdateStatus: (insightId: string, status: InsightStatus) => void;
  onWhatsApp: (insight: InsightWithLead) => void;
  isPending: boolean;
}) {
  const leadName = `${insight.lead.firstName}${insight.lead.lastName ? ` ${insight.lead.lastName}` : ""}`;

  const dateStr = new Date(insight.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <tr className="border-b last:border-0 hover:bg-muted/50 transition-colors">
      {/* Lead */}
      <td className="py-3 pr-4 max-w-[220px]">
        <div className="flex items-center gap-3">
          {insight.lead.photoUrl ? (
            <Image
              src={insight.lead.photoUrl}
              alt={leadName}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              {insight.lead.firstName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{leadName}</p>
            {insight.lead.companyName && (
              <p className="text-xs text-muted-foreground truncate">
                {insight.lead.title ? `${insight.lead.title} • ` : ""}{insight.lead.companyName}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Post */}
      <td className="py-3 pr-4 max-w-[250px]">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <p className="text-sm text-muted-foreground line-clamp-2">{insight.postText}</p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[400px]">
              <p className="text-sm whitespace-pre-wrap">{insight.postText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {insight.postUrl && (
          <a
            href={insight.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
          >
            Ver post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>

      {/* Sugestao */}
      <td className="py-3 pr-4 max-w-[300px]">
        {insight.suggestion ? (
          <div className="flex flex-col gap-1">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <p className="text-sm line-clamp-2">{insight.suggestion}</p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px]">
                  <p className="text-sm whitespace-pre-wrap">{insight.suggestion}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs w-fit"
              onClick={() => copyToClipboard(insight.suggestion!)}
              aria-label="Copiar sugestao de abordagem"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Sugestao nao disponivel
          </span>
        )}
      </td>

      {/* Por que? */}
      <td className="py-3 pr-4 max-w-[200px]">
        {insight.relevanceReasoning ? (
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground line-clamp-2">{insight.relevanceReasoning}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[400px]">
                <p className="text-sm whitespace-pre-wrap">{insight.relevanceReasoning}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Raciocinio nao disponivel
          </span>
        )}
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <Badge variant={insightStatusVariants[insight.status]}>
          {insightStatusLabels[insight.status]}
        </Badge>
      </td>

      {/* Data */}
      <td className="py-3 pr-4">
        <span className="text-sm text-muted-foreground">{dateStr}</span>
      </td>

      {/* Acoes */}
      <td className="py-3">
        <div className="flex items-center gap-1">
        {insight.lead.phone ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-600 dark:text-green-400"
            onClick={() => onWhatsApp(insight)}
            aria-label="Enviar WhatsApp"
            data-testid="insight-whatsapp-button"
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  disabled
                  aria-label="WhatsApp indisponivel - lead sem telefone"
                  data-testid="insight-whatsapp-disabled"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Telefone nao cadastrado</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Acoes do insight"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {insight.suggestion && (
              <DropdownMenuItem onClick={() => copyToClipboard(insight.suggestion!)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Sugestao
              </DropdownMenuItem>
            )}
            {insight.status !== "used" && (
              <DropdownMenuItem
                onClick={() => onUpdateStatus(insight.id, "used")}
                disabled={isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                Marcar como Usado
              </DropdownMenuItem>
            )}
            {insight.status !== "dismissed" && (
              <DropdownMenuItem
                onClick={() => onUpdateStatus(insight.id, "dismissed")}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Descartar
              </DropdownMenuItem>
            )}
            {insight.postUrl && (
              <DropdownMenuItem asChild>
                <a href={insight.postUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Post Original
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
