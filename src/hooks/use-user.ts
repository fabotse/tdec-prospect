"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { User, AuthError, AuthChangeEvent, Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types/database";

/**
 * Timeout for auth operations in milliseconds
 */
const AUTH_TIMEOUT_MS = 10000;

/**
 * Extended return type with profile data
 * AC: #4 - profiles table stores user metadata (name, role)
 * AC: #6 - Admin role differentiated from User role (FR37)
 */
interface UseUserReturn {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  role: UserRole | null;
  refetchProfile: () => Promise<void>;
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timeout: auth operation took too long"));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Hook for managing user session and profile data
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 */
export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchProfile = useCallback(
    async (userId: string, checkMounted = true) => {
      if (checkMounted && !isMountedRef.current) return;

      setIsProfileLoading(true);
      try {
        const supabase = createClient();
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (!isMountedRef.current) return;

        if (profileError) {
          // Profile might not exist yet (trigger not fired or new user)
          // This is not necessarily an error - PGRST116 means no rows returned
          if (profileError.code !== "PGRST116") {
            console.error("Error fetching profile:", profileError);
          }
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (e) {
        if (!isMountedRef.current) return;
        console.error("Error fetching profile:", e);
        setProfile(null);
      } finally {
        if (isMountedRef.current) {
          setIsProfileLoading(false);
        }
      }
    },
    []
  );

  const refetchProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, false);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    isMountedRef.current = true;
    const supabase = createClient();

    // Get initial user
    async function getUser() {
      try {
        const {
          data: { user },
          error,
        } = await withTimeout<{ data: { user: User | null }; error: AuthError | null }>(
          supabase.auth.getUser(),
          AUTH_TIMEOUT_MS
        );

        if (!isMountedRef.current) return;

        if (error) {
          throw error;
        }

        setUser(user);

        // Fetch profile if user exists
        if (user) {
          await fetchProfile(user.id);
        }
      } catch (e) {
        if (!isMountedRef.current) return;

        // Don't treat timeout as fatal error - just log and continue
        if (e instanceof Error && e.message.includes("Timeout")) {
          console.warn("Auth timeout - continuing without user data");
          setUser(null);
          setProfile(null);
        } else {
          setError(e instanceof Error ? e : new Error("Failed to get user"));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    getUser();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (!isMountedRef.current) return;

      const newUser = session?.user ?? null;
      setUser(newUser);
      setIsLoading(false);

      // Fetch or clear profile based on auth state
      if (newUser) {
        await fetchProfile(newUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  return {
    user,
    profile,
    isLoading,
    isProfileLoading,
    error,
    isAdmin: profile?.role === "admin",
    role: profile?.role ?? null,
    refetchProfile,
  };
}
