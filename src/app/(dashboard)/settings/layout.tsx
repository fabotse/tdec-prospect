import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { AdminGuard } from "@/components/settings/AdminGuard";

/**
 * Settings layout with tabs
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #1 - Settings page with tabs: Integrações, Base de Conhecimento, Equipe
 * AC: #5 - Non-admin users cannot access admin tabs
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-h1 text-foreground">Configurações</h1>
        <p className="text-body text-foreground-muted mt-2">
          Configure sua conta e integrações.
        </p>
      </div>

      <AdminGuard
        fallback={
          <div className="text-center py-12">
            <p className="text-body text-foreground-muted">
              Você não tem permissão para acessar as configurações administrativas.
            </p>
          </div>
        }
      >
        <SettingsTabs />
        <div className="mt-6">{children}</div>
      </AdminGuard>
    </div>
  );
}
