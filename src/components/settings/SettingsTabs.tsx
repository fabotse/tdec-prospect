"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { useUser } from "@/hooks/use-user";
import { isNonAdminSettingsPath } from "@/lib/auth/settings-access";

interface Tab {
  id: string;
  label: string;
  href: string;
  /** Story 23.3: só o operador da plataforma (platform admin) vê a aba. */
  platformOnly?: boolean;
}

// Note: Admin access is enforced server-side via middleware (Story 2.1 - AC #5)
// Tabs are admin-only, except the ones in NON_ADMIN_SETTINGS_PATHS (Story 23.5: Lista de
// Supressão, read-only for SDR). Middleware redirects non-admins from every other tab.
const tabs: Tab[] = [
  { id: "integrations", label: "Integrações", href: "/settings/integrations" },
  { id: "knowledge-base", label: "Base de Conhecimento", href: "/settings/knowledge-base" },
  { id: "products", label: "Produtos", href: "/settings/products" },
  { id: "usage", label: "Uso da API", href: "/settings/usage" },
  { id: "monitoring", label: "Monitoramento", href: "/settings/monitoring" },
  { id: "notifications", label: "Notificações", href: "/settings/notifications" },
  { id: "suppression", label: "Lista de Supressão", href: "/settings/suppression" },
  { id: "errors", label: "Erros", href: "/settings/errors", platformOnly: true },
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
  const { data: isPlatformAdmin } = usePlatformAdmin();
  const { isAdmin, isLoading, isProfileLoading } = useUser();
  // Enquanto o perfil carrega `isAdmin` é false: não mostra abas para o admin não ver
  // só "Lista de Supressão" por um instante.
  const profileReady = !isLoading && !isProfileLoading;
  const visibleTabs = !profileReady
    ? []
    : tabs
        .filter((tab) => !tab.platformOnly || isPlatformAdmin === true)
        .filter((tab) => isAdmin || isNonAdminSettingsPath(tab.href));

  return (
    <nav className="flex gap-1 border-b border-border" role="tablist">
      {visibleTabs.map((tab) => {
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
