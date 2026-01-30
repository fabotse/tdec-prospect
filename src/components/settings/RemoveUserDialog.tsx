"use client";

/**
 * Remove User Dialog Component
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: #7 - Confirmation dialog for removal
 * AC: #8 - Remove user from tenant
 * AC: #9 - Prevent removing only admin (handled in parent)
 * AC: #10 - Cancel pending invitations
 */

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTeamMembers } from "@/hooks/use-team-members";
import type { TeamMember } from "@/types/team";

interface RemoveUserDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "remove" | "cancel-invite";
}

export function RemoveUserDialog({
  member,
  open,
  onOpenChange,
  mode,
}: RemoveUserDialogProps) {
  const { removeMember, isRemoving, cancelInvite, isCanceling } =
    useTeamMembers();

  const isLoading = isRemoving || isCanceling;

  const handleConfirm = async () => {
    if (!member) return;

    if (mode === "cancel-invite" && member.invitation_id) {
      const result = await cancelInvite(member.invitation_id);
      if (result.success) {
        toast.success("Convite cancelado");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Erro ao cancelar convite");
      }
    } else {
      const result = await removeMember(member.id);
      if (result.success) {
        toast.success("Usuário removido com sucesso");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Erro ao remover usuário");
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "cancel-invite" ? "Cancelar Convite" : "Remover Usuário"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "cancel-invite" ? (
              <>
                Tem certeza que deseja cancelar o convite para{" "}
                <strong>{member?.email}</strong>?
              </>
            ) : (
              <>
                Tem certeza que deseja remover{" "}
                <strong>{member?.full_name || member?.email}</strong> da equipe?
                Esta ação não pode ser desfeita.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "cancel-invite" ? "Cancelando..." : "Removendo..."}
              </>
            ) : mode === "cancel-invite" ? (
              "Cancelar Convite"
            ) : (
              "Remover"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
