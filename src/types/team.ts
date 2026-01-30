/**
 * Team Management Types
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * Types for team member management and invitations.
 */

import { z } from "zod";

// ==============================================
// STATUS TYPES
// ==============================================

/**
 * Team member status types
 * AC: #1, #6 - Distinguish active members from pending invitations
 */
export const TEAM_MEMBER_STATUSES = ["active", "pending"] as const;
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];

/**
 * User role types
 * AC: #3 - Role selection: Admin or Usuário
 */
export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Human-readable role labels (Portuguese)
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  user: "Usuário",
};

/**
 * Human-readable status labels (Portuguese)
 */
export const STATUS_LABELS: Record<TeamMemberStatus, string> = {
  active: "Ativo",
  pending: "Pendente",
};

// ==============================================
// TEAM MEMBER TYPES
// ==============================================

/**
 * Team member interface combining profiles and invitations
 * AC: #1 - Shows name, email, role, status
 * AC: #6 - Pending invitations show email instead of name
 */
export interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  status: TeamMemberStatus;
  created_at: string;
  invitation_id?: string; // Present if status is 'pending'
}

// ==============================================
// TEAM INVITATION TYPES
// ==============================================

/**
 * Invitation status types
 */
export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "cancelled",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Team invitation record as stored in database
 * AC: #4, #6 - Tracking invitations
 */
export interface TeamInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

// ==============================================
// INPUT SCHEMAS
// ==============================================

/**
 * Zod schema for inviting a user
 * AC: #3 - Email and role inputs
 * AC: #5 - Email validation
 */
export const inviteUserSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(USER_ROLES),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// ==============================================
// ACTION RESULT TYPE (RE-EXPORT)
// ==============================================

/**
 * Generic action result type for server actions
 * Re-exported from knowledge-base for convenience
 */
export type { ActionResult } from "./knowledge-base";
