/**
 * VariableReference Component Tests
 * Story 12.6: Variáveis de Personalização no Editor de Campanha
 * AC: #1, #2, #3 - Referência de variáveis visível no editor com click para inserir
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VariableReference } from "@/components/builder/VariableReference";

describe("VariableReference (Story 12.6 AC #1, #2, #3)", () => {
  describe("AC #1: Referência de variáveis visível", () => {
    it("renders the variable reference container", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      expect(screen.getByTestId("variable-reference")).toBeInTheDocument();
    });

    it("renders 'Variáveis:' label", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      expect(screen.getByText("Variáveis:")).toBeInTheDocument();
    });
  });

  describe("AC #3: Todas as 4 variáveis exibidas", () => {
    it("renders chip for first_name", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      const chip = screen.getByTestId("variable-chip-first_name");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveTextContent("{{first_name}}");
      expect(chip).toHaveTextContent("Nome");
    });

    it("renders chip for company_name", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      const chip = screen.getByTestId("variable-chip-company_name");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveTextContent("{{company_name}}");
      expect(chip).toHaveTextContent("Empresa");
    });

    it("renders chip for title", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      const chip = screen.getByTestId("variable-chip-title");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveTextContent("{{title}}");
      expect(chip).toHaveTextContent("Cargo");
    });

    it("renders chip for ice_breaker", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      const chip = screen.getByTestId("variable-chip-ice_breaker");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveTextContent("{{ice_breaker}}");
      expect(chip).toHaveTextContent("Quebra-gelo");
    });

    it("renders exactly 4 variable chips", () => {
      render(<VariableReference onInsert={vi.fn()} />);
      const chips = screen.getAllByTestId(/^variable-chip-/);
      expect(chips).toHaveLength(4);
    });
  });

  describe("AC #2: Click para inserir", () => {
    it("calls onInsert with template when first_name chip clicked", () => {
      const onInsert = vi.fn();
      render(<VariableReference onInsert={onInsert} />);

      fireEvent.click(screen.getByTestId("variable-chip-first_name"));
      expect(onInsert).toHaveBeenCalledWith("{{first_name}}");
    });

    it("calls onInsert with template when company_name chip clicked", () => {
      const onInsert = vi.fn();
      render(<VariableReference onInsert={onInsert} />);

      fireEvent.click(screen.getByTestId("variable-chip-company_name"));
      expect(onInsert).toHaveBeenCalledWith("{{company_name}}");
    });

    it("calls onInsert with template when title chip clicked", () => {
      const onInsert = vi.fn();
      render(<VariableReference onInsert={onInsert} />);

      fireEvent.click(screen.getByTestId("variable-chip-title"));
      expect(onInsert).toHaveBeenCalledWith("{{title}}");
    });

    it("calls onInsert with template when ice_breaker chip clicked", () => {
      const onInsert = vi.fn();
      render(<VariableReference onInsert={onInsert} />);

      fireEvent.click(screen.getByTestId("variable-chip-ice_breaker"));
      expect(onInsert).toHaveBeenCalledWith("{{ice_breaker}}");
    });

    it("stops click propagation to prevent block selection", () => {
      const onInsert = vi.fn();
      const onParentClick = vi.fn();

      render(
        <div onClick={onParentClick}>
          <VariableReference onInsert={onInsert} />
        </div>
      );

      fireEvent.click(screen.getByTestId("variable-chip-first_name"));
      expect(onInsert).toHaveBeenCalled();
      expect(onParentClick).not.toHaveBeenCalled();
    });
  });
});
