/**
 * New Campaign Page
 * Story 5.7: Campaign Lead Association
 *
 * AC: #6 - Create new campaign and redirect to builder with pre-selected leads
 *
 * This page creates a new campaign with a default name and redirects
 * to the builder. If leads query param is present, it passes them along.
 */

"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Create campaign via API
 */
async function createCampaign(name: string): Promise<string | null> {
  try {
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data.id;
  } catch (error) {
    console.error("[New Campaign] Create error:", error);
    throw error;
  }
}

/**
 * New Campaign Page - Creates campaign and redirects to builder
 */
export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasCreated = useRef(false);

  useEffect(() => {
    // Prevent double creation in strict mode
    if (hasCreated.current) return;
    hasCreated.current = true;

    const createAndRedirect = async () => {
      try {
        // Generate default name with timestamp
        const now = new Date();
        const defaultName = `Nova Campanha ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

        // Create campaign
        const campaignId = await createCampaign(defaultName);

        if (!campaignId) {
          toast.error("Erro ao criar campanha");
          router.push("/campaigns");
          return;
        }

        // Build redirect URL with leads if present
        const leadsParam = searchParams.get("leadIds") || searchParams.get("leads");
        let redirectUrl = `/campaigns/${campaignId}/edit`;

        if (leadsParam) {
          redirectUrl += `?leads=${leadsParam}`;
        }

        // Redirect to builder
        router.replace(redirectUrl);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao criar campanha"
        );
        router.push("/campaigns");
      }
    };

    createAndRedirect();
  }, [router, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Criando campanha...</p>
      </div>
    </div>
  );
}
