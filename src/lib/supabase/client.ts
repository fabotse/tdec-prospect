import { createBrowserClient } from "@supabase/ssr";

/**
 * Singleton instance of the Supabase browser client.
 *
 * IMPORTANT: Using a singleton prevents multiple client instances
 * which can cause issues with auth state listeners after HMR.
 * All components share the same client and auth state.
 */
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabaseInstance;
}

/**
 * Reset the singleton instance.
 * Only used for testing purposes.
 */
export function resetClient() {
  supabaseInstance = null;
}
