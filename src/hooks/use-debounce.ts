/**
 * Debounce Hook
 * Story 4.2.2: My Leads Page
 * Story 6.7: Inline Text Editing
 *
 * AC 4.2.2 #3 - Debounced search input for filtering
 * AC 6.7 #3 - Debounced auto-save with flush on blur
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Debounces a value by delaying updates until after a specified delay.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface UseDebouncedCallbackOptions {
  delay?: number;
}

/**
 * Story 6.7: Inline Text Editing - AC #3
 *
 * Returns a debounced version of the callback that delays execution
 * and a flush function to immediately execute pending callback.
 *
 * Features:
 * - Configurable delay (default 500ms)
 * - Flush function for immediate execution (e.g., on blur)
 * - Cleanup on unmount flushes pending callback to prevent data loss
 *
 * @param callback - The function to debounce
 * @param options - Configuration options
 * @returns Tuple of [debouncedCallback, flushFunction]
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  options: UseDebouncedCallbackOptions = {}
): [T, () => void] {
  const { delay = 500 } = options;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount - flush pending callback to prevent data loss
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Flush pending callback on unmount (AC #3: navigate away before debounce completes)
        if (pendingArgsRef.current) {
          callbackRef.current(...pendingArgsRef.current);
        }
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      pendingArgsRef.current = args;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        pendingArgsRef.current = null;
      }, delay);
    },
    [delay]
  ) as T;

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingArgsRef.current) {
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  return [debouncedCallback, flush];
}
