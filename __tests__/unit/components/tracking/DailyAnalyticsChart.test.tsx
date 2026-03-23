/**
 * Unit Tests for DailyAnalyticsChart Component
 * Story 14.3: Grafico de Evolucao Diaria
 *
 * AC: #1 — Componente com grafico de linhas
 * AC: #2 — Series: Enviados, Aberturas, Respostas
 * AC: #6 — Estado vazio quando sem dados
 * AC: #7 — Secao colapsavel
 * AC: #8 — Testes unitarios
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyAnalyticsChart, CustomTooltip, formatDateBR } from "@/components/tracking/DailyAnalyticsChart";
import { createMockDailyAnalytics } from "../../../helpers/mock-data";

// Mock recharts — jsdom lacks ResizeObserver
vi.mock("recharts", async () => {
  const OriginalModule = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 300 }}>
        {children}
      </div>
    ),
  };
});

describe("DailyAnalyticsChart (AC: #1, #2, #6, #7, #8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC: #1 — Renderiza chart container com dados
  it("renderiza chart container quando tem dados (AC: #1)", () => {
    const mockData = createMockDailyAnalytics(7);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    expect(screen.getByTestId("daily-analytics-chart")).toBeInTheDocument();
    expect(screen.getByTestId("daily-chart-content")).toBeInTheDocument();
    expect(screen.getByTestId("daily-chart-container")).toBeInTheDocument();
  });

  // AC: #6 — Estado vazio com array vazio
  it("renderiza estado vazio com array vazio (AC: #6)", () => {
    render(<DailyAnalyticsChart dailyAnalytics={[]} />);

    expect(screen.getByTestId("daily-chart-empty")).toBeInTheDocument();
    expect(screen.getByText("Sincronize a campanha para ver a evolucao diaria")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-chart-container")).not.toBeInTheDocument();
  });

  // AC: #6 — Estado vazio com prop undefined
  it("renderiza estado vazio com prop undefined (AC: #6)", () => {
    render(<DailyAnalyticsChart />);

    expect(screen.getByTestId("daily-chart-empty")).toBeInTheDocument();
    expect(screen.getByText("Sincronize a campanha para ver a evolucao diaria")).toBeInTheDocument();
  });

  // AC: #7 — Colapsavel: inicialmente aberto
  it("inicia aberto por padrao (AC: #7)", () => {
    const mockData = createMockDailyAnalytics(3);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    expect(screen.getByTestId("daily-chart-content")).toBeInTheDocument();
  });

  // AC: #7 — Colapsavel: clicar fecha
  it("fecha ao clicar no header (AC: #7)", async () => {
    const user = userEvent.setup();
    const mockData = createMockDailyAnalytics(3);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    await user.click(screen.getByTestId("daily-chart-toggle"));

    expect(screen.queryByTestId("daily-chart-content")).not.toBeInTheDocument();
  });

  // AC: #7 — Colapsavel: clicar abre novamente
  it("abre novamente ao clicar no header fechado (AC: #7)", async () => {
    const user = userEvent.setup();
    const mockData = createMockDailyAnalytics(3);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    // Fecha
    await user.click(screen.getByTestId("daily-chart-toggle"));
    expect(screen.queryByTestId("daily-chart-content")).not.toBeInTheDocument();

    // Abre
    await user.click(screen.getByTestId("daily-chart-toggle"));
    expect(screen.getByTestId("daily-chart-content")).toBeInTheDocument();
  });

  // AC: #2 — Verifica presenca do chart com dados (internals do SVG sao responsabilidade da lib)
  it("renderiza chart com dados e responsive container (AC: #2)", () => {
    const mockData = createMockDailyAnalytics(7);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("daily-chart-container")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-chart-empty")).not.toBeInTheDocument();
  });

  // Verifica titulo e descricao
  it("renderiza titulo e descricao da secao", () => {
    render(<DailyAnalyticsChart dailyAnalytics={[]} />);

    expect(screen.getByText("Evolucao Diaria")).toBeInTheDocument();
    expect(screen.getByText("Tendencia de envios, aberturas e respostas ao longo do tempo")).toBeInTheDocument();
  });

  // AC: #7 — Acessibilidade: toggle funciona com teclado Enter
  it("toggle funciona com teclado Enter (acessibilidade)", async () => {
    const user = userEvent.setup();
    const mockData = createMockDailyAnalytics(3);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    const toggle = screen.getByTestId("daily-chart-toggle");
    expect(toggle).toHaveAttribute("role", "button");
    expect(toggle).toHaveAttribute("tabIndex", "0");

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByTestId("daily-chart-content")).not.toBeInTheDocument();
  });

  // AC: #7 — Acessibilidade: toggle funciona com teclado Space
  it("toggle funciona com teclado Space (acessibilidade)", async () => {
    const user = userEvent.setup();
    const mockData = createMockDailyAnalytics(3);

    render(<DailyAnalyticsChart dailyAnalytics={mockData} />);

    const toggle = screen.getByTestId("daily-chart-toggle");
    toggle.focus();
    await user.keyboard(" ");
    expect(screen.queryByTestId("daily-chart-content")).not.toBeInTheDocument();
  });
});

describe("formatDateBR", () => {
  it("formata YYYY-MM-DD para DD/MM", () => {
    expect(formatDateBR("2026-03-15")).toBe("15/03");
    expect(formatDateBR("2026-12-01")).toBe("01/12");
  });

  it("retorna input original para formato invalido", () => {
    expect(formatDateBR("invalid")).toBe("invalid");
    expect(formatDateBR("2026-03")).toBe("2026-03");
  });
});

describe("CustomTooltip (AC: #4)", () => {
  it("renderiza data formatada e valores de cada serie", () => {
    render(
      <CustomTooltip
        active={true}
        label="2026-03-15"
        payload={[
          { name: "Enviados", value: 50, color: "hsl(210 80% 60%)" },
          { name: "Aberturas", value: 20, color: "hsl(45 90% 55%)" },
          { name: "Respostas", value: 5, color: "hsl(150 60% 50%)" },
        ]}
      />
    );

    const tooltip = screen.getByTestId("chart-tooltip");
    expect(tooltip).toHaveTextContent("15/03");
    expect(tooltip).toHaveTextContent("Enviados: 50");
    expect(tooltip).toHaveTextContent("Aberturas: 20");
    expect(tooltip).toHaveTextContent("Respostas: 5");
  });

  it("retorna null quando nao ativo", () => {
    const { container } = render(
      <CustomTooltip active={false} label="2026-03-15" payload={[]} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("retorna null quando label ausente", () => {
    const { container } = render(
      <CustomTooltip active={true} payload={[]} />
    );
    expect(container.innerHTML).toBe("");
  });
});
