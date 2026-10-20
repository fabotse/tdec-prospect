/**
 * ErrorsPage Tests
 * Story 23.3: aba Configurações → Erros
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/settings/ErrorLogList", () => ({
  ErrorLogList: () => <div data-testid="error-log-list" />,
}));

import ErrorsPage from "@/app/(dashboard)/settings/errors/page";

describe("ErrorsPage", () => {
  it("mostra o título e a lista de erros", () => {
    render(<ErrorsPage />);
    expect(screen.getByRole("heading", { name: "Erros" })).toBeInTheDocument();
    expect(screen.getByTestId("error-log-list")).toBeInTheDocument();
  });
});
