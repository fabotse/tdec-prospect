"use client";

import { LogOut, User } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useUser, resetAuthState } from "@/hooks/use-user";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  sidebarWidth?: number;
}

export function Header({ sidebarWidth = 240 }: HeaderProps) {
  const { user, isLoading } = useUser();

  async function handleLogout() {
    console.log("[Header] Starting logout...");
    const supabase = createClient();

    // 1. Sign out from Supabase (clears server-side cookies)
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[Header] Logout error:", error);
    }

    // 2. Reset shared auth state immediately
    resetAuthState();

    // 3. Use window.location for full page reload to ensure middleware sees cleared cookies
    console.log("[Header] Redirecting to login...");
    window.location.href = "/login";
  }

  // Get display name: user_metadata.name, email, or fallback
  const displayName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Usuário";

  return (
    <header
      role="banner"
      className="fixed top-0 right-0 h-16 bg-background border-b border-border flex items-center justify-between px-6 z-10"
      style={{
        left: `${sidebarWidth}px`,
        transition: "left 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Left side - can be used for breadcrumbs or page title later */}
      <div className="flex items-center" />

      {/* Right side - User info and theme toggle */}
      <div className="flex items-center gap-4">
        <ThemeToggle />

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sidebar-accent">
            <User className="h-5 w-5 text-sidebar-accent-foreground" />
          </div>
          <span className="text-body text-foreground hidden sm:inline">
            {isLoading ? "..." : displayName}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
