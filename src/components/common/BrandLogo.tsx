// SEM "use client" e SEM useTheme: a troca de variante é 100% via CSS (variante
// `dark:` do Tailwind). O script inline de layout.tsx aplica .dark/.light no <html>
// antes do primeiro paint, então o CSS resolve qual logo mostrar sem depender de
// JS/hidratação → zero FOUC (inclusive para usuários em tema claro). Ver Story 19.1.
import Image from "next/image";

import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/constants/brand";

// Dimensões intrínsecas reais dos PNGs (1400x750) — preservam a proporção e
// evitam o warning de aspect-ratio do next/image. O tamanho de exibição vem
// da prop `className` (ex.: "h-8 w-auto").
const LOGO_WIDTH = 1400;
const LOGO_HEIGHT = 750;

interface BrandLogoProps {
  className?: string;
  /**
   * Marca o logo como decorativo (`alt=""`). Use quando já existe um texto
   * adjacente que nomeia a marca (ex.: o heading sr-only da página de login) —
   * evita que o leitor de tela anuncie a marca duas vezes. No app shell
   * (sidebar) o logo é a única referência da marca, então deve manter o alt.
   */
  decorative?: boolean;
}

export function BrandLogo({ className, decorative = false }: BrandLogoProps) {
  // alt vazio (decorativo) quando há um rótulo textual adjacente; senão, o nome da marca.
  const alt = decorative ? "" : BRAND.logo.alt;

  return (
    <>
      {/* Logo branco — visível só no tema escuro.
          `priority`: precarrega ambas as variantes. A oculta tem display:none e,
          com o lazy-loading padrão do next/image, não seria baixada até aparecer
          — causaria flash de logo ausente ao alternar o tema. Carregar as duas
          de imediato também melhora o LCP (logo above-the-fold). */}
      <Image
        src={BRAND.logo.dark}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority
        className={cn("hidden w-auto dark:block", className)}
      />
      {/* Logo preto — visível só no tema claro */}
      <Image
        src={BRAND.logo.light}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority
        className={cn("block w-auto dark:hidden", className)}
      />
    </>
  );
}
