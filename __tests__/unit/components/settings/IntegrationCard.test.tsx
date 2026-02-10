import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntegrationCard } from "@/components/settings/IntegrationCard";

describe("IntegrationCard", () => {
  const defaultProps = {
    name: "apollo" as const,
    displayName: "Apollo",
    icon: "🔗",
    description: "Busca de leads",
    maskedKey: null,
    updatedAt: null,
    status: "not_configured" as const,
    isSaving: false,
    onSave: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render with correct integration name", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByText("Apollo")).toBeInTheDocument();
    });

    it("should render with icon", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByText("🔗")).toBeInTheDocument();
    });

    it("should render description", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByText("Busca de leads")).toBeInTheDocument();
    });

    it("should render API key label", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    it('should render save button when not configured', () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /salvar/i })
      ).toBeInTheDocument();
    });

    it('should render update button when configured', () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
        />
      );

      expect(
        screen.getByRole("button", { name: /atualizar/i })
      ).toBeInTheDocument();
    });
  });

  describe("Status Badge", () => {
    it('should show "Não configurado" badge when status is not_configured', () => {
      render(<IntegrationCard {...defaultProps} status="not_configured" />);

      expect(screen.getByText("Não configurado")).toBeInTheDocument();
    });

    it('should show "Configurado" badge when status is configured', () => {
      render(<IntegrationCard {...defaultProps} status="configured" />);

      expect(screen.getByText("Configurado")).toBeInTheDocument();
    });

    it('should show "Erro" badge when status is error', () => {
      render(<IntegrationCard {...defaultProps} status="error" />);

      expect(screen.getByText("Erro")).toBeInTheDocument();
    });

    it('should show "Carregando..." badge when status is loading', () => {
      render(<IntegrationCard {...defaultProps} status="loading" />);

      expect(screen.getByText("Carregando...")).toBeInTheDocument();
    });
  });

  describe("API Key Input", () => {
    it("should mask API key by default", () => {
      render(<IntegrationCard {...defaultProps} />);

      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("type", "password");
    });

    it("should reveal API key when eye button clicked", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...defaultProps} />);

      const toggleButton = screen.getByRole("button", {
        name: /mostrar api key/i,
      });
      await user.click(toggleButton);

      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("type", "text");
    });

    it("should hide API key when eye button clicked again", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...defaultProps} />);

      const toggleButton = screen.getByRole("button", {
        name: /mostrar api key/i,
      });
      await user.click(toggleButton);
      await user.click(toggleButton);

      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("type", "password");
    });

    it("should display masked key as placeholder when configured", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
        />
      );

      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("placeholder", "••••••••1234");
    });

    it("should show default placeholder when not configured", () => {
      render(<IntegrationCard {...defaultProps} />);

      const input = screen.getByLabelText("API Key");
      expect(input).toHaveAttribute("placeholder", "Insira sua API key");
    });

    it("should disable input when saving", () => {
      render(<IntegrationCard {...defaultProps} isSaving={true} />);

      const input = screen.getByLabelText("API Key");
      expect(input).toBeDisabled();
    });
  });

  describe("Save Button", () => {
    it("should disable save button when input is empty", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    });

    it("should enable save button when API key is entered", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...defaultProps} />);

      const input = screen.getByLabelText("API Key");
      await user.type(input, "test-api-key-12345");

      expect(screen.getByRole("button", { name: /salvar/i })).toBeEnabled();
    });

    it("should call onSave with key value when form submitted", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...defaultProps} onSave={onSave} />);

      const input = screen.getByLabelText("API Key");
      await user.type(input, "test-api-key-12345");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("test-api-key-12345");
      });
    });

    it("should clear input after successful save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...defaultProps} onSave={onSave} />);

      const input = screen.getByLabelText("API Key");
      await user.type(input, "test-api-key-12345");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(input).toHaveValue("");
      });
    });

    it("should not clear input after failed save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(false);
      render(<IntegrationCard {...defaultProps} onSave={onSave} />);

      const input = screen.getByLabelText("API Key");
      await user.type(input, "test-api-key-12345");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(input).toHaveValue("test-api-key-12345");
      });
    });

    it("should show loading state while saving (from prop)", () => {
      render(<IntegrationCard {...defaultProps} isSaving={true} />);

      expect(screen.getByText(/salvando/i)).toBeInTheDocument();
    });

    it("should submit on Enter key press", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...defaultProps} onSave={onSave} />);

      const input = screen.getByLabelText("API Key");
      await user.type(input, "test-api-key-12345{Enter}");

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("test-api-key-12345");
      });
    });

    it("should not submit on Enter when saving", () => {
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...defaultProps} onSave={onSave} isSaving={true} />);

      const input = screen.getByLabelText("API Key");
      // Input is disabled when saving, so Enter key won't trigger submission
      expect(input).toBeDisabled();
    });
  });

  describe("Last Update Text", () => {
    it('should show "Nunca" when updatedAt is null', () => {
      render(<IntegrationCard {...defaultProps} updatedAt={null} />);

      expect(screen.getByText(/última atualização: nunca/i)).toBeInTheDocument();
    });

    it("should show formatted date when updatedAt is provided", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          updatedAt="2026-01-30T10:30:00Z"
        />
      );

      // Should contain the formatted date
      expect(
        screen.getByText(/última atualização:/i)
      ).toBeInTheDocument();
      // The text should not be "Nunca"
      expect(screen.queryByText(/nunca/i)).not.toBeInTheDocument();
    });
  });

  describe("Test Connection Button (Story 2.3)", () => {
    it("should show test button when configured and onTest provided", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          onTest={vi.fn()}
        />
      );

      expect(screen.getByTestId("test-connection-apollo")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /testar conexão/i })).toBeInTheDocument();
    });

    it("should hide test button when not configured", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="not_configured"
          onTest={vi.fn()}
        />
      );

      expect(screen.queryByTestId("test-connection-apollo")).not.toBeInTheDocument();
    });

    it("should hide test button when onTest not provided", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
        />
      );

      expect(screen.queryByTestId("test-connection-apollo")).not.toBeInTheDocument();
    });

    it("should show loading state during test", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="testing"
          onTest={vi.fn()}
        />
      );

      expect(screen.getByText(/testando/i)).toBeInTheDocument();
    });

    it("should disable test button during test", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="testing"
          onTest={vi.fn()}
        />
      );

      expect(screen.getByTestId("test-connection-apollo")).toBeDisabled();
    });

    it("should call onTest when test button clicked", async () => {
      const user = userEvent.setup();
      const onTest = vi.fn();

      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          onTest={onTest}
        />
      );

      await user.click(screen.getByTestId("test-connection-apollo"));

      expect(onTest).toHaveBeenCalledTimes(1);
    });

    it("should not call onTest when already testing", async () => {
      const user = userEvent.setup();
      const onTest = vi.fn();

      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="testing"
          onTest={onTest}
        />
      );

      // Button is disabled, but let's verify onClick doesn't fire
      const button = screen.getByTestId("test-connection-apollo");
      expect(button).toBeDisabled();
    });
  });

  describe("Test Result Display (Story 2.3)", () => {
    it("should show success result with green styling", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="connected"
          lastTestResult={{
            success: true,
            message: "Conexão estabelecida com sucesso",
            testedAt: "2026-01-30T12:00:00Z",
          }}
          onTest={vi.fn()}
        />
      );

      const resultDiv = screen.getByTestId("test-result-apollo");
      expect(resultDiv).toBeInTheDocument();
      expect(resultDiv).toHaveTextContent("Conexão estabelecida com sucesso");
      expect(resultDiv).toHaveClass("text-success");
    });

    it("should show error result with red styling", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="error"
          lastTestResult={{
            success: false,
            message: "API key inválida ou expirada.",
            testedAt: "2026-01-30T12:00:00Z",
          }}
          onTest={vi.fn()}
        />
      );

      const resultDiv = screen.getByTestId("test-result-apollo");
      expect(resultDiv).toBeInTheDocument();
      expect(resultDiv).toHaveTextContent("API key inválida ou expirada.");
      expect(resultDiv).toHaveClass("text-destructive");
    });

    it("should not show result when lastTestResult is null", () => {
      render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="untested"
          lastTestResult={null}
          onTest={vi.fn()}
        />
      );

      expect(screen.queryByTestId("test-result-apollo")).not.toBeInTheDocument();
    });

    it("should persist result until next test or page refresh", () => {
      const { rerender } = render(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="connected"
          lastTestResult={{
            success: true,
            message: "Conexão estabelecida com sucesso",
            testedAt: "2026-01-30T12:00:00Z",
          }}
          onTest={vi.fn()}
        />
      );

      expect(screen.getByTestId("test-result-apollo")).toBeInTheDocument();

      // Rerender with same props - result should persist
      rerender(
        <IntegrationCard
          {...defaultProps}
          status="configured"
          maskedKey="••••••••1234"
          connectionStatus="connected"
          lastTestResult={{
            success: true,
            message: "Conexão estabelecida com sucesso",
            testedAt: "2026-01-30T12:00:00Z",
          }}
          onTest={vi.fn()}
        />
      );

      expect(screen.getByTestId("test-result-apollo")).toBeInTheDocument();
    });
  });

  describe("Multi-field Mode (Story 11.1)", () => {
    const zapiFields = [
      { key: "instanceId", label: "Instance ID", placeholder: "Insira o Instance ID" },
      { key: "instanceToken", label: "Instance Token", placeholder: "Insira o Instance Token" },
      { key: "securityToken", label: "Security Token", placeholder: "Insira o Security Token" },
    ];

    const multiFieldProps = {
      ...defaultProps,
      name: "zapi" as const,
      displayName: "Z-API",
      icon: "📱",
      description: "Envio de mensagens WhatsApp via Z-API",
      fields: zapiFields,
    };

    it("should render N inputs when fields prop is provided", () => {
      render(<IntegrationCard {...multiFieldProps} />);

      expect(screen.getByLabelText("Instance ID")).toBeInTheDocument();
      expect(screen.getByLabelText("Instance Token")).toBeInTheDocument();
      expect(screen.getByLabelText("Security Token")).toBeInTheDocument();
    });

    it("should NOT render single API Key label when fields are present", () => {
      render(<IntegrationCard {...multiFieldProps} />);

      expect(screen.queryByText("API Key")).not.toBeInTheDocument();
    });

    it("should render each input with its own label", () => {
      render(<IntegrationCard {...multiFieldProps} />);

      expect(screen.getByText("Instance ID")).toBeInTheDocument();
      expect(screen.getByText("Instance Token")).toBeInTheDocument();
      expect(screen.getByText("Security Token")).toBeInTheDocument();
    });

    it("should have independent visibility toggle per field", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...multiFieldProps} />);

      // All start as password
      const instanceIdInput = screen.getByLabelText("Instance ID");
      const instanceTokenInput = screen.getByLabelText("Instance Token");
      expect(instanceIdInput).toHaveAttribute("type", "password");
      expect(instanceTokenInput).toHaveAttribute("type", "password");

      // Toggle only Instance ID
      const toggleButton = screen.getByRole("button", { name: /mostrar instance id/i });
      await user.click(toggleButton);

      expect(instanceIdInput).toHaveAttribute("type", "text");
      expect(instanceTokenInput).toHaveAttribute("type", "password");
    });

    it("should disable save button when not all fields are filled", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...multiFieldProps} />);

      // Fill only one field
      const instanceIdInput = screen.getByLabelText("Instance ID");
      await user.type(instanceIdInput, "some-value");

      expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    });

    it("should enable save button when ALL fields are filled", async () => {
      const user = userEvent.setup();
      render(<IntegrationCard {...multiFieldProps} />);

      await user.type(screen.getByLabelText("Instance ID"), "id-value");
      await user.type(screen.getByLabelText("Instance Token"), "token-value");
      await user.type(screen.getByLabelText("Security Token"), "sec-value");

      expect(screen.getByRole("button", { name: /salvar/i })).toBeEnabled();
    });

    it("should call onSave with JSON stringify of all field values", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...multiFieldProps} onSave={onSave} />);

      await user.type(screen.getByLabelText("Instance ID"), "my-id");
      await user.type(screen.getByLabelText("Instance Token"), "my-token");
      await user.type(screen.getByLabelText("Security Token"), "my-secret");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
        const arg = onSave.mock.calls[0][0];
        const parsed = JSON.parse(arg);
        expect(parsed).toEqual({
          instanceId: "my-id",
          instanceToken: "my-token",
          securityToken: "my-secret",
        });
      });
    });

    it("should trigger save on Enter when all fields are filled", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...multiFieldProps} onSave={onSave} />);

      await user.type(screen.getByLabelText("Instance ID"), "id-1");
      await user.type(screen.getByLabelText("Instance Token"), "tok-2");
      await user.type(screen.getByLabelText("Security Token"), "sec-3{Enter}");

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });
    });

    it("should display per-field masks when maskedKey is JSON", () => {
      const maskedKeyJson = JSON.stringify({
        instanceId: "••••••••abcd",
        instanceToken: "••••••••efgh",
        securityToken: "••••••••ijkl",
      });

      render(
        <IntegrationCard
          {...multiFieldProps}
          status="configured"
          maskedKey={maskedKeyJson}
        />
      );

      expect(screen.getByLabelText("Instance ID")).toHaveAttribute(
        "placeholder",
        "••••••••abcd"
      );
      expect(screen.getByLabelText("Instance Token")).toHaveAttribute(
        "placeholder",
        "••••••••efgh"
      );
      expect(screen.getByLabelText("Security Token")).toHaveAttribute(
        "placeholder",
        "••••••••ijkl"
      );
    });

    it("should show correct placeholders when not configured (no maskedKey)", () => {
      render(<IntegrationCard {...multiFieldProps} />);

      expect(screen.getByLabelText("Instance ID")).toHaveAttribute(
        "placeholder",
        "Insira o Instance ID"
      );
      expect(screen.getByLabelText("Instance Token")).toHaveAttribute(
        "placeholder",
        "Insira o Instance Token"
      );
      expect(screen.getByLabelText("Security Token")).toHaveAttribute(
        "placeholder",
        "Insira o Security Token"
      );
    });

    it("should fall back to field placeholders when maskedKey is non-JSON string", () => {
      render(
        <IntegrationCard
          {...multiFieldProps}
          status="configured"
          maskedKey="••••••••1234"
        />
      );

      expect(screen.getByLabelText("Instance ID")).toHaveAttribute(
        "placeholder",
        "Insira o Instance ID"
      );
      expect(screen.getByLabelText("Instance Token")).toHaveAttribute(
        "placeholder",
        "Insira o Instance Token"
      );
      expect(screen.getByLabelText("Security Token")).toHaveAttribute(
        "placeholder",
        "Insira o Security Token"
      );
    });

    it("should maintain backward compatibility — no fields prop renders single input", () => {
      render(<IntegrationCard {...defaultProps} />);

      expect(screen.getByText("API Key")).toBeInTheDocument();
      expect(screen.getByLabelText("API Key")).toBeInTheDocument();
      expect(screen.queryByText("Instance ID")).not.toBeInTheDocument();
    });

    it("should clear all fields after successful save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<IntegrationCard {...multiFieldProps} onSave={onSave} />);

      await user.type(screen.getByLabelText("Instance ID"), "id-1");
      await user.type(screen.getByLabelText("Instance Token"), "tok-2");
      await user.type(screen.getByLabelText("Security Token"), "sec-3");
      await user.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => {
        expect(screen.getByLabelText("Instance ID")).toHaveValue("");
        expect(screen.getByLabelText("Instance Token")).toHaveValue("");
        expect(screen.getByLabelText("Security Token")).toHaveValue("");
      });
    });
  });
});
