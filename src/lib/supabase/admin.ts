import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with admin (service role) privileges.
 * ONLY use this for operations that require elevated permissions:
 * - Inviting users via Auth Admin API
 * - Listing all users
 * - Other admin-only operations
 *
 * SECURITY: Never expose this client to the browser.
 * The service role key bypasses RLS and has full database access.
 *
 * Story: 2.7 - Team Management - Invite & Remove Users
 * AC: #4 - Send invite via Supabase Auth Admin API
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin operations require this key."
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
