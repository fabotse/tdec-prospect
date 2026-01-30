"use client";

import { useEffect, useCallback, useSyncExternalStore } from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";

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

// ==============================================
// SHARED AUTH STATE (module-level singleton)
// Prevents race conditions between multiple useUser instances
// ==============================================
interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  isProfileLoading: boolean;
}

let authState: AuthState = {
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isProfileLoading: false,
};

let authListeners: Array<() => void> = [];
let isAuthInitialized = false;

function notifyListeners() {
  authListeners.forEach((listener) => listener());
}

function subscribeToAuth(callback: () => void) {
  authListeners.push(callback);
  return () => {
    authListeners = authListeners.filter((l) => l !== callback);
  };
}

function getAuthSnapshot(): AuthState {
  return authState;
}

// Cached server snapshot to avoid infinite loop
const serverAuthSnapshot: AuthState = {
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isProfileLoading: false,
};

function getServerAuthSnapshot(): AuthState {
  return serverAuthSnapshot;
}

/**
 * Reset auth state to logged out state
 * Used during logout to ensure clean state before redirect
 */
export function resetAuthState() {
  console.log("[useUser] Resetting auth state for logout");
  authState = {
    user: null,
    profile: null,
    isLoading: false,
    isInitialized: true,
    isProfileLoading: false,
  };
  notifyListeners();
}

async function fetchProfileData(userId: string): Promise<Profile | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[useUser] Error fetching profile:", error);
    }
    return data;
  } catch (e) {
    console.error("[useUser] Error fetching profile:", e);
    return null;
  }
}

// Flag to track if initial load is complete (prevents race condition)
let isInitialLoadComplete = false;

function initializeAuth() {
  if (isAuthInitialized) return; // Already initialized
  isAuthInitialized = true;

  console.log("[useUser] Initializing shared auth state...");
  const supabase = createClient();

  // Helper function to load user and profile
  async function loadUserAndProfile(user: User | null) {
    let newProfile: Profile | null = null;
    if (user) {
      console.log("[useUser] Fetching profile...");
      newProfile = await fetchProfileData(user.id);
      console.log("[useUser] Profile fetched:", newProfile?.role);
    }

    authState = {
      user,
      profile: newProfile,
      isLoading: false,
      isInitialized: true,
      isProfileLoading: false,
    };

    console.log("[useUser] Auth state updated:", { hasUser: !!user, hasProfile: !!newProfile, role: newProfile?.role });
    notifyListeners();
  }

  // Register listener FIRST but ignore events until initial load is complete
  supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
    console.log(`[useUser] onAuthStateChange: event=${event}, hasSession=${!!session}, initialLoadComplete=${isInitialLoadComplete}`);

    // Ignore ALL events until getSession() completes (prevents race condition)
    if (!isInitialLoadComplete) {
      console.log("[useUser] Ignoring event - waiting for initial getSession() to complete");
      return;
    }

    const newUser = session?.user ?? null;

    // Update state for auth change
    authState = {
      ...authState,
      user: newUser,
      isInitialized: true,
      isLoading: !!newUser,
      isProfileLoading: !!newUser,
    };
    notifyListeners();

    // Load profile
    await loadUserAndProfile(newUser);
  });

  // CRITICAL: Use getSession() for initial load - this properly syncs the client
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    console.log("[useUser] Initial getSession completed:", { hasSession: !!session });

    const initialUser = session?.user ?? null;

    // Set initial state immediately
    authState = {
      ...authState,
      user: initialUser,
      isInitialized: true,
      isLoading: !!initialUser,
      isProfileLoading: !!initialUser,
    };
    notifyListeners();

    // Load profile for initial session
    if (initialUser) {
      await loadUserAndProfile(initialUser);
    } else {
      authState = {
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
        isProfileLoading: false,
      };
      notifyListeners();
    }

    // Mark initial load as complete - now onAuthStateChange can process events
    isInitialLoadComplete = true;
    console.log("[useUser] Initial load complete - onAuthStateChange now active");
  });

  // Fallback if no session loads within 5 seconds
  setTimeout(() => {
    if (!authState.isInitialized) {
      console.warn("[useUser] No auth event received after 5s, assuming no session");
      isInitialLoadComplete = true;
      authState = {
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
        isProfileLoading: false,
      };
      notifyListeners();
    }
  }, 5000);
}

/**
 * Hook for managing user session and profile data
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 *
 * IMPORTANT: Uses shared module-level state to prevent race conditions
 * between multiple hook instances.
 * @see https://github.com/supabase/supabase/issues/35754
 */
export function useUser(): UseUserReturn {
  // Initialize auth on first hook mount (only happens once globally)
  useEffect(() => {
    initializeAuth();
  }, []);

  // Subscribe to shared auth state
  const state = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot);

  // Refetch profile function
  const refetchProfile = useCallback(async () => {
    if (state.user?.id) {
      authState = { ...authState, isProfileLoading: true };
      notifyListeners();

      const profile = await fetchProfileData(state.user.id);

      authState = { ...authState, profile, isProfileLoading: false };
      notifyListeners();
    }
  }, [state.user?.id]);

  return {
    user: state.user,
    profile: state.profile,
    isLoading: state.isLoading,
    isProfileLoading: state.isProfileLoading,
    error: null,
    isAdmin: state.profile?.role === "admin",
    role: state.profile?.role ?? null,
    refetchProfile,
  };
}
