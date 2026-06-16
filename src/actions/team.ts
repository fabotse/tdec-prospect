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
import { isValidRole } from "@/types/database";
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

    // Normalizar o e-mail para minúsculas. O Supabase GoTrue minúsculiza o e-mail
    // do auth user, então gravar/comparar o e-mail cru aqui faria o lookup de
    // pós-aceitação (applyInvitedRoleOnAcceptance, via `.eq("email", user.email)`)
    // falhar silenciosamente para qualquer convite digitado com maiúsculas →
    // convidado preso como `sdr`. Normalizar no ponto de escrita mantém todo o
    // fluxo de convite case-consistente.
    const normalizedEmail = validated.data.email.toLowerCase();

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
      .eq("email", normalizedEmail)
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
      (u) => u.email === normalizedEmail
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
      await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
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
        email: normalizedEmail,
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
// APPLY INVITED ROLE ON ACCEPTANCE (Story 20.4 — deliverable B)
// ==============================================

/**
 * Promove o perfil recém-criado ao papel registrado no convite que ele aceitou.
 * Story: 20.4 - Provisionamento dos usuários do cliente (AC #4, #2, #3) — AD-5.
 *
 * Fecha o gap convite→signup rastreado desde a 20.1: `handle_new_user()` cria
 * TODO perfil como `sdr` + primeiro tenant, ignorando o role/tenant do convite.
 * O convite só existe em `team_invitations` DEPOIS de `inviteUserByEmail` retornar
 * (a linha é inserida pelo `inviteUser` após a chamada), então o trigger não tem
 * como lê-lo no momento da criação do auth user → o único ponto confiável é a
 * ACEITAÇÃO. Esta ação roda no callback de aceitação, com a sessão já ativa.
 *
 * Segurança (AD-5 — vinculante):
 *  - Identidade vem do SERVIDOR (`auth.getUser()`), nunca de parâmetro do cliente.
 *  - O papel vem de lookup server-side em `team_invitations` casado pelo e-mail
 *    autenticado, NUNCA de `raw_user_meta_data` (vetor de escalonamento).
 *  - Lookup e UPDATE usam o admin client (service role): o usuário recém-aceito
 *    ainda é `sdr` e a RLS de `team_invitations`/`profiles` exige `is_admin()`, então
 *    a sessão dele não consegue ler/escrever. Isso também torna (B) INDEPENDENTE da
 *    migration 00054 (policy de UPDATE admin em profiles) estar aplicada no banco.
 *  - Tolerante a falha: na ausência de convite válido é no-op (`applied:false`) —
 *    não trava o login; o papel pode ser corrigido depois via `updateMemberRole`.
 */
export async function applyInvitedRoleOnAcceptance(): Promise<
  ActionResult<{ applied: boolean }>
> {
  try {
    // 1. Identidade confiável a partir da sessão server-side (cookie).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      // Sem sessão (ou sem e-mail) → no-op. Nunca trava o fluxo de aceitação.
      return { success: true, data: { applied: false } };
    }

    const adminClient = createAdminClient();

    // 2. Lookup do convite pendente e NÃO expirado (admin client — bypassa RLS).
    //    Entre tenants pode haver mais de um convite para o mesmo e-mail → o
    //    índice único parcial garante no máximo 1 por (tenant, e-mail) pendente,
    //    então ordenamos por created_at desc e pegamos o mais recente.
    const { data: invitations, error: lookupError } = await adminClient
      .from("team_invitations")
      .select("id, role, tenant_id")
      .eq("email", user.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (lookupError) {
      console.error(
        "applyInvitedRoleOnAcceptance: erro no lookup do convite:",
        lookupError
      );
      return { success: false, error: "Erro ao verificar o convite." };
    }

    const invitation = invitations?.[0];

    if (!invitation) {
      // Nenhum convite válido (inexistente/expirado/já aceito) → perfil segue
      // com o default seguro (`sdr`). Não é erro — é o caminho esperado para
      // qualquer login que não seja a primeira aceitação de um convite.
      return { success: true, data: { applied: false } };
    }

    // 3. Validar o papel contra o enum — defesa contra dado corrompido na tabela.
    //    (O papel JAMAIS vem de raw_user_meta_data; vem só desta linha confiável.)
    if (!isValidRole(invitation.role)) {
      console.error(
        `applyInvitedRoleOnAcceptance: papel inválido no convite ${invitation.id}: "${invitation.role}"`
      );
      return { success: false, error: "Papel do convite inválido." };
    }

    // 4. Promover o perfil ao papel/tenant do convite (admin client — bypassa RLS).
    //    `.select("id")` + guarda de 0 linhas: nunca reportar sucesso falso quando
    //    nada foi escrito (lição da 20.3 — falso sucesso por RLS / perfil ausente).
    const { data: updated, error: updateError } = await adminClient
      .from("profiles")
      .update({ role: invitation.role, tenant_id: invitation.tenant_id })
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      console.error(
        "applyInvitedRoleOnAcceptance: erro ao aplicar papel no perfil:",
        updateError
      );
      return { success: false, error: "Erro ao aplicar o papel do convite." };
    }

    if (!updated || updated.length === 0) {
      console.error(
        "applyInvitedRoleOnAcceptance: update afetou 0 linhas (perfil ausente? trigger não criou?)."
      );
      return {
        success: false,
        error: "Não foi possível aplicar o papel do convite.",
      };
    }

    // 5. Marcar o convite como aceito. Se falhar, o papel JÁ foi aplicado — não
    //    desfazer; apenas logar para reconciliação (estado seguro: papel correto,
    //    convite ainda pending → será ignorado por expirar/ser cancelado).
    const { error: acceptError } = await adminClient
      .from("team_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (acceptError) {
      console.error(
        "applyInvitedRoleOnAcceptance: papel aplicado, mas falha ao marcar convite como aceito:",
        acceptError
      );
    }

    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("applyInvitedRoleOnAcceptance error:", error);
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
