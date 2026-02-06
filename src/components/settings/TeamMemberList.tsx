"use client";

/**
 * Team Member List Component
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: #1 - Display team members with name, email, role, status
 * AC: #6 - Pending invitations shown in list
 */

import { MoreHorizontal, Clock, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTeamMembers, useIsOnlyAdmin } from "@/hooks/use-team-members";
import type { TeamMember } from "@/types/team";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TeamMemberListProps {
  onRemove: (member: TeamMember) => void;
  onCancelInvite: (member: TeamMember) => void;
  currentUserId: string;
}

export function TeamMemberList({
  onRemove,
  onCancelInvite,
  currentUserId,
}: TeamMemberListProps) {
  const { members, isLoading, error } = useTeamMembers();
  const { data: isOnlyAdmin } = useIsOnlyAdmin();

  if (isLoading) {
    return <TeamMemberListSkeleton />;
  }

  if (error) {
    return (
      <div className="text-destructive py-4">
        Erro ao carregar equipe: {error}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
        <p>Nenhum membro na equipe ainda.</p>
        <p className="text-body-small">
          Use o botão acima para convidar membros.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isCurrentUserOnlyAdmin =
              member.id === currentUserId && isOnlyAdmin;
            const canRemove =
              member.status === "active" && !isCurrentUserOnlyAdmin;

            return (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.full_name || (
                    <span className="text-foreground-muted italic">
                      Pendente
                    </span>
                  )}
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={member.role === "admin" ? "default" : "secondary"}
                  >
                    {member.role === "admin" ? "Admin" : "Usuário"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      member.status === "active" ? "outline" : "secondary"
                    }
                  >
                    {member.status === "active" ? (
                      "Ativo"
                    ) : (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </span>
                    )}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground-muted text-body-small">
                  {formatDistanceToNow(new Date(member.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {member.status === "pending" ? (
                        <DropdownMenuItem
                          onClick={() => onCancelInvite(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Cancelar Convite
                        </DropdownMenuItem>
                      ) : isCurrentUserOnlyAdmin ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block">
                              <DropdownMenuItem
                                disabled
                                className="text-destructive opacity-50"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Não é possível remover o único administrador
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => onRemove(member)}
                          disabled={!canRemove}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}

function TeamMemberListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 py-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}
