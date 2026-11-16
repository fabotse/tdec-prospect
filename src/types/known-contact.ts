/**
 * Known contacts types
 * Story: 25.1 - Contatos conhecidos
 */

import { z } from "zod";

export const KNOWN_CONTACT_RELATIONS = [
  "cliente_atual",
  "ex_cliente",
  "parceiro",
  "reuniao_marcada",
] as const;
export type KnownContactRelation = (typeof KNOWN_CONTACT_RELATIONS)[number];

export const KNOWN_CONTACT_SOURCES = ["manual", "import_csv", "oportunidade"] as const;
export type KnownContactSource = (typeof KNOWN_CONTACT_SOURCES)[number];

export const KNOWN_CONTACT_RELATION_LABELS: Record<KnownContactRelation, string> = {
  cliente_atual: "Cliente atual",
  ex_cliente: "Ex-cliente",
  parceiro: "Parceiro",
  reuniao_marcada: "Reunião marcada",
};

export const KNOWN_CONTACT_SOURCE_LABELS: Record<KnownContactSource, string> = {
  manual: "Manual",
  import_csv: "Import CSV",
  oportunidade: "Oportunidade",
};

/** Linha da tabela `known_contacts` (migration 00075). */
export interface KnownContact {
  id: string;
  tenant_id: string;
  full_name: string;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  relation_type: KnownContactRelation;
  source: KnownContactSource;
  lead_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullish()
    .transform((v) => v ?? "");

/** Entrada manual (adicionar/editar). Normalizada de novo no servidor. */
export const knownContactInputSchema = z.object({
  fullName: z.string().trim().min(1, "Informe o nome").max(200, "Nome muito longo"),
  title: optionalText(200, "Cargo muito longo"),
  companyName: optionalText(200, "Empresa muito longa"),
  companyDomain: optionalText(320, "Domínio muito longo"),
  linkedinUrl: optionalText(500, "URL do LinkedIn muito longa"),
  relationType: z.enum(KNOWN_CONTACT_RELATIONS, { message: "Relação inválida" }),
});

export type KnownContactInput = z.input<typeof knownContactInputSchema>;

/** Contato pronto para gravar (já normalizado). */
export interface NormalizedKnownContact {
  full_name: string;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  relation_type: KnownContactRelation;
}

/** Linha de CSV já lida no cliente (normalizada de novo no servidor). */
export interface KnownContactImportRow {
  /** Nº da linha no arquivo (cabeçalho = 1). */
  line: number;
  fullName: string;
  title: string;
  companyName: string;
  companyDomain: string;
  linkedinUrl: string;
  relation: string;
}

export interface KnownContactImportSkipped {
  line: number;
  value: string;
  reason: string;
}

export interface KnownContactImportReport {
  accepted: number;
  skipped: KnownContactImportSkipped[];
}

/**
 * Máximo de linhas por import. 2000 (e não 5000 como a supressão): cada linha leva
 * nome/cargo/empresa/domínio/LinkedIn e o corpo da Server Action tem limite de 1 MB.
 */
export const KNOWN_CONTACTS_IMPORT_MAX_ROWS = 2000;

/** Mensagens de validação (cadastro manual e relatório do import). */
export const KNOWN_CONTACT_ERRORS = {
  missingName: "Informe o nome",
  missingCompany: "Informe a empresa ou o domínio",
  invalidDomain: "Domínio inválido",
  invalidLinkedin: "URL do LinkedIn inválida (use linkedin.com/in/...)",
  missingRelation: "relação ausente",
  unknownRelation: "relação desconhecida",
  duplicateInFile: "LinkedIn repetido no arquivo",
  alreadyListed: "já existe um contato com esse LinkedIn",
  duplicateContactInFile: "contato repetido no arquivo (mesmo nome e empresa)",
  contactAlreadyListed: "já existe um contato com esse nome e empresa",
} as const;

/** Candidato de perfil do LinkedIn devolvido pela busca (25.1). */
export interface LinkedinCandidate {
  url: string;
  title: string;
  snippet: string;
}

export interface LinkedinLookupInput {
  fullName: string;
  companyName?: string | null;
  companyDomain?: string | null;
}
