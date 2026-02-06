import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock server actions
vi.mock("@/actions/knowledge-base", () => ({
  getCompanyProfile: vi.fn(),
  saveCompanyProfile: vi.fn(),
}));

import { getCompanyProfile, saveCompanyProfile } from "@/actions/knowledge-base";
import { useKnowledgeBase } from "@/hooks/use-knowledge-base";

// Create a wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("useKnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getCompanyProfile).mockResolvedValue({
      success: true,
      data: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getCompanyProfile on mount", async () => {
      renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getCompanyProfile).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return null data when no profile exists", async () => {
      vi.mocked(getCompanyProfile).mockResolvedValue({
        success: true,
        data: null,
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it("should return company profile data when it exists", async () => {
      const mockProfile = {
        company_name: "Test Company",
        business_description: "We do things",
        products_services: "Product A",
        competitive_advantages: "We are the best",
      };

      vi.mocked(getCompanyProfile).mockResolvedValue({
        success: true,
        data: mockProfile,
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockProfile);
    });
  });

  describe("Error Handling", () => {
    it("should set error when fetch fails", async () => {
      vi.mocked(getCompanyProfile).mockResolvedValue({
        success: false,
        error: "Erro ao buscar dados",
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      // Wait for the error to be set
      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro ao buscar dados");
        },
        { timeout: 2000 }
      );
    });

    it("should return null data when fetch fails", async () => {
      vi.mocked(getCompanyProfile).mockResolvedValue({
        success: false,
        error: "Erro",
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      // Wait for the error state
      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro");
        },
        { timeout: 2000 }
      );

      expect(result.current.data).toBeNull();
    });
  });

  describe("saveCompany", () => {
    it("should call saveCompanyProfile with correct data", async () => {
      vi.mocked(saveCompanyProfile).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const profileData = {
        company_name: "New Company",
        business_description: "Description",
        products_services: "Products",
        competitive_advantages: "Advantages",
      };

      await act(async () => {
        await result.current.saveCompany(profileData);
      });

      expect(saveCompanyProfile).toHaveBeenCalledWith(profileData);
    });

    it("should return success result on successful save", async () => {
      vi.mocked(saveCompanyProfile).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveCompany({
          company_name: "Test",
          business_description: "",
          products_services: "",
          competitive_advantages: "",
        });
      });

      expect(saveResult).toEqual({ success: true });
    });

    it("should return error result on failed save", async () => {
      vi.mocked(saveCompanyProfile).mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveCompany({
          company_name: "Test",
          business_description: "",
          products_services: "",
          competitive_advantages: "",
        });
      });

      expect(saveResult).toEqual({ success: false, error: "Erro ao salvar" });
    });

    it("should handle isSaving state during mutation", async () => {
      vi.mocked(saveCompanyProfile).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially not saving
      expect(result.current.isSaving).toBe(false);

      // After save completes, isSaving should be false
      await act(async () => {
        await result.current.saveCompany({
          company_name: "Test",
          business_description: "",
          products_services: "",
          competitive_advantages: "",
        });
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe("Return Values", () => {
    it("should return saveCompany function", async () => {
      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.saveCompany).toBe("function");
    });

    it("should return isSaving state", async () => {
      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isSaving).toBe("boolean");
    });

    it("should return error state", async () => {
      const { result } = renderHook(() => useKnowledgeBase(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
