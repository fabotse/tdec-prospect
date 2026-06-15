import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { QueryProvider } from "@/components/common/QueryProvider";
import { BRAND } from "@/lib/constants/brand";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL_FALLBACK = "http://localhost:3000";

/**
 * Resolve o `metadataBase` de forma resiliente: aceita uma URL absoluta válida,
 * tenta prefixar `https://` para valores sem scheme (ex.: "tdec.com.br" colado
 * no painel da Vercel) e, em último caso, cai no localhost. Evita que um
 * `NEXT_PUBLIC_SITE_URL` malformado quebre o `next build` — a `metadata` é
 * avaliada em module-eval, então um `new URL()` que lança aborta o build.
 */
function resolveMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return new URL(SITE_URL_FALLBACK);
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return new URL(SITE_URL_FALLBACK);
    }
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: BRAND.productName,
  description: BRAND.description,
  icons: {
    icon: { url: BRAND.favicon, type: "image/png", sizes: "32x32" },
  },
  openGraph: {
    title: BRAND.productName,
    description: BRAND.description,
    siteName: BRAND.productName,
    type: "website",
    locale: "pt_BR",
    images: [
      { url: BRAND.ogImage, width: 1200, height: 630, alt: BRAND.name },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <QueryProvider>
          <ThemeProvider>
            {children}
            <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                color: "var(--card-foreground)",
                border: "1px solid var(--border)",
              },
              classNames: {
                description: "!text-[var(--foreground-muted)]",
              },
            }}
          />
        </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
