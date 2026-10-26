/**
 * Settings layout tests
 * Story 23.5 - o layout passa `nonAdminPaths` ao AdminGuard: o SDR entra só na
 * Lista de Supressão.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockUsePathname(),
}));

vi.mock("@/hooks/use-user", () => ({
  useUser: () => ({
    isLoading: false,
    isProfileLoading: false,
    isAdmin: false,
    user: { id: "sdr-1" },
  }),
}));

vi.mock("@/hooks/use-platform-admin", () => ({
  usePlatformAdmin: () => ({ data: false }),
}));

import SettingsLayout from "@/app/(dashboard)/settings/layout";

describe("SettingsLayout (não-admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o conteúdo em /settings/suppression", () => {
    mockUsePathname.mockReturnValue("/settings/suppression");
    render(
      <SettingsLayout>
        <div>Conteúdo da página</div>
      </SettingsLayout>
    );
    expect(screen.getByText("Conteúdo da página")).toBeInTheDocument();
    expect(screen.queryByText(/não tem permissão/i)).not.toBeInTheDocument();
  });

  it("mostra o fallback em /settings/integrations", () => {
    mockUsePathname.mockReturnValue("/settings/integrations");
    render(
      <SettingsLayout>
        <div>Conteúdo da página</div>
      </SettingsLayout>
    );
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo da página")).not.toBeInTheDocument();
  });
});
