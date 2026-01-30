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

// Mock the useToneOfVoice hook
vi.mock("@/hooks/use-tone-of-voice", () => ({
  useToneOfVoice: vi.fn(),
}));

import { toast } from "sonner";
import { useToneOfVoice } from "@/hooks/use-tone-of-voice";
import { ToneOfVoiceForm } from "@/components/settings/ToneOfVoiceForm";

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

describe("ToneOfVoiceForm", () => {
  const mockSaveTone = vi.fn();

  const defaultHookReturn = {
    data: null,
    isLoading: false,
    error: null,
    saveTone: mockSaveTone,
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToneOfVoice).mockReturnValue(defaultHookReturn);
    mockSaveTone.mockResolvedValue({ success: true });
  });

  describe("Rendering", () => {
    it("should render tone preset radio buttons", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("radio", { name: /formal/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /casual/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /técnico/i })).toBeInTheDocument();
    });

    it("should render custom description textarea", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(
        screen.getByLabelText(/descrição personalizada/i)
      ).toBeInTheDocument();
    });

    it("should render writing guidelines textarea", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/diretrizes de escrita/i)).toBeInTheDocument();
    });

    it("should render save button", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    });

    it("should render loading skeleton when isLoading is true", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      // The form fields should not be visible during loading
      expect(screen.queryByRole("radio", { name: /formal/i })).not.toBeInTheDocument();
    });

    it("should render error message when error exists", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        error: "Erro ao carregar dados",
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByText("Erro ao carregar dados")).toBeInTheDocument();
    });
  });

  describe("Data Population", () => {
    it("should populate fields with existing data", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        data: {
          preset: "casual",
          custom_description: "Be friendly",
          writing_guidelines: "Use simple words",
        },
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      // Check radio button is selected
      expect(screen.getByRole("radio", { name: /casual/i })).toBeChecked();

      // Check textareas are populated
      expect(screen.getByLabelText(/descrição personalizada/i)).toHaveValue(
        "Be friendly"
      );
      expect(screen.getByLabelText(/diretrizes de escrita/i)).toHaveValue(
        "Use simple words"
      );
    });

    it("should default to formal preset when no data exists", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("radio", { name: /formal/i })).toBeChecked();
    });
  });

  describe("Form Submission", () => {
    it("should call saveTone with form data on submit", async () => {
      const user = userEvent.setup();
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("radio", { name: /casual/i }));
      await user.type(
        screen.getByLabelText(/descrição personalizada/i),
        "Friendly tone"
      );
      await user.type(
        screen.getByLabelText(/diretrizes de escrita/i),
        "Keep it simple"
      );
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(mockSaveTone).toHaveBeenCalledWith({
          preset: "casual",
          custom_description: "Friendly tone",
          writing_guidelines: "Keep it simple",
        });
      });
    });

    it("should show success toast on successful save", async () => {
      const user = userEvent.setup();
      mockSaveTone.mockResolvedValue({ success: true });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Tom de voz salvo com sucesso");
      });
    });

    it("should show error toast on failed save", async () => {
      const user = userEvent.setup();
      mockSaveTone.mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao salvar");
      });
    });
  });

  describe("Loading State", () => {
    it("should show saving state during save", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/salvando/i)).toBeInTheDocument();
    });

    it("should disable inputs while saving", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/descrição personalizada/i)).toBeDisabled();
      expect(screen.getByLabelText(/diretrizes de escrita/i)).toBeDisabled();
    });

    it("should disable save button while saving", () => {
      vi.mocked(useToneOfVoice).mockReturnValue({
        ...defaultHookReturn,
        isSaving: true,
      });

      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper labels for all form fields", () => {
      render(<ToneOfVoiceForm />, { wrapper: createWrapper() });

      expect(screen.getByText(/tom de comunicação/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/descrição personalizada/i)
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/diretrizes de escrita/i)).toBeInTheDocument();
    });
  });
});
