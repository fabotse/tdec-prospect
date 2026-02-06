/**
 * Sending Account Selector Component
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 * AC: #4 - Sending account selection for Instantly export
 */

"use client";

import { Loader2, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { InstantlyAccountItem } from "@/types/instantly";

interface SendingAccountSelectorProps {
  accounts: InstantlyAccountItem[];
  selectedAccounts: string[];
  onSelectionChange: (selected: string[]) => void;
  isLoading: boolean;
}

/**
 * Multi-select list of Instantly sending accounts
 * AC: #4 - Select one or more sending accounts for campaign export
 */
export function SendingAccountSelector({
  accounts,
  selectedAccounts,
  onSelectionChange,
  isLoading,
}: SendingAccountSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground" data-testid="sending-accounts-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando contas de envio...</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="py-4 text-sm text-muted-foreground" data-testid="sending-accounts-empty">
        Nenhuma conta de envio encontrada. Configure no Instantly primeiro.
      </div>
    );
  }

  function handleToggle(email: string) {
    const isSelected = selectedAccounts.includes(email);
    if (isSelected) {
      onSelectionChange(selectedAccounts.filter((e) => e !== email));
    } else {
      onSelectionChange([...selectedAccounts, email]);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="sending-accounts-list">
      <span className="text-sm font-medium">Contas de envio</span>
      {accounts.map((account) => (
        <label
          key={account.email}
          className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
        >
          <Checkbox
            checked={selectedAccounts.includes(account.email)}
            onCheckedChange={() => handleToggle(account.email)}
          />
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{account.email}</span>
        </label>
      ))}
    </div>
  );
}
