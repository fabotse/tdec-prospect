/**
 * AgentCampaignNotice Component Tests
 * Story 22.16: Campanha do Agente visivel em /campaigns
 *
 * Cobre as duas linhas da I/O & Edge-Case Matrix que vivem na tela:
 * - "Detalhe aberto no builder": campanha com `external_campaign_id` e ZERO blocos
 *   locais -> o aviso aparece e a pagina nao quebra.
 * - "Rascunho manual vazio": campanha sem blocos e SEM `external_campaign_id` -> o aviso
 *   NAO aparece (comportamento de hoje intocado).
 *
 * O segundo caso e o que importa: uma condicao frouxa (so `!hasBlocks`) transformaria
 * TODO rascunho recem-criado do builder manual num aviso mentiroso de "criada pelo
 * Agente TDEC".
 *
 * Story 22.16 (review follow-up): o componente recebe as entradas BRUTAS (`storeHasBlocks`
 * + `initialBlocks`) e deriva internamente. Antes a pagina derivava e passava o booleano
 * pronto — e como nenhum teste monta a pagina, um call site que mandasse o `hasBlocks` cru
 * do store deixava a suite verde e o aviso falso de volta. Agora estes testes exercitam a
 * MESMA entrada que a pagina passa.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  AgentCampaignNotice,
  builderHasSequence,
} from "@/components/builder/AgentCampaignNotice";

describe("AgentCampaignNotice (Story 22.16)", () => {
  it("campanha do agente (external_campaign_id + zero blocos): mostra o aviso", () => {
    render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={false}
        initialBlocks={[]}
      />
    );

    expect(screen.getByTestId("agent-campaign-notice")).toBeInTheDocument();
    expect(screen.getByText("Campanha criada pelo Agente TDEC")).toBeInTheDocument();
    // O aviso tem que explicar POR QUE o canvas esta vazio e que editar aqui nao vale.
    expect(screen.getByText(/vive no Instantly/i)).toBeInTheDocument();
    expect(screen.getByText(/não são enviadas para o Instantly/i)).toBeInTheDocument();
  });

  it("a copy renderizada e acentuada (o resto da tela tambem e)", () => {
    render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={false}
        initialBlocks={[]}
      />
    );

    const description = screen.getByText(/vive no Instantly/i);
    expect(description.textContent).toContain("sequência");
    expect(description.textContent).toContain("Alterações");
    // Regressao para a versao sem acento.
    expect(description.textContent).not.toContain("sequencia");
    expect(description.textContent).not.toContain("Alteracoes");
  });

  it("rascunho manual vazio (sem external_campaign_id): NAO mostra o aviso", () => {
    const { container } = render(
      <AgentCampaignNotice
        externalCampaignId={null}
        storeHasBlocks={false}
        initialBlocks={[]}
      />
    );

    expect(screen.queryByTestId("agent-campaign-notice")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("campanha do builder exportada (tem blocos locais): NAO mostra o aviso", () => {
    const { container } = render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={true}
        initialBlocks={[{ id: "block-1" }]}
      />
    );

    expect(screen.queryByTestId("agent-campaign-notice")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("string vazia em external_campaign_id nao e tratada como exportada", () => {
    const { container } = render(
      <AgentCampaignNotice
        externalCampaignId=""
        storeHasBlocks={false}
        initialBlocks={[]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // ==============================================
  // Derivacao "sem blocos" vs "ainda nao sei"
  // ==============================================

  it("blocos no banco mas store ainda vazio: o aviso NAO pisca no primeiro frame", () => {
    // Campanha manual exportada COM blocos no banco. O store so e populado pelo useEffect
    // de `loadBlocks`, que roda DEPOIS do render — neste frame `storeHasBlocks` e false
    // enquanto `initialBlocks` ja chegou com conteudo.
    const { container } = render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={false}
        initialBlocks={[{ id: "block-1" }]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("query de blocos falhou: nao afirmamos 'criada pelo Agente' em cima da duvida", () => {
    // `useCampaignBlocks` com erro deixa `initialBlocks` undefined para sempre — o gate
    // de erro da pagina cobre so a query da campanha. Sem esta guarda o aviso falso
    // seria PERMANENTE numa campanha exportada pelo builder manual.
    const { container } = render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={false}
        initialBlocks={undefined}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("banco RESPONDEU vazio: aí sim o aviso aparece", () => {
    render(
      <AgentCampaignNotice
        externalCampaignId="instantly-abc-123"
        storeHasBlocks={false}
        initialBlocks={[]}
      />
    );

    expect(screen.getByTestId("agent-campaign-notice")).toBeInTheDocument();
  });

  // ==============================================
  // A regra pura, isolada
  // ==============================================

  describe("builderHasSequence", () => {
    it("banco respondeu vazio e store vazio: NAO ha sequencia (unico caso)", () => {
      expect(builderHasSequence(false, [])).toBe(false);
    });

    it("na duvida (blocos ainda nao chegaram) afirma que HA sequencia", () => {
      expect(builderHasSequence(false, undefined)).toBe(true);
    });

    it("banco respondeu com blocos: ha sequencia mesmo com o store vazio", () => {
      expect(builderHasSequence(false, [{ id: "block-1" }])).toBe(true);
    });

    it("store populado: ha sequencia", () => {
      expect(builderHasSequence(true, [])).toBe(true);
    });
  });
});
