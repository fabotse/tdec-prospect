import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginPage from "@/app/(auth)/login/page";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

// Mock Supabase client
const mockSignInWithPassword = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ error: null });
  });

  describe("Rendering", () => {
    it("should render login form with title", () => {
      render(<LoginPage />);

      expect(
        screen.getByRole("heading", { name: /TDEC Prospect/i })
      ).toBeInTheDocument();
    });

    it("should render email input field", () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute("type", "email");
    });

    it("should render password input field", () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/senha/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("should render submit button with 'Entrar' text", () => {
      render(<LoginPage />);

      expect(
        screen.getByRole("button", { name: /entrar/i })
      ).toBeInTheDocument();
    });

    it("should have autocomplete attributes for accessibility", () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/email/i)).toHaveAttribute(
        "autocomplete",
        "email"
      );
      expect(screen.getByLabelText(/senha/i)).toHaveAttribute(
        "autocomplete",
        "current-password"
      );
    });
  });

  describe("Form Validation", () => {
    it("should show error for empty email", async () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      // Fill password but leave email empty
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email inválido/i)).toBeInTheDocument();
      });
    });

    it("should show error for short password", async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "12345" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/senha deve ter no mínimo 6 caracteres/i)
        ).toBeInTheDocument();
      });
    });

    it("should not submit form with empty fields", async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole("button", { name: /entrar/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignInWithPassword).not.toHaveBeenCalled();
      });
    });
  });

  describe("Form Submission", () => {
    it("should call signInWithPassword with correct credentials", async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignInWithPassword).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "password123",
        });
      });
    });

    it("should redirect to /leads on successful login", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/leads");
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it("should show loading state during submission", async () => {
      // Delay the mock response to see loading state
      mockSignInWithPassword.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      // Button should show loading text
      expect(screen.getByRole("button", { name: /entrando/i })).toBeInTheDocument();
    });

    it("should disable submit button during submission", async () => {
      mockSignInWithPassword.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      const loadingButton = screen.getByRole("button", { name: /entrando/i });
      expect(loadingButton).toBeDisabled();
    });
  });

  describe("Error Handling", () => {
    it("should show error for invalid credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/email ou senha incorretos/i)).toBeInTheDocument();
      });
    });

    it("should show error for unconfirmed email", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Email not confirmed" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/por favor, confirme seu email/i)).toBeInTheDocument();
      });
    });

    it("should show rate limit error message", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Too many requests" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/muitas tentativas/i)).toBeInTheDocument();
      });
    });

    it("should show generic error for unknown errors", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Unknown error" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/erro de conexão/i)).toBeInTheDocument();
      });
    });

    it("should not redirect on error", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-invalid on inputs with errors", async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole("button", { name: /entrar/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const emailInput = screen.getByLabelText(/email/i);
        expect(emailInput).toHaveAttribute("aria-invalid", "true");
      });
    });

    it("should have role=alert on error message container", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole("button", { name: /entrar/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });
  });
});
