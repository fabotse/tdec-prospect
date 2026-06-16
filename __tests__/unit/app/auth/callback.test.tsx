import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Auth callback page tests
 * Story: 20.4 - Provisionamento dos usuários do cliente (deliverable B, Task 2)
 *
 * Foco: o callback de aceitação de convite chama applyInvitedRoleOnAcceptance
 * (apenas para type=invite), na ordem certa (após setSession, antes do signOut),
 * e que uma falha da ação NÃO trava o redirect.
 * (A propagação real do cookie de sessão → action server é validada manualmente —
 *  ver §Execução da story; o unit test cobre o wiring, não o transporte de cookie.)
 */

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// Mock Supabase browser client
const mockSetSession = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      setSession: mockSetSession,
      signOut: mockSignOut,
    },
  }),
}));

// Mock the server action (deliverable B)
const mockApplyInvitedRole = vi.fn();
vi.mock("@/actions/team", () => ({
  applyInvitedRoleOnAcceptance: () => mockApplyInvitedRole(),
}));

import AuthCallbackPage from "@/app/auth/callback/page";

const originalLocation = window.location;

function setHash(hash: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { hash, href: "http://localhost/", replace: vi.fn(), assign: vi.fn() },
  });
}

const TOKENS = "access_token=acc-123&refresh_token=ref-456";

describe("AuthCallbackPage (Story 20.4 — invite role propagation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSession.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockApplyInvitedRole.mockResolvedValue({
      success: true,
      data: { applied: true },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("calls applyInvitedRoleOnAcceptance on an invite acceptance, then redirects", async () => {
    setHash(`#${TOKENS}&type=invite`);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?invite=accepted");
    });

    expect(mockApplyInvitedRole).toHaveBeenCalledTimes(1);
    // ORDERING IS BINDING: the role must be applied while the session is still
    // active — i.e. AFTER setSession and BEFORE signOut.
    expect(mockSetSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockApplyInvitedRole.mock.invocationCallOrder[0]
    );
    expect(mockApplyInvitedRole.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0]
    );
  });

  it("does NOT call applyInvitedRoleOnAcceptance for non-invite callbacks", async () => {
    setHash(`#${TOKENS}&type=recovery`);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?verified=true");
    });

    expect(mockApplyInvitedRole).not.toHaveBeenCalled();
  });

  it("still redirects when the role action returns a failure (does not block)", async () => {
    mockApplyInvitedRole.mockResolvedValue({
      success: false,
      error: "Erro ao aplicar o papel do convite.",
    });
    setHash(`#${TOKENS}&type=invite`);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?invite=accepted");
    });

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("still redirects when the role action throws (does not block)", async () => {
    mockApplyInvitedRole.mockRejectedValue(new Error("boom"));
    setHash(`#${TOKENS}&type=invite`);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?invite=accepted");
    });

    expect(mockSignOut).toHaveBeenCalled();
  });
});
