import { redirect } from "next/navigation";

/**
 * Settings root page - redirects to integrations tab
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #1 - Settings page with tabs, defaults to first available tab
 */
export default function SettingsPage() {
  redirect("/settings/integrations");
}
