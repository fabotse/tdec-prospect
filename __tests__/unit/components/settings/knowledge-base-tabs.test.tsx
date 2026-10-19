/**
 * KnowledgeBaseTabs Component Tests
 * Story 9.2: Verify new "Ice Breakers" tab is rendered
 *
 * AC: #1 - New tab exists after "Exemplos" and before "ICP"
 * Story 24.7: "Provas" tab after "Ice Breakers"
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock all child form components to avoid deep rendering
vi.mock("@/components/settings/CompanyProfileForm", () => ({
  CompanyProfileForm: () => <div data-testid="company-form">CompanyProfileForm</div>,
}));

vi.mock("@/components/settings/ToneOfVoiceForm", () => ({
  ToneOfVoiceForm: () => <div data-testid="tone-form">ToneOfVoiceForm</div>,
}));

vi.mock("@/components/settings/EmailExamplesForm", () => ({
  EmailExamplesForm: () => <div data-testid="email-examples-form">EmailExamplesForm</div>,
}));

vi.mock("@/components/settings/IcebreakerExamplesForm", () => ({
  IcebreakerExamplesForm: () => <div data-testid="icebreaker-examples-form">IcebreakerExamplesForm</div>,
}));

vi.mock("@/components/settings/ProofsForm", () => ({
  ProofsForm: () => <div data-testid="proofs-form">ProofsForm</div>,
}));

vi.mock("@/components/settings/ICPDefinitionForm", () => ({
  ICPDefinitionForm: () => <div data-testid="icp-form">ICPDefinitionForm</div>,
}));

import { KnowledgeBaseTabs } from "@/components/settings/KnowledgeBaseTabs";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("KnowledgeBaseTabs", () => {
  it("renders all 6 tabs including Ice Breakers and Provas", () => {
    render(<KnowledgeBaseTabs />, { wrapper: createWrapper() });

    expect(screen.getByRole("tab", { name: "Empresa" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tom de Voz" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exemplos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ice Breakers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Provas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ICP" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });

  it("renders Ice Breakers tab in correct order (after Exemplos, before ICP)", () => {
    render(<KnowledgeBaseTabs />, { wrapper: createWrapper() });

    const tabs = screen.getAllByRole("tab");
    const tabNames = tabs.map((t) => t.textContent);

    expect(tabNames).toEqual([
      "Empresa",
      "Tom de Voz",
      "Exemplos",
      "Ice Breakers",
      "Provas",
      "ICP",
    ]);
  });

  it("renders IcebreakerExamplesForm card when Ice Breakers tab is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<KnowledgeBaseTabs />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("tab", { name: "Ice Breakers" }));

    expect(screen.getByText("Exemplos de Ice Breakers")).toBeInTheDocument();
    expect(
      screen.getByText(/ice breakers bem-sucedidos para a IA aprender/)
    ).toBeInTheDocument();
  });

  it("renders ProofsForm card when Provas tab is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<KnowledgeBaseTabs />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("tab", { name: "Provas" }));

    expect(screen.getByTestId("proofs-form")).toBeInTheDocument();
    expect(
      screen.getByText(/só pode citar os itens marcados como autorizados/)
    ).toBeInTheDocument();
  });
});
