/**
 * Tests for ValidationSummaryPanel
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1, #2 - Visual validation summary with colored states
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ValidationSummaryPanel } from "@/components/builder/ValidationSummaryPanel";
import type {
  AdvancedValidationResult,
  ValidationIssue,
  ValidationSummary,
} from "@/lib/export/validate-export-advanced";

// ==============================================
// HELPERS
// ==============================================

const baseSummary: ValidationSummary = {
  totalLeads: 10,
  validLeads: 10,
  invalidLeads: 0,
  duplicateLeads: 0,
  leadsWithoutIcebreaker: 0,
  emailBlocks: 2,
  completeEmailBlocks: 2,
  unknownVariables: 0,
};

function makeResult(
  overrides: Partial<AdvancedValidationResult> = {}
): AdvancedValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    summary: baseSummary,
    ...overrides,
  };
}

function makeIssue(
  overrides: Partial<ValidationIssue> = {}
): ValidationIssue {
  return {
    type: "invalid_email",
    message: "Mensagem de teste",
    suggestedAction: "Acao sugerida",
    ...overrides,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("ValidationSummaryPanel", () => {
  it("shows green success panel when valid and no warnings", () => {
    render(<ValidationSummaryPanel validation={makeResult()} />);
    expect(screen.getByTestId("validation-panel-success")).toBeInTheDocument();
    expect(screen.getByText("Tudo pronto para exportar")).toBeInTheDocument();
  });

  it("shows yellow warning panel when valid with warnings", () => {
    const validation = makeResult({
      warnings: [makeIssue({ type: "no_icebreaker", message: "2 leads sem icebreaker" })],
    });
    render(<ValidationSummaryPanel validation={validation} />);
    expect(screen.getByTestId("validation-panel-warning")).toBeInTheDocument();
    expect(screen.getByText("Avisos encontrados")).toBeInTheDocument();
    expect(screen.getByText(/2 leads sem icebreaker/)).toBeInTheDocument();
  });

  it("shows red error panel when invalid", () => {
    const validation = makeResult({
      valid: false,
      errors: [makeIssue({ type: "no_email_blocks", message: "Nenhum email completo" })],
    });
    render(<ValidationSummaryPanel validation={validation} />);
    expect(screen.getByTestId("validation-panel-error")).toBeInTheDocument();
    expect(screen.getByText("Problemas encontrados")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum email completo/)).toBeInTheDocument();
  });

  it("shows suggested actions for each issue", () => {
    const validation = makeResult({
      valid: false,
      errors: [makeIssue({ suggestedAction: "Corrija os emails" })],
    });
    render(<ValidationSummaryPanel validation={validation} />);
    expect(screen.getByText("Corrija os emails")).toBeInTheDocument();
  });

  it("shows both errors and warnings in error panel", () => {
    const validation = makeResult({
      valid: false,
      errors: [makeIssue({ message: "Erro bloqueante" })],
      warnings: [makeIssue({ type: "no_icebreaker", message: "Aviso nao bloqueante" })],
    });
    render(<ValidationSummaryPanel validation={validation} />);
    expect(screen.getByText(/Erro bloqueante/)).toBeInTheDocument();
    expect(screen.getByText(/Aviso nao bloqueante/)).toBeInTheDocument();
  });

  it("calls onDismissWarnings when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    const validation = makeResult({
      warnings: [makeIssue({ type: "duplicate_email", message: "Duplicados" })],
    });
    render(
      <ValidationSummaryPanel validation={validation} onDismissWarnings={onDismiss} />
    );
    fireEvent.click(screen.getByTestId("dismiss-warnings"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not show dismiss button without onDismissWarnings prop", () => {
    const validation = makeResult({
      warnings: [makeIssue({ type: "duplicate_email", message: "Duplicados" })],
    });
    render(<ValidationSummaryPanel validation={validation} />);
    expect(screen.queryByTestId("dismiss-warnings")).not.toBeInTheDocument();
  });

  it("renders multiple issues with scroll area", () => {
    const warnings = Array.from({ length: 5 }, (_, i) =>
      makeIssue({ type: "no_icebreaker", message: `Aviso ${i + 1}` })
    );
    const validation = makeResult({ warnings });
    render(<ValidationSummaryPanel validation={validation} />);
    const issues = screen.getAllByTestId("validation-issue");
    expect(issues).toHaveLength(5);
  });
});
