/**
 * Unit Tests for AgentLeadReview
 * Story 17.5 - AC: #3, #4
 *
 * Tests: renders table, checkboxes, filter, approve with filtered leads
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLeadReview } from "@/components/agent/AgentLeadReview";
import { useAgentStore } from "@/stores/use-agent-store";
import { diagnoseEmptySearch } from "@/lib/agent/empty-search-diagnosis";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

const defaultData = {
  totalFound: 3,
  leads: [
    { name: "Alice Santos", title: "CTO", companyName: "Acme Corp", email: "alice@acme.com" },
    { name: "Bob Silva", title: "VP Engineering", companyName: "TechCo", email: "bob@techco.com" },
    { name: "Carlos Lima", title: "CEO", companyName: "StartupX", email: "carlos@startupx.com" },
  ],
  jobTitles: ["CTO", "VP Engineering", "CEO"],
};

// ==============================================
// TESTS
// ==============================================

describe("AgentLeadReview (AC: #3, #4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 2, status: "approved", nextStep: 3 } }),
    });
  });

  // 9.16 - Renders table with leads and checkboxes
  it("renders table with lead data and checkboxes (9.16)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    expect(screen.getByText("Revisao: Leads Encontrados")).toBeInTheDocument();
    expect(screen.getByText("Alice Santos")).toBeInTheDocument();
    expect(screen.getByText("Bob Silva")).toBeInTheDocument();
    expect(screen.getByText("Carlos Lima")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows all leads as selected by default", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
    expect(screen.getByText("Aprovar (3 leads)")).toBeInTheDocument();
  });

  // 9.18 - Deselect leads updates counter
  it("updates counter when leads are deselected (9.18)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    // Click Alice's checkbox to deselect
    const aliceCheckbox = screen.getByLabelText("Selecionar Alice Santos");
    fireEvent.click(aliceCheckbox);

    expect(screen.getByText("2 de 3 leads selecionados")).toBeInTheDocument();
    expect(screen.getByText("Aprovar (2 leads)")).toBeInTheDocument();
  });

  // Select all / deselect all
  it("toggles all leads via select all checkbox", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const selectAll = screen.getByLabelText("Selecionar todos");

    // Deselect all
    fireEvent.click(selectAll);
    expect(screen.getByText("0 de 3 leads selecionados")).toBeInTheDocument();

    // Select all again
    fireEvent.click(selectAll);
    expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
  });

  // 9.17 - Filter by name/company/title
  it("filters leads by name (9.17)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "alice" } });

    // Alice visible, others not
    expect(screen.getByText("Alice Santos")).toBeInTheDocument();
    expect(screen.queryByText("Bob Silva")).toBeNull();
    expect(screen.queryByText("Carlos Lima")).toBeNull();
  });

  it("filters leads by company name", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "TechCo" } });

    expect(screen.getByText("Bob Silva")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  it("filters leads by job title", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "CEO" } });

    expect(screen.getByText("Carlos Lima")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  // 9.19 - Approve with filtered leads sends approvedData
  it("sends approvedData with selected leads on approve (9.19)", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    // Deselect Bob
    fireEvent.click(screen.getByLabelText("Selecionar Bob Silva"));

    // Approve with 2 leads
    fireEvent.click(screen.getByText("Aprovar (2 leads)"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/2/approve",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: {
              leads: [
                defaultData.leads[0], // Alice
                defaultData.leads[2], // Carlos
              ],
            },
          }),
        })
      );
    });
  });

  // Reject calls API
  it("calls reject API on Rejeitar click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 2, status: "awaiting_approval" } }),
    });

    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    fireEvent.click(screen.getByText("Rejeitar"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/2/reject",
        { method: "POST" }
      );
    });
  });

  // ==============================================
  // Story 22.13 — ajuste pos-rejeicao
  // ==============================================

  it("rejeitar: liga o estado de ajuste no store e PARA o spinner (22.13 AC1)", async () => {
    act(() => {
      useAgentStore.setState({ adjustingStep: null });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 2, status: "awaiting_approval" } }),
    });

    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    fireEvent.click(screen.getByRole("button", { name: /rejeitar/i }));

    await waitFor(() => {
      expect(useAgentStore.getState().adjustingStep).toEqual({
        executionId: "exec-001",
        stepNumber: 2,
        stepType: "search_leads",
        phase: "describe",
      });
    });

    expect(
      screen.getByRole("button", { name: /rejeitar/i }).querySelector(".animate-spin")
    ).toBeNull();
  });

  it("prop rejected: card nasce marcado e com os botoes desabilitados (22.13 AC5)", () => {
    render(
      <AgentLeadReview
        data={defaultData}
        executionId="exec-001"
        stepNumber={2}
        totalSteps={5}
        rejected
      />
    );

    expect(screen.getByText("❌ Rejeitado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rejeitar/i })).toBeDisabled();
  });

  // Approve button disabled when no leads selected
  it("disables approve button when no leads are selected", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    // Deselect all
    fireEvent.click(screen.getByLabelText("Selecionar todos"));

    const approveBtn = screen.getByText("Aprovar (0 leads)");
    expect(approveBtn).toBeDisabled();
  });

  // Buttons disabled after action
  it("disables buttons after approval", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    fireEvent.click(screen.getByText("Aprovar (3 leads)"));

    await waitFor(() => {
      expect(screen.getByText(/Aprovado/)).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 17.12: Quantity selector
  // ==============================================

  describe("quantity selector (Story 17.12)", () => {
    const manyMoreData = {
      totalFound: 200,
      leads: Array.from({ length: 25 }, (_, i) => ({
        name: `Lead ${i + 1}`,
        title: "CTO",
        companyName: `Company ${i + 1}`,
        email: `lead${i + 1}@test.com`,
      })),
      jobTitles: ["CTO"],
    };

    it("shows selector when totalFound (200) > leads.length (25)", () => {
      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      expect(screen.getByText("Mostrando 25 de 200 leads encontrados.")).toBeInTheDocument();
      expect(screen.getByText("Quantos leads deseja usar?")).toBeInTheDocument();
      // Options 50, 100, 200 should be visible (500 > totalFound, so hidden)
      expect(screen.getByRole("button", { name: "50" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "100" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "200" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "500" })).toBeNull();
    });

    it("does NOT show selector when totalFound <= leads.length", () => {
      const allFetchedData = {
        totalFound: 15,
        leads: Array.from({ length: 15 }, (_, i) => ({
          name: `Lead ${i + 1}`,
          title: "CTO",
          companyName: `Company ${i + 1}`,
          email: `lead${i + 1}@test.com`,
        })),
        jobTitles: ["CTO"],
      };

      render(
        <AgentLeadReview data={allFetchedData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      expect(screen.queryByText("Quantos leads deseja usar?")).toBeNull();
      expect(screen.queryByText(/Mostrando/)).toBeNull();
    });

    it("clicking quantity option updates selected state", () => {
      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));

      expect(screen.getByText("Custo estimado: ~100 creditos Apollo")).toBeInTheDocument();
      expect(screen.getByText("Buscar 100 leads")).toBeInTheDocument();
    });

    it("clicking 'Buscar N leads' calls fetch-leads with desiredCount", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            leads: Array.from({ length: 100 }, (_, i) => ({
              name: `Lead ${i + 1}`,
              title: "CTO",
              companyName: `Company ${i + 1}`,
              email: `lead${i + 1}@test.com`,
            })),
            totalFetched: 100,
            totalFound: 200,
            cost: { apollo_search: 100 },
          },
        }),
      });

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/agent/executions/exec-001/steps/2/fetch-leads",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ desiredCount: 100 }),
          })
        );
      });
    });

    it("after fetch success, leads are updated and selector disappears", async () => {
      const fetchedLeads = Array.from({ length: 100 }, (_, i) => ({
        name: `Fetched Lead ${i + 1}`,
        title: "CTO",
        companyName: `Company ${i + 1}`,
        email: `fetched${i + 1}@test.com`,
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            leads: fetchedLeads,
            totalFetched: 100,
            totalFound: 200,
            cost: { apollo_search: 100 },
          },
        }),
      });

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        // Selector should disappear
        expect(screen.queryByText("Quantos leads deseja usar?")).toBeNull();
      });

      // New leads should be rendered
      expect(screen.getByText("Fetched Lead 1")).toBeInTheDocument();
      // Counter should reflect new leads
      expect(screen.getByText("100 de 200 leads selecionados")).toBeInTheDocument();
    });

    it("during fetch, button is disabled with loading text", async () => {
      // Make fetch hang
      let resolvePromise: (value: unknown) => void;
      mockFetch.mockReturnValue(
        new Promise((resolve) => { resolvePromise = resolve; })
      );

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        expect(screen.getByText("Buscando mais leads...")).toBeInTheDocument();
      });

      // Resolve to prevent test leaking
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ data: { leads: [], totalFetched: 0, totalFound: 200, cost: {} } }),
      });
    });
  });

  // ==============================================
  // Story 22.14 — empty-state de busca sem resultados
  // ==============================================

  describe("Story 22.14 - busca vazia (AC #2, #3, #4)", () => {
    // O diagnostico vem do helper REAL: se o contrato mudar, o teste do card quebra junto
    // (em vez de validar um fixture inventado que ninguem mais produz).
    const atibaiaBriefing: ParsedBriefing = {
      technology: null,
      jobTitles: ["Owner", "Director"],
      location: "Atibaia",
      companySize: "<11",
      industry: "clinicas de estetica",
      productSlug: null,
      mode: "guided",
      skipSteps: ["search_companies"],
    };

    const atibaiaFilters = {
      titles: ["Owner", "Director"],
      perPage: 25,
      page: 1,
      companySizes: ["<11"],
      locations: ["Atibaia"],
      industries: ["clinicas de estetica"],
    };

    const emptyData = {
      totalFound: 0,
      leads: [],
      jobTitles: ["Owner", "Director"],
      emptyResult: true,
      emptyDiagnosis: diagnoseEmptySearch(atibaiaBriefing, atibaiaFilters),
    };

    function renderEmpty(data: Record<string, unknown> = emptyData) {
      return render(
        <AgentLeadReview
          data={data as typeof emptyData}
          executionId="exec-001"
          stepNumber={2}
          totalSteps={5}
        />
      );
    }

    beforeEach(() => {
      act(() => {
        useAgentStore.setState({
          adjustingStep: null,
          pendingChipAdjustment: null,
          chatInputDraft: null,
        });
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { stepNumber: 2, status: "awaiting_approval" } }),
      });
    });

    it("NAO renderiza tabela vazia, input de filtro nem 'Aprovar (0 leads)' (AC2)", () => {
      renderEmpty();

      expect(screen.getByTestId("agent-lead-review-empty")).toBeInTheDocument();
      expect(screen.queryByText("0 de 0 leads selecionados")).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Filtrar por nome, empresa ou cargo...")
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
    });

    it("lista os filtros EFETIVOS enviados a Apollo, com a nota do formato invalido (AC2a)", () => {
      renderEmpty();

      expect(screen.getByText("Cargos:")).toBeInTheDocument();
      expect(screen.getByText("Owner, Director")).toBeInTheDocument();
      expect(screen.getByText("Atibaia")).toBeInTheDocument();
      expect(screen.getByText("<11")).toBeInTheDocument();
      expect(screen.getByText(/nao reconhecido|não reconhecido/i)).toBeInTheDocument();
    });

    it("explica que industria e busca por TEXTO (AC2c)", () => {
      renderEmpty();

      expect(screen.getByText(/busca por ind[úu]stria .* por TEXTO/i)).toBeInTheDocument();
    });

    it("lista as causas provaveis na ordem da heuristica (AC2b)", () => {
      renderEmpty();

      const causes = screen.getByText("Causas mais prováveis").parentElement;
      const items = causes?.querySelectorAll("li") ?? [];
      expect(items.length).toBeGreaterThanOrEqual(2);
      // Caso Atibaia: tamanho em formato invalido vem antes de industria.
      expect(items[0].textContent).toContain("<11");
      expect(items[1].textContent).toContain("clinicas de estetica");
    });

    it("renderiza os chips de recuperacao com o aviso de efeito colateral (AC3)", () => {
      renderEmpty();

      expect(screen.getByTestId("empty-chip-remove-industry")).toBeInTheDocument();
      expect(screen.getByTestId("empty-chip-fix-company-size")).toBeInTheDocument();
      expect(screen.getByTestId("empty-chip-broaden-location")).toBeInTheDocument();
      // Guardrail de custo comunicado na tela.
      expect(screen.getByText(/nada é executado só com o clique/i)).toBeInTheDocument();
    });

    it("chip de delta: rejeita, entra em ajuste e publica o delta para o AgentChat (AC3)", async () => {
      renderEmpty();

      fireEvent.click(screen.getByTestId("empty-chip-remove-industry"));

      await waitFor(() => {
        expect(useAgentStore.getState().pendingChipAdjustment).toEqual({
          executionId: "exec-001",
          stepNumber: 2,
          stepType: "search_leads",
          label: "Remover filtro de indústria",
          delta: { industry: null },
        });
      });

      // O reject vem PRIMEIRO (carimbo duravel + reentrada pos-F5 de graca — D1).
      const rejectCall = mockFetch.mock.calls.find(([url]) =>
        String(url).endsWith("/steps/2/reject")
      );
      expect(rejectCall).toBeDefined();
      expect(JSON.parse(rejectCall![1].body)).toEqual({
        reason: "Remover filtro de indústria",
      });

      expect(useAgentStore.getState().adjustingStep).toEqual({
        executionId: "exec-001",
        stepNumber: 2,
        stepType: "search_leads",
        phase: "describe",
      });
    });

    it("chip NUNCA dispara /execute — quem paga e a confirmacao (AC3, Trap #2)", async () => {
      renderEmpty();

      fireEvent.click(screen.getByTestId("empty-chip-fix-company-size"));

      await waitFor(() => {
        expect(useAgentStore.getState().pendingChipAdjustment).not.toBeNull();
      });

      const executeCalls = mockFetch.mock.calls.filter(([url]) =>
        String(url).includes("/execute")
      );
      expect(executeCalls).toHaveLength(0);
    });

    it("chip de prefill NAO tem delta — pre-preenche o input e cai no caminho de texto", async () => {
      renderEmpty();

      fireEvent.click(screen.getByTestId("empty-chip-broaden-location"));

      await waitFor(() => {
        expect(useAgentStore.getState().chatInputDraft).toContain("Atibaia");
      });

      expect(useAgentStore.getState().pendingChipAdjustment).toBeNull();
      // Mesmo assim entra em ajuste: sem isso a mensagem digitada nao teria consumidor.
      expect(useAgentStore.getState().adjustingStep?.phase).toBe("describe");
    });

    it("reject que falha NAO publica o sinal do chip (nada de PATCH sobre um gate vivo)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Step nao esta aguardando aprovacao" } }),
      });

      renderEmpty();
      fireEvent.click(screen.getByTestId("empty-chip-remove-industry"));

      await waitFor(() => {
        expect(screen.getByText("Step nao esta aguardando aprovacao")).toBeInTheDocument();
      });

      expect(useAgentStore.getState().pendingChipAdjustment).toBeNull();
      expect(useAgentStore.getState().adjustingStep).toBeNull();
    });

    it("caminho de TEXTO continua vivo e converge no MESMO adjustingStep (AC4)", async () => {
      renderEmpty();

      fireEvent.click(screen.getByRole("button", { name: /rejeitar e ajustar por texto/i }));

      await waitFor(() => {
        expect(useAgentStore.getState().adjustingStep).toEqual({
          executionId: "exec-001",
          stepNumber: 2,
          stepType: "search_leads",
          phase: "describe",
        });
      });
      expect(useAgentStore.getState().pendingChipAdjustment).toBeNull();
    });

    it("gate ja rejeitado (duravel): chips desabilitados — um ajuste por vez (AC4)", () => {
      render(
        <AgentLeadReview
          data={emptyData}
          executionId="exec-001"
          stepNumber={2}
          totalSteps={5}
          rejected
        />
      );

      expect(screen.getByTestId("empty-chip-remove-industry")).toBeDisabled();
      expect(screen.getByRole("button", { name: /rejeitar e ajustar por texto/i })).toBeDisabled();
      expect(screen.getByText("❌ Rejeitado")).toBeInTheDocument();
    });

    it("chip com aviso mostra o efeito colateral do piso 11+ antes do clique", () => {
      const noSizeBriefing: ParsedBriefing = { ...atibaiaBriefing, companySize: null, industry: null };
      renderEmpty({
        ...emptyData,
        emptyDiagnosis: diagnoseEmptySearch(noSizeBriefing, {
          ...atibaiaFilters,
          companySizes: ["11-50"],
          industries: undefined,
        }),
      });

      expect(screen.getByTestId("empty-chip-include-small-companies")).toBeInTheDocument();
      expect(screen.getAllByText(/11\+/).length).toBeGreaterThan(0);
    });

    it("execucao antiga sem diagnostico no output: degrada com graca, sem quebrar", () => {
      renderEmpty({ totalFound: 0, leads: [], jobTitles: [], emptyResult: true });

      expect(screen.getByTestId("agent-lead-review-empty")).toBeInTheDocument();
      expect(screen.getByText(/Rejeite a etapa e descreva o ajuste/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^aprovar/i })).not.toBeInTheDocument();
    });

    /**
     * Code review 22.14 — gate LEGADO, sem o flag.
     *
     * `emptyResult` so existe em execucoes criadas depois desta story. Um gate anterior
     * ainda em `awaiting_approval` com `leads: []` continuava renderizando tabela vazia +
     * input de filtro + "Aprovar (0 leads)": exatamente o P1 que a story existe para matar,
     * sobrevivendo no banco. O gatilho passou a olhar tambem a LISTA — o que satisfaz o
     * Trap #5 igualmente (nunca `totalFound`) e cobre o passado.
     *
     * `totalFound: 137` prova as duas coisas de uma vez: sem o flag E com total > 0, o
     * empty-state ainda assim dispara, porque quem manda e a lista.
     */
    it("gate LEGADO sem emptyResult tambem cai no empty-state (retroativo, Trap #5)", () => {
      renderEmpty({ totalFound: 137, leads: [], jobTitles: ["Owner"] });

      expect(screen.getByTestId("agent-lead-review-empty")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^aprovar/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/0 de 137 leads selecionados/i)).not.toBeInTheDocument();
    });

    it("com leads, o card normal continua identico (NFR4)", () => {
      render(
        <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      expect(screen.queryByTestId("agent-lead-review-empty")).not.toBeInTheDocument();
      expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
      expect(screen.getByText("Aprovar (3 leads)")).toBeInTheDocument();
    });
  });
});
