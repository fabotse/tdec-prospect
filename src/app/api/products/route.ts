/**
 * Products API Routes
 * Story 6.4: Product Catalog CRUD
 *
 * AC: #2 - List products
 * AC: #4 - Create product
 * AC: #8 - Campaign usage count
 * AC: #9 - Data isolation via RLS
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  createProductSchema,
  transformProductRow,
  type ProductRow,
} from "@/types/product";

/**
 * GET /api/products
 * List all products for current tenant with campaign counts
 * AC: #2, #8 - View products with campaign usage indicator
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  // Query products with campaign count
  // Note: campaigns.product_id FK will be added in Story 6.5
  // For now, campaign_count will always be 0
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Products API] GET list error:", error);
    return NextResponse.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro ao buscar produtos" },
      },
      { status: 500 }
    );
  }

  // Transform rows to frontend model
  // Campaign count will be 0 until Story 6.5 adds the relationship
  const products = (data || []).map((row) =>
    transformProductRow({
      ...row,
      campaign_count: 0,
    } as ProductRow)
  );

  return NextResponse.json({ data: products });
}

/**
 * POST /api/products
 * Create a new product
 * AC: #4 - Save product to database
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Corpo da requisicao invalido",
        },
      },
      { status: 400 }
    );
  }
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Dados invalidos",
        },
      },
      { status: 400 }
    );
  }

  // Insert product
  const { data, error } = await supabase
    .from("products")
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      description: parsed.data.description,
      features: parsed.data.features,
      differentials: parsed.data.differentials,
      target_audience: parsed.data.targetAudience,
    })
    .select()
    .single();

  if (error) {
    console.error("[Products API] POST create error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar produto" } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: transformProductRow({
        ...data,
        campaign_count: 0,
      } as ProductRow),
    },
    { status: 201 }
  );
}
