/**
 * Create Lead Dialog Component
 * Quick Dev: Manual Lead Creation
 *
 * Dialog with form to manually create a lead.
 * Uses createLeadSchema from types/lead.ts for validation.
 */

"use client";

import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLeadSchema, type CreateLeadInput } from "@/types/lead";
import { useCreateLead } from "@/hooks/use-create-lead";

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLeadDialog({ open, onOpenChange }: CreateLeadDialogProps) {
  const createLead = useCreateLead();

  const form = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      companyName: "",
      companySize: "",
      industry: "",
      location: "",
      title: "",
      linkedinUrl: "",
    },
  });

  const onSubmit = useCallback(
    async (data: CreateLeadInput) => {
      try {
        await createLead.mutateAsync(data);
        toast.success("Lead criado com sucesso!");
        form.reset();
        onOpenChange(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao criar lead"
        );
      }
    },
    [createLead, form, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Criar Lead Manualmente</DialogTitle>
            <DialogDescription>
              Preencha os dados do lead. Apenas o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Row 1: Nome + Sobrenome */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-firstName">Nome *</Label>
                <Input
                  id="create-lead-firstName"
                  placeholder="Ex: João"
                  {...form.register("firstName")}
                  data-testid="create-lead-firstName"
                  autoFocus
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-destructive" data-testid="create-lead-firstName-error">
                    {form.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-lastName">Sobrenome</Label>
                <Input
                  id="create-lead-lastName"
                  placeholder="Ex: Silva"
                  {...form.register("lastName")}
                  data-testid="create-lead-lastName"
                />
              </div>
            </div>

            {/* Row 2: Email + Telefone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-email">Email</Label>
                <Input
                  id="create-lead-email"
                  type="email"
                  placeholder="joao@empresa.com"
                  {...form.register("email")}
                  data-testid="create-lead-email"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive" data-testid="create-lead-email-error">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-phone">Telefone</Label>
                <Input
                  id="create-lead-phone"
                  placeholder="+55 11 99999-9999"
                  {...form.register("phone")}
                  data-testid="create-lead-phone"
                />
              </div>
            </div>

            {/* Row 3: Empresa + Cargo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-companyName">Empresa</Label>
                <Input
                  id="create-lead-companyName"
                  placeholder="Ex: Tech Corp"
                  {...form.register("companyName")}
                  data-testid="create-lead-companyName"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-title">Cargo</Label>
                <Input
                  id="create-lead-title"
                  placeholder="Ex: CTO"
                  {...form.register("title")}
                  data-testid="create-lead-title"
                />
              </div>
            </div>

            {/* Row 4: Indústria + Localização */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-industry">Indústria</Label>
                <Input
                  id="create-lead-industry"
                  placeholder="Ex: Tecnologia"
                  {...form.register("industry")}
                  data-testid="create-lead-industry"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-location">Localização</Label>
                <Input
                  id="create-lead-location"
                  placeholder="Ex: São Paulo, SP"
                  {...form.register("location")}
                  data-testid="create-lead-location"
                />
              </div>
            </div>

            {/* Row 5: Tamanho empresa + LinkedIn */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-companySize">Tamanho da Empresa</Label>
                <Input
                  id="create-lead-companySize"
                  placeholder="Ex: 51-200"
                  {...form.register("companySize")}
                  data-testid="create-lead-companySize"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-lead-linkedinUrl">LinkedIn URL</Label>
                <Input
                  id="create-lead-linkedinUrl"
                  placeholder="https://linkedin.com/in/..."
                  {...form.register("linkedinUrl")}
                  data-testid="create-lead-linkedinUrl"
                />
                {form.formState.errors.linkedinUrl && (
                  <p className="text-sm text-destructive" data-testid="create-lead-linkedinUrl-error">
                    {form.formState.errors.linkedinUrl.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createLead.isPending}
              data-testid="create-lead-submit"
            >
              {createLead.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Lead"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
