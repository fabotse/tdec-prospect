"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  id: string;
  label: string;
  href: string;
}

// Note: Admin access is enforced server-side via middleware (Story 2.1 - AC #5)
// All tabs here are admin-only; middleware redirects non-admins before reaching this component
const tabs: Tab[] = [
  { id: "integrations", label: "Integrações", href: "/settings/integrations" },
  { id: "knowledge-base", label: "Base de Conhecimento", href: "/settings/knowledge-base" },
  { id: "products", label: "Produtos", href: "/settings/products" },
  { id: "team", label: "Equipe", href: "/settings/team" },
];

/**
 * Tab navigation for Settings page
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * Story: 6.4 - Added Produtos tab
 * AC: #1 - Settings page with tabs: Integrações, Base de Conhecimento, Produtos, Equipe
 * AC: #6 - Tabs styled consistently with dark mode design system
 */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border" role="tablist">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`
              relative px-4 py-3 text-body font-medium
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
              ${isActive
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
                : "text-foreground-muted hover:text-foreground"
              }
            `}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
