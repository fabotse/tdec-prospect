/**
 * PremiumIcebreakerBadge Component
 * Story 6.5.7: Icebreaker Integration with Email Generation
 *
 * AC #3: Premium icebreaker indicator in preview
 * AC #6: Icebreaker source display with tooltip
 *
 * Shows a badge indicating premium icebreaker was used,
 * with tooltip showing the LinkedIn posts that inspired it.
 */

"use client";

import { Sparkles, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LinkedInPostSummary } from "@/types/email-block";

interface PremiumIcebreakerBadgeProps {
  /** LinkedIn posts that inspired the icebreaker */
  posts: LinkedInPostSummary[] | null;
  /** Optional className for styling */
  className?: string;
}

/**
 * Badge component showing premium icebreaker status
 *
 * AC #3: Shows "✨ Icebreaker Premium" badge
 * AC #6: Tooltip shows post text snippets (first 100 chars) and links
 *
 * @example
 * ```tsx
 * <PremiumIcebreakerBadge posts={lead.linkedinPostsCache?.posts} />
 * ```
 */
export function PremiumIcebreakerBadge({
  posts,
  className,
}: PremiumIcebreakerBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={`text-xs gap-1 cursor-default ${className || ""}`}
            data-testid="premium-icebreaker-badge"
          >
            <Sparkles className="h-3 w-3" />
            Icebreaker Premium
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm p-3"
          data-testid="premium-icebreaker-tooltip"
        >
          <p className="font-semibold text-xs mb-2">
            Baseado nos posts do LinkedIn:
          </p>
          {posts && posts.length > 0 ? (
            <div className="space-y-2">
              {posts.slice(0, 2).map((post, i) => (
                <div key={i} className="text-xs">
                  <p className="text-muted-foreground line-clamp-2">
                    &quot;{post.text.slice(0, 100)}
                    {post.text.length > 100 ? "..." : ""}&quot;
                  </p>
                  {post.postUrl && (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ver post original
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Posts do LinkedIn usados para gerar o icebreaker
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
