/**
 * ErrorsPage Tests
 * Story 23.3: aba Configurações → Erros (só platform admin)
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/settings/ErrorLogList", () => ({
  ErrorLogList: () => <div data-testid="error-log-list" />,
}));

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUsePlatformAdmin = vi.fn();
vi.mock("@/hooks/use-platform-admin", () => ({
  usePlatformAdmin: () => mockUsePlatformAdmin(),
}));

import ErrorsPage from "@/app/(dashboard)/settings/errors/page";

describe("ErrorsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("platform admin: mostra o título e a lista de erros", () => {
    mockUsePlatformAdmin.mockReturnValue({ data: true, isLoading: false });
    render(<ErrorsPage />);
    expect(screen.getByRole("heading", { name: "Erros" })).toBeInTheDocument();
    expect(screen.getByTestId("error-log-list")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("gestor do cliente: não renderiza e volta para /settings", () => {
    mockUsePlatformAdmin.mockReturnValue({ data: false, isLoading: false });
    render(<ErrorsPage />);
    expect(screen.queryByTestId("error-log-list")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/settings");
  });

  it("carregando: não renderiza nem redireciona", () => {
    mockUsePlatformAdmin.mockReturnValue({ data: undefined, isLoading: true });
    render(<ErrorsPage />);
    expect(screen.queryByTestId("error-log-list")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
