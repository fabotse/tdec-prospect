"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// Map error codes to user-friendly Portuguese messages
function getErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error.includes("Invalid login credentials")) {
    return "Email ou senha incorretos";
  }
  if (error.includes("Email not confirmed")) {
    return "Por favor, confirme seu email";
  }
  if (error.includes("Too many requests")) {
    return "Muitas tentativas. Aguarde um momento.";
  }
  if (error === "auth_callback_error") {
    return "Erro na autenticação. Tente novamente.";
  }
  return "Erro de conexão. Tente novamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize error from URL param (callback error) or null
  const initialError = getErrorMessage(searchParams.get("error"));
  const [serverError, setServerError] = useState<string | null>(initialError);

  // Show toast for invite acceptance or email verification
  useEffect(() => {
    const invite = searchParams.get("invite");
    const verified = searchParams.get("verified");

    if (invite === "accepted") {
      toast.success("Convite aceito com sucesso!", {
        description:
          'Use "Esqueci minha senha" para definir sua senha e fazer login.',
        duration: 8000,
      });
      // Clean URL without reloading
      window.history.replaceState({}, "", "/login");
    } else if (verified === "true") {
      toast.success("Email verificado!", {
        description: "Você já pode fazer login.",
        duration: 5000,
      });
      window.history.replaceState({}, "", "/login");
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormData) {
    setServerError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setServerError(getErrorMessage(error.message));
      return;
    }

    router.push("/leads");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">TDEC Prospect</h1>
        <p className="text-sm text-muted-foreground">
          Entre com suas credenciais para acessar
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email" className="mb-2 block">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="password" className="mb-2 block">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
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

        {serverError && (
          <div
            className="p-3 rounded-md bg-destructive/10 border border-destructive/20"
            role="alert"
          >
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </Button>
      </form>

      <div className="text-center">
        <a
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Esqueci minha senha
        </a>
      </div>
    </div>
  );
}
