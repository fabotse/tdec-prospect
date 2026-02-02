/**
 * Saved Filter Delete API Route
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #4 - Delete saved filter
 * AC: #6 - RLS for tenant isolation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ filterId: string }>;
}

/**
 * DELETE /api/filters/saved/[filterId]
 * Delete a saved filter
 * AC: #4 - Delete saved filter with confirmation
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { filterId } = await params;
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // RLS handles authorization - user can only delete their own filters
  const { error } = await supabase
    .from("saved_filters")
    .delete()
    .eq("id", filterId);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao remover filtro" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
