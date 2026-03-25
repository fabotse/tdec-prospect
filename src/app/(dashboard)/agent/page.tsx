/**
 * Pagina do Agente TDEC
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #1 - Pagina do agente acessivel via menu lateral
 * AC: #4 - AgentChat com area de mensagens e input
 */

import { Suspense } from "react";
import { AgentChat } from "@/components/agent";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Agente TDEC - tdec-prospect",
  description: "Agente conversacional para prospeccao automatizada",
};

function AgentSkeleton() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="flex-1 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

export default function AgentPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="px-6 pt-6 pb-3">
        <h1 className="text-h1 text-foreground">Agente TDEC</h1>
        <p className="text-body-small text-muted-foreground mt-1">
          Descreva sua campanha e o agente executa a prospeccao para voce.
        </p>
      </div>

      <Suspense fallback={<AgentSkeleton />}>
        <AgentChat />
      </Suspense>
    </div>
  );
}
