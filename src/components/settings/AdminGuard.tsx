"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";

interface AdminGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client component to check admin role
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #5 - Non-admin users cannot access admin tabs
 *
 * Uses useUser hook for consistent auth state handling
 * Redirects to login if not authenticated
 */
export function AdminGuard({ children, fallback }: AdminGuardProps) {
  const router = useRouter();
  const { isLoading, isAdmin, user } = useUser();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      console.log("[AdminGuard] No user - redirecting to login");
      router.push("/login");
    }
  }, [isLoading, user, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // If not authenticated, show nothing (redirect will happen)
  if (!user) {
    return null;
  }

  // If authenticated but not admin, show fallback
  if (!isAdmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
