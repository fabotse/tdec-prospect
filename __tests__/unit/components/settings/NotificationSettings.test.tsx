/**
 * Tests for NotificationSettings (Story 21.7 AC3)
 * Cobre: loading skeleton, render dos campos, save desabilitado até dirty,
 * adicionar/sanitizar número (chip), estado de erro.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationSettingsView } from "@/hooks/use-notification-settings";

const mockSave = vi.fn();
const mockUseNotificationSettings = vi.fn();
vi.mock("@/hooks/use-notification-settings", () => ({
  useNotificationSettings: () => mockUseNotificationSettings(),
}));

import { NotificationSettings } from "@/components/settings/NotificationSettings";

const SETTINGS: NotificationSettingsView = {
  id: "ns-1",
  tenantId: "tenant-1",
  whatsappNumbers: ["5511999999999"],
  channels: { whatsapp: true, inApp: true, whatsappEngagement: false },
  notifyIntents: ["interessado", "pediu_info"],
  createdAt: "2026-07-16T00:00:00Z",
  updatedAt: "2026-07-16T00:00:00Z",
};

function setup(overrides: Record<string, unknown> = {}) {
  mockUseNotificationSettings.mockReturnValue({
    settings: SETTINGS,
    settingsExist: true,
    isLoading: false,
    error: null,
    saveSettings: { mutate: mockSave, isPending: false },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationSettings", () => {
  it("mostra skeleton enquanto carrega", () => {
    mockUseNotificationSettings.mockReturnValue({
      settings: null,
      settingsExist: false,
      isLoading: true,
      error: null,
      saveSettings: { mutate: mockSave, isPending: false },
    });
    const { container } = render(<NotificationSettings />);
    // Skeleton usa animate-pulse; nenhum campo de formulário renderizado.
    expect(screen.queryByText("Canais de notificação")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renderiza canais, número existente e intents", () => {
    setup();
    render(<NotificationSettings />);
    expect(screen.getByText("Canais de notificação")).toBeInTheDocument();
    expect(screen.getByText("5511999999999")).toBeInTheDocument();
    expect(screen.getByText("Interessado")).toBeInTheDocument();
    expect(screen.getByText("Pediu informações")).toBeInTheDocument();
  });

  it("save desabilitado quando não há alterações (não dirty)", () => {
    setup();
    render(<NotificationSettings />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("adiciona número (sanitizado) como chip e habilita o save", () => {
    setup();
    render(<NotificationSettings />);

    const input = screen.getByPlaceholderText("5511999999999");
    fireEvent.change(input, { target: { value: "+55 (11) 98888-7777" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar número" }));

    // Sanitizado para dígitos.
    expect(screen.getByText("5511988887777")).toBeInTheDocument();
    // Alteração torna o form dirty → save habilitado.
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });

  it("remove número via botão do chip", () => {
    setup();
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Remover 5511999999999" }));
    expect(screen.queryByText("5511999999999")).not.toBeInTheDocument();
  });

  it("mostra estado de erro", () => {
    mockUseNotificationSettings.mockReturnValue({
      settings: null,
      settingsExist: false,
      isLoading: false,
      error: new Error("Falha ao carregar"),
      saveSettings: { mutate: mockSave, isPending: false },
    });
    render(<NotificationSettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Falha ao carregar");
  });
});
