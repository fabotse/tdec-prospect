"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "theme";
const THEME_TRANSITION_CLASS = "theme-transition";
const TRANSITION_DURATION = 200;

// External store for theme state
let themeListeners: Array<() => void> = [];
let currentTheme: Theme = "dark";
let isInitialized = false;

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // localStorage not available
  }

  // Check system preference
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }

  return "dark";
}

function subscribeToTheme(callback: () => void) {
  themeListeners.push(callback);
  return () => {
    themeListeners = themeListeners.filter((l) => l !== callback);
  };
}

function getThemeSnapshot(): Theme {
  // Initialize on first call in browser
  if (typeof window !== "undefined" && !isInitialized) {
    currentTheme = getStoredTheme();
    isInitialized = true;
  }
  return currentTheme;
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function notifyThemeListeners() {
  themeListeners.forEach((listener) => listener());
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Reset initialization on unmount for HMR
  useEffect(() => {
    return () => {
      isInitialized = false;
    };
  }, []);

  // Use sync external store for theme state
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  const setTheme = useCallback((newTheme: Theme) => {
    const root = document.documentElement;

    // Add transition class for smooth theme switching
    root.classList.add(THEME_TRANSITION_CLASS);

    // Update classes
    if (newTheme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }

    // Persist to localStorage
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // localStorage not available
    }

    // Update external store
    currentTheme = newTheme;
    notifyThemeListeners();

    // Remove transition class after animation completes
    setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
    }, TRANSITION_DURATION);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  }, [setTheme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if no stored preference exists
      try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (!storedTheme) {
          setTheme(e.matches ? "dark" : "light");
        }
      } catch {
        setTheme(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [setTheme]);

  // Always render children - the inline script in layout.tsx already sets
  // the correct theme class before React hydrates, so there's no flash.
  // The theme value will be 'dark' on server (via getServerThemeSnapshot)
  // and will sync to the actual stored preference on client after mount.
  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
