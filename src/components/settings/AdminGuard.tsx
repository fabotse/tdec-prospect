"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AdminGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client component to check admin role
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #5 - Non-admin users cannot access admin tabs
 *
 * Uses isAdmin() logic from tenant.ts adapted for client-side
 */
export function AdminGuard({ children, fallback }: AdminGuardProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAdminStatus() {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          console.warn("AdminGuard: No authenticated user", authError?.message);
          setIsAdmin(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.warn("AdminGuard: Failed to fetch profile", profileError.message);
          setIsAdmin(false);
          return;
        }

        setIsAdmin(profile?.role === "admin");
      } catch (error) {
        console.error("AdminGuard: Unexpected error", error);
        setIsAdmin(false);
      }
    }

    checkAdminStatus();
  }, []);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
