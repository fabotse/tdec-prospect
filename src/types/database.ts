/**
 * Database types for multi-tenant architecture
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 *
 * These types mirror the Supabase database schema.
 * For auto-generated types, run: supabase gen types typescript
 */

// ==============================================
// USER ROLE TYPES
// ==============================================

/**
 * Available user roles in the system
 * - 'admin': Full access to admin features (FR37)
 * - 'user': Regular user with standard permissions
 */
export type UserRole = "admin" | "user";

// ==============================================
// DATABASE TABLE TYPES
// ==============================================

/**
 * Tenant (organization) entity
 * AC: #2 - tenants table with id, name, created_at
 */
export interface Tenant {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * User profile linked to tenant
 * AC: #3 - users table links to tenants via tenant_id
 * AC: #4 - profiles table stores user metadata (name, role)
 */
export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// ==============================================
// WHATSAPP MESSAGE TYPES
// Story: 11.2 - Schema WhatsApp Messages + Tipos
// ==============================================

/**
 * Status de entrega de mensagem WhatsApp
 * Fluxo: pending → sent → delivered → read | pending → failed
 */
export type WhatsAppMessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

/**
 * WhatsApp message row — espelha tabela whatsapp_messages
 * AC: #5 - WhatsAppMessage interface mirrors the DB row
 */
export interface WhatsAppMessage {
  id: string;
  tenant_id: string;
  campaign_id: string;
  lead_id: string;
  phone: string;
  message: string;
  status: WhatsAppMessageStatus;
  external_message_id: string | null;
  external_zaap_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Insert type — omit auto-generated fields
 * AC: #5 - WhatsAppMessageInsert type following project pattern
 */
export type WhatsAppMessageInsert = Omit<
  WhatsAppMessage,
  "id" | "status" | "created_at" | "updated_at"
> & {
  id?: string;
  status?: WhatsAppMessageStatus;
  created_at?: string;
  updated_at?: string;
};

/**
 * Update type — partial, excluding immutable fields
 * AC: #5 - WhatsAppMessageUpdate type following project pattern
 */
export type WhatsAppMessageUpdate = Partial<
  Omit<WhatsAppMessage, "id" | "tenant_id" | "created_at">
>;

/**
 * Constantes de status válidos para validação runtime
 * AC: #5 - Array const para validação
 */
export const WHATSAPP_MESSAGE_STATUSES = [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;

/**
 * Type guard para validar status de mensagem WhatsApp
 * AC: #5 - isValidWhatsAppMessageStatus type guard
 */
export function isValidWhatsAppMessageStatus(
  status: string
): status is WhatsAppMessageStatus {
  return (WHATSAPP_MESSAGE_STATUSES as readonly string[]).includes(status);
}

// ==============================================
// COMPOSITE TYPES
// ==============================================

/**
 * Extended user type with profile information
 * Used in useUser hook and throughout the application
 */
export interface UserWithProfile {
  id: string;
  email: string;
  profile: Profile | null;
}

/**
 * Tenant with associated profiles
 * Useful for admin views
 */
export interface TenantWithProfiles extends Tenant {
  profiles: Profile[];
}

// ==============================================
// DATABASE ROW TYPES (Supabase compatible)
// ==============================================

/**
 * Database table row types for Supabase queries
 */
export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Tenant, "id" | "created_at">>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at" | "role"> & {
          created_at?: string;
          updated_at?: string;
          role?: UserRole;
        };
        Update: Partial<Omit<Profile, "id" | "created_at" | "tenant_id">>;
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: WhatsAppMessageInsert;
        Update: WhatsAppMessageUpdate;
      };
    };
    Functions: {
      get_current_tenant_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
}

// ==============================================
// TYPE GUARDS
// ==============================================

/**
 * Check if a role is valid
 */
export function isValidRole(role: string): role is UserRole {
  return role === "admin" || role === "user";
}

/**
 * Check if user is admin
 */
export function isAdminRole(role: UserRole): boolean {
  return role === "admin";
}
