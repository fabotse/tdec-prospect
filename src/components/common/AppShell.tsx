"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";
const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 64;

interface SidebarContextType {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  sidebarWidth: number;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within an AppShell");
  }
  return context;
}

/**
 * External store for sidebar collapsed state.
 *
 * This pattern uses module-level variables with useSyncExternalStore to:
 * 1. Avoid hydration mismatches between server and client
 * 2. Prevent React strict mode issues with setState in useEffect
 * 3. Share state across components without prop drilling
 *
 * The isInitialized flag ensures localStorage is only read once on first render.
 * Reset on unmount (useEffect cleanup) handles HMR correctly.
 *
 * @see https://react.dev/reference/react/useSyncExternalStore
 */
let sidebarListeners: Array<() => void> = [];
let isCollapsedState = false;
let isInitialized = false;

function getStoredCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

function subscribeToSidebar(callback: () => void) {
  sidebarListeners.push(callback);
  return () => {
    sidebarListeners = sidebarListeners.filter((l) => l !== callback);
  };
}

function getCollapsedSnapshot(): boolean {
  if (typeof window !== "undefined" && !isInitialized) {
    isCollapsedState = getStoredCollapsed();
    isInitialized = true;
  }
  return isCollapsedState;
}

function getServerCollapsedSnapshot(): boolean {
  return false;
}

function notifySidebarListeners() {
  sidebarListeners.forEach((listener) => listener());
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Reset initialization on unmount for HMR
  useEffect(() => {
    return () => {
      isInitialized = false;
    };
  }, []);

  const isCollapsed = useSyncExternalStore(
    subscribeToSidebar,
    getCollapsedSnapshot,
    getServerCollapsedSnapshot
  );

  const toggleCollapse = useCallback(() => {
    const newValue = !isCollapsedState;
    isCollapsedState = newValue;

    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newValue));
    } catch {
      // localStorage not available
    }

    notifySidebarListeners();
  }, []);

  const sidebarWidth = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  // Track hydration status for transition animation
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleCollapse, sidebarWidth }}>
      <div className="min-h-screen bg-background">
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          width={sidebarWidth}
          isHydrated={isHydrated}
        />
        <Header sidebarWidth={sidebarWidth} />
        <main
          className="pt-16"
          style={{
            marginLeft: `${sidebarWidth}px`,
            transition: isHydrated ? "margin-left 200ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
          }}
        >
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
