import type { AxeResults } from "axe-core";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
}

export {};
