/**
 * Story 24.18: fixtures do modo contas parecidas (3 bancos em SP, 201-1000 funcionarios).
 */

import { deriveReferenceProfile } from "@/lib/agent/reference-accounts";
import type { ReferenceCompany, ReferenceProfile, TargetAccount } from "@/types/agent";

export const REFERENCE_ACCOUNTS: TargetAccount[] = [
  { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
  { name: "Banco Y", domain: "bancoy.com.br", confidence: "high" },
  { name: "Seg Z", domain: "segz.com.br", confidence: "high" },
];

function bank(name: string, domain: string, employees: number, sizeBucket: string): ReferenceCompany {
  return {
    name,
    domain,
    industry: "banking",
    employees,
    sizeBucket,
    city: "Sao Paulo",
    state: "Sao Paulo",
    country: "Brazil",
    technologies: ["aws"],
  };
}

export const REFERENCE_COMPANIES: ReferenceCompany[] = [
  bank("Banco X", "bancox.com.br", 300, "201-500"),
  bank("Banco Y", "bancoy.com.br", 800, "501-1000"),
  bank("Seg Z", "segz.com.br", 450, "201-500"),
];

export function confidentReferenceProfile(): ReferenceProfile {
  return deriveReferenceProfile(REFERENCE_COMPANIES, 3).profile;
}
