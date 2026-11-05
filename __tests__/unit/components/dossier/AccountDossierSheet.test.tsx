/**
 * Unit Tests — AccountDossierSheet + useAccountDossier (contencao de erro)
 * Story 24.22 - AC4 · revisao Codex rodada 1 (DTO invalido, timeout, error boundary)
 */

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDossierSheet } from "@/components/dossier/AccountDossierSheet";
import { DossierPanelErrorBoundary } from "@/components/dossier/DossierPanelErrorBoundary";
import {
  ACCOUNT_DOSSIER_TIMEOUT_MS,
  parseAccountDossierView,
} from "@/hooks/use-account-dossier";
import type { AccountDossierTarget, AccountDossierView } from "@/types/account-dossier";

const target: AccountDossierTarget = {
  executionId: null,
  leadId: null,
  apolloId: "ap-1",
  email: "ana@acme.com",
  leadName: "Ana",
  companyName: "Acme",
};

const foundView: AccountDossierView = {
  status: "found",
  dossier: {
    id: "d-1",
    companyName: "Acme",
    companyDomain: "acme.com",
    dossierStatus: "complete",
    failedSources: [],
    researchedAt: "2026-11-01T10:00:00Z",
    expired: false,
  },
  facts: [],
  totalFacts: 0,
  whyNow: null,
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const mockFetch = vi.fn();

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="host-screen">tela hospedeira</div>
      <AccountDossierSheet open onOpenChange={() => {}} target={target} context="campaign" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseAccountDossierView", () => {
  it("aceita none e found completo", () => {
    expect(parseAccountDossierView({ status: "none" })).toEqual({ status: "none" });
    expect(parseAccountDossierView(foundView)).toEqual(foundView);
  });

  it("rejeita found incompleto ou fora do formato", () => {
    expect(parseAccountDossierView({ status: "found" })).toBeNull();
    expect(parseAccountDossierView({ ...foundView, dossier: { id: "d-1" } })).toBeNull();
    expect(parseAccountDossierView({ ...foundView, facts: [{ kind: "x" }] })).toBeNull();
    expect(parseAccountDossierView(null)).toBeNull();
    expect(parseAccountDossierView({ status: "outro" })).toBeNull();
  });
});

describe("AccountDossierSheet — erros contidos no painel", () => {
  it("HTTP 200 com {status:'found'} incompleto -> erro local; 'Tentar de novo' recarrega", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { status: "found" } }));
    renderSheet();

    expect(await screen.findByTestId("dossier-error")).toBeInTheDocument();
    expect(screen.getByTestId("host-screen")).toBeInTheDocument();
    // DTO invalido nao e erro transitorio, mas retry: 1 pode repetir; nunca chega ao painel.
    expect(screen.queryByTestId("dossier-found")).not.toBeInTheDocument();

    mockFetch.mockResolvedValue(jsonResponse({ data: foundView }));
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByTestId("dossier-found")).toBeInTheDocument();
  });

  it("fetch que nunca resolve -> erro por timeout; nova tentativa funciona", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderSheet();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("dossier-loading")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACCOUNT_DOSSIER_TIMEOUT_MS + 10);
    });
    expect(screen.getByTestId("dossier-error")).toBeInTheDocument();
    // Timeout nao e repetido automaticamente.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);

    mockFetch.mockResolvedValue(jsonResponse({ data: foundView }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("dossier-found")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("DossierPanelErrorBoundary", () => {
  function Boom(): never {
    throw new Error("render quebrou");
  }

  it("exceção de render fica contida; a tela hospedeira continua e 'Tentar de novo' chama onRetry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRetry = vi.fn();
    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) return <Boom />;
      return <p data-testid="recovered">ok</p>;
    }
    render(
      <div>
        <p data-testid="host-screen">tela hospedeira</p>
        <DossierPanelErrorBoundary onRetry={onRetry}>
          <MaybeBoom />
        </DossierPanelErrorBoundary>
      </div>
    );
    expect(screen.getByTestId("host-screen")).toBeInTheDocument();
    expect(screen.getByTestId("dossier-error")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("recovered")).toBeInTheDocument());
  });
});
