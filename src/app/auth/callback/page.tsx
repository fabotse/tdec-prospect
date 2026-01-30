"use client";

/**
 * Auth Callback Page - Processes invite acceptance
 *
 * When a user accepts an invitation via Supabase email,
 * they're redirected here with tokens in the hash fragment.
 * This page extracts the tokens, establishes the session,
 * and redirects to login with appropriate messaging.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      // Hash fragment is only available on client
      const hash = window.location.hash;

      if (!hash) {
        // No hash - redirect to login
        router.replace("/login");
        return;
      }

      // Parse hash fragment (remove leading #)
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (!accessToken || !refreshToken) {
        setStatus("error");
        setErrorMessage("Tokens de autenticação não encontrados.");
        return;
      }

      try {
        const supabase = createClient();

        // Set the session with the tokens from the hash
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("Error setting session:", error);
          setStatus("error");
          setErrorMessage("Erro ao processar autenticação.");
          return;
        }

        // Sign out - user needs to set password via "forgot password"
        await supabase.auth.signOut();

        // Redirect based on type
        if (type === "invite") {
          // Invite accepted - redirect to login with success message
          router.replace("/login?invite=accepted");
        } else {
          // Other auth callback (e.g., password reset confirmation)
          router.replace("/login?verified=true");
        }
      } catch (err) {
        console.error("Callback error:", err);
        setStatus("error");
        setErrorMessage("Erro inesperado. Tente novamente.");
      }
    }

    handleCallback();
  }, [router]);

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">{errorMessage}</p>
          <button
            onClick={() => router.replace("/login")}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Processando autenticação...</p>
      </div>
    </div>
  );
}
