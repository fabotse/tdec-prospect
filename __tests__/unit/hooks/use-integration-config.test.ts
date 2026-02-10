import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock server actions
vi.mock("@/actions/integrations", () => ({
  getApiConfigs: vi.fn(),
  saveApiConfig: vi.fn(),
  deleteApiConfig: vi.fn(),
  testApiConnection: vi.fn(),
}));

import { toast } from "sonner";
import { getApiConfigs, saveApiConfig, deleteApiConfig, testApiConnection } from "@/actions/integrations";
import { useIntegrationConfig } from "@/hooks/use-integration-config";

describe("useIntegrationConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getApiConfigs).mockResolvedValue({
      success: true,
      data: [
        { serviceName: "apollo", isConfigured: false, maskedKey: null, updatedAt: null },
        { serviceName: "signalhire", isConfigured: false, maskedKey: null, updatedAt: null },
        { serviceName: "snovio", isConfigured: false, maskedKey: null, updatedAt: null },
        { serviceName: "instantly", isConfigured: false, maskedKey: null, updatedAt: null },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useIntegrationConfig());

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getApiConfigs on mount", async () => {
      renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(getApiConfigs).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return configs with all integrations not configured initially", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configs.apollo.status).toBe("not_configured");
      expect(result.current.configs.signalhire.status).toBe("not_configured");
      expect(result.current.configs.snovio.status).toBe("not_configured");
      expect(result.current.configs.instantly.status).toBe("not_configured");
    });

    it("should return saveConfig function", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.saveConfig).toBe("function");
    });

    it("should populate configs from server response", async () => {
      vi.mocked(getApiConfigs).mockResolvedValue({
        success: true,
        data: [
          { serviceName: "apollo", isConfigured: true, maskedKey: "••••••••1234", updatedAt: "2026-01-30T10:00:00Z" },
          { serviceName: "signalhire", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "snovio", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "instantly", isConfigured: false, maskedKey: null, updatedAt: null },
        ],
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configs.apollo.status).toBe("configured");
      expect(result.current.configs.apollo.maskedKey).toBe("••••••••1234");
      expect(result.current.configs.apollo.updatedAt).toBe("2026-01-30T10:00:00Z");
    });
  });

  describe("saveConfig", () => {
    it("should call saveApiConfig with correct arguments", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      expect(saveApiConfig).toHaveBeenCalledWith("apollo", "valid-api-key-12345678");
    });

    it("should update config status to configured after successful save", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      expect(result.current.configs.apollo.status).toBe("configured");
      expect(result.current.configs.apollo.maskedKey).toBe("••••••••5678");
    });

    it("should show success toast on successful save", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Configuração salva com sucesso",
        expect.any(Object)
      );
    });

    it("should show error toast for short API key", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "short");
      });

      expect(toast.error).toHaveBeenCalledWith("API key muito curta", expect.any(Object));
      expect(saveApiConfig).not.toHaveBeenCalled();
    });

    it("should return false for validation failure", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.saveConfig("apollo", "short");
      });

      expect(success).toBe(false);
    });

    it("should return true for successful save", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      expect(success).toBe(true);
    });

    it("should handle server action failure", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: false,
        error: "Erro ao salvar configuração",
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Erro ao salvar configuração",
        expect.objectContaining({ description: "Erro ao salvar configuração" })
      );
      expect(result.current.configs.apollo.status).toBe("error");
    });

    it("should set isSaving true during save operation", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(saveApiConfig).mockReturnValue(promise as Promise<{ success: true; data: { serviceName: string; maskedKey: string; updatedAt: string } }>);

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start save without awaiting
      act(() => {
        result.current.saveConfig("apollo", "valid-api-key-12345678");
      });

      // Check isSaving is true
      expect(result.current.configs.apollo.isSaving).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          success: true,
          data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
        });
      });

      // Check isSaving is false
      expect(result.current.configs.apollo.isSaving).toBe(false);
    });

    it("should handle multiple integrations independently", async () => {
      vi.mocked(saveApiConfig)
        .mockResolvedValueOnce({
          success: true,
          data: { serviceName: "apollo", maskedKey: "••••••••1234", updatedAt: "2026-01-30T12:00:00Z" },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { serviceName: "instantly", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
        });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "apollo-api-key-12345678");
      });

      await act(async () => {
        await result.current.saveConfig("instantly", "instantly-api-key-12345678");
      });

      expect(result.current.configs.apollo.status).toBe("configured");
      expect(result.current.configs.instantly.status).toBe("configured");
      expect(result.current.configs.signalhire.status).toBe("not_configured");
      expect(result.current.configs.snovio.status).toBe("not_configured");
    });
  });

  describe("removeConfig", () => {
    it("should call deleteApiConfig with correct argument", async () => {
      vi.mocked(deleteApiConfig).mockResolvedValue({
        success: true,
        data: { deleted: true },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removeConfig("apollo");
      });

      expect(deleteApiConfig).toHaveBeenCalledWith("apollo");
    });

    it("should reset config to not_configured after successful delete", async () => {
      // Start with configured apollo
      vi.mocked(getApiConfigs).mockResolvedValue({
        success: true,
        data: [
          { serviceName: "apollo", isConfigured: true, maskedKey: "••••••••1234", updatedAt: "2026-01-30T10:00:00Z" },
          { serviceName: "signalhire", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "snovio", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "instantly", isConfigured: false, maskedKey: null, updatedAt: null },
        ],
      });

      vi.mocked(deleteApiConfig).mockResolvedValue({
        success: true,
        data: { deleted: true },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configs.apollo.status).toBe("configured");

      await act(async () => {
        await result.current.removeConfig("apollo");
      });

      expect(result.current.configs.apollo.status).toBe("not_configured");
      expect(result.current.configs.apollo.maskedKey).toBeNull();
      expect(result.current.configs.apollo.updatedAt).toBeNull();
    });
  });

  describe("refreshConfigs", () => {
    it("should refetch configs from server", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(getApiConfigs).toHaveBeenCalledTimes(1);

      // Update mock for second call
      vi.mocked(getApiConfigs).mockResolvedValue({
        success: true,
        data: [
          { serviceName: "apollo", isConfigured: true, maskedKey: "••••••••9999", updatedAt: "2026-01-30T14:00:00Z" },
          { serviceName: "signalhire", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "snovio", isConfigured: false, maskedKey: null, updatedAt: null },
          { serviceName: "instantly", isConfigured: false, maskedKey: null, updatedAt: null },
        ],
      });

      await act(async () => {
        await result.current.refreshConfigs();
      });

      expect(getApiConfigs).toHaveBeenCalledTimes(2);
      expect(result.current.configs.apollo.status).toBe("configured");
      expect(result.current.configs.apollo.maskedKey).toBe("••••••••9999");
    });
  });

  describe("API Key Validation", () => {
    it("should reject API key with less than 8 characters", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "1234567"); // 7 chars
      });

      expect(toast.error).toHaveBeenCalledWith("API key muito curta", expect.any(Object));
      expect(saveApiConfig).not.toHaveBeenCalled();
    });

    it("should accept API key with exactly 8 characters", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••7890", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "12345678"); // 8 chars
      });

      expect(saveApiConfig).toHaveBeenCalled();
      expect(result.current.configs.apollo.status).toBe("configured");
    });

    it("should accept API key with more than 8 characters", async () => {
      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••-key", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("apollo", "this-is-a-long-api-key");
      });

      expect(saveApiConfig).toHaveBeenCalled();
      expect(result.current.configs.apollo.status).toBe("configured");
    });
  });

  describe("testConnection (Story 2.3)", () => {
    it("should call testApiConnection with correct service name", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: "Conexão estabelecida com sucesso",
          testedAt: "2026-01-30T12:00:00Z",
          latencyMs: 150,
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(testApiConnection).toHaveBeenCalledWith("apollo");
    });

    it("should set connectionStatus to testing during test", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(testApiConnection).mockReturnValue(promise as ReturnType<typeof testApiConnection>);

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start test without awaiting
      act(() => {
        result.current.testConnection("apollo");
      });

      // Check connectionStatus is testing
      expect(result.current.configs.apollo.connectionStatus).toBe("testing");

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          success: true,
          data: {
            success: true,
            message: "Conexão estabelecida com sucesso",
            testedAt: "2026-01-30T12:00:00Z",
          },
        });
      });
    });

    it("should set connectionStatus to connected on successful test", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: "Conexão estabelecida com sucesso",
          testedAt: "2026-01-30T12:00:00Z",
          latencyMs: 150,
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(result.current.configs.apollo.connectionStatus).toBe("connected");
      expect(result.current.configs.apollo.lastTestResult?.success).toBe(true);
      expect(result.current.configs.apollo.lastTestResult?.message).toBe("Conexão estabelecida com sucesso");
    });

    it("should set connectionStatus to error on failed test", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: false,
          message: "API key inválida ou expirada.",
          testedAt: "2026-01-30T12:00:00Z",
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(result.current.configs.apollo.connectionStatus).toBe("error");
      expect(result.current.configs.apollo.lastTestResult?.success).toBe(false);
    });

    it("should show success toast on successful connection test", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: "Conexão estabelecida com sucesso",
          testedAt: "2026-01-30T12:00:00Z",
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(toast.success).toHaveBeenCalledWith("Conexão estabelecida", expect.any(Object));
    });

    it("should show error toast on failed connection test", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: false,
          message: "API key inválida ou expirada.",
          testedAt: "2026-01-30T12:00:00Z",
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(toast.error).toHaveBeenCalledWith("Falha na conexão", expect.any(Object));
    });

    it("should handle server action failure", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: false,
        error: "API key não configurada para este serviço",
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(result.current.configs.apollo.connectionStatus).toBe("error");
      expect(toast.error).toHaveBeenCalledWith("Erro ao testar conexão", expect.any(Object));
    });

    it("should return TestConnectionResult on success", async () => {
      const expectedResult = {
        success: true,
        message: "Conexão estabelecida com sucesso",
        testedAt: "2026-01-30T12:00:00Z",
        latencyMs: 150,
      };

      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: expectedResult,
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let testResult: unknown;
      await act(async () => {
        testResult = await result.current.testConnection("apollo");
      });

      expect(testResult).toEqual(expectedResult);
    });

    it("should reset connectionStatus to untested when API key is saved", async () => {
      // First, set up a successful connection test
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: "Conexão estabelecida com sucesso",
          testedAt: "2026-01-30T12:00:00Z",
        },
      });

      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: { serviceName: "apollo", maskedKey: "••••••••5678", updatedAt: "2026-01-30T12:00:00Z" },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test connection first
      await act(async () => {
        await result.current.testConnection("apollo");
      });

      expect(result.current.configs.apollo.connectionStatus).toBe("connected");

      // Now save a new API key
      await act(async () => {
        await result.current.saveConfig("apollo", "new-api-key-12345678");
      });

      // connectionStatus should be reset to untested
      expect(result.current.configs.apollo.connectionStatus).toBe("untested");
      expect(result.current.configs.apollo.lastTestResult).toBeNull();
    });
  });

  describe("Z-API support (Story 11.1)", () => {
    it("should include zapi in initialConfigs", async () => {
      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configs.zapi).toBeDefined();
      expect(result.current.configs.zapi.status).toBe("not_configured");
    });

    it("should saveConfig for zapi with JSON credentials", async () => {
      const zapiJson = JSON.stringify({
        instanceId: "inst-123",
        instanceToken: "tok-456",
        securityToken: "sec-789",
      });

      vi.mocked(saveApiConfig).mockResolvedValue({
        success: true,
        data: {
          serviceName: "zapi",
          maskedKey: JSON.stringify({
            instanceId: "••••••••-123",
            instanceToken: "••••••••-456",
            securityToken: "••••••••-789",
          }),
          updatedAt: "2026-02-10T12:00:00Z",
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveConfig("zapi", zapiJson);
      });

      expect(saveApiConfig).toHaveBeenCalledWith("zapi", zapiJson);
      expect(result.current.configs.zapi.status).toBe("configured");
    });

    it("should testConnection for zapi", async () => {
      vi.mocked(testApiConnection).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: "Conexão estabelecida com sucesso",
          testedAt: "2026-02-10T12:00:00Z",
          latencyMs: 200,
        },
      });

      const { result } = renderHook(() => useIntegrationConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testConnection("zapi");
      });

      expect(testApiConnection).toHaveBeenCalledWith("zapi");
      expect(result.current.configs.zapi.connectionStatus).toBe("connected");
    });
  });
});
