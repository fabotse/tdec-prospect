"use client";

/**
 * KnownContactForm
 * Story 25.1: dialog de adicionar/editar contato conhecido (só admin).
 *
 * Cadastro novo sem LinkedIn: em vez de salvar direto, entrega o contato para
 * `onSaveWithoutLinkedin` (a lista abre a busca de candidatos).
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeKnownContactInput } from "@/lib/utils/known-contacts";
import {
  KNOWN_CONTACT_RELATIONS,
  KNOWN_CONTACT_RELATION_LABELS,
  type KnownContact,
  type KnownContactInput,
  type KnownContactRelation,
} from "@/types/known-contact";

interface KnownContactFormProps {
  /** Contato em edição; sem ele, é cadastro novo. */
  contact?: KnownContact | null;
  onClose: () => void;
  /** Salva; devolve `true` para fechar o dialog. */
  onSave: (input: KnownContactInput) => Promise<boolean>;
  /** Cadastro novo sem LinkedIn: a lista abre a busca. */
  onSaveWithoutLinkedin?: (input: KnownContactInput) => void;
  isSaving: boolean;
}

export function KnownContactForm({
  contact,
  onClose,
  onSave,
  onSaveWithoutLinkedin,
  isSaving,
}: KnownContactFormProps) {
  const isEdit = !!contact;
  const [fullName, setFullName] = useState(contact?.full_name ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [companyName, setCompanyName] = useState(contact?.company_name ?? "");
  const [companyDomain, setCompanyDomain] = useState(contact?.company_domain ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedin_url ?? "");
  const [relation, setRelation] = useState<KnownContactRelation | "">(
    contact?.relation_type ?? ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relation) {
      setError("Selecione a relação");
      return;
    }
    const input: KnownContactInput = {
      fullName,
      title,
      companyName,
      companyDomain,
      linkedinUrl,
      relationType: relation,
    };
    const normalized = normalizeKnownContactInput(input);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    setError(null);

    if (!isEdit && !normalized.data.linkedin_url && onSaveWithoutLinkedin) {
      onSaveWithoutLinkedin(input);
      return;
    }
    if (await onSave(input)) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="known-contact-form">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar contato" : "Adicionar contato conhecido"}</DialogTitle>
            <DialogDescription>
              Pessoa com quem a TDec já tem relacionamento. Informe a empresa ou o domínio.
              {!isEdit && " Sem LinkedIn, o sistema busca os perfis candidatos para você confirmar."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="kc-name">Nome</Label>
              <Input
                id="kc-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="kc-title">Cargo</Label>
              <Input
                id="kc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="kc-relation">Relação</Label>
              <Select
                value={relation}
                onValueChange={(v) => setRelation(v as KnownContactRelation)}
                disabled={isSaving}
              >
                <SelectTrigger id="kc-relation" aria-label="Relação">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_CONTACT_RELATIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {KNOWN_CONTACT_RELATION_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="kc-company">Empresa</Label>
              <Input
                id="kc-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="kc-domain">Domínio</Label>
              <Input
                id="kc-domain"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                placeholder="empresa.com.br"
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="kc-linkedin">LinkedIn</Label>
              <Input
                id="kc-linkedin"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="linkedin.com/in/..."
                disabled={isSaving}
              />
            </div>
          </div>

          {error && (
            <p className="text-body-small text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
