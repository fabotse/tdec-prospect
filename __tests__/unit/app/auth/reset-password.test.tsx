import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Reset password page tests
 * Hotfix: link de recuperação caía em "Link expirado" mesmo válido.
 *
 * Causa: o browser client (@supabase/ssr, flowType pkce, detectSessionInUrl)
 * já troca o `?code` pela sessão na inicialização. A página chamava
 * exchangeCodeForSession de novo com o mesmo código → erro → "Link expirado".
 * O mock abaixo reproduz isso: exchangeCodeForSession falha (código já usado)
 * e getSession devolve a sessão criada pela inicialização.
 */

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const mockGetSession = vi.fn();
const mockExchangeCode = vi.fn();
const mockSetSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      exchangeCodeForSession: mockExchangeCode,
      setSession: mockSetSession,
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

import ResetPasswordPage from "@/app/(auth)/reset-password/page";

const originalLocation = window.location;

function setUrl(search: string, hash = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { search, hash, href: `http://localhost/reset-password${search}${hash}` },
  });
}

const SESSION = { access_token: "acc", refresh_token: "ref", user: { id: "u1" } };

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockExchangeCode.mockResolvedValue({
      error: { message: "invalid flow state, no valid flow state found" },
    });
    mockSetSession.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("shows the form when the client already exchanged the PKCE code (no second exchange)", async () => {
    setUrl("?code=abc");
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });

    render(<ResetPasswordPage />);

    expect(await screen.findByText("Definir nova senha")).toBeInTheDocument();
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it("explains the same-browser requirement when a code arrives without a session", async () => {
    setUrl("?code=abc");
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    expect(
      await screen.findByText(/mesmo navegador em que você pediu a recuperação/)
    ).toBeInTheDocument();
  });

  it("falls back to hash tokens via setSession", async () => {
    setUrl("", "#access_token=acc&refresh_token=ref&type=recovery");
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    expect(await screen.findByText("Definir nova senha")).toBeInTheDocument();
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "acc",
      refresh_token: "ref",
    });
  });

  it("shows invalid link when there is no code, token or session", async () => {
    setUrl("");
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    await waitFor(() =>
      expect(screen.getByText("Link inválido ou expirado.")).toBeInTheDocument()
    );
  });
});
