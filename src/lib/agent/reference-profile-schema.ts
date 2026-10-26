/**
 * reference-profile-schema.ts — schemas zod do modo contas parecidas (Story 24.18).
 *
 * Fonte única do formato aceito em `/parse` (perfil atual vindo do hook) e no PATCH
 * `/briefing` (armadilha do strip: sem declarar, o PATCH descartaria referências e perfil).
 */

import { z } from "zod";
import { DOMAIN_REGEX, TARGET_ACCOUNT_NAME_MAX } from "@/lib/agent/target-accounts";
import { REFERENCE_MAX, REFERENCE_SIZE_BUCKETS } from "@/lib/agent/reference-accounts";

const shortText = z.string().max(200);

export const referenceCompanySchema = z.object({
  name: z.string().max(TARGET_ACCOUNT_NAME_MAX).nullable(),
  domain: z.string().regex(DOMAIN_REGEX),
  industry: shortText.nullable(),
  employees: z.number().int().min(0).nullable(),
  sizeBucket: z.enum(REFERENCE_SIZE_BUCKETS).nullable(),
  city: shortText.nullable(),
  state: shortText.nullable(),
  country: shortText.nullable(),
  technologies: z.array(shortText).max(200),
});

export const referenceProfileSchema = z.object({
  sourceDomains: z.array(z.string().regex(DOMAIN_REGEX)).max(REFERENCE_MAX),
  companies: z.array(referenceCompanySchema).max(REFERENCE_MAX),
  industries: z.array(shortText).max(10),
  // Vai verbatim para a Apollo: so faixas canonicas.
  companySizes: z.array(z.enum(REFERENCE_SIZE_BUCKETS)).max(10),
  locations: z.array(shortText).max(10),
  technologies: z.array(shortText).max(10),
  creditsUsed: z.number().int().min(0).max(REFERENCE_MAX),
});

export const referenceAccountsSchema = z
  .array(
    z.object({
      name: z.string().max(TARGET_ACCOUNT_NAME_MAX).nullable(),
      domain: z.string().regex(DOMAIN_REGEX).nullable(),
      confidence: z.enum(["high", "low"]),
    })
  )
  .max(REFERENCE_MAX);
