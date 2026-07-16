/**
 * Tests for NotificationBell (Story 21.7 AC2)
 * Cobre: badge de não-lidas, estado vazio, render do item, clique → mark-read + navega.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppNotification } from "@/types/opportunity";

// Renderiza o dropdown inline (evita a complexidade do portal/pointer do Radix em jsdom).
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseNotifications = vi.fn();
const mockUseUnreadCount = vi.fn();
const mockMarkRead = vi.fn();
vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => mockUseNotifications(),
  useUnreadNotificationsCount: () => mockUseUnreadCount(),
  useMarkNotificationRead: () => ({ mutate: mockMarkRead }),
}));

import { NotificationBell } from "@/components/common/NotificationBell";

function notif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "an-1",
    tenantId: "tenant-1",
    type: "nova_oportunidade",
    payload: { leadName: "João Silva", company: "ACME", campaignName: "Campanha X" },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNotifications.mockReturnValue({ notifications: [], meta: null, isLoading: false, error: null });
  mockUseUnreadCount.mockReturnValue({ data: 0 });
});

describe("NotificationBell", () => {
  it("exibe o botão do sino sempre", () => {
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
  });

  it("mostra o badge com a contagem de não-lidas", () => {
    mockUseUnreadCount.mockReturnValue({ data: 3 });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell-badge")).toHaveTextContent("3");
  });

  it("não mostra badge quando 0 não-lidas", () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 });
    render(<NotificationBell />);
    expect(screen.queryByTestId("notification-bell-badge")).not.toBeInTheDocument();
  });

  it("badge satura em 99+", () => {
    mockUseUnreadCount.mockReturnValue({ data: 150 });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell-badge")).toHaveTextContent("99+");
  });

  it("estado vazio", () => {
    render(<NotificationBell />);
    expect(screen.getByText("Nenhuma notificação")).toBeInTheDocument();
  });

  it("estado de carregamento (não confunde com vazio)", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      meta: null,
      isLoading: true,
      error: null,
    });
    render(<NotificationBell />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma notificação")).not.toBeInTheDocument();
  });

  it("estado de erro (não confunde com vazio)", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      meta: null,
      isLoading: false,
      error: "Erro ao buscar notificações",
    });
    render(<NotificationBell />);
    expect(screen.getByText("Erro ao carregar notificações")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma notificação")).not.toBeInTheDocument();
  });

  it("renderiza o título da notificação a partir do payload", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [notif()],
      meta: null,
      isLoading: false,
      error: null,
    });
    render(<NotificationBell />);
    expect(screen.getByText(/João Silva \(ACME\)/)).toBeInTheDocument();
    expect(screen.getByText("Campanha X")).toBeInTheDocument();
  });

  it("clique numa notificação não-lida → mark-read + navega para a Central", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [notif({ id: "an-9", readAt: null })],
      meta: null,
      isLoading: false,
      error: null,
    });
    render(<NotificationBell />);

    fireEvent.click(screen.getByText(/João Silva/));

    expect(mockMarkRead).toHaveBeenCalledWith("an-9");
    expect(mockPush).toHaveBeenCalledWith("/opportunities");
  });

  it("clique numa notificação já lida → navega mas NÃO re-marca", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [notif({ id: "an-9", readAt: "2026-07-16T00:00:00Z" })],
      meta: null,
      isLoading: false,
      error: null,
    });
    render(<NotificationBell />);

    fireEvent.click(screen.getByText(/João Silva/));

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/opportunities");
  });
});
