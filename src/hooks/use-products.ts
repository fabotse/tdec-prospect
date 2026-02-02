/**
 * Products Hook
 * Story 6.4: Product Catalog CRUD
 *
 * AC: #2 - List products
 * AC: #4 - Create product
 * AC: #5 - Edit product
 * AC: #6 - Delete product
 *
 * TanStack Query hooks for managing products server state.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
} from "@/types/product";

const PRODUCTS_KEY = ["products"];

interface ApiError {
  code: string;
  message: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

/**
 * Fetch all products for current tenant
 */
async function fetchProducts(): Promise<Product[]> {
  const response = await fetch("/api/products");
  const result: ApiResponse<Product[]> = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar produtos");
  }
  return result.data || [];
}

/**
 * Create a new product
 */
async function createProduct(input: CreateProductInput): Promise<Product> {
  const response = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result: ApiResponse<Product> = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao criar produto");
  }
  return result.data!;
}

/**
 * Update a product
 */
async function updateProduct(
  productId: string,
  input: UpdateProductInput
): Promise<Product> {
  const response = await fetch(`/api/products/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result: ApiResponse<Product> = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao atualizar produto");
  }
  return result.data!;
}

/**
 * Delete a product
 */
async function deleteProduct(productId: string): Promise<void> {
  const response = await fetch(`/api/products/${productId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json();
    throw new Error(result.error?.message || "Erro ao remover produto");
  }
}

/**
 * Hook to fetch products list
 * AC: #2 - View products in cards format
 */
export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: fetchProducts,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to create a new product
 * AC: #4 - Save product with success notification
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

/**
 * Hook to update a product
 * AC: #5 - Edit product with pre-filled form
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: UpdateProductInput }) =>
      updateProduct(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

/**
 * Hook to delete a product
 * AC: #6 - Delete product with confirmation
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}
