/**
 * Product API Route - Single Product
 * Story 6.4: Product Catalog CRUD
 *
 * GET /api/products/[productId] - Get single product
 * PATCH /api/products/[productId] - Update product
 * DELETE /api/products/[productId] - Delete product
 *
 * AC: #5 - Edit product
 * AC: #6 - Delete product
 * AC: #8 - Campaign usage count
 * AC: #9 - Data isolation via RLS
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  updateProductSchema,
  transformProductRow,
  type ProductRow,
} from "@/types/product";

interface RouteParams {
  params: Promise<{ productId: string }>;
}

// UUID validation schema
const uuidSchema = z.string().uuid("ID de produto invalido");

/**
 * GET /api/products/[productId]
 * Get a single product with campaign count
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { productId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(productId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de produto invalido" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Produto nao encontrado" } },
        { status: 404 }
      );
    }
    console.error("[Products API] GET error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar produto" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: transformProductRow({
      ...data,
      campaign_count: 0, // Will be populated in Story 6.5
    } as ProductRow),
  });
}

/**
 * PATCH /api/products/[productId]
 * Update product fields
 * AC: #5 - Edit product with pre-filled form
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { productId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(productId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de produto invalido" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

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

  const parsed = updateProductSchema.safeParse(body);
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

  // Build update object (only include provided fields)
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updateData.description = parsed.data.description;
  if (parsed.data.features !== undefined)
    updateData.features = parsed.data.features;
  if (parsed.data.differentials !== undefined)
    updateData.differentials = parsed.data.differentials;
  if (parsed.data.targetAudience !== undefined)
    updateData.target_audience = parsed.data.targetAudience;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nenhum campo para atualizar" } },
      { status: 400 }
    );
  }

  // Update product
  const { data, error } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", productId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Produto nao encontrado" } },
        { status: 404 }
      );
    }
    console.error("[Products API] PATCH error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar produto" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: transformProductRow({
      ...data,
      campaign_count: 0,
    } as ProductRow),
  });
}

/**
 * DELETE /api/products/[productId]
 * Delete a product
 * AC: #6 - Delete product with confirmation
 * AC: #8 - Warning if product is in use (handled client-side)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { productId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(productId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de produto invalido" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // RLS handles authorization - user can only delete their tenant's products
  // Use select() to verify if a row was actually deleted
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[Products API] DELETE error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao remover produto" } },
      { status: 500 }
    );
  }

  // If no row was deleted, product doesn't exist or RLS blocked access
  if (!data) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Produto nao encontrado" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: { deleted: true } });
}
