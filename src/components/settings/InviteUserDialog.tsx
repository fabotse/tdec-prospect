"use client";

/**
 * Invite User Dialog Component
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: #2 - "Convidar Usuário" button
 * AC: #3 - Invite dialog with email and role
 * AC: #4 - Send invitation via Supabase Auth
 * AC: #5 - Email validation
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamMembers } from "@/hooks/use-team-members";
import { inviteUserSchema, type InviteUserInput } from "@/types/team";

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const { inviteUser, isInviting } = useTeamMembers();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      role: "user",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedRole = watch("role");

  const onSubmit = async (data: InviteUserInput) => {
    const result = await inviteUser(data);
    if (result.success) {
      toast.success("Convite enviado com sucesso");
      reset();
      setOpen(false);
    } else {
      toast.error(result.error || "Erro ao enviar convite");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Convidar Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
            <DialogDescription>
              Envie um convite por email para adicionar um novo membro à equipe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="block">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@empresa.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="role" className="block">Função</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) =>
                  setValue("role", value as "admin" | "user")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isInviting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isInviting}>
              {isInviting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Convite"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
