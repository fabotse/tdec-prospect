"use client";

/**
 * Forgot Password Page
 *
 * Allows users to request a password reset email.
 * Used by new invited users to set their initial password.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordFormData) {
    setServerError(null);

    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${siteUrl}/reset-password`,
    });

    if (error) {
      console.error("Reset password error:", error);
      if (error.message.includes("rate limit")) {
        setServerError("Muitas tentativas. Aguarde alguns minutos.");
      } else {
        setServerError("Erro ao enviar email. Tente novamente.");
      }
      return;
    }

    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Verifique seu email
          </h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de recuperação para{" "}
            <span className="font-medium text-foreground">
              {getValues("email")}
            </span>
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Não recebeu o email? Verifique sua pasta de spam ou tente novamente.
          </p>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setEmailSent(false)}
          >
            Tentar novamente
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite seu email para receber um link de recuperação
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email" className="mb-2 block">
            Email
          </Label>
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
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.message}
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
              Enviando...
            </>
          ) : (
            "Enviar link de recuperação"
          )}
        </Button>
      </form>

      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para login
      </Link>
    </div>
  );
}
