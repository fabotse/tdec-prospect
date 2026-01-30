"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  sidebarWidth?: number;
}

export function Header({ sidebarWidth = 240 }: HeaderProps) {
  const router = useRouter();
  const { user, isLoading } = useUser();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
