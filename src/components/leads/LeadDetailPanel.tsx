/**
 * Lead Detail Panel Component
 * Story 4.3: Lead Detail View & Interaction History
 * Story 4.4.1: Lead Data Enrichment
 * Story 4.5: Phone Number Lookup
 *
 * AC 4.3: #1 - Detail sidepanel opens
 * AC 4.3: #2 - Lead information display
 * AC 4.3: #3 - Interaction history section
 * AC 4.3: #4 - Add interaction note
 * AC 4.3: #7 - Close and keyboard accessibility
 * AC 4.4.1: #1 - Enrich button when missing email/linkedin
 * AC 4.4.1: #2 - Enrich with loading state and success toast
 * AC 4.4.1: #3 - Handle not found case
 * AC 4.5: #1 - Individual phone lookup from detail panel
 * AC 4.5: #2 - Phone not found handling
 * AC 4.5: #3 - Error handling
 * AC 4.5: #5 - Lead already has phone
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  StickyNote,
  RefreshCw,
  Download,
  Send,
  Reply,
  Loader2,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Linkedin,
  Calendar,
  Copy,
  AlertCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { InfoRow } from "./InfoRow";
import {
  useLeadInteractions,
  useCreateInteraction,
} from "@/hooks/use-lead-interactions";
import {
  usePhoneLookup,
  getLeadIdentifier,
} from "@/hooks/use-phone-lookup";
import { useEnrichPersistedLead } from "@/hooks/use-enrich-persisted-lead";
import { copyToClipboard } from "@/lib/utils/clipboard";
import type { Lead } from "@/types/lead";
import { transformLeadRow } from "@/types/lead";
import type { LeadInteraction, InteractionType } from "@/types/interaction";
import { cn } from "@/lib/utils";

interface LeadDetailPanelProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdate?: (updatedLead: Lead) => void;
}

/**
 * Get icon for interaction type
 * AC: #3 - Interaction type icons
 */
function getInteractionIcon(type: InteractionType) {
  switch (type) {
    case "note":
      return StickyNote;
    case "status_change":
      return RefreshCw;
    case "import":
      return Download;
    case "campaign_sent":
      return Send;
    case "campaign_reply":
      return Reply;
    default:
      return StickyNote;
  }
}

/**
 * Format date for display
 * AC: #2, #3 - Date formatting (dd/MM/yyyy or dd/MM/yyyy HH:mm)
 */
function formatDate(dateString: string, includeTime = false): string {
  const date = new Date(dateString);
  return format(date, includeTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", {
    locale: ptBR,
  });
}

/**
 * Interaction Item Component
 * AC: #3 - Each interaction shows: type icon, content, timestamp
 */
function InteractionItem({ interaction }: { interaction: LeadInteraction }) {
  const Icon = getInteractionIcon(interaction.type);

  return (
    <div className="flex gap-3 p-4 rounded-md bg-muted/50">
      <div className="flex-shrink-0 mt-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {interaction.content}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(interaction.createdAt, true)}
        </p>
      </div>
    </div>
  );
}

/**
 * Add Note Form Component
 * AC: #4 - Textarea with Salvar and Cancelar buttons
 */
function AddNoteForm({
  leadId,
  onComplete,
}: {
  leadId: string;
  onComplete: () => void;
}) {
  const [content, setContent] = useState("");
  const { createInteraction, isLoading, error } = useCreateInteraction(leadId);

  const handleSubmit = useCallback(() => {
    if (!content.trim()) return;

    createInteraction(
      { content: content.trim(), type: "note" },
      {
        onSuccess: () => {
          setContent("");
          onComplete();
          toast.success("Nota salva!");
        },
        onError: () => {
          toast.error("Erro ao salvar nota");
        },
      }
    );
  }, [content, createInteraction, onComplete]);

  const handleCancel = useCallback(() => {
    setContent("");
    onComplete();
  }, [onComplete]);

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Digite uma nota..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[100px] resize-none"
        disabled={isLoading}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isLoading}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isLoading || !content.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar"
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Phone Section Component
 * Story 4.5: AC #1, #2, #3, #5
 * Handles phone display and lookup functionality
 */
