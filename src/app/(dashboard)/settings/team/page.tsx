"use client";

/**
 * Team Management Page
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: All - Complete team management functionality
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminGuard } from "@/components/settings/AdminGuard";
import { TeamMemberList } from "@/components/settings/TeamMemberList";
import { InviteUserDialog } from "@/components/settings/InviteUserDialog";
import { RemoveUserDialog } from "@/components/settings/RemoveUserDialog";
import { useUser } from "@/hooks/use-user";
import type { TeamMember } from "@/types/team";

export default function TeamPage() {
  const { profile } = useUser();
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [dialogMode, setDialogMode] = useState<"remove" | "cancel-invite">(
    "remove"
  );

  const handleRemove = (member: TeamMember) => {
    setMemberToRemove(member);
    setDialogMode("remove");
  };

  const handleCancelInvite = (member: TeamMember) => {
    setMemberToRemove(member);
    setDialogMode("cancel-invite");
  };

  return (
    <AdminGuard>
      <Card className="bg-background-secondary border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-h3">Gestão de Equipe</CardTitle>
            <CardDescription className="text-body-small text-foreground-muted">
              Gerencie os membros da sua equipe e envie convites.
            </CardDescription>
          </div>
          <InviteUserDialog />
        </CardHeader>
        <CardContent>
          <TeamMemberList
            onRemove={handleRemove}
            onCancelInvite={handleCancelInvite}
            currentUserId={profile?.id ?? ""}
          />
        </CardContent>
      </Card>

      <RemoveUserDialog
        member={memberToRemove}
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        mode={dialogMode}
      />
    </AdminGuard>
  );
}
