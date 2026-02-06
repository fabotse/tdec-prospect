/**
 * useDebounce and useDebouncedCallback Tests
 * Story 6.7: Inline Text Editing
 *
 * AC #3: Debounced Auto-Save
 * - Debounced callback delays execution by specified time
 * - Multiple calls within delay only execute once (last value)
 * - Flush immediately executes pending callback
 * - Cleanup on unmount flushes pending callback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce, useDebouncedCallback } from "@/hooks/use-debounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("debounces value changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "initial" } }
    );

    // Update value
    rerender({ value: "updated" });

    // Value should NOT be updated yet
    expect(result.current).toBe("initial");

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Now value should be updated
    expect(result.current).toBe("updated");
  });

  it("cancels previous timeout on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    // Rapid changes
    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "final" });

    // Still initial value
    expect(result.current).toBe("a");

    // Fast-forward full delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Only final value should be set
    expect(result.current).toBe("final");
  });
});

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays callback execution by specified time", () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [debouncedFn] = result.current;

    act(() => {
      debouncedFn("test");
    });

    // Callback should NOT be called yet
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward debounce delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Now callback should be called with correct args
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("test");
  });

  it("uses default delay of 500ms", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback));

    const [debouncedFn] = result.current;

    act(() => {
      debouncedFn("test");
    });

    // Not called at 400ms
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(callback).not.toHaveBeenCalled();

    // Called at 500ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("only executes once with last value on multiple calls within delay", () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [debouncedFn] = result.current;

    // Multiple rapid calls
    act(() => {
      debouncedFn("first");
      debouncedFn("second");
      debouncedFn("third");
      debouncedFn("last");
    });

    // Callback should NOT be called yet
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward debounce delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Callback should only be called once with last value
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("last");
  });

  it("flush immediately executes pending callback", () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [debouncedFn, flush] = result.current;

    act(() => {
      debouncedFn("pending value");
    });

    // Callback should NOT be called yet
    expect(callback).not.toHaveBeenCalled();

    // Call flush (simulates blur)
    act(() => {
      flush();
    });

    // Callback should be called immediately
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("pending value");
  });

  it("flush does nothing if no pending callback", () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [, flush] = result.current;

    // Call flush without any pending callback
    act(() => {
      flush();
    });

    // Callback should NOT be called
    expect(callback).not.toHaveBeenCalled();
  });

  it("flush clears pending timeout", () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [debouncedFn, flush] = result.current;

    act(() => {
      debouncedFn("value");
    });

    // Flush immediately
    act(() => {
      flush();
    });

    expect(callback).toHaveBeenCalledTimes(1);

    // Advance timers - should NOT call again
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cleanup on unmount flushes pending callback", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(callback, { delay: 500 })
    );

    const [debouncedFn] = result.current;

    act(() => {
      debouncedFn("pending on unmount");
    });

    // Callback should NOT be called yet
    expect(callback).not.toHaveBeenCalled();

    // Unmount the hook
    unmount();

    // Callback should be called with pending value (AC #3: navigate away before debounce completes)
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("pending on unmount");
  });

  it("callback ref stays updated", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, { delay: 500 }),
      { initialProps: { cb: callback1 } }
    );

    const [debouncedFn] = result.current;

    act(() => {
      debouncedFn("test");
    });

    // Update callback
    rerender({ cb: callback2 });

    // Fast-forward debounce delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // New callback should be called
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledWith("test");
  });

  it("supports multiple independent debounced callbacks", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { result: result1 } = renderHook(() =>
      useDebouncedCallback(callback1, { delay: 500 })
    );
    const { result: result2 } = renderHook(() =>
      useDebouncedCallback(callback2, { delay: 500 })
    );

    const [debouncedFn1] = result1.current;
    const [debouncedFn2] = result2.current;

    act(() => {
      debouncedFn1("subject");
      debouncedFn2("body");
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback1).toHaveBeenCalledWith("subject");
    expect(callback2).toHaveBeenCalledWith("body");
  });
});
