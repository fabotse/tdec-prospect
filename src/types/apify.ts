/**
 * Apify Types
 * Story: 6.5.2 - Apify LinkedIn Posts Service
 *
 * Types for Apify LinkedIn post scraping integration.
 * Actor: supreme_coder/linkedin-post (Wpp1BZ6yGWjySadk3)
 */

/**
 * Input for Apify LinkedIn Post actor
 * AC #2: Actor Call Parameters
 */
export interface ApifyLinkedInPostInput {
  urls: string[];
  limitPerSource: number;
  deepScrape: boolean;
  rawData: boolean;
}

/**
 * Single LinkedIn post from Apify actor
 * AC #3: Response Parsing - required fields
 */
export interface LinkedInPost {
  postUrl: string;
  text: string;
  publishedAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount?: number;
  authorName?: string;
  authorHeadline?: string;
}

/**
 * Apify actor run result
 * Used internally by the service
 */
export interface ApifyRunResult {
  id: string;
  status: string;
  defaultDatasetId: string;
  startedAt?: string;
  finishedAt?: string;
}

/**
 * Result of fetching LinkedIn posts
 * AC #3, #4: Response structure with error handling
 */
export interface FetchLinkedInPostsResult {
  success: boolean;
  posts: LinkedInPost[];
  error?: string;
  profileUrl: string;
  fetchedAt: string;
  /**
   * FEL-57: posicao (0-based) de cada item de `posts` no dataset BRUTO do actor, antes do
   * descarte de itens vazios. So no sucesso. Usado para reaproveitar os posts do dossie
   * apenas quando equivalem a uma busca com limite menor.
   */
  rawIndexes?: number[];
}
