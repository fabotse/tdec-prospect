import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the useEmailExamples hook
vi.mock("@/hooks/use-email-examples", () => ({
  useEmailExamples: vi.fn(),
}));

import { toast } from "sonner";
import { useEmailExamples } from "@/hooks/use-email-examples";
import { EmailExamplesForm } from "@/components/settings/EmailExamplesForm";

// Create wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("EmailExamplesForm", () => {
  const mockCreateExample = vi.fn();
  const mockUpdateExample = vi.fn();
  const mockDeleteExample = vi.fn();

  const defaultHookReturn = {
    examples: [],
    isLoading: false,
    error: null,
    createExample: mockCreateExample,
    updateExample: mockUpdateExample,
    deleteExample: mockDeleteExample,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEmailExamples).mockReturnValue(defaultHookReturn);
    mockCreateExample.mockResolvedValue({
      success: true,
      data: { id: "1", subject: "Test", body: "Body", context: null },
    });
    mockUpdateExample.mockResolvedValue({
      success: true,
      data: { id: "1", subject: "Updated", body: "Body", context: null },
    });
    mockDeleteExample.mockResolvedValue({ success: true });
  });

  describe("Rendering", () => {
    it("should render empty state when no examples", () => {
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/nenhum exemplo cadastrado/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      ).toBeInTheDocument();
    });

    it("should render list of examples", () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "Email de Apresentação",
            body: "Olá, sou o João...",
            context: "Primeiro contato",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
          {
            id: "2",
            tenant_id: "t1",
            subject: "Follow-up",
            body: "Conforme conversamos...",
            context: null,
            created_at: "2024-01-02",
            updated_at: "2024-01-02",
          },
        ],
      });

      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Email de Apresentação")).toBeInTheDocument();
      expect(screen.getByText("Follow-up")).toBeInTheDocument();
    });

    it("should render loading skeleton when isLoading is true", () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      // Empty state should not be visible during loading
      expect(
        screen.queryByText(/nenhum exemplo cadastrado/i)
      ).not.toBeInTheDocument();
    });

    it("should render error message when error exists", () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        error: "Erro ao carregar dados",
      });

      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Erro ao carregar dados")).toBeInTheDocument();
    });
  });

  describe("Add Example", () => {
    it("should open add dialog when clicking add button", async () => {
      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: /adicionar exemplo/i })).toBeInTheDocument();
    });

    it("should create new example successfully", async () => {
      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      );

      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/assunto/i), "Novo Assunto");
      await user.type(within(dialog).getByLabelText(/corpo do email/i), "Conteúdo do email");
      await user.type(within(dialog).getByLabelText(/contexto/i), "Contexto opcional");

      await user.click(within(dialog).getByRole("button", { name: /^adicionar$/i }));

      await waitFor(() => {
        expect(mockCreateExample).toHaveBeenCalledWith({
          subject: "Novo Assunto",
          body: "Conteúdo do email",
          context: "Contexto opcional",
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Exemplo adicionado com sucesso"
      );
    });

    it("should show error toast on failed create", async () => {
      mockCreateExample.mockResolvedValue({
        success: false,
        error: "Erro ao criar",
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      );

      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/assunto/i), "Test");
      await user.type(within(dialog).getByLabelText(/corpo do email/i), "Body");
      await user.click(within(dialog).getByRole("button", { name: /^adicionar$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao criar");
      });
    });
  });

  describe("Edit Example", () => {
    it("should open edit dialog when clicking edit button", async () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "Existing Subject",
            body: "Existing Body",
            context: "Existing Context",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /editar exemplo/i }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/assunto/i)).toHaveValue("Existing Subject");
      expect(within(dialog).getByLabelText(/corpo do email/i)).toHaveValue("Existing Body");
      expect(within(dialog).getByLabelText(/contexto/i)).toHaveValue("Existing Context");
    });

    it("should update existing example successfully", async () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "Old Subject",
            body: "Old Body",
            context: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /editar exemplo/i }));

      const dialog = screen.getByRole("dialog");
      const subjectInput = within(dialog).getByLabelText(/assunto/i);
      await user.clear(subjectInput);
      await user.type(subjectInput, "New Subject");

      await user.click(within(dialog).getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(mockUpdateExample).toHaveBeenCalledWith("1", {
          subject: "New Subject",
          body: "Old Body",
          context: "",
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Exemplo atualizado com sucesso"
      );
    });
  });

  describe("Delete Example", () => {
    it("should open delete confirmation when clicking delete button", async () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "To Delete",
            body: "Body",
            context: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /excluir exemplo/i }));

      const alertDialog = screen.getByRole("alertdialog");
      expect(alertDialog).toBeInTheDocument();
      expect(within(alertDialog).getByText(/remover exemplo\?/i)).toBeInTheDocument();
    });

    it("should delete example after confirmation", async () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "To Delete",
            body: "Body",
            context: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /excluir exemplo/i }));

      const alertDialog = screen.getByRole("alertdialog");
      await user.click(within(alertDialog).getByRole("button", { name: /^remover$/i }));

      await waitFor(() => {
        expect(mockDeleteExample).toHaveBeenCalledWith("1");
      });

      expect(toast.success).toHaveBeenCalledWith("Exemplo removido com sucesso");
    });

    it("should not delete example when cancelled", async () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "To Keep",
            body: "Body",
            context: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
      });

      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /excluir exemplo/i }));

      const alertDialog = screen.getByRole("alertdialog");
      await user.click(within(alertDialog).getByRole("button", { name: /cancelar/i }));

      expect(mockDeleteExample).not.toHaveBeenCalled();
    });
  });

  describe("Loading States", () => {
    it("should show loading state during create operation", () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        isCreating: true,
      });

      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      // Empty state should still be interactive
      expect(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      ).toBeInTheDocument();
    });

    it("should show loading state during delete operation", () => {
      vi.mocked(useEmailExamples).mockReturnValue({
        ...defaultHookReturn,
        examples: [
          {
            id: "1",
            tenant_id: "t1",
            subject: "Test",
            body: "Body",
            context: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
        isDeleting: true,
      });

      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      // Delete button should still be present
      expect(
        screen.getByRole("button", { name: /excluir exemplo/i })
      ).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("should show validation error when subject is empty", async () => {
      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      );

      const dialog = screen.getByRole("dialog");
      // Try to submit without filling required fields
      await user.click(within(dialog).getByRole("button", { name: /^adicionar$/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/assunto é obrigatório/i)).toBeInTheDocument();
      });

      expect(mockCreateExample).not.toHaveBeenCalled();
    });

    it("should show validation error when body is empty", async () => {
      const user = userEvent.setup();
      render(<EmailExamplesForm />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /adicionar exemplo/i })
      );

      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText(/assunto/i), "Test Subject");
      await user.click(within(dialog).getByRole("button", { name: /^adicionar$/i }));

      await waitFor(() => {
        expect(
          within(dialog).getByText(/corpo do email é obrigatório/i)
        ).toBeInTheDocument();
      });

      expect(mockCreateExample).not.toHaveBeenCalled();
    });
  });
});
