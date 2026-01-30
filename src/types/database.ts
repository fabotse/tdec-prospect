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
