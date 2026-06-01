import { describe, it, expect } from "vitest";

import { BRAND } from "@/lib/constants/brand";

describe("BRAND constant", () => {
  it("usa a grafia oficial 'TDec' como name", () => {
    expect(BRAND.name).toBe("TDec");
  });

  it("NUNCA usa a grafia antiga 'TDEC' no name", () => {
    expect(BRAND.name).not.toMatch(/TDEC/);
  });

  it("expõe o productName 'TDec Prospect'", () => {
    expect(BRAND.productName).toBe("TDec Prospect");
  });

  it("aponta o logo dark (branco) para o asset real", () => {
    expect(BRAND.logo.dark).toBe("/brand/Logo-TDec-branco.png");
  });

  it("aponta o logo light (preto) para o asset real", () => {
    expect(BRAND.logo.light).toBe("/brand/Logo-TDec-preto.png");
  });

  it("aponta o favicon para o asset real da TDec", () => {
    expect(BRAND.favicon).toBe("/brand/tdec-favicon.png");
  });

  it("aponta a imagem OpenGraph para o asset real", () => {
    expect(BRAND.ogImage).toBe("/brand/og-image.png");
  });

  it("define um alt text para acessibilidade", () => {
    expect(BRAND.logo.alt).toBeTruthy();
  });
});
