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

// Mock the useICPDefinition hook
vi.mock("@/hooks/use-icp-definition", () => ({
  useICPDefinition: vi.fn(),
}));

import { toast } from "sonner";
import { useICPDefinition } from "@/hooks/use-icp-definition";
import { ICPDefinitionForm } from "@/components/settings/ICPDefinitionForm";

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

describe("ICPDefinitionForm", () => {
  const mockSaveICP = vi.fn();

  const defaultHookReturn = {
    data: null,
    isLoading: false,
    error: null,
    saveICP: mockSaveICP,
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useICPDefinition).mockReturnValue(defaultHookReturn);
    mockSaveICP.mockResolvedValue({ success: true });
  });

  describe("Rendering", () => {
    it("should render company size checkboxes", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/tamanho da empresa/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/1-10 funcionários/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/11-50 funcionários/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/51-200 funcionários/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/201-500 funcionários/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/501-1000 funcionários/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/1000\+ funcionários/i)).toBeInTheDocument();
    });

    it("should render industries tag input", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/setores\/indústrias/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/ex: tecnologia, saas/i)
      ).toBeInTheDocument();
    });

    it("should render job titles tag input", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/cargos alvo/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/ex: ceo, cto/i)
      ).toBeInTheDocument();
    });

    it("should render geographic focus tag input", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/foco geográfico/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/ex: são paulo, brasil/i)
      ).toBeInTheDocument();
    });

    it("should render pain points textarea", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/dores que resolvemos/i)).toBeInTheDocument();
    });

    it("should render common objections textarea", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      // Label appears in the form
      expect(screen.getByLabelText(/objeções comuns/i)).toBeInTheDocument();
    });

    it("should render save button", () => {
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    });

    it("should render loading skeleton when isLoading is true", () => {
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      // The form fields should not be visible during loading
      expect(screen.queryByText(/tamanho da empresa/i)).not.toBeInTheDocument();
    });

    it("should render error message when error exists", () => {
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        error: "Erro ao carregar dados",
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Erro ao carregar dados")).toBeInTheDocument();
    });
  });

  describe("Data Population", () => {
    it("should populate fields with existing data", () => {
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        data: {
          company_sizes: ["11-50", "51-200"],
          industries: ["Tecnologia", "SaaS"],
          job_titles: ["CEO", "CTO"],
          geographic_focus: ["São Paulo"],
          pain_points: "Dores do cliente",
          common_objections: "Objeções comuns",
        },
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      // Check company sizes are selected
      expect(screen.getByLabelText(/11-50 funcionários/i)).toBeChecked();
      expect(screen.getByLabelText(/51-200 funcionários/i)).toBeChecked();
      expect(screen.getByLabelText(/1-10 funcionários/i)).not.toBeChecked();

      // Check tags are displayed
      expect(screen.getByText("Tecnologia")).toBeInTheDocument();
      expect(screen.getByText("SaaS")).toBeInTheDocument();
      expect(screen.getByText("CEO")).toBeInTheDocument();
      expect(screen.getByText("CTO")).toBeInTheDocument();
      expect(screen.getByText("São Paulo")).toBeInTheDocument();

      // Check textareas
      expect(screen.getByDisplayValue("Dores do cliente")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Objeções comuns")).toBeInTheDocument();
    });
  });

  describe("Company Size Selection", () => {
    it("should allow selecting multiple company sizes", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      await user.click(screen.getByLabelText(/11-50 funcionários/i));
      await user.click(screen.getByLabelText(/51-200 funcionários/i));

      expect(screen.getByLabelText(/11-50 funcionários/i)).toBeChecked();
      expect(screen.getByLabelText(/51-200 funcionários/i)).toBeChecked();
    });

    it("should allow deselecting company sizes", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      await user.click(screen.getByLabelText(/11-50 funcionários/i));
      expect(screen.getByLabelText(/11-50 funcionários/i)).toBeChecked();

      await user.click(screen.getByLabelText(/11-50 funcionários/i));
      expect(screen.getByLabelText(/11-50 funcionários/i)).not.toBeChecked();
    });
  });

  describe("Tag Input", () => {
    it("should add industry tag on Enter key", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ex: tecnologia, saas/i);
      await user.type(input, "Fintech{enter}");

      expect(screen.getByText("Fintech")).toBeInTheDocument();
    });

    it("should add job title tag on Enter key", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ex: ceo, cto/i);
      await user.type(input, "VP Vendas{enter}");

      expect(screen.getByText("VP Vendas")).toBeInTheDocument();
    });

    it("should add geographic focus tag on Enter key", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ex: são paulo, brasil/i);
      await user.type(input, "América Latina{enter}");

      expect(screen.getByText("América Latina")).toBeInTheDocument();
    });

    it("should remove tag when X is clicked", async () => {
      const user = userEvent.setup();
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        data: {
          company_sizes: ["11-50"],
          industries: ["Tecnologia"],
          job_titles: [],
          geographic_focus: [],
          pain_points: "",
          common_objections: "",
        },
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Tecnologia")).toBeInTheDocument();

      // Find the badge and its remove button
      const badge = screen.getByText("Tecnologia").closest("div");
      const removeButton = within(badge!).getByRole("button");
      await user.click(removeButton);

      expect(screen.queryByText("Tecnologia")).not.toBeInTheDocument();
    });

    it("should not add duplicate tags", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/ex: tecnologia, saas/i);
      await user.type(input, "SaaS{enter}");
      await user.type(input, "SaaS{enter}");

      // Should only have one SaaS tag
      const saasTags = screen.getAllByText("SaaS");
      expect(saasTags).toHaveLength(1);
    });
  });

  describe("Form Submission", () => {
    it("should call saveICP with form data on submit", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      // Select company size
      await user.click(screen.getByLabelText(/11-50 funcionários/i));

      // Add a tag
      const industryInput = screen.getByPlaceholderText(/ex: tecnologia, saas/i);
      await user.type(industryInput, "Tech{enter}");

      // Submit
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(mockSaveICP).toHaveBeenCalledWith(
          expect.objectContaining({
            company_sizes: ["11-50"],
            industries: ["Tech"],
          })
        );
      });
    });

    it("should show success toast on successful save", async () => {
      const user = userEvent.setup();
      mockSaveICP.mockResolvedValue({ success: true });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      await user.click(screen.getByLabelText(/11-50 funcionários/i));
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("ICP salvo com sucesso");
      });
    });

    it("should show error toast on failed save", async () => {
      const user = userEvent.setup();
      mockSaveICP.mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      await user.click(screen.getByLabelText(/11-50 funcionários/i));
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao salvar");
      });
    });

    it("should show validation error when no company size is selected", async () => {
      const user = userEvent.setup();
      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/selecione ao menos um tamanho/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Loading State", () => {
    it("should show saving state during save", () => {
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/salvando/i)).toBeInTheDocument();
    });

    it("should disable save button while saving", () => {
      vi.mocked(useICPDefinition).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<ICPDefinitionForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled();
    });
  });
});
