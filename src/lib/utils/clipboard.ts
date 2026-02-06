/**
 * Clipboard Utilities
 * Story 4.3: Lead Detail View & Interaction History
 *
 * Shared utility for copying text to clipboard with fallback support.
 */

import { toast } from "sonner";

/**
 * Copy text to clipboard with toast feedback
 * Includes fallback for older browsers that don't support navigator.clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    toast.success("Copiado!");
  }
}
