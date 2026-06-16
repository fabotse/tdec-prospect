"use client";

/**
 * Change Role Dialog Component
 * Story: 20.3 - UI de papéis na gestão de time
 *
 * AC: #2 - Editar o papel de um membro ativo (Gestor / Diretor / SDR),
 *          persistindo em profiles.role via updateMemberRole.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamMembers } from "@/hooks/use-team-members";
import {
  type TeamMember,
  type UserRole,
  USER_ROLES,
  ROLE_LABELS,
} from "@/types/team";

interface ChangeRoleDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeRoleDialog({
  member,
  open,
  onOpenChange,
}: ChangeRoleDialogProps) {
  const { updateMemberRole, isUpdatingRole } = useTeamMembers();
  // Initial role = the member's current role. The parent remounts this dialog
  // (via `key={member.id}`) when a different member is selected, so the initial
  // state is always correct — no effect-based syncing needed.
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    member?.role ?? "sdr"
  );

  const handleConfirm = async () => {
    if (!member) return;

    const result = await updateMemberRole(member.id, selectedRole);
    if (result.success) {
      toast.success("Papel atualizado com sucesso");
      onOpenChange(false);
    } else {
      toast.error(result.error || "Erro ao atualizar papel");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Alterar Função</DialogTitle>
          <DialogDescription>
            Selecione o novo papel para{" "}
            <strong>{member?.full_name || member?.email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="change-role" className="block">
              Função
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as UserRole)}
            >
              <SelectTrigger id="change-role">
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdatingRole}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isUpdatingRole}
          >
            {isUpdatingRole ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
