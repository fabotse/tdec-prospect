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

import { useState, useCallback, useEffect, useMemo } from "react";
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
  Sparkles,
  MessageCircle,
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
import { useIcebreakerEnrichment } from "@/hooks/use-icebreaker-enrichment";
import { useWhatsAppMessages } from "@/hooks/use-whatsapp-messages";
import { getWhatsAppStatusIcon } from "@/components/tracking/LeadTrackingTable";
import { IcebreakerCategorySelect } from "./IcebreakerCategorySelect";
import { DEFAULT_ICEBREAKER_CATEGORY } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";
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
 * Render icon for interaction type
 * AC: #3 - Interaction type icons
 */
function renderInteractionIcon(type: InteractionType, className: string) {
  switch (type) {
    case "note":
      return <StickyNote className={className} />;
    case "status_change":
      return <RefreshCw className={className} />;
    case "import":
      return <Download className={className} />;
    case "campaign_sent":
      return <Send className={className} />;
    case "campaign_reply":
      return <Reply className={className} />;
    case "whatsapp_sent":
      return <MessageCircle className={cn(className, "text-green-600 dark:text-green-400")} />;
    default:
      return <StickyNote className={className} />;
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
  return (
    <div className="flex gap-3 p-4 rounded-md bg-muted/50">
      <div className="flex-shrink-0 mt-1">
        {renderInteractionIcon(interaction.type, "h-4 w-4 text-muted-foreground")}
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
  const [localPhone, setLocalPhone] = useState<string | null>(null);

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

  // Reset states when lead changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset on lead change
    setLookupError(null);

    setNotFoundMessage(null);
    setLocalPhone(null);
    reset();
  }, [lead.id, reset]);

  // Handle phone lookup (AC #1)
  const handleLookup = async () => {
    if (!identifier) return;

    setLookupError(null);
    setNotFoundMessage(null);

    try {
      const result = await lookupPhoneAsync({ identifier, leadId: lead.id });
      // Update local state immediately for instant UI refresh
      if (result.phone) {
        setLocalPhone(result.phone);
      }
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

  // Use local phone for immediate display, fallback to lead prop
  const displayPhone = localPhone ?? lead.phone;

  // If lead has phone (AC #5)
  if (displayPhone) {
    return (
      <div className="flex items-center justify-between gap-2 py-2">
        {/* Phone number */}
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground whitespace-nowrap">Telefone:</span>
          <span className="font-medium font-mono">{displayPhone}</span>
        </div>
        {/* Icon-only action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => copyToClipboard(displayPhone)}
            title="Copiar telefone"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleLookup}
            disabled={isLoading || !identifier}
            title="Atualizar telefone"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
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
 * Icebreaker Section Component
 * Story 6.5.6: AC #3, #4, #5, #6
 * Handles icebreaker display and generation
 */
function IcebreakerSection({ lead }: { lead: Lead }) {
  const { generateForLead, isGenerating } = useIcebreakerEnrichment();
  const [error, setError] = useState<string | null>(null);
  const [localIcebreaker, setLocalIcebreaker] = useState<string | null>(null);
  const [localTimestamp, setLocalTimestamp] = useState<string | null>(null);
  // Story 9.1: Category state with "Empresa" default
  const [category, setCategory] = useState<IcebreakerCategory>(DEFAULT_ICEBREAKER_CATEGORY);

  // Reset local state when lead changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset on lead change
    setError(null);

    setLocalIcebreaker(null);

    setLocalTimestamp(null);
    // Story 9.1: Reset category to default when switching leads
    setCategory(DEFAULT_ICEBREAKER_CATEGORY);
  }, [lead.id]);

  // Use local state for immediate display, fallback to lead prop
  const displayIcebreaker = localIcebreaker ?? lead.icebreaker;

  // Story 9.1: Check if lead has LinkedIn posts for Post/LinkedIn warning
  const hasLinkedInPosts = !!lead.linkedinPostsCache;

  // Handle generate/regenerate icebreaker
  const handleGenerate = async (regenerate: boolean = false) => {
    setError(null);

    // Story 9.1: For non-post categories, LinkedIn URL is not required
    if (category === "post" && !lead.linkedinUrl) {
      setError("Este lead não possui LinkedIn cadastrado");
      return;
    }

    try {
      const data = await generateForLead(lead.id, regenerate, category);
      // Update local state immediately with the API response
      const result = data.results[0];
      if (result?.success && result.icebreaker) {
        setLocalIcebreaker(result.icebreaker);
        setLocalTimestamp(new Date().toISOString());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar icebreaker";
      setError(message);
    }
  };

  // Format timestamp for display (AC #6)
  const formatTimestamp = (dateString: string | null): string | null => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return null;
    }
  };

  const timestamp = formatTimestamp(localTimestamp ?? lead.icebreakerGeneratedAt);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Icebreaker
        </h3>
        {/* AC #3: Regenerar button for existing icebreakers */}
        {displayIcebreaker && !isGenerating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerate(true)}
            disabled={isGenerating}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerar
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        {/* AC #4: Loading state during generation */}
        {isGenerating ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Gerando icebreaker...</span>
          </div>
        ) : displayIcebreaker ? (
          /* AC #3: Display full icebreaker text */
          <div className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{displayIcebreaker}</p>
            {/* AC #6: Generation timestamp */}
            {timestamp && (
              <p className="text-xs text-muted-foreground">
                Gerado em {timestamp}
              </p>
            )}
            {/* Story 9.1: Category select for regeneration */}
            <IcebreakerCategorySelect
              value={category}
              onValueChange={setCategory}
              showPostWarning={category === "post" && !hasLinkedInPosts}
              disabled={isGenerating}
            />
          </div>
        ) : (
          /* AC #3: Generate button for leads without icebreaker */
          <div className="space-y-3">
            {/* Story 9.1: Category select before generate button */}
            <IcebreakerCategorySelect
              value={category}
              onValueChange={setCategory}
              showPostWarning={category === "post" && !hasLinkedInPosts}
              disabled={isGenerating}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(false)}
              disabled={isGenerating}
              className="w-full"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Gerar Icebreaker
            </Button>
          </div>
        )}

        {/* AC #5: Error message */}
        {error && (
          <Alert variant="destructive" className="mt-3 py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {error}
              {error.includes("LinkedIn") && (
                <>
                  <br />
                  <span className="text-muted-foreground">
                    Atualize os dados do lead para incluir o LinkedIn
                  </span>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}

/**
 * WhatsApp Messages Section
 * Story 11.7: AC #4, #5 — WhatsApp message history grouped by campaign
 */
function WhatsAppMessagesSection({ lead }: { lead: Lead }) {
  const { messages, isLoading } = useWhatsAppMessages(undefined, lead.email ?? undefined, {
    enabled: !!lead.email,
  });

  // Group messages by campaign_name
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, typeof messages>();
    for (const msg of messages) {
      const key = msg.campaign_name ?? "Sem campanha";
      const existing = groups.get(key) ?? [];
      existing.push(msg);
      groups.set(key, existing);
    }
    return groups;
  }, [messages]);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5" />
        Mensagens WhatsApp
      </h3>

      <div className="rounded-lg border bg-card p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <MessageCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma mensagem WhatsApp enviada</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedMessages.entries()).map(([campaignName, msgs]) => (
              <div key={campaignName} className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {campaignName}
                </h4>
                {msgs.map((msg) => {
                  const statusInfo = getWhatsAppStatusIcon(msg.status);
                  const StatusIcon = statusInfo.icon;
                  const preview = msg.message.length > 100
                    ? msg.message.slice(0, 100) + "..."
                    : msg.message;

                  return (
                    <div key={msg.id} className="flex gap-3 p-3 rounded-md bg-muted/50">
                      <div className="flex-shrink-0 mt-0.5">
                        <StatusIcon className={cn("h-4 w-4", statusInfo.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <span className="font-mono">{msg.phone}</span>
                          <span>·</span>
                          <span>{statusInfo.label}</span>
                        </div>
                        <p className="text-sm text-foreground break-words">
                          {preview}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {msg.sent_at
                            ? formatDate(msg.sent_at, true)
                            : formatDate(msg.created_at, true)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset on close
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

          {/* Story 6.5.6: AC #3 - Icebreaker Section */}
          <IcebreakerSection lead={lead} />

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

          {/* Story 11.7: AC #4, #5 — WhatsApp Messages Section */}
          <WhatsAppMessagesSection lead={lead} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
