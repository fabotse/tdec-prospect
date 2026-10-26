"use client";

/**
 * Lista de Supressão
 * Story: 23.5 - Lista de supressão: cadastro e import
 *
 * Única aba de Configurações liberada ao SDR (só leitura).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SuppressionList } from "@/components/settings/SuppressionList";

export default function SuppressionPage() {
  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader>
        <CardTitle className="text-h3">Lista de Supressão</CardTitle>
        <CardDescription className="text-body-small text-foreground-muted">
          Domínios e e-mails que nunca devem receber campanha: clientes, negociações em
          andamento, concorrentes, parceiros e opt-outs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SuppressionList />
      </CardContent>
    </Card>
  );
}
