"use client";

/**
 * Reset Password Page
 *
 * Allows users to set a new password after clicking the reset link.
 * Handles the hash fragment tokens from Supabase.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

type PageStatus = "loading" | "ready" | "success" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  // Process code (PKCE) or hash fragment tokens on mount
  useEffect(() => {
    async function processAuth() {
      const supabase = createClient();

      // Check for PKCE code in query params (Supabase default flow)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");

      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error("Code exchange error:", error);
            setStatus("error");
            setServerError("Link expirado. Solicite um novo.");
            return;
          }

          setStatus("ready");
          // Clean URL
          window.history.replaceState({}, "", "/reset-password");
          return;
        } catch (err) {
          console.error("Code processing error:", err);
          setStatus("error");
          setServerError("Erro ao processar link.");
          return;
        }
      }

      // Fallback: Check for hash fragment tokens (legacy flow)
      const hash = window.location.hash;

      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          try {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("Session error:", error);
              setStatus("error");
              setServerError("Link expirado. Solicite um novo.");
              return;
            }

            setStatus("ready");
            window.history.replaceState({}, "", "/reset-password");
            return;
          } catch (err) {
            console.error("Token processing error:", err);
            setStatus("error");
            setServerError("Erro ao processar link.");
            return;
          }
        }
      }

      // No code or tokens found
      setStatus("error");
      setServerError("Link inválido ou expirado.");
    }

    processAuth();
  }, []);

  async function onSubmit(data: ResetPasswordFormData) {
    setServerError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) {
      console.error("Update password error:", error);
      if (error.message.includes("same")) {
        setServerError("A nova senha deve ser diferente da anterior.");
      } else {
        setServerError("Erro ao atualizar senha. Tente novamente.");
      }
      return;
    }

    // Sign out and redirect to login
    await supabase.auth.signOut();
    setStatus("success");

    toast.success("Senha atualizada com sucesso!");

    // Redirect after brief delay
    setTimeout(() => {
      router.replace("/login");
    }, 2000);
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Verificando link...
        </p>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Link inválido</h1>
          <p className="text-sm text-muted-foreground">{serverError}</p>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.replace("/forgot-password")}
        >
          Solicitar novo link
        </Button>
      </div>
    );
  }

  // Success state
  if (status === "success") {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Senha atualizada</h1>
          <p className="text-sm text-muted-foreground">
            Redirecionando para login...
          </p>
        </div>
      </div>
    );
  }

  // Ready state - show form
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Definir nova senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite sua nova senha abaixo
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="password" className="mb-2 block">
            Nova senha
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password")}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="confirmPassword" className="mb-2 block">
            Confirmar senha
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("confirmPassword")}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? "confirm-password-error" : undefined
            }
          />
          {errors.confirmPassword && (
            <p id="confirm-password-error" className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {serverError && (
          <div
            className="p-3 rounded-md bg-destructive/10 border border-destructive/20"
            role="alert"
          >
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar nova senha"
          )}
        </Button>
      </form>
    </div>
  );
}
