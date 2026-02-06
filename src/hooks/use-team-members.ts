"use client";

/**
 * Team Members Hook
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: #1 - Fetch and display team members
 * AC: #4 - Invite new users
 * AC: #8 - Remove team members
 * AC: #10 - Cancel pending invitations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTeamMembers,
  inviteUser,
  removeTeamMember,
  cancelInvitation,
  isOnlyAdmin,
} from "@/actions/team";
import type { TeamMember, InviteUserInput } from "@/types/team";
import type { ActionResult } from "@/types/knowledge-base";

const TEAM_QUERY_KEY = ["team", "members"];
const ONLY_ADMIN_QUERY_KEY = ["team", "isOnlyAdmin"];

/**
 * Hook for managing team members
 * Uses TanStack Query for fetching and CRUD mutations
 */
export function useTeamMembers() {
  const queryClient = useQueryClient();

  // Fetch team members (profiles + pending invitations)
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: async () => {
      const result = await getTeamMembers();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 60 * 1000, // 1 minute
    retry: 1,
  });

  // Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: InviteUserInput): Promise<ActionResult<void>> => {
      return inviteUser(data);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch the list
        queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
      }
    },
  });

  // Remove member mutation
  const removeMutation = useMutation({
    mutationFn: async (userId: string): Promise<ActionResult<void>> => {
      return removeTeamMember(userId);
    },
    onSuccess: (result, removedId) => {
      if (result.success) {
        // Optimistically remove from cache
        queryClient.setQueryData<TeamMember[]>(TEAM_QUERY_KEY, (old) =>
          old?.filter((member) => member.id !== removedId) ?? []
        );
        // Also invalidate the isOnlyAdmin query
        queryClient.invalidateQueries({ queryKey: ONLY_ADMIN_QUERY_KEY });
      }
    },
  });

  // Cancel invitation mutation
  const cancelMutation = useMutation({
    mutationFn: async (invitationId: string): Promise<ActionResult<void>> => {
      return cancelInvitation(invitationId);
    },
    onSuccess: (result, canceledId) => {
      if (result.success) {
        // Optimistically remove from cache
        queryClient.setQueryData<TeamMember[]>(TEAM_QUERY_KEY, (old) =>
          old?.filter(
            (member) => member.invitation_id !== canceledId && member.id !== canceledId
          ) ?? []
        );
      }
    },
  });

  // Wrapper functions for easier use
  const invite = async (data: InviteUserInput): Promise<ActionResult<void>> => {
    return inviteMutation.mutateAsync(data);
  };

  const remove = async (userId: string): Promise<ActionResult<void>> => {
    return removeMutation.mutateAsync(userId);
  };

  const cancel = async (invitationId: string): Promise<ActionResult<void>> => {
    return cancelMutation.mutateAsync(invitationId);
  };

  return {
    members: queryData ?? [],
    isLoading,
    error: queryError?.message ?? null,
    inviteUser: invite,
    isInviting: inviteMutation.isPending,
    removeMember: remove,
    isRemoving: removeMutation.isPending,
    cancelInvite: cancel,
    isCanceling: cancelMutation.isPending,
  };
}

/**
 * Hook to check if current user is the only admin
 * AC: #9 - Prevent removing only admin
 */
export function useIsOnlyAdmin() {
  return useQuery({
    queryKey: ONLY_ADMIN_QUERY_KEY,
    queryFn: isOnlyAdmin,
    staleTime: 60 * 1000, // 1 minute
  });
}
