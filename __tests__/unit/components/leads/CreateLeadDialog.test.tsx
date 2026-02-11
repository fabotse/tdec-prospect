/**
 * Tests for CreateLeadDialog Component
 * Quick Dev: Manual Lead Creation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("CreateLeadDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog with title and description", () => {
    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Criar Lead Manualmente")).toBeInTheDocument();
    expect(
      screen.getByText("Preencha os dados do lead. Apenas o nome é obrigatório.")
    ).toBeInTheDocument();
  });

  it("should render all form fields", () => {
    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("create-lead-firstName")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-lastName")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-email")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-phone")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-companyName")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-title")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-industry")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-location")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-companySize")).toBeInTheDocument();
    expect(screen.getByTestId("create-lead-linkedinUrl")).toBeInTheDocument();
  });

  it("should show validation error when firstName is empty", async () => {
    const user = userEvent.setup();

    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    const submitButton = screen.getByTestId("create-lead-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId("create-lead-firstName-error")).toBeInTheDocument();
    });
  });

  it("should submit form with valid data", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: "lead-1", firstName: "João", status: "novo" },
        }),
    });

    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    await user.type(screen.getByTestId("create-lead-firstName"), "João");
    await user.type(screen.getByTestId("create-lead-email"), "joao@test.com");
    await user.click(screen.getByTestId("create-lead-submit"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("João"),
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Lead criado com sucesso!");
    });

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show error toast on API failure", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { message: "Erro ao criar lead" },
        }),
    });

    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    await user.type(screen.getByTestId("create-lead-firstName"), "João");
    await user.click(screen.getByTestId("create-lead-submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao criar lead");
    });
  });

  it("should show loading state while submitting", async () => {
    const user = userEvent.setup();

    // Never resolves — simulates loading
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    await user.type(screen.getByTestId("create-lead-firstName"), "João");
    await user.click(screen.getByTestId("create-lead-submit"));

    await waitFor(() => {
      expect(screen.getByText("Criando...")).toBeInTheDocument();
    });
  });

  it("should reset form after successful submission", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: "lead-1", firstName: "João", status: "novo" },
        }),
    });

    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    // Type into field
    const firstNameInput = screen.getByTestId("create-lead-firstName") as HTMLInputElement;
    await user.type(firstNameInput, "João");
    expect(firstNameInput.value).toBe("João");

    // Submit
    await user.click(screen.getByTestId("create-lead-submit"));

    // After success, form.reset() is called — onOpenChange(false) closes dialog
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    // Verify form was reset (input cleared)
    await waitFor(() => {
      expect(firstNameInput.value).toBe("");
    });
  });

  it("should render cancel and submit buttons", () => {
    render(
      <CreateLeadDialog open={true} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Cancelar")).toBeInTheDocument();
    expect(screen.getByText("Criar Lead")).toBeInTheDocument();
  });

  it("should not render when dialog is closed", () => {
    render(
      <CreateLeadDialog open={false} onOpenChange={mockOnOpenChange} />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("Criar Lead Manualmente")).not.toBeInTheDocument();
  });
});
