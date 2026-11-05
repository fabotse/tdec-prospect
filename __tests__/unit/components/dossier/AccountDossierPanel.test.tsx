/**
 * Unit Tests — AccountDossierPanel
 * Story 24.22 - AC 1, 3, 4, 5 · D5, D6, D11
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  AccountDossierPanel,
  formatFactDate,
  GENERATE_RESEARCH_HINT,
  LEAD_REVIEW_NOTE,
  safeHttpUrl,
} from "@/components/dossier/AccountDossierPanel";
import type { AccountDossierView, DossierViewFact } from "@/types/account-dossier";

function fact(overrides: Partial<DossierViewFact> = {}): DossierViewFact {
  return {
    kind: "news",
    fato: "Acme abre escritório em Recife",
    fonteUrl: "https://news.example.com/acme",
    data: "2026-10-01",
    confianca: "alta",
    isTriggerSource: false,
    ...overrides,
  };
}

function found(overrides: Partial<Extract<AccountDossierView, { status: "found" }>> = {}): AccountDossierView {
  return {
    status: "found",
    dossier: {
      id: "d-1",
      companyName: "Acme",
      companyDomain: "acme.com",
      dossierStatus: "complete",
      failedSources: [],
      researchedAt: "2026-11-01T15:00:00Z",
      expired: false,
    },
    facts: [fact({ isTriggerSource: true })],
    totalFacts: 1,
    whyNow: {
      status: "trigger",
      reason: null,
      gatilho: "Noticia: Acme abre escritório em Recife",
      hipoteseDor: "Como vão contratar para o novo escritório?",
      confianca: "alta",
      fonteUrl: "https://news.example.com/acme",
      data: "2026-10-01",
    },
    ...overrides,
  };
}

const baseProps = {
  isLoading: false,
  isError: false,
  onRetry: vi.fn(),
  leadName: "Ana Silva",
  companyName: "Acme",
  context: "campaign" as const,
};

describe("AccountDossierPanel", () => {
  it("carregando", () => {
    render(<AccountDossierPanel {...baseProps} view={undefined} isLoading />);
    expect(screen.getByTestId("dossier-loading")).toBeInTheDocument();
  });

  it("erro + 'Tentar de novo' chama onRetry", () => {
    const onRetry = vi.fn();
    render(<AccountDossierPanel {...baseProps} view={undefined} isError onRetry={onRetry} />);
    expect(screen.getByText("Não foi possível carregar o dossiê")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("none: 'Sem pesquisa' e 'Gerar pesquisa' desabilitada com o texto da D6", () => {
    render(<AccountDossierPanel {...baseProps} view={{ status: "none" }} />);
    expect(screen.getByText("Sem pesquisa")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Gerar pesquisa (em breve)" });
    expect(button).toBeDisabled();
    expect(screen.getByText(GENERATE_RESEARCH_HINT)).toBeInTheDocument();
    expect(screen.queryByText(LEAD_REVIEW_NOTE)).not.toBeInTheDocument();
  });

  it("none na revisão de leads mostra a nota da D4", () => {
    render(<AccountDossierPanel {...baseProps} context="lead_review" view={{ status: "none" }} />);
    expect(screen.getByText(LEAD_REVIEW_NOTE)).toBeInTheDocument();
  });

  it("found com gatilho: gatilho, hipótese, fonte, data e badge Gatilho", () => {
    render(<AccountDossierPanel {...baseProps} view={found()} />);
    expect(screen.getByTestId("dossier-trigger-text")).toHaveTextContent("Noticia: Acme abre escritório em Recife");
    expect(screen.getByTestId("dossier-pain-text")).toHaveTextContent("Como vão contratar para o novo escritório?");
    expect(screen.getByTestId("dossier-fact-trigger")).toHaveTextContent("Gatilho");
    expect(screen.getByTestId("dossier-researched-at")).toHaveTextContent("Pesquisa de 01/11/2026");
    expect(screen.getAllByText("01/10/2026").length).toBeGreaterThan(0);
  });

  it("sem gatilho mostra o motivo da D11 e 'Sem hipótese de dor'", () => {
    render(
      <AccountDossierPanel
        {...baseProps}
        view={found({
          whyNow: {
            status: "no_trigger",
            reason: "time_budget",
            gatilho: null,
            hipoteseDor: null,
            confianca: null,
            fonteUrl: null,
            data: null,
          },
        })}
      />
    );
    expect(screen.getByTestId("dossier-no-trigger")).toHaveTextContent("limite da execução atingido");
    expect(screen.getByText("Sem hipótese de dor (sem gatilho)")).toBeInTheDocument();
  });

  it("motivo desconhecido -> 'sem gatilho'; whyNow null -> 'gatilho não avaliado'", () => {
    const { rerender } = render(
      <AccountDossierPanel
        {...baseProps}
        view={found({
          whyNow: { status: "no_trigger", reason: "constructor", gatilho: null, hipoteseDor: null, confianca: null, fonteUrl: null, data: null },
        })}
      />
    );
    expect(screen.getByTestId("dossier-no-trigger")).toHaveTextContent("Sem gatilho: sem gatilho");
    rerender(<AccountDossierPanel {...baseProps} view={found({ whyNow: null })} />);
    expect(screen.getByTestId("dossier-no-trigger")).toHaveTextContent("gatilho não avaliado");
  });

  it("badges Desatualizado e Parcial (com as fontes que falharam)", () => {
    const view = found();
    if (view.status !== "found") throw new Error();
    render(
      <AccountDossierPanel
        {...baseProps}
        view={{ ...view, dossier: { ...view.dossier, expired: true, dossierStatus: "partial", failedSources: ["treg"] } }}
      />
    );
    expect(screen.getByTestId("dossier-expired")).toHaveTextContent("Desatualizado");
    expect(screen.getByTestId("dossier-partial")).toHaveTextContent("Parcial");
    expect(screen.getByText("Fontes que falharam: treg")).toBeInTheDocument();
  });

  it("sem fatos e 'e mais N fatos'", () => {
    const { rerender } = render(<AccountDossierPanel {...baseProps} view={found({ facts: [], totalFacts: 0 })} />);
    expect(screen.getByText("Pesquisa sem fatos com fonte")).toBeInTheDocument();
    rerender(<AccountDossierPanel {...baseProps} view={found({ facts: [fact()], totalFacts: 7 })} />);
    expect(screen.getByTestId("dossier-more-facts")).toHaveTextContent("e mais 6 fatos");
  });

  it("link seguro: target=_blank e rel=noopener noreferrer, rótulo = host", () => {
    render(<AccountDossierPanel {...baseProps} view={found()} />);
    const link = screen.getByTestId("dossier-fact-source");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://news.example.com/acme");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("news.example.com");
  });

  it("javascript:alert(1) não vira <a>: aparece 'fonte inválida'", () => {
    const { container } = render(
      <AccountDossierPanel
        {...baseProps}
        view={found({ facts: [fact({ fonteUrl: "javascript:alert(1)" })], whyNow: null })}
      />
    );
    expect(screen.getByText("fonte inválida")).toBeInTheDocument();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("conteúdo malicioso aparece como texto literal (sem script/b/markdown)", () => {
    const evil = '<script>alert(1)</script><b>negrito</b> **md** <img src=x onerror="alert(2)">';
    const { container } = render(
      <AccountDossierPanel
        {...baseProps}
        view={found({
          facts: [fact({ fato: evil })],
          whyNow: {
            status: "trigger",
            reason: null,
            gatilho: evil,
            hipoteseDor: evil,
            confianca: "media",
            fonteUrl: "https://ok.example.com",
            data: "2026-10-01",
          },
          dossier: {
            id: "d-1",
            companyName: evil,
            companyDomain: "acme.com",
            dossierStatus: "complete",
            failedSources: [],
            researchedAt: "2026-11-01T15:00:00Z",
            expired: false,
          },
        })}
      />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(within(screen.getByTestId("dossier-fact-text")).getByText(evil)).toBeInTheDocument();
    expect(screen.getByTestId("dossier-company")).toHaveTextContent(evil);
  });
});

describe("helpers", () => {
  it("formatFactDate não desloca por fuso", () => {
    expect(formatFactDate("2026-01-01")).toBe("01/01/2026");
    expect(formatFactDate("2026-12-31")).toBe("31/12/2026");
    expect(formatFactDate("lixo")).toBe("");
    expect(formatFactDate(null)).toBe("");
  });

  it("safeHttpUrl só aceita http/https", () => {
    expect(safeHttpUrl("https://a.com/x")?.hostname).toBe("a.com");
    expect(safeHttpUrl("http://a.com")?.protocol).toBe("http:");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("/relativa")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
