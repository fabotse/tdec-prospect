import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { BrandLogo } from "@/components/common/BrandLogo";
import { BRAND } from "@/lib/constants/brand";

function getLogoBySrc(fragment: string): HTMLImageElement {
  const imgs = screen.getAllByAltText(BRAND.logo.alt) as HTMLImageElement[];
  const found = imgs.find((img) =>
    (img.getAttribute("src") ?? "").includes(fragment)
  );
  if (!found) {
    throw new Error(`No <img> found with src containing "${fragment}"`);
  }
  return found;
}

describe("BrandLogo", () => {
  it("renderiza as duas variantes do logo (branca + preta) com o alt da marca", () => {
    render(<BrandLogo />);

    const imgs = screen.getAllByAltText(BRAND.logo.alt);
    expect(imgs).toHaveLength(2);
  });

  it("logo branco: src aponta para Logo-TDec-branco e é visível só no dark", () => {
    render(<BrandLogo />);

    const white = getLogoBySrc("Logo-TDec-branco");
    // toContain no src: next/image gera URL otimizada (não comparar por igualdade)
    expect(white.getAttribute("src")).toContain("Logo-TDec-branco");
    expect(white).toHaveClass("hidden");
    expect(white).toHaveClass("dark:block");
  });

  it("logo preto: src aponta para Logo-TDec-preto e é visível só no claro", () => {
    render(<BrandLogo />);

    const black = getLogoBySrc("Logo-TDec-preto");
    expect(black.getAttribute("src")).toContain("Logo-TDec-preto");
    expect(black).toHaveClass("block");
    expect(black).toHaveClass("dark:hidden");
  });

  it("aplica a className recebida via prop a ambas as variantes", () => {
    render(<BrandLogo className="h-8 w-auto" />);

    const white = getLogoBySrc("Logo-TDec-branco");
    const black = getLogoBySrc("Logo-TDec-preto");
    expect(white).toHaveClass("h-8");
    expect(black).toHaveClass("h-8");
  });

  it("modo decorativo: ambas as variantes ficam com alt vazio (evita anúncio duplicado)", () => {
    const { container } = render(<BrandLogo decorative />);

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    imgs.forEach((img) => expect(img.getAttribute("alt")).toBe(""));
  });
});
