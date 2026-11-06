/**
 * Tests for MeetingPrepPanel (Story 24.23)
 * Estados (carregando, sem briefing, briefing), Sugestão, cópia, texto puro e links seguros.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingPrepPanel } from "@/components/opportunities/MeetingPrepPanel";
import type { MeetingPrep } from "@/types/meeting-prep";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

const PREP: MeetingPrep = {
  version: 1,
  generatedAt: "2026-11-06T15:30:00.000Z",
  account: {
    status: "found",
    companyName: "Acme",
    companyDomain: "acme.com",
    researchedAt: "2026-11-01T12:00:00.000Z",
    expired: false,
    facts: [
      { id: "F1", kind: "news", fato: "<script>alert(1)</script>", fonteUrl: "https://news.com/a", data: "2026-10-20" },
      { id: "F2", kind: "job", fato: "Vaga de CISO", fonteUrl: "javascript:alert(1)", data: "2026-10-21" },
    ],
    whyNow: { gatilho: "Vaga de CISO", hipoteseDor: "Como estruturar o time?" },
  },
  engagement: {
    source: "reply",
    campaignName: "Q4",
    replySubject: "Re: Oi",
    replyText: "Tenho interesse **muito**",
    repliedAt: "2026-11-02T10:00:00.000Z",
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    meetingBookedAt: null,
    events: [{ type: "email_opened", at: "2026-11-01T10:00:00.000Z" }],
  },
  talkingPoints: [
    { text: "Ponto com fonte", origin: "dossie", refs: ["F1"] },
    { text: "Ponto sem fonte", origin: "sugestao", refs: [] },
    { text: "Ponto da KB", origin: "kb", refs: ["P1"] },
  ],
  objections: [{ objection: "Está caro", answer: "Mostrar ROI", origin: "kb", refs: ["KB-OBJ"] }],
  kbRefs: ["P1", "KB-OBJ"],
};

const noop = () => {};

function renderPanel(overrides: Partial<React.ComponentProps<typeof MeetingPrepPanel>> = {}) {
  const props = {
    prep: PREP,
    isLoading: false,
    reason: null,
    saved: true,
    isRegenerating: false,
    onRegenerate: vi.fn(),
    onRetry: vi.fn(),
    title: "Acme",
    ...overrides,
  };
  render(<MeetingPrepPanel {...props} />);
  return props;
}

describe("MeetingPrepPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carregando mostra o skeleton", () => {
    renderPanel({ prep: null, isLoading: true });
    expect(screen.getByTestId("meeting-prep-loading")).toBeInTheDocument();
  });

  it("sem briefing mostra o motivo em linguagem simples e 'Tentar de novo'", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ prep: null, reason: "no_openai_key" });
    expect(screen.getByTestId("meeting-prep-reason")).toHaveTextContent(/chave da OpenAI/);
    await user.click(screen.getByTestId("meeting-prep-retry"));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("motivo desconhecido cai no texto genérico", () => {
    renderPanel({ prep: null, reason: "request_error" });
    expect(screen.getByTestId("meeting-prep-reason")).toHaveTextContent(
      "Não foi possível preparar a reunião agora."
    );
  });

  it("tipo de evento e de fato vindos do jsonb como __proto__ não quebram o painel", () => {
    renderPanel({
      prep: {
        ...PREP,
        account: {
          ...PREP.account,
          facts: [{ ...PREP.account.facts[0], kind: "__proto__" }],
        },
        engagement: { ...PREP.engagement, events: [{ type: "__proto__", at: "2026-11-02T09:00:00Z" }] },
      },
    });
    expect(screen.getAllByText(/__proto__/).length).toBeGreaterThanOrEqual(2);
  });

  it("briefing mostra as seções, Gerado em, e marca Sugestão", () => {
    renderPanel();
    expect(screen.getByText("Resumo da conta")).toBeInTheDocument();
    expect(screen.getByText("Engajamento e resposta")).toBeInTheDocument();
    expect(screen.getByText("Pontos de conversa")).toBeInTheDocument();
    expect(screen.getByText("Objeções prováveis")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-prep-generated-at")).toHaveTextContent("Gerado em 06/11/2026 12:30");
    expect(screen.getByText(/Mostrar ROI/)).toBeInTheDocument();

    const points = screen.getAllByTestId("meeting-prep-talking-point");
    expect(within(points[0]).getByTestId("meeting-prep-badge-origin")).toHaveTextContent("Dossiê");
    expect(within(points[1]).getByTestId("meeting-prep-badge-suggestion")).toHaveTextContent("Sugestão");
    expect(within(points[2]).getByTestId("meeting-prep-badge-origin")).toHaveTextContent(
      "Base de conhecimento"
    );
    expect(screen.queryByTestId("meeting-prep-not-saved")).not.toBeInTheDocument();
  });

  it("texto da LLM/dossiê é texto puro: <script> literal e markdown cru", () => {
    const { container } = render(
      <MeetingPrepPanel
        prep={PREP}
        isLoading={false}
        reason={null}
        saved={true}
        isRegenerating={false}
        onRegenerate={noop}
        onRetry={noop}
      />
    );
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByTestId("meeting-prep-reply-text")).toHaveTextContent("Tenho interesse **muito**");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("link http vira <a> seguro; javascript: não vira link", () => {
    const { container } = render(
      <MeetingPrepPanel
        prep={PREP}
        isLoading={false}
        reason={null}
        saved={true}
        isRegenerating={false}
        onRegenerate={noop}
        onRetry={noop}
      />
    );
    const link = screen.getByTestId("meeting-prep-source-link");
    expect(link).toHaveAttribute("href", "https://news.com/a");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("meeting-prep-source-invalid")).toHaveTextContent("fonte inválida");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("javascript:"))).toBe(false);
  });

  it("sem pesquisa mostra 'Sem pesquisa da conta' e a nota da DW-34", () => {
    renderPanel({
      prep: { ...PREP, account: { ...PREP.account, status: "none", facts: [], whyNow: null } },
    });
    const block = screen.getByTestId("meeting-prep-no-research");
    expect(block).toHaveTextContent("Sem pesquisa da conta");
    expect(block).toHaveTextContent("DW-34");
  });

  it("saved:false mostra o aviso de não salvo", () => {
    renderPanel({ saved: false });
    expect(screen.getByTestId("meeting-prep-not-saved")).toHaveTextContent(/não foi possível salvar/i);
  });

  it("Copiar põe o texto com [Sugestão] na área de transferência", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderPanel();
    stubClipboard(writeText);
    await user.click(screen.getByTestId("meeting-prep-copy"));
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("Preparação de reunião — Acme");
    expect(text).toContain("2. [Sugestão] Ponto sem fonte");
    expect(text).toContain("1. Ponto com fonte");
    expect(toast.success).toHaveBeenCalled();
  });

  it("Regenerar chama o callback e fica desabilitado enquanto regenera", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.click(screen.getByTestId("meeting-prep-regenerate"));
    expect(props.onRegenerate).toHaveBeenCalled();
  });

  it("Regenerar desabilitado durante a regeneração", () => {
    renderPanel({ isRegenerating: true });
    expect(screen.getByTestId("meeting-prep-regenerate")).toBeDisabled();
  });
});
