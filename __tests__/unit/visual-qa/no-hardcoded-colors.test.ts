/**
 * No Hardcoded Colors Test
 * Story 8.5: Visual QA & Contrast Review
 *
 * AC #4: Cores hardcoded de blue/amber substituidas por CSS variables
 *
 * Grep scan that fails if blue-500 or amber-500 appear in component files.
 * Status colors (green-500, yellow-500, red-500) are ACCEPTABLE and excluded.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Recursively collect all .tsx files from a directory
 */
function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...collectTsxFiles(fullPath));
      } else if (entry.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return files;
}

// Banned color patterns in the B&W theme
const BANNED_PATTERNS = [
  /\bblue-\d{3}\b/,
  /\bamber-\d{3}\b/,
  /\bpurple-\d{3}\b/,
  /\bindigo-\d{3}\b/,
  /\bviolet-\d{3}\b/,
  /\bteal-\d{3}\b/,
  /\bcyan-\d{3}\b/,
  /\bpink-\d{3}\b/,
  /\brose-\d{3}\b/,
  /\bfuchsia-\d{3}\b/,
  /\blime-\d{3}\b/,
  /\bemerald-\d{3}\b/,
  /\bsky-\d{3}\b/,
  /\borange-\d{3}\b/,
];

const COMPONENT_DIRS = [
  join(process.cwd(), "src", "components", "builder"),
  join(process.cwd(), "src", "components", "campaigns"),
  join(process.cwd(), "src", "components", "leads"),
  join(process.cwd(), "src", "components", "products"),
  join(process.cwd(), "src", "components", "settings"),
  join(process.cwd(), "src", "components", "search"),
  join(process.cwd(), "src", "components", "ui"),
  join(process.cwd(), "src", "app"),
];

describe("No Hardcoded Colors in Components (Story 8.5 AC #4)", () => {
  const allFiles: string[] = [];
  for (const dir of COMPONENT_DIRS) {
    allFiles.push(...collectTsxFiles(dir));
  }

  it("should find component files to scan", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  it("no component files contain banned color classes (blue, amber, purple, indigo, etc.)", () => {
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment-only lines
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

        for (const pattern of BANNED_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            // Extract relative path for readability
            const relativePath = filePath.replace(process.cwd(), "").replace(/\\/g, "/");
            violations.push({
              file: relativePath,
              line: i + 1,
              match: match[0],
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.match}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} banned hardcoded color(s) in components:\n${report}`
      );
    }
  });
});
