/**
 * AutoResizeTextarea Component
 * Story 6.7: Inline Text Editing
 *
 * AC #4: Auto-Expanding Textarea
 * - Textarea automatically expands to fit content
 * - Minimum height: 100px
 * - Maximum height: 400px
 * - Scrollbar appears only when content exceeds max height
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
  maxHeight?: number;
}

const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ className, minHeight = 100, maxHeight = 400, onChange, value, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const combinedRef = useCombinedRef(ref, textareaRef);

  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = "auto";

    // Calculate new height within bounds
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight
    );

    textarea.style.height = `${newHeight}px`;

    // Show scrollbar only when content exceeds max height (AC #4)
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minHeight, maxHeight]);

  // Adjust on value change and mount (M2 fix: single effect instead of two)
  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    onChange?.(e);
  };

  return (
    <textarea
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={combinedRef}
      value={value}
      onChange={handleChange}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        resize: "none",
      }}
      {...props}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";

/**
 * Helper to combine multiple refs into one (M1 fix: stable callback)
 */
function useCombinedRef<T>(
  ref1: React.Ref<T> | null | undefined,
  ref2: React.Ref<T> | null | undefined
): React.RefCallback<T> {
  return React.useCallback(
    (element: T) => {
      [ref1, ref2].forEach((ref) => {
        if (!ref) return;
        if (typeof ref === "function") {
          ref(element);
        } else {
          (ref as React.MutableRefObject<T>).current = element;
        }
      });
    },
    [ref1, ref2]
  );
}

export { AutoResizeTextarea };
