/**
 * ExportPreview Component Tests
 * Story 7.4: Export Dialog UI com Preview de Variaveis
 *
 * AC #2: Variable mapping preview
 * AC #3: Lead summary with email validation
 */

import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ExportPreview } from "@/components/builder/ExportPreview";
import type { ExportPlatform, LeadExportSummary } from "@/types/export";
import type { BuilderBlock } from "@/stores/use-builder-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmailBlock(
  id: string,
  position: number,
  data: { subject?: string; body?: string } = {}
): BuilderBlock {
  return { id, type: "email", position, data };
}

function createDelayBlock(id: string, position: number): BuilderBlock {
  return { id, type: "delay", position, data: { delayValue: 3, delayUnit: "days" } };
}

const defaultLeadSummary: LeadExportSummary = {
  totalLeads: 50,
  leadsWithEmail: 45,
  leadsWithoutEmail: 5,
  leadsWithoutIcebreaker: 10,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExportPreview", () => {
  // 1 - Renders variable mapping table when blocks have variables
  it("renders variable mapping table when blocks contain {{variables}}", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, {
        subject: "Hello {{first_name}}",
        body: "We know you work at {{company_name}}",
      }),
    ];

    render(
      <ExportPreview
        platform="instantly"
        leadSummary={defaultLeadSummary}
        blocks={blocks}
      />
    );

    expect(screen.getByTestId("export-preview")).toBeInTheDocument();
    expect(screen.getByText("Mapeamento de Variáveis")).toBeInTheDocument();
    expect(screen.getByTestId("variable-mapping-table")).toBeInTheDocument();

    // The table should contain rows for first_name and company_name
    // For instantly, template and platform tag are the same, so multiple elements match
    const table = screen.getByTestId("variable-mapping-table");
    expect(within(table).getAllByText("{{first_name}}").length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText("{{company_name}}").length).toBeGreaterThanOrEqual(1);
  });

  // 2 - Shows correct platform mapping for instantly variables
  it("shows correct platform mapping for instantly variables", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, {
        subject: "Hi {{first_name}}",
        body: "Your role as {{title}} at {{company_name}}. {{ice_breaker}}",
      }),
    ];

    render(
      <ExportPreview
        platform="instantly"
        leadSummary={defaultLeadSummary}
        blocks={blocks}
      />
    );

    const table = screen.getByTestId("variable-mapping-table");
    const rows = within(table).getAllByRole("row");

    // Header + 4 variable rows
    expect(rows).toHaveLength(5);

    // Instantly keeps the same format: {{first_name}} -> {{first_name}}
    // Each variable template appears in the first column AND the platform column
    // For instantly, both columns show the same value
    const cells = within(table).getAllByRole("cell");

    // Collect all cell text content for verification
    const cellTexts = cells.map((cell) => cell.textContent);

    // Template column values
    expect(cellTexts).toContain("{{first_name}}");
    expect(cellTexts).toContain("{{company_name}}");
    expect(cellTexts).toContain("{{title}}");
    expect(cellTexts).toContain("{{ice_breaker}}");
  });

  // 3 - Shows correct platform mapping for snovio variables
  it("shows correct platform mapping for snovio variables", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, {
        subject: "Hi {{first_name}}",
        body: "Your role as {{title}} at {{company_name}}. {{ice_breaker}}",
      }),
    ];

    render(
      <ExportPreview
        platform="snovio"
        leadSummary={defaultLeadSummary}
        blocks={blocks}
      />
    );

    const table = screen.getByTestId("variable-mapping-table");
    const cells = within(table).getAllByRole("cell");
    const cellTexts = cells.map((cell) => cell.textContent);

    // Snov.io maps to camelCase: {{firstName}}, {{companyName}}, {{title}}, {{iceBreaker}}
    expect(cellTexts).toContain("{{firstName}}");
    expect(cellTexts).toContain("{{companyName}}");
    expect(cellTexts).toContain("{{title}}");
    expect(cellTexts).toContain("{{iceBreaker}}");
  });

  // 4 - Shows lead summary with counts
  it("shows lead summary with counts", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, { subject: "Hello", body: "World" }),
    ];

    const summary: LeadExportSummary = {
      totalLeads: 100,
      leadsWithEmail: 85,
      leadsWithoutEmail: 15,
      leadsWithoutIcebreaker: 20,
    };

    render(
      <ExportPreview platform="instantly" leadSummary={summary} blocks={blocks} />
    );

    expect(screen.getByText("Resumo de Leads")).toBeInTheDocument();

    const leadSection = screen.getByTestId("lead-summary");
    expect(within(leadSection).getByText(/85 leads com email/)).toBeInTheDocument();
    expect(within(leadSection).getByText(/100 leads total/)).toBeInTheDocument();
  });

  // 5 - Shows warning for leads without email
  it("shows warning for leads without email", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, { subject: "Test", body: "Body" }),
    ];

    const summary: LeadExportSummary = {
      totalLeads: 30,
      leadsWithEmail: 22,
      leadsWithoutEmail: 8,
      leadsWithoutIcebreaker: 0,
    };

    render(
      <ExportPreview platform="csv" leadSummary={summary} blocks={blocks} />
    );

    const leadSection = screen.getByTestId("lead-summary");
    expect(
      within(leadSection).getByText(/8 leads sem email/)
    ).toBeInTheDocument();
  });

  // 6 - Shows warning for leads without icebreaker
  it("shows warning for leads without icebreaker", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, { subject: "Test", body: "Body" }),
    ];

    const summary: LeadExportSummary = {
      totalLeads: 40,
      leadsWithEmail: 40,
      leadsWithoutEmail: 0,
      leadsWithoutIcebreaker: 12,
    };

    render(
      <ExportPreview
        platform="instantly"
        leadSummary={summary}
        blocks={blocks}
      />
    );

    const leadSection = screen.getByTestId("lead-summary");
    expect(
      within(leadSection).getByText(/12 leads sem icebreaker/)
    ).toBeInTheDocument();
  });

  // 7 - C1 fix: Shows email preview section with first email block (Task 7.5)
  it("shows email preview section with first email block content", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock("e1", 0, {
        subject: "Olá {{first_name}}",
        body: "Sobre a {{company_name}}",
      }),
      createDelayBlock("d1", 1),
      createEmailBlock("e2", 2, {
        subject: "Follow-up",
        body: "Outro email",
      }),
    ];

    render(
      <ExportPreview
        platform="instantly"
        leadSummary={defaultLeadSummary}
        blocks={blocks}
      />
    );

    expect(screen.getByTestId("email-preview-section")).toBeInTheDocument();
    expect(screen.getByText("Preview do Email")).toBeInTheDocument();
    expect(screen.getByText("Email 1")).toBeInTheDocument();
    // Variables rendered as placeholders via renderTextWithVariablePlaceholders
    expect(screen.getByTestId("email-preview-section")).toBeInTheDocument();
  });

  // 8 - Does not show email preview when no email blocks exist
  it("does not show email preview section when no email blocks exist", () => {
    const blocks: BuilderBlock[] = [
      createDelayBlock("d1", 0),
    ];

    render(
      <ExportPreview
        platform="instantly"
        leadSummary={defaultLeadSummary}
        blocks={blocks}
      />
    );

    expect(screen.queryByTestId("email-preview-section")).not.toBeInTheDocument();
  });
});
