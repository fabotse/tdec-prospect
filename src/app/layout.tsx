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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
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
