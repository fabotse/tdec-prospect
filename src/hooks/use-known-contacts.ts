"use client";

/**
 * Known Contacts Hook
 * Story: 25.1 - Contatos conhecidos
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getKnownContacts,
  addKnownContact,
  updateKnownContact,
  removeKnownContact,
  importKnownContacts,
  addKnownContactFromOpportunity,
  findKnownContactLinkedin,
} from "@/actions/known-contacts";
import type { ActionResult } from "@/types/knowledge-base";
import type {
  KnownContact,
  KnownContactImportReport,
  KnownContactImportRow,
  KnownContactInput,
  LinkedinCandidate,
  LinkedinLookupInput,
} from "@/types/known-contact";

export const KNOWN_CONTACTS_QUERY_KEY = ["known-contacts"];

export function useKnownContacts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KNOWN_CONTACTS_QUERY_KEY,
    queryFn: async () => {
      const result = await getKnownContacts();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data ?? [];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KNOWN_CONTACTS_QUERY_KEY });

  const addMutation = useMutation({
    mutationFn: (input: KnownContactInput): Promise<ActionResult<KnownContact>> =>
      addKnownContact(input),
    onSuccess: (result) => {
      if (result.success) invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: KnownContactInput;
    }): Promise<ActionResult<KnownContact>> => updateKnownContact(id, input),
    onSuccess: (result) => {
      if (result.success) invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string): Promise<ActionResult<void>> => removeKnownContact(id),
    onSuccess: (result, id) => {
      if (result.success) {
        queryClient.setQueryData<KnownContact[]>(KNOWN_CONTACTS_QUERY_KEY, (old) =>
          old?.filter((c) => c.id !== id) ?? []
        );
        invalidate();
      }
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: KnownContactImportRow[]): Promise<ActionResult<KnownContactImportReport>> =>
      importKnownContacts(rows),
    // Sempre: um import parcial (chunk falhou depois de outros gravados) muda a tabela.
    onSettled: () => {
      invalidate();
    },
  });

  const lookupMutation = useMutation({
    mutationFn: (
      input: LinkedinLookupInput
    ): Promise<ActionResult<{ candidates: LinkedinCandidate[] }>> =>
      findKnownContactLinkedin(input),
  });

  return {
    contacts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    addContact: addMutation.mutateAsync,
    updateContact: (id: string, input: KnownContactInput) =>
      updateMutation.mutateAsync({ id, input }),
    removeContact: removeMutation.mutateAsync,
    importContacts: importMutation.mutateAsync,
    findLinkedin: lookupMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isImporting: importMutation.isPending,
    isLookingUp: lookupMutation.isPending,
  };
}

/**
 * 1 clique do card de oportunidade (Story 25.1). Não precisa da lista carregada:
 * só invalida a query dos contatos para a página do Radar refletir.
 */
export function useAddKnownContactFromOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      opportunityId: string
    ): Promise<ActionResult<{ alreadyKnown: boolean; contact?: KnownContact }>> =>
      addKnownContactFromOpportunity(opportunityId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: KNOWN_CONTACTS_QUERY_KEY });
      }
    },
  });
}
