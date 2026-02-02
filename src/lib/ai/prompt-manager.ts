/**
 * Prompt Manager
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * Centralized prompt management with 3-level fallback (ADR-001).
 * AC: #2 - getPrompt with fallback, renderPrompt, caching
 */

import { createClient } from "@/lib/supabase/server";
import type {
  AIPrompt,
  AIPromptRow,
  RenderedPrompt,
  GetPromptOptions,
  CachedPrompt,
  PromptSource,
  PromptKey,
  AIPromptMetadata,
} from "@/types/ai-prompt";
import { toAIPrompt } from "@/types/ai-prompt";
import { CODE_DEFAULT_PROMPTS } from "./prompts/defaults";

// ==============================================
// CONSTANTS
// ==============================================

/** Cache TTL in milliseconds (5 minutes per AC #2) */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ==============================================
// PROMPT MANAGER
// ==============================================

/**
 * PromptManager - Centralized prompt management
 *
 * 3-level fallback (ADR-001):
 * 1. Tenant-specific prompt (tenant_id = current_tenant)
 * 2. Global prompt (tenant_id IS NULL)
 * 3. Code default (hardcoded in src/lib/ai/prompts/)
 */
export class PromptManager {
  private cache: Map<string, CachedPrompt> = new Map();

  /**
   * Get a prompt by key with 3-level fallback
   * AC: #2 - Fallback logic
   *
   * @param key - Prompt key (e.g., "email_subject_generation")
   * @param options - Options for tenant ID and cache
   * @returns AIPrompt or null if not found at any level
   */
  async getPrompt(
    key: PromptKey,
    options?: GetPromptOptions
  ): Promise<{ prompt: AIPrompt | null; source: PromptSource }> {
    const { tenantId, skipCache = false } = options ?? {};

    // Check cache first
    const cacheKey = this.getCacheKey(key, tenantId);
    if (!skipCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return { prompt: cached.prompt, source: cached.source };
      }
    }

    // Level 1: Try tenant-specific prompt
    if (tenantId) {
      const tenantPrompt = await this.fetchPromptFromDB(key, tenantId);
      if (tenantPrompt) {
        this.setCache(cacheKey, tenantPrompt, "tenant");
        return { prompt: tenantPrompt, source: "tenant" };
      }
    }

    // Level 2: Try global prompt
    const globalPrompt = await this.fetchPromptFromDB(key, null);
    if (globalPrompt) {
      this.setCache(cacheKey, globalPrompt, "global");
      return { prompt: globalPrompt, source: "global" };
    }

    // Level 3: Fall back to code default
    const codeDefault = this.getCodeDefault(key);
    if (codeDefault) {
      this.setCache(cacheKey, codeDefault, "default");
      return { prompt: codeDefault, source: "default" };
    }

    // No prompt found at any level
    this.setCache(cacheKey, null, "default");
    return { prompt: null, source: "default" };
  }

  /**
   * Render a prompt with variable interpolation
   * AC: #2 - Template interpolation
   *
   * @param key - Prompt key
   * @param variables - Variables to interpolate (e.g., { lead_name: "João" })
   * @param options - Options for tenant ID and cache
   * @returns RenderedPrompt with content and metadata
   */
  async renderPrompt(
    key: PromptKey,
    variables: Record<string, string>,
    options?: GetPromptOptions
  ): Promise<RenderedPrompt | null> {
    const { prompt, source } = await this.getPrompt(key, options);

    if (!prompt) {
      return null;
    }

    // Interpolate variables using {{variable}} pattern
    const content = this.interpolateTemplate(
      prompt.promptTemplate,
      variables
    );

    return {
      content,
      modelPreference: prompt.modelPreference,
      metadata: prompt.metadata,
      source,
    };
  }

  /**
   * Clear the cache (useful for testing or admin actions)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific prompt
   */
  clearCacheForPrompt(key: PromptKey, tenantId?: string): void {
    const cacheKey = this.getCacheKey(key, tenantId);
    this.cache.delete(cacheKey);
    // Also clear the tenant-agnostic cache if tenant was specified
    if (tenantId) {
      this.cache.delete(this.getCacheKey(key, undefined));
    }
  }

  // ==============================================
  // PRIVATE METHODS
  // ==============================================

  /**
   * Fetch prompt from database
   */
  private async fetchPromptFromDB(
    key: string,
    tenantId: string | null
  ): Promise<AIPrompt | null> {
    try {
      const supabase = await createClient();

      let query = supabase
        .from("ai_prompts")
        .select("*")
        .eq("prompt_key", key)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1);

      // Handle tenant_id condition
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[PromptManager] fetchPromptFromDB error:", error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      return toAIPrompt(data[0] as AIPromptRow);
    } catch (error) {
      // Silently fail and fall back to code defaults - this is expected in tests
      // and during initial setup when DB might not be available
      if (process.env.NODE_ENV === "development") {
        console.error("[PromptManager] fetchPromptFromDB exception:", error);
      }
      return null;
    }
  }

  /**
   * Get code default prompt
   */
  private getCodeDefault(key: PromptKey): AIPrompt | null {
    const defaultPrompt = CODE_DEFAULT_PROMPTS[key];
    if (!defaultPrompt) {
      return null;
    }

    // Create a synthetic AIPrompt from code default
    return {
      id: `default-${key}`,
      tenantId: null,
      promptKey: key,
      promptTemplate: defaultPrompt.template,
      modelPreference: defaultPrompt.modelPreference ?? null,
      version: 0,
      isActive: true,
      metadata: defaultPrompt.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
    };
  }

  /**
   * Interpolate template variables
   * Replaces {{variable}} with values from the variables object
   */
  private interpolateTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] ?? match;
    });
  }

  /**
   * Generate cache key
   */
  private getCacheKey(key: string, tenantId?: string): string {
    return tenantId ? `${tenantId}:${key}` : `global:${key}`;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(cacheKey: string): CachedPrompt | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * Set cache entry
   */
  private setCache(
    cacheKey: string,
    prompt: AIPrompt | null,
    source: PromptSource
  ): void {
    this.cache.set(cacheKey, {
      prompt,
      fetchedAt: Date.now(),
      source,
    });
  }
}

// ==============================================
// SINGLETON INSTANCE
// ==============================================

/** Singleton instance for use across the application */
export const promptManager = new PromptManager();
