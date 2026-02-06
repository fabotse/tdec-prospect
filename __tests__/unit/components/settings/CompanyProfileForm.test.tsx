import { render, screen, waitFor } from "@testing-library/react";
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

// Mock the useKnowledgeBase hook
vi.mock("@/hooks/use-knowledge-base", () => ({
  useKnowledgeBase: vi.fn(),
}));

import { toast } from "sonner";
import { useKnowledgeBase } from "@/hooks/use-knowledge-base";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";

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

describe("CompanyProfileForm", () => {
  const mockSaveCompany = vi.fn();

  const defaultHookReturn = {
    data: null,
    isLoading: false,
    error: null,
    saveCompany: mockSaveCompany,
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useKnowledgeBase).mockReturnValue(defaultHookReturn);
    mockSaveCompany.mockResolvedValue({ success: true });
  });

  describe("Rendering", () => {
    it("should render all form fields", () => {
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/nome da empresa/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/descrição do negócio/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/produtos\/serviços/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/diferenciais competitivos/i)).toBeInTheDocument();
    });

    it("should render save button", () => {
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    });

    it("should render loading skeleton when isLoading is true", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      // The form fields should not be visible during loading
      expect(screen.queryByLabelText(/nome da empresa/i)).not.toBeInTheDocument();
    });

    it("should render error message when error exists", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        error: "Erro ao carregar dados",
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Erro ao carregar dados")).toBeInTheDocument();
    });
  });

  describe("Data Population", () => {
    it("should populate fields with existing data", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        data: {
          company_name: "TDEC Company",
          business_description: "We do great things",
          products_services: "Product A, Product B",
          competitive_advantages: "We are the best",
        },
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/nome da empresa/i)).toHaveValue("TDEC Company");
      expect(screen.getByLabelText(/descrição do negócio/i)).toHaveValue("We do great things");
      expect(screen.getByLabelText(/produtos\/serviços/i)).toHaveValue("Product A, Product B");
      expect(screen.getByLabelText(/diferenciais competitivos/i)).toHaveValue("We are the best");
    });

    it("should show empty fields when no data exists", () => {
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/nome da empresa/i)).toHaveValue("");
      expect(screen.getByLabelText(/descrição do negócio/i)).toHaveValue("");
      expect(screen.getByLabelText(/produtos\/serviços/i)).toHaveValue("");
      expect(screen.getByLabelText(/diferenciais competitivos/i)).toHaveValue("");
    });
  });

  describe("Form Submission", () => {
    it("should call saveCompany with form data on submit", async () => {
      const user = userEvent.setup();
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      await user.type(screen.getByLabelText(/nome da empresa/i), "Test Company");
      await user.type(screen.getByLabelText(/descrição do negócio/i), "Description");
      await user.type(screen.getByLabelText(/produtos\/serviços/i), "Products");
      await user.type(screen.getByLabelText(/diferenciais competitivos/i), "Advantages");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(mockSaveCompany).toHaveBeenCalledWith({
          company_name: "Test Company",
          business_description: "Description",
          products_services: "Products",
          competitive_advantages: "Advantages",
        });
      });
    });

    it("should show success toast on successful save", async () => {
      const user = userEvent.setup();
      mockSaveCompany.mockResolvedValue({ success: true });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      await user.type(screen.getByLabelText(/nome da empresa/i), "Test Company");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Informações da empresa salvas com sucesso"
        );
      });
    });

    it("should show error toast on failed save", async () => {
      const user = userEvent.setup();
      mockSaveCompany.mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      await user.type(screen.getByLabelText(/nome da empresa/i), "Test Company");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao salvar");
      });
    });
  });

  describe("Loading State", () => {
    it("should show saving state during save", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/salvando/i)).toBeInTheDocument();
    });

    it("should disable inputs while saving", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/nome da empresa/i)).toBeDisabled();
      expect(screen.getByLabelText(/descrição do negócio/i)).toBeDisabled();
      expect(screen.getByLabelText(/produtos\/serviços/i)).toBeDisabled();
      expect(screen.getByLabelText(/diferenciais competitivos/i)).toBeDisabled();
    });

    it("should disable save button while saving", () => {
      vi.mocked(useKnowledgeBase).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled();
    });
  });

  describe("Validation", () => {
    it("should show validation error when company_name is empty on submit", async () => {
      const user = userEvent.setup();
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      // Submit without filling required field
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/obrigatório/i)).toBeInTheDocument();
      });

      // Should not call saveCompany
      expect(mockSaveCompany).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper labels for all form fields", () => {
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/nome da empresa/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/descrição do negócio/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/produtos\/serviços/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/diferenciais competitivos/i)).toBeInTheDocument();
    });

    it("should set aria-invalid on fields with errors", async () => {
      const user = userEvent.setup();
      render(<CompanyProfileForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/nome da empresa/i)).toHaveAttribute(
          "aria-invalid",
          "true"
        );
      });
    });
  });
});