function PhoneSection({ lead }: { lead: Lead }) {
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);

  // Get identifier for lookup (AC #6 - LinkedIn > email)
  const identifier = getLeadIdentifier(lead);

  // Phone lookup hook (AC #1, #7)
  const { lookupPhoneAsync, isLoading, reset } = usePhoneLookup({
    leadId: lead.id,
    saveToDatabase: true,
    invalidateLeads: true,
    showSuccessToast: true,
    showErrorToast: false, // We handle error display inline
  });

  // Reset error states when lead changes
  useEffect(() => {
    setLookupError(null);
    setNotFoundMessage(null);
    reset();
  }, [lead.id, reset]);

  // Handle phone lookup (AC #1)
  const handleLookup = async () => {
    if (!identifier) return;

    setLookupError(null);
    setNotFoundMessage(null);

    try {
      await lookupPhoneAsync({ identifier, leadId: lead.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar telefone";

      // AC #2 - Phone not found handling
      if (message.includes("não encontrado") || message.includes("not found")) {
        setNotFoundMessage("Telefone não encontrado");
      } else {
        // AC #3 - Error handling with specific messages
        setLookupError(message);
      }
    }
  };

  // If lead has phone (AC #5)
  if (lead.phone) {
    return (
      <div className="space-y-2">
        {/* Phone display with copy button */}
        <div className="flex items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Telefone:</span>
            <span className="font-medium font-mono">{lead.phone}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Copy button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard(lead.phone!)}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </Button>
            {/* Update button (AC #5) */}
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleLookup}
              disabled={isLoading || !identifier}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Atualizar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Lead doesn't have phone - show lookup button (AC #1)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 py-2">
        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-muted-foreground">Telefone:</span>

        {/* Lookup button (AC #3.1, #3.6) */}
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleLookup}
          disabled={isLoading || !identifier}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Buscando telefone...
            </>
          ) : (
            <>
              <Phone className="h-3 w-3 mr-1" />
              Buscar Telefone
            </>
          )}
        </Button>
      </div>

      {/* Not found message (AC #2) */}
      {notFoundMessage && (
        <Alert variant="default" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {notFoundMessage}
            <br />
            <span className="text-muted-foreground">
              Tente buscar no LinkedIn ou entrar em contato por email
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Error message (AC #3) */}
      {lookupError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {lookupError}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 ml-2 text-xs"
              onClick={handleLookup}
              disabled={isLoading}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* No identifier warning */}
      {!identifier && (
        <p className="text-xs text-muted-foreground">
          Lead sem email ou LinkedIn para buscar telefone
        </p>
      )}
    </div>
  );
}

/**
 * Lead Detail Panel
 * AC: #1 - Sidepanel with Sheet component
 * AC: #2 - Lead information display
 * AC: #3 - Interaction history section
 * AC: #4 - Add note functionality
 * AC: #7 - Keyboard accessibility (Escape to close)
 */
export function LeadDetailPanel({
  lead,
  isOpen,
  onClose,
  onLeadUpdate,
}: LeadDetailPanelProps) {
  const [showNoteForm, setShowNoteForm] = useState(false);

  // AC: #3 - Fetch interactions for the lead
  const { data: interactions, isLoading: loadingInteractions } =
    useLeadInteractions(lead?.id ?? null, { enabled: isOpen && !!lead?.id });

  // Story 4.4.1: AC #1, #2 - Enrich persisted lead with callback to update panel
  const enrichMutation = useEnrichPersistedLead({
    onSuccess: (updatedLeadRow) => {
      // Update the lead in the parent component to reflect changes immediately
      if (onLeadUpdate && updatedLeadRow) {
        onLeadUpdate(transformLeadRow(updatedLeadRow));
      }
    },
  });

  // Story 4.4.1: AC #1 - Check if lead needs enrichment (missing email OR linkedin)
  const needsEnrichment = lead && (!lead.email || !lead.linkedinUrl);

  // Reset form state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowNoteForm(false);
    }
  }, [isOpen]);

  // Don't render if no lead
  if (!lead) return null;

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full flex flex-col overflow-hidden"
      >
        {/* Header - Story 4.4.1: AC #5 - Show larger avatar with photo */}
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {lead.photoUrl && (
                <AvatarImage src={lead.photoUrl} alt={fullName} />
              )}
              <AvatarFallback className="text-lg font-medium">
                {[lead.firstName?.[0], lead.lastName?.[0]]
                  .filter(Boolean)
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-xl">{fullName}</SheetTitle>
              {lead.title && (
                <p className="text-sm text-muted-foreground mt-1">{lead.title}</p>
              )}
            </div>
          </div>
          <SheetDescription className="sr-only">
            Detalhes do lead {fullName}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto space-y-6 px-6 pb-6">
          {/* Story 4.4.1: AC #1 - Enrich Data Button when missing email/linkedin */}
          {needsEnrichment && (
            <section className="space-y-2">
              <Alert variant="default" className="py-3">
                <RefreshCw className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span className="text-sm">
                    Dados incompletos. Enriquecer para obter email, LinkedIn e foto.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => enrichMutation.mutate(lead.id)}
                    disabled={enrichMutation.isPending}
                    className="ml-4"
                  >
                    {enrichMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enriquecendo...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Enriquecer Dados
                      </>
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
            </section>
          )}

          {/* Lead Info Section */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Informações
            </h3>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <InfoRow
                icon={Building2}
                label="Empresa"
                value={lead.companyName}
              />
              <InfoRow icon={Briefcase} label="Cargo" value={lead.title} />
              <InfoRow
                icon={Mail}
                label="Email"
                value={lead.email}
                copyable
              />

              {/* Story 4.5: Phone Section with lookup functionality */}
              <PhoneSection lead={lead} />

              <InfoRow
                icon={Linkedin}
                label="LinkedIn"
                value={lead.linkedinUrl}
                href={lead.linkedinUrl ?? undefined}
                external
              />

              {/* Status Badge */}
              <div className="flex items-center gap-2 py-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <LeadStatusBadge status={lead.status} />
              </div>

              {/* Imported date */}
              <InfoRow
                icon={Calendar}
                label="Importado em"
                value={formatDate(lead.createdAt)}
              />
            </div>
          </section>

          {/* Interaction History Section */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Histórico de Interações
              </h3>
              {!showNoteForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNoteForm(true)}
                >
                  <StickyNote className="h-4 w-4 mr-2" />
                  Adicionar Nota
                </Button>
              )}
            </div>

            {/* Add Note Form */}
            {showNoteForm && (
              <AddNoteForm
                leadId={lead.id}
                onComplete={() => setShowNoteForm(false)}
              />
            )}

            {/* Interactions List */}
            <div
              className={cn(
                "space-y-2",
                loadingInteractions && "opacity-50 pointer-events-none"
              )}
            >
              {loadingInteractions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : interactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma interação registrada</p>
                </div>
              ) : (
                interactions.map((interaction) => (
                  <InteractionItem
                    key={interaction.id}
                    interaction={interaction}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
