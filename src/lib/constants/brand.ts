/**
 * BRAND — fonte única de verdade da identidade de marca (Epic 19).
 * Centraliza nome e assets para facilitar white-label/renomeações.
 */
export const BRAND = {
  /** Nome da empresa, grafia oficial (NUNCA "TDEC"). */
  name: "TDec",
  /** Nome do produto (título). */
  productName: "TDec Prospect",
  description: "AI-powered prospecting and outbound sales automation platform",
  logo: {
    /** Logo preto — usado no tema CLARO (fundo claro). */
    light: "/brand/Logo-TDec-preto.png",
    /** Logo branco — usado no tema ESCURO (fundo escuro). */
    dark: "/brand/Logo-TDec-branco.png",
    alt: "TDec",
  },
} as const;
