/**
 * Apify Service
 * Story: 6.5.1 - Apify Integration Configuration
 * Story: 6.5.2 - Apify LinkedIn Posts Service
 *
 * Apify API integration for LinkedIn post extraction (icebreaker generation).
 * Uses /acts/{actorId} endpoint for connection testing.
 * Uses ApifyClient for actor runs (LinkedIn post scraping).
 *
 * API Docs: https://docs.apify.com/api/v2
 */

import { ApifyClient } from "apify-client";
import {
  ExternalService,
  ExternalServiceError,
  ERROR_MESSAGES,
  type TestConnectionResult,
} from "./base-service";
import type {
  LinkedInPost,
  FetchLinkedInPostsResult,
  ApifyLinkedInPostInput,
} from "@/types/apify";

// ==============================================
// CONSTANTS
// ==============================================

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_LINKEDIN_ACTOR_ID = "Wpp1BZ6yGWjySadk3"; // supreme_coder/linkedin-post
const APIFY_ACTOR_TIMEOUT_SECS = 60; // AC #2: 60 seconds timeout for actor runs
const DEFAULT_POSTS_LIMIT = 3; // AC #2: default limitPerSource

// ==============================================
// ERROR MESSAGES (PORTUGUESE) - AC #4
// ==============================================

export const APIFY_ERROR_MESSAGES = {
  PROFILE_NOT_FOUND: "Perfil nao encontrado",
  NO_PUBLIC_POSTS: "Nenhum post publico encontrado",
  INVALID_URL: "URL do LinkedIn invalida",
  INVALID_API_KEY: "API key do Apify invalida ou vazia",
  ACTOR_TIMEOUT: "Tempo limite excedido ao buscar posts. Tente novamente.",
  ACTOR_FAILURE: "Erro ao executar busca de posts no Apify",
  GENERIC_ERROR: "Erro ao buscar posts do LinkedIn",
} as const;

// ==============================================
// APIFY SERVICE
// ==============================================

/**
 * Apify API service
 * Used for LinkedIn post extraction for icebreaker generation
 *
 * Authentication: Token parameter in query string or Bearer token
 */
export class ApifyService extends ExternalService {
  readonly name = "apify";

  /**
   * Test connection to Apify API
   * Uses the actor info endpoint to verify API token validity
   *
   * @param apiKey - Apify API token
   * @returns TestConnectionResult with success/failure and latency
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      // Apify API uses token in query string
      const url = `${APIFY_API_BASE}/acts/${APIFY_LINKEDIN_ACTOR_ID}?token=${encodeURIComponent(apiKey)}`;

      await this.request<ApifyActorResponse>(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Apify")
      );
    }
  }

  /**
   * Fetch recent LinkedIn posts from a profile
   * Story 6.5.2: AC #1-#4
   *
   * @param apiKey - Apify API token
   * @param linkedinUrl - LinkedIn profile URL
   * @param limit - Number of posts to fetch (default: 3)
   * @returns FetchLinkedInPostsResult with posts array or error
   */
  async fetchLinkedInPosts(
    apiKey: string,
    linkedinUrl: string,
    limit: number = DEFAULT_POSTS_LIMIT
  ): Promise<FetchLinkedInPostsResult> {
    const fetchedAt = new Date().toISOString();

    // Validate API key is not empty
    if (!apiKey || apiKey.trim() === "") {
      return {
        success: false,
        posts: [],
        error: APIFY_ERROR_MESSAGES.INVALID_API_KEY,
        profileUrl: linkedinUrl,
        fetchedAt,
      };
    }

    // AC #4: Validate LinkedIn URL format
    if (!this.isValidLinkedInUrl(linkedinUrl)) {
      return {
        success: false,
        posts: [],
        error: APIFY_ERROR_MESSAGES.INVALID_URL,
        profileUrl: linkedinUrl,
        fetchedAt,
      };
    }

    try {
      // AC #1: Use ApifyClient with tenant's API token
      const client = new ApifyClient({ token: apiKey });

      // AC #2: Actor call parameters
      const input: ApifyLinkedInPostInput = {
        urls: [linkedinUrl],
        limitPerSource: limit,
        deepScrape: true,
        rawData: false,
      };

      // AC #2: Run actor and wait for completion (60s timeout)
      const run = await client.actor(APIFY_LINKEDIN_ACTOR_ID).call(input, {
        waitSecs: APIFY_ACTOR_TIMEOUT_SECS,
      });

      // Check if actor run failed
      if (run.status === "FAILED" || run.status === "ABORTED") {
        return {
          success: false,
          posts: [],
          error: APIFY_ERROR_MESSAGES.ACTOR_FAILURE,
          profileUrl: linkedinUrl,
          fetchedAt,
        };
      }

      // Check for timeout (actor still running)
      if (run.status === "RUNNING" || run.status === "READY") {
        return {
          success: false,
          posts: [],
          error: APIFY_ERROR_MESSAGES.ACTOR_TIMEOUT,
          profileUrl: linkedinUrl,
          fetchedAt,
        };
      }

      // AC #2: Fetch results from dataset
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      // AC #3: Parse results to LinkedInPost array
      const posts = this.parseLinkedInPosts(items);

      // AC #3: Empty results return empty array (not error)
      return {
        success: true,
        posts,
        profileUrl: linkedinUrl,
        fetchedAt,
      };
    } catch (error) {
      // AC #4: Handle specific error scenarios
      const errorMessage = this.getLinkedInPostsErrorMessage(error);

      return {
        success: false,
        posts: [],
        error: errorMessage,
        profileUrl: linkedinUrl,
        fetchedAt,
      };
    }
  }

