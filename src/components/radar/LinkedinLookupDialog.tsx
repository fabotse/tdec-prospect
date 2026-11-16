"use client";

/**
 * LinkedinLookupDialog
 * Story 25.1: busca sob demanda do LinkedIn de um contato (só admin).
 *
 * Montado só quando aberto: faz UMA busca ao montar, lista até 5 candidatos e só grava
 * a URL que o gestor confirmar ("Usar este"). Sem candidato ou com falha, mostra o motivo
 * e oferece só "Salvar sem LinkedIn" (quando `onSaveWithout` existe) ou "Cancelar".
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/types/knowledge-base";
import type { LinkedinCandidate, LinkedinLookupInput } from "@/types/known-contact";

interface LinkedinLookupDialogProps {
  target: LinkedinLookupInput;
  onLookup: (
    input: LinkedinLookupInput
  ) => Promise<ActionResult<{ candidates: LinkedinCandidate[] }>>;
  /** Grava com a URL escolhida. */
  onConfirm: (url: string) => Promise<void> | void;
  /** Grava sem LinkedIn (cadastro novo). Sem a prop, o botão não aparece. */
  onSaveWithout?: () => Promise<void> | void;
  onClose: () => void;
  isSaving: boolean;
}

type LookupState =
  | { status: "loading" }
  | { status: "done"; candidates: LinkedinCandidate[] }
  | { status: "error"; error: string };

export function LinkedinLookupDialog({
  target,
  onLookup,
  onConfirm,
  onSaveWithout,
  onClose,
  isSaving,
}: LinkedinLookupDialogProps) {
  const [state, setState] = useState<LookupState>({ status: "loading" });
  // Uma busca por abertura (StrictMode monta o efeito duas vezes em dev).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    onLookup(target)
      .then((result) => {
        if (!result.success) {
          setState({ status: "error", error: result.error });
        } else {
          setState({ status: "done", candidates: result.data?.candidates ?? [] });
        }
      })
      .catch(() => {
        setState({ status: "error", error: "A busca do LinkedIn falhou." });
      });
  }, [onLookup, target]);

  const company = target.companyName || target.companyDomain;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[600px]" data-testid="linkedin-lookup-dialog">
        <DialogHeader>
          <DialogTitle>Buscar LinkedIn</DialogTitle>
          <DialogDescription>
            Perfis encontrados para <strong>{target.fullName}</strong>
            {company ? ` (${company})` : ""}. Confira e escolha o certo: só a URL que você
            confirmar é salva.
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" && (
          <div
            className="flex items-center gap-2 p-4 text-body-small text-foreground-muted"
            data-testid="linkedin-lookup-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando perfis…
          </div>
        )}

        {state.status === "error" && (
          <p className="text-body-small text-destructive" role="alert">
            {state.error}
          </p>
        )}

        {state.status === "done" && (
          <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="linkedin-candidates">
            {state.candidates.map((c) => (
              <li
                key={c.url}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-body-small font-medium">{c.title || c.url}</p>
                  {c.snippet && (
                    <p className="text-xs text-foreground-muted">{c.snippet}</p>
                  )}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
                  >
                    {c.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                <Button
                  size="sm"
                  onClick={() => onConfirm(c.url)}
                  disabled={isSaving}
                  aria-label={`Usar este: ${c.url}`}
                >
                  Usar este
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          {onSaveWithout && (
            <Button
              variant="secondary"
              onClick={() => onSaveWithout()}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar sem LinkedIn
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
