/**
 * Sheet lateral do dossie da conta (um por tela, controlado pelo pai — D10)
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * A leitura so acontece com o Sheet aberto (D9): o corpo que chama o hook so monta
 * dentro do `SheetContent`, que nao existe com o Sheet fechado. Assim, nenhuma tela
 * ganha leitura nova no carregamento.
 */

"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAccountDossier } from "@/hooks/use-account-dossier";
import type { AccountDossierContext, AccountDossierTarget } from "@/types/account-dossier";
import { AccountDossierPanel } from "./AccountDossierPanel";
import { DossierPanelErrorBoundary } from "./DossierPanelErrorBoundary";

export interface AccountDossierSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AccountDossierTarget | null;
  context: AccountDossierContext;
}

function AccountDossierSheetBody({
  target,
  context,
  open,
}: {
  target: AccountDossierTarget;
  context: AccountDossierContext;
  open: boolean;
}) {
  const query = useAccountDossier(
    {
      executionId: target.executionId ?? null,
      leadId: target.leadId ?? null,
      apolloId: target.apolloId ?? null,
      email: target.email ?? null,
    },
    { enabled: open }
  );
  const retry = () => {
    void query.refetch();
  };
  // Nova tentativa depois de um erro: volta ao "carregando" ate a resposta chegar.
  const retrying = query.isError && query.isFetching;
  return (
    <DossierPanelErrorBoundary onRetry={retry}>
      <AccountDossierPanel
        view={query.data}
        isLoading={query.isLoading || retrying}
        isError={query.isError && !retrying}
        onRetry={retry}
        leadName={target.leadName}
        companyName={target.companyName}
        context={context}
      />
    </DossierPanelErrorBoundary>
  );
}

export function AccountDossierSheet({ open, onOpenChange, target, context }: AccountDossierSheetProps) {
  const title = target?.companyName || target?.leadName || "lead";
  return (
    <Sheet open={open && Boolean(target)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden sm:max-w-lg"
        data-testid="account-dossier-sheet"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Dossiê — {title}</SheetTitle>
          <SheetDescription>{target ? target.leadName : ""}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          {target && <AccountDossierSheetBody target={target} context={context} open={open} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