  /**
   * Validate LinkedIn profile URL format
   * AC #4: Invalid URL validation
   * Accepts: /in/username or /company/name with at least one character
   */
  private isValidLinkedInUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes("linkedin.com")) {
        return false;
      }
      // Match /in/username or /company/name with at least one alphanumeric character
      const profilePattern = /^\/in\/[a-zA-Z0-9][\w-]*\/?$/;
      const companyPattern = /^\/company\/[a-zA-Z0-9][\w-]*\/?$/;
      return profilePattern.test(parsed.pathname) || companyPattern.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  /**
   * Safely parse a value to integer, returning 0 for NaN/invalid values
   */
  private safeParseInt(value: unknown): number {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : Math.floor(num);
  }

  /**
   * Parse Apify actor results to LinkedInPost array
   * AC #3: Response parsing with type safety
   */
  private parseLinkedInPosts(items: unknown[]): LinkedInPost[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item): item is Record<string, unknown> => {
        return item !== null && typeof item === "object";
      })
      .map((item) => ({
        postUrl: String(item.postUrl ?? item.url ?? ""),
        text: String(item.text ?? item.content ?? ""),
        publishedAt: String(item.publishedAt ?? item.postedAt ?? ""),
        likesCount: this.safeParseInt(item.likesCount ?? item.likes),
        commentsCount: this.safeParseInt(item.commentsCount ?? item.comments),
        repostsCount: item.repostsCount !== undefined ? this.safeParseInt(item.repostsCount) : undefined,
        authorName: item.authorName !== undefined ? String(item.authorName) : undefined,
        authorHeadline: item.authorHeadline !== undefined ? String(item.authorHeadline) : undefined,
      }))
      .filter((post) => post.postUrl || post.text); // Filter out empty posts
  }

  /**
   * Get Portuguese error message from error
   * AC #4: Error handling with specific messages
   */
  private getLinkedInPostsErrorMessage(error: unknown): string {
    const errorStr = String(error);

    // Check for no public posts
    if (
      errorStr.toLowerCase().includes("no posts") ||
      errorStr.toLowerCase().includes("no public") ||
      errorStr.toLowerCase().includes("private profile")
    ) {
      return APIFY_ERROR_MESSAGES.NO_PUBLIC_POSTS;
    }

    // Check for profile not found
    if (
      errorStr.toLowerCase().includes("not found") ||
      errorStr.toLowerCase().includes("404") ||
      errorStr.toLowerCase().includes("profile")
    ) {
      return APIFY_ERROR_MESSAGES.PROFILE_NOT_FOUND;
    }

    // Check for timeout
    if (
      errorStr.toLowerCase().includes("timeout") ||
      errorStr.toLowerCase().includes("timed out") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return APIFY_ERROR_MESSAGES.ACTOR_TIMEOUT;
    }

    // Check for rate limiting
    if (errorStr.includes("429") || errorStr.toLowerCase().includes("rate")) {
      return ERROR_MESSAGES.RATE_LIMITED;
    }

    // Check for auth errors
    if (errorStr.includes("401") || errorStr.includes("403")) {
      return ERROR_MESSAGES.UNAUTHORIZED;
    }

    return APIFY_ERROR_MESSAGES.GENERIC_ERROR;
  }
}

// ==============================================
// APIFY API TYPES
// ==============================================

/**
 * Response from Apify Actor Info endpoint
 * Used for connection testing and will be reused in Story 6.5.2 for post fetching
 */
export interface ApifyActorResponse {
  data: {
    id: string;
    name: string;
    isPublic: boolean;
    title?: string;
    description?: string;
  };
}
