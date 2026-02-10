/**
 * Unit Tests for SyncIndicator Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #3 — Mostra lastSyncAt formatado, botao Sincronizar
 * AC: #4 — Loading state durante sync, botao desabilitado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncIndicator, formatRelativeTime } from "@/components/tracking/SyncIndicator";

describe("SyncIndicator (AC: #3, #4)", () => {
  const onSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe lastSyncAt formatado (7.2)", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    render(
      <SyncIndicator lastSyncAt={tenMinutesAgo} onSync={onSync} isSyncing={false} />
    );

    expect(screen.getByTestId("sync-status")).toHaveTextContent("Sincronizado Ha 10 minutos");
  });

  it("exibe 'Nunca sincronizado' quando lastSyncAt e null (7.2)", () => {
    render(
      <SyncIndicator lastSyncAt={null} onSync={onSync} isSyncing={false} />
    );

    expect(screen.getByTestId("sync-status")).toHaveTextContent("Nunca sincronizado");
  });

  it("exibe botao Sincronizar habilitado quando nao esta sincronizando (7.2)", () => {
    render(
      <SyncIndicator lastSyncAt={null} onSync={onSync} isSyncing={false} />
    );

    const button = screen.getByTestId("sync-button");
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent("Sincronizar");
  });

  it("chama onSync ao clicar no botao (7.2)", async () => {
    const user = userEvent.setup();

    render(
      <SyncIndicator lastSyncAt={null} onSync={onSync} isSyncing={false} />
    );

    await user.click(screen.getByTestId("sync-button"));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("desabilita botao e exibe loading durante sync (AC: #4) (7.2)", () => {
    render(
      <SyncIndicator lastSyncAt={null} onSync={onSync} isSyncing={true} />
    );

    const button = screen.getByTestId("sync-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Sincronizando...");
  });

  it("renderiza container com testid (7.2)", () => {
    render(
      <SyncIndicator lastSyncAt={null} onSync={onSync} isSyncing={false} />
    );

    expect(screen.getByTestId("sync-indicator")).toBeInTheDocument();
  });
});

describe("formatRelativeTime", () => {
  it("retorna 'Agora mesmo' para menos de 1 minuto (7.2)", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("Agora mesmo");
  });

  it("retorna minutos no singular (7.2)", () => {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneMinuteAgo)).toBe("Ha 1 minuto");
  });

  it("retorna minutos no plural (7.2)", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("Ha 5 minutos");
  });

  it("retorna horas no singular (7.2)", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe("Ha 1 hora");
  });

  it("retorna horas no plural (7.2)", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("Ha 3 horas");
  });

  it("retorna dias no singular (7.2)", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneDayAgo)).toBe("Ha 1 dia");
  });

  it("retorna dias no plural (7.2)", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe("Ha 3 dias");
  });
});
