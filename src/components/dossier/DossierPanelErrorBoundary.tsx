/**
 * Contencao local de erro de renderizacao do painel do dossie
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade (AC4)
 *
 * Qualquer excecao ao renderizar o painel fica DENTRO do Sheet: a tela que o hospeda
 * (revisao, previa da campanha, oportunidades) continua de pe. O fallback oferece
 * "Tentar de novo", que limpa o erro e pede nova leitura.
 */

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
}

export class DossierPanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AccountDossierPanel] erro de renderizacao contido:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Alert variant="destructive" data-testid="dossier-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o dossiê</AlertTitle>
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={this.handleRetry} className="mt-2">
            <RefreshCw className="h-3 w-3" />
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
}
