/**
 * Configuracoes → Integracoes: card do Treg (Story 24.19)
 * Salvar e testar usam os fluxos existentes (useIntegrationConfig).
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const saveConfig = vi.fn();
const testConnection = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-user", () => ({ useUser: () => ({ user: { id: "u1" }, isLoading: false }) }));
vi.mock("@/hooks/use-integration-config", () => ({
  useIntegrationConfig: () => ({ configs: {}, isLoading: false, saveConfig, testConnection }),
}));
vi.mock("@/components/settings/IntegrationCard", () => ({
  IntegrationCard: (props: { name: string; displayName: string; icon: string; description: string; onSave: (k: string) => void; onTest: () => void }) => (
    <div data-testid={`card-${props.name}`}>
      <span>{props.icon} {props.displayName}</span>
      <p>{props.description}</p>
      <button onClick={() => props.onSave("tok")}>save-{props.name}</button>
      <button onClick={() => props.onTest()}>test-{props.name}</button>
    </div>
  ),
}));

import IntegrationsPage from "@/app/(dashboard)/settings/integrations/page";

describe("IntegrationsPage — Treg", () => {
  it("mostra o card Treg e usa os fluxos existentes de salvar e testar", () => {
    render(<IntegrationsPage />);
    const card = screen.getByTestId("card-treg");
    expect(card).toHaveTextContent("🔎 Treg");
    expect(card).toHaveTextContent("Pesquisa web das contas para o dossiê do agente: site, notícias e vagas");

    screen.getByText("save-treg").click();
    screen.getByText("test-treg").click();
    expect(saveConfig).toHaveBeenCalledWith("treg", "tok");
    expect(testConnection).toHaveBeenCalledWith("treg");
  });
});
