/**
 * ErrorLogList Tests
 * Story 23.3: Configurações → Erros
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ErrorLog } from "@/types/error-log";

const mockUseErrorLogs = vi.fn();
vi.mock("@/hooks/use-error-logs", () => ({
  useErrorLogs: () => mockUseErrorLogs(),
}));

import { ErrorLogList } from "@/components/settings/ErrorLogList";

const refetch = vi.fn();

function state(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, error: null, refetch, ...overrides };
}

const log: ErrorLog = {
  id: "e1",
  tenantId: null,
  source: "cron",
  route: "pg_cron/reply-sweep-cron",
  message: "Falhou 1 vez(es) nos ultimos 15 min: timeout",
  createdAt: "2026-10-20T15:30:00Z",
};

describe("ErrorLogList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading", () => {
    mockUseErrorLogs.mockReturnValue(state({ isLoading: true }));
    render(<ErrorLogList />);
    expect(screen.getByTestId("error-logs-loading")).toBeInTheDocument();
  });

  it("erro com Tentar novamente", () => {
    mockUseErrorLogs.mockReturnValue(state({ error: new Error("Acesso negado") }));
    render(<ErrorLogList />);
    expect(screen.getByText(/Acesso negado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it("vazio", () => {
    mockUseErrorLogs.mockReturnValue(state({ data: [] }));
    render(<ErrorLogList />);
    expect(screen.getByText("Nenhum erro registrado")).toBeInTheDocument();
  });

  it("tabela Data / Origem / Rota / Mensagem", () => {
    mockUseErrorLogs.mockReturnValue(
      state({ data: [log, { ...log, id: "e2", source: "agent_step", route: "agent/export" }] })
    );
    render(<ErrorLogList />);

    for (const header of ["Data", "Origem", "Rota", "Mensagem"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText("Job agendado")).toBeInTheDocument();
    expect(screen.getByText("Agente")).toBeInTheDocument();
    expect(screen.getByText("pg_cron/reply-sweep-cron")).toBeInTheDocument();
    expect(screen.getAllByText(log.message)).toHaveLength(2);
    // dd/MM/yyyy HH:mm (fuso local)
    expect(screen.getAllByText(/^20\/10\/2026 \d{2}:\d{2}$/)).toHaveLength(2);
  });
});
