"use server";

/**
 * Server Actions: Team Management
 * Story: 2.7 - Team Management - Invite & Remove Users
 *
 * AC: #1 - Display team members list
 * AC: #4 - Send invitations via Supabase Auth
 * AC: #8 - Remove team members
 * AC: #9 - Prevent removing only admin
 * AC: #10 - Cancel pending invitations
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { hasAdminAccess, ADMIN_ROLES } from "@/lib/auth/capabilities";
import {
  type TeamMember,
  type InviteUserInput,
  type ActionResult,
  type UserRole,
  inviteUserSchema,
  updateMemberRoleSchema,
} from "@/types/team";

// ==============================================
// GET TEAM MEMBERS ACTION
// ==============================================

/**
 * Get all team members (profiles + pending invitations) for the current tenant
 * AC: #1 - Display team members with name, email, role, status
 * AC: #6 - Show pending invitations in the list
 */
export async function getTeamMembers(): Promise<ActionResult<TeamMember[]>> {
  try {
    // 1. Check authentication and admin role
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    if (!hasAdminAccess(profile.role)) {
      return {
        success: false,
        error: "Apenas administradores podem gerenciar a equipe.",
      };
    }

    const supabase = await createClient();

    // 2. Fetch profiles for the tenant
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at, tenant_id")
      .eq("tenant_id", profile.tenant_id);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return { success: false, error: "Erro ao carregar membros da equipe." };
    }

    // 3. Fetch auth.users data for emails (needs admin client)
    const adminClient = createAdminClient();
    const { data: authData, error: authError } =
      await adminClient.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching auth users:", authError);
      return { success: false, error: "Erro ao carregar dados de usuários." };
    }

    // 4. Fetch pending invitations
    const { data: invitations, error: invError } = await supabase
      .from("team_invitations")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "pending");

    if (invError) {
      console.error("Error fetching invitations:", invError);
      // Don't fail completely, just skip invitations
    }

    // 5. Combine data - active profiles
    const members: TeamMember[] = (profiles || []).map((p) => {
      const authUser = authData.users.find((u) => u.id === p.id);
      return {
        id: p.id,
        full_name: p.full_name || "Usuário",
        email: authUser?.email || "",
        role: p.role as UserRole,
        status: "active" as const,
        created_at: p.created_at,
      };
    });

    // 6. Add pending invitations as members
    if (invitations) {
      invitations.forEach((inv) => {
        members.push({
          id: inv.id,
          full_name: null,
          email: inv.email,
          role: inv.role as UserRole,
          status: "pending" as const,
          created_at: inv.created_at,
          invitation_id: inv.id,
        });
      });
    }

    return { success: true, data: members };
  } catch (error) {
    console.error("getTeamMembers error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// INVITE USER ACTION
// ==============================================

/**
 * Send an invitation to a new user
 * AC: #3 - Enter email and select role
 * AC: #4 - Send invite via Supabase Auth Admin API
 * AC: #5 - Validate email format
 */
export async function inviteUser(
  data: InviteUserInput
): Promise<ActionResult<void>> {
  try {
    // 1. Validate input with Zod
    const validated = inviteUserSchema.safeParse(data);
    if (!validated.success) {
      return { success: false, error: "Email inválido" };
    }

    // 2. Check authentication and admin role
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    if (!hasAdminAccess(profile.role)) {
      return {
        success: false,
        error: "Apenas administradores podem convidar usuários.",
      };
    }

    const supabase = await createClient();

    // 3. Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from("team_invitations")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("email", validated.data.email)
      .eq("status", "pending")
      .single();

    if (existingInvite) {
      return {
        success: false,
        error: "Já existe um convite pendente para este email.",
      };
    }

    // 4. Check if user already exists in tenant
    const adminClient = createAdminClient();
    const { data: authData } = await adminClient.auth.admin.listUsers();

    const existingUser = authData?.users.find(
      (u) => u.email === validated.data.email
    );

    if (existingUser) {
      // Check if user is already in this tenant
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", existingUser.id)
        .eq("tenant_id", profile.tenant_id)
        .single();

      if (existingProfile) {
        return {
          success: false,
          error: "Este usuário já faz parte da equipe.",
        };
      }
    }

    // 5. Send invite via Supabase Auth Admin API
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const { error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(validated.data.email, {
        data: {
          tenant_id: profile.tenant_id,
          role: validated.data.role,
          invited_by: profile.id,
        },
        redirectTo: `${siteUrl}/auth/callback`,
      });

    if (inviteError) {
      console.error("Invite error:", inviteError);
      if (inviteError.message.includes("already registered")) {
        return {
          success: false,
          error: "Este email já está registrado no sistema.",
        };
      }
      return { success: false, error: "Erro ao enviar convite. Tente novamente." };
    }

    // 6. Record invitation in our tracking table
    const { error: insertError } = await supabase
      .from("team_invitations")
      .insert({
        tenant_id: profile.tenant_id,
        email: validated.data.email,
        role: validated.data.role,
        invited_by: profile.id,
        status: "pending",
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(), // 7 days
      });

    if (insertError) {
      console.error("Failed to record invitation:", insertError);
      // Don't fail - invitation was sent, just tracking failed
    }

    return { success: true };
  } catch (error) {
    console.error("inviteUser error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// REMOVE TEAM MEMBER ACTION
// ==============================================

/**
 * Remove a team member from the tenant
 * AC: #7 - Confirmation before removal
 * AC: #8 - Remove user from tenant
 * AC: #9 - Prevent removing only admin
 */
export async function removeTeamMember(
  userId: string
): Promise<ActionResult<void>> {
  try {
    // 1. Check authentication and admin role
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    if (!hasAdminAccess(profile.role)) {
      return {
        success: false,
        error: "Apenas administradores podem remover usuários.",
      };
    }

    // 2. Check if trying to remove self as only admin
    if (userId === profile.id) {
      const isOnly = await isOnlyAdmin();
      if (isOnly) {
        return {
          success: false,
          error: "Não é possível remover o único administrador.",
        };
      }
    }

    const supabase = await createClient();

    // 3. Verify user belongs to same tenant
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, tenant_id, role")
      .eq("id", userId)
      .single();

    if (profileError || !targetProfile) {
      return { success: false, error: "Usuário não encontrado." };
    }

    if (targetProfile.tenant_id !== profile.tenant_id) {
      return { success: false, error: "Usuário não encontrado." };
    }

    // 4. If target has admin access, check if they're the only admin
    if (hasAdminAccess(targetProfile.role as UserRole)) {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", profile.tenant_id)
        .in("role", [...ADMIN_ROLES]);

      if (count === 1) {
        return {
          success: false,
          error: "Não é possível remover o único administrador.",
        };
      }
    }

    // 5. Delete profile (user can no longer access tenant data)
    const { error: deleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      console.error("Error deleting profile:", deleteError);
      return { success: false, error: "Erro ao remover usuário." };
    }

    return { success: true };
  } catch (error) {
    console.error("removeTeamMember error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// CANCEL INVITATION ACTION
// ==============================================

/**
 * Cancel a pending invitation
 * AC: #10 - Revoke pending invitations
 */
export async function cancelInvitation(
  invitationId: string
): Promise<ActionResult<void>> {
  try {
    // 1. Check authentication and admin role
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    if (!hasAdminAccess(profile.role)) {
      return {
        success: false,
        error: "Apenas administradores podem cancelar convites.",
      };
    }

    const supabase = await createClient();

    // 2. Delete invitation (RLS ensures tenant isolation)
    const { error } = await supabase
      .from("team_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      console.error("Error canceling invitation:", error);
      return { success: false, error: "Erro ao cancelar convite." };
    }

    return { success: true };
  } catch (error) {
    console.error("cancelInvitation error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// UPDATE MEMBER ROLE ACTION
// ==============================================

/**
 * Update an existing (active) member's role within the current tenant.
 * Story: 20.3 - UI de papéis na gestão de time (AC #2 - edição)
 *
 * - Admin-only (hasAdminAccess); tenant-isolated.
 * - Protects the "last admin": cannot demote the only admin of the tenant.
 * - Persists to profiles.role. Pending invitations are not editable here
 *   (their role is set at invite time; change = cancel + re-invite).
 */
export async function updateMemberRole(
  userId: string,
  newRole: UserRole
): Promise<ActionResult<void>> {
  try {
    // 1. Validate input
    const validated = updateMemberRoleSchema.safeParse({ userId, role: newRole });
    if (!validated.success) {
      return { success: false, error: "Dados inválidos" };
    }

    // 2. Check authentication and admin role
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    if (!hasAdminAccess(profile.role)) {
      return {
        success: false,
        error: "Apenas administradores podem alterar papéis.",
      };
    }

    const supabase = await createClient();

    // 3. Verify target user belongs to same tenant
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, tenant_id, role")
      .eq("id", validated.data.userId)
      .single();

    if (profileError || !targetProfile) {
      return { success: false, error: "Usuário não encontrado." };
    }

    if (targetProfile.tenant_id !== profile.tenant_id) {
      return { success: false, error: "Usuário não encontrado." };
    }

    // 4. Prevent demoting the only admin of the tenant (avoids lockout)
    const isDemotingAdmin =
      hasAdminAccess(targetProfile.role as UserRole) &&
      !hasAdminAccess(validated.data.role);

    if (isDemotingAdmin) {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", profile.tenant_id)
        .in("role", [...ADMIN_ROLES]);

      if (count === 1) {
        return {
          success: false,
          error: "Não é possível rebaixar o único administrador.",
        };
      }
    }

    // 5. Persist new role (tenant-scoped update — defense-in-depth).
    //    `.select()` returns the affected rows so we can detect a write that the
    //    DB silently dropped (e.g. RLS filtered the row → 0 updated, no error).
    //    Without this guard the action would report a false success.
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ role: validated.data.role })
      .eq("id", validated.data.userId)
      .eq("tenant_id", profile.tenant_id)
      .select("id");

    if (updateError) {
      console.error("Error updating member role:", updateError);
      return { success: false, error: "Erro ao alterar o papel do usuário." };
    }

    if (!updated || updated.length === 0) {
      // Row matched nothing we are allowed to write (RLS / race). Never a success.
      // Most likely cause in prod: migration 00054 (admin UPDATE policy on
      // profiles) not applied to the DB. Log so this is diagnosable instead of
      // looking like a transient user error.
      console.error(
        "updateMemberRole: update affected 0 rows (RLS blocked or row vanished). Is migration 00054 applied?"
      );
      return {
        success: false,
        error: "Não foi possível alterar o papel do usuário.",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("updateMemberRole error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// HELPER: CHECK IF ONLY ADMIN
// ==============================================

/**
 * Check if the current user is the only admin in the tenant
 * AC: #9 - Prevent removing the only admin
 */
export async function isOnlyAdmin(): Promise<boolean> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) return false;

    const supabase = await createClient();

    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .in("role", [...ADMIN_ROLES]);

    return count === 1;
  } catch (error) {
    console.error("isOnlyAdmin error:", error);
    return false;
  }
}
