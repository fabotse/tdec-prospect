"use client";

/**
 * KnownContactsList
 * Story 25.1: Radar → Contatos conhecidos
 *
 * Tabela Nome / Cargo / Empresa / LinkedIn / Relação / Origem / Data com busca.
 * Gestor/diretor adiciona, edita, remove, importa CSV e busca LinkedIn; o SDR só consulta
 * (o servidor e o RLS barram a escrita).
 */

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KnownContactForm } from "@/components/radar/KnownContactForm";
import { KnownContactsImportDialog } from "@/components/radar/KnownContactsImportDialog";
import { LinkedinLookupDialog } from "@/components/radar/LinkedinLookupDialog";
import { useKnownContacts } from "@/hooks/use-known-contacts";
import { useUser } from "@/hooks/use-user";
import {
  KNOWN_CONTACT_RELATION_LABELS,
  KNOWN_CONTACT_SOURCE_LABELS,
  type KnownContact,
  type KnownContactInput,
  type LinkedinLookupInput,
} from "@/types/known-contact";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

/** Minúsculo e sem acento ("Reunião" casa com "reuniao"). */
function foldSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matches(contact: KnownContact, term: string): boolean {
  if (!term) return true;
  return [
    contact.full_name,
    contact.title,
    contact.company_name,
    contact.company_domain,
    contact.linkedin_url,
    KNOWN_CONTACT_RELATION_LABELS[contact.relation_type],
    KNOWN_CONTACT_SOURCE_LABELS[contact.source],
  ].some((field) => foldSearch(field ?? "").includes(term));
}

function toInput(contact: KnownContact): KnownContactInput {
  return {
    fullName: contact.full_name,
    title: contact.title ?? "",
    companyName: contact.company_name ?? "",
    companyDomain: contact.company_domain ?? "",
    linkedinUrl: contact.linkedin_url ?? "",
    relationType: contact.relation_type,
  };
}

/** Busca de LinkedIn aberta: cadastro novo (ainda não gravado) ou contato existente. */
type LookupTarget =
  | { mode: "add"; input: KnownContactInput; lookup: LinkedinLookupInput }
  | { mode: "update"; contact: KnownContact; lookup: LinkedinLookupInput };

