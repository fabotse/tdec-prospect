"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types/database";

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
 * Hook for managing user session and profile data
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 */
export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    setIsProfileLoading(true);
    try {
      const supabase = createClient();
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

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
      console.error("Error fetching profile:", e);
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const supabase = createClient();

    // Get initial user
    async function getUser() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        setUser(user);

        // Fetch profile if user exists
        if (user) {
          await fetchProfile(user.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Failed to get user"));
      } finally {
        setIsLoading(false);
      }
    }

    getUser();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
