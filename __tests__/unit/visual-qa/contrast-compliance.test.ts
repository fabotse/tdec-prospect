/**
 * Contrast Compliance Tests
 * Story 8.5: Visual QA & Contrast Review
 *
 * AC #1: Contraste atende WCAG 2.1 AA (4.5:1 texto normal, 3:1 texto grande)
 * AC #7: Todos os criterios atendidos em ambos os temas
 *
 * Validates CSS variable color pairs against WCAG AA requirements.
 */

import { describe, it, expect } from "vitest";

/**
 * Parse HSL string to RGB values
 * Supports format: hsl(H S% L%) or hsl(H, S%, L%)
 */
function hslToRgb(hsl: string): { r: number; g: number; b: number } {
  const match = hsl.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (!match) throw new Error(`Invalid HSL: ${hsl}`);

  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Calculate relative luminance per WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function contrastRatio(color1: string, color2: string): number {
  const l1 = relativeLuminance(hslToRgb(color1));
  const l2 = relativeLuminance(hslToRgb(color2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// IMPORTANT: These values are duplicated from globals.css.
// If CSS variables change in globals.css, these must be updated manually.
// TODO: Consider parsing globals.css at runtime for automatic sync.
// Dark theme CSS variables (from globals.css :root)
const DARK_THEME = {
  background: "hsl(0 0% 4%)",          // #0A0A0A
  foreground: "hsl(0 0% 98%)",         // #FAFAFA
  card: "hsl(0 0% 7%)",               // #121212
  primary: "hsl(0 0% 98%)",           // #FAFAFA
  primaryForeground: "hsl(0 0% 4%)",  // #0A0A0A
  muted: "hsl(0 0% 14%)",             // #242424
  mutedForeground: "hsl(0 0% 55%)",   // #8C8C8C
  accent: "hsl(0 0% 20%)",            // #333333
  accentForeground: "hsl(0 0% 98%)",  // #FAFAFA
};

// Light theme CSS variables (from globals.css .light)
const LIGHT_THEME = {
  background: "hsl(0 0% 100%)",        // #FFFFFF
  foreground: "hsl(0 0% 9%)",          // #171717
  card: "hsl(0 0% 100%)",             // #FFFFFF
  primary: "hsl(0 0% 9%)",            // #171717
  primaryForeground: "hsl(0 0% 100%)", // #FFFFFF
  muted: "hsl(0 0% 96%)",             // #F5F5F5
  mutedForeground: "hsl(0 0% 45%)",   // #737373
  accent: "hsl(0 0% 92%)",            // #EBEBEB
  accentForeground: "hsl(0 0% 9%)",   // #171717
};

// WCAG AA minimum contrast ratios
const WCAG_AA_NORMAL_TEXT = 4.5;
const WCAG_AA_LARGE_TEXT = 3.0;

describe("WCAG AA Contrast Compliance (Story 8.5 AC #1, #7)", () => {
  describe("Dark Theme - Critical Text Pairs", () => {
    it("foreground on background passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.foreground, DARK_THEME.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("muted-foreground on background passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.mutedForeground, DARK_THEME.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("foreground on card passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.foreground, DARK_THEME.card);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("muted-foreground on card passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.mutedForeground, DARK_THEME.card);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("primary-foreground on primary passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.primaryForeground, DARK_THEME.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("accent-foreground on accent passes AA for large text (icons, headings)", () => {
      const ratio = contrastRatio(DARK_THEME.accentForeground, DARK_THEME.accent);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    });

    it("foreground on muted passes AA for normal text", () => {
      const ratio = contrastRatio(DARK_THEME.foreground, DARK_THEME.muted);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  });

  describe("Light Theme - Critical Text Pairs", () => {
    it("foreground on background passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.foreground, LIGHT_THEME.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("muted-foreground on background passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.mutedForeground, LIGHT_THEME.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("foreground on card passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.foreground, LIGHT_THEME.card);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("muted-foreground on card passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.mutedForeground, LIGHT_THEME.card);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("primary-foreground on primary passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.primaryForeground, LIGHT_THEME.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("accent-foreground on accent passes AA for large text (icons, headings)", () => {
      const ratio = contrastRatio(LIGHT_THEME.accentForeground, LIGHT_THEME.accent);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    });

    it("foreground on muted passes AA for normal text", () => {
      const ratio = contrastRatio(LIGHT_THEME.foreground, LIGHT_THEME.muted);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  });

  describe("Cross-theme Consistency", () => {
    it("both themes maintain at least 4.5:1 for primary text on background", () => {
      const darkRatio = contrastRatio(DARK_THEME.foreground, DARK_THEME.background);
      const lightRatio = contrastRatio(LIGHT_THEME.foreground, LIGHT_THEME.background);
      expect(darkRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      expect(lightRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it("both themes maintain at least 4.5:1 for secondary text on background", () => {
      const darkRatio = contrastRatio(DARK_THEME.mutedForeground, DARK_THEME.background);
      const lightRatio = contrastRatio(LIGHT_THEME.mutedForeground, LIGHT_THEME.background);
      expect(darkRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      expect(lightRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  });
});