export function KnownContactsList() {
  const { isAdmin, isLoading: isUserLoading, isProfileLoading } = useUser();
  const canWrite = isAdmin && !isUserLoading && !isProfileLoading;
  const {
    contacts,
    isLoading,
    error,
    refetch,
    addContact,
    updateContact,
    removeContact,
    importContacts,
    findLinkedin,
    isAdding,
    isUpdating,
    isRemoving,
    isImporting,
  } = useKnownContacts();

  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<{ contact: KnownContact | null } | null>(null);
  const [lookupTarget, setLookupTarget] = useState<LookupTarget | null>(null);
  const [toRemove, setToRemove] = useState<KnownContact | null>(null);

  const term = foldSearch(search.trim());
  const filtered = useMemo(() => contacts.filter((c) => matches(c, term)), [contacts, term]);

  /** Grava (novo ou edição) e mostra o toast. Devolve `true` se gravou. */
  const save = useCallback(
    async (input: KnownContactInput, contact?: KnownContact | null): Promise<boolean> => {
      try {
        const result = contact
          ? await updateContact(contact.id, input)
          : await addContact(input);
        if (!result.success) {
          toast.error(result.error);
          return false;
        }
        toast.success(contact ? "Contato atualizado" : "Contato conhecido adicionado");
        return true;
      } catch {
        toast.error("Erro ao salvar o contato. Tente novamente.");
        return false;
      }
    },
    [addContact, updateContact]
  );

  const handleSaveWithoutLinkedin = (input: KnownContactInput) => {
    setFormTarget(null);
    setLookupTarget({
      mode: "add",
      input,
      lookup: {
        fullName: input.fullName,
        companyName: input.companyName ?? "",
        companyDomain: input.companyDomain ?? "",
      },
    });
  };

  const handleLookupConfirm = async (url: string) => {
    if (!lookupTarget) return;
    const ok =
      lookupTarget.mode === "add"
        ? await save({ ...lookupTarget.input, linkedinUrl: url })
        : await save({ ...toInput(lookupTarget.contact), linkedinUrl: url }, lookupTarget.contact);
    if (ok) setLookupTarget(null);
  };

  const handleLookupSaveWithout = async () => {
    if (lookupTarget?.mode !== "add") return;
    if (await save({ ...lookupTarget.input, linkedinUrl: "" })) setLookupTarget(null);
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      const result = await removeContact(toRemove.id);
      if (result.success) {
        toast.success("Contato removido");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Erro ao remover o contato. Tente novamente.");
    } finally {
      setToRemove(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="known-contacts-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md bg-destructive/10 p-4">
        <p className="text-destructive text-body-small">
          Erro ao carregar os contatos conhecidos: {error}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="ml-4 shrink-0"
          data-testid="known-contacts-retry"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const isSaving = isAdding || isUpdating;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, empresa, cargo ou relação"
            className="pl-9"
            aria-label="Buscar nos contatos conhecidos"
          />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-body-small text-foreground-muted" data-testid="known-contacts-count">
            {term
              ? `${filtered.length} de ${contacts.length} contatos`
              : `${contacts.length} ${contacts.length === 1 ? "contato" : "contatos"}`}
          </p>
          {canWrite && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
              </Button>
              <Button size="sm" onClick={() => setFormTarget({ contact: null })}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </>
          )}
        </div>
      </div>

      {contacts.length === 0 ? (
        <p
          className="rounded-md bg-background-secondary p-6 text-center text-body-small text-foreground-muted"
          data-testid="known-contacts-empty"
        >
          Nenhum contato conhecido cadastrado
        </p>
      ) : filtered.length === 0 ? (
        <p
          className="rounded-md bg-background-secondary p-6 text-center text-body-small text-foreground-muted"
          data-testid="known-contacts-no-results"
        >
          Nenhum contato encontrado para a busca
        </p>
      ) : (
        <Table data-testid="known-contacts-table">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead className="w-[130px]">Relação</TableHead>
              <TableHead className="w-[120px]">Origem</TableHead>
              <TableHead className="w-[100px]">Data</TableHead>
              {canWrite && <TableHead className="w-[100px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.full_name}</TableCell>
                <TableCell>{contact.title ?? "—"}</TableCell>
                <TableCell>
                  {contact.company_name ?? contact.company_domain ?? "—"}
                  {contact.company_name && contact.company_domain && (
                    <span className="block text-xs text-foreground-muted">
                      {contact.company_domain}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.linkedin_url ? (
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Perfil
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : canWrite ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        setLookupTarget({
                          mode: "update",
                          contact,
                          lookup: {
                            fullName: contact.full_name,
                            companyName: contact.company_name ?? "",
                            companyDomain: contact.company_domain ?? "",
                          },
                        })
                      }
                      aria-label={`Buscar LinkedIn de ${contact.full_name}`}
                    >
                      <Search className="h-3 w-3" />
                      Buscar LinkedIn
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {KNOWN_CONTACT_RELATION_LABELS[contact.relation_type] ?? contact.relation_type}
                </TableCell>
                <TableCell>
                  {KNOWN_CONTACT_SOURCE_LABELS[contact.source] ?? contact.source}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(contact.created_at)}</TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setFormTarget({ contact })}
                        aria-label={`Editar ${contact.full_name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToRemove(contact)}
                        disabled={isRemoving}
                        aria-label={`Remover ${contact.full_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canWrite && formTarget && (
        <KnownContactForm
          contact={formTarget.contact}
          onClose={() => setFormTarget(null)}
          onSave={(input) => save(input, formTarget.contact)}
          onSaveWithoutLinkedin={handleSaveWithoutLinkedin}
          isSaving={isSaving}
        />
      )}

      {canWrite && lookupTarget && (
        <LinkedinLookupDialog
          target={lookupTarget.lookup}
          onLookup={findLinkedin}
          onConfirm={handleLookupConfirm}
          onSaveWithout={lookupTarget.mode === "add" ? handleLookupSaveWithout : undefined}
          onClose={() => setLookupTarget(null)}
          isSaving={isSaving}
        />
      )}

      {canWrite && (
        <KnownContactsImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={importContacts}
          isImporting={isImporting}
        />
      )}

      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato conhecido?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove?.full_name} deixa de ser acompanhado como contato conhecido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isRemoving}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
