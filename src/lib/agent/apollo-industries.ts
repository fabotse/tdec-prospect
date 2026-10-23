/**
 * apollo-industries.ts — indústria do briefing → nomes de `organization_industries` da Apollo
 * (Story 24.15). Leaf module puro.
 *
 * Só nomes de indústria da Apollo (em minúsculas), nunca IDs de tag inventados. Sem
 * correspondência → `null`, e a busca cai no `q_keywords` de hoje.
 */

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Chave canônica → nomes de indústria da Apollo. */
const APOLLO_INDUSTRIES: Record<string, string[]> = {
  fintech: ["financial services", "banking"],
  banco: ["banking"],
  saude: ["hospital & health care"],
  varejo: ["retail"],
  educacao: ["education management", "higher education", "e-learning"],
  logistica: ["logistics & supply chain", "transportation/trucking/railroad"],
  agro: ["farming"],
  energia: ["oil & energy", "renewables & environment", "utilities"],
  telecom: ["telecommunications"],
  seguros: ["insurance"],
  tecnologia: ["information technology & services", "computer software"],
  farmaceutica: ["pharmaceuticals"],
  construcao: ["construction"],
  imobiliario: ["real estate"],
  alimentos: ["food & beverages", "food production"],
  automotivo: ["automotive"],
  mineracao: ["mining & metals"],
  juridico: ["law practice", "legal services"],
  consultoria: ["management consulting"],
  marketing: ["marketing & advertising"],
  hotelaria: ["hospitality", "leisure, travel & tourism"],
  quimica: ["chemicals"],
};

/** Variações (já normalizadas) → chave canônica. */
const ALIASES: Record<string, string> = {
  fintechs: "fintech",
  financeiro: "fintech",
  financeira: "fintech",
  financas: "fintech",
  "servicos financeiros": "fintech",
  "financial services": "fintech",
  bancos: "banco",
  bancario: "banco",
  bancaria: "banco",
  banking: "banco",
  "banco digital": "banco",
  "bancos digitais": "banco",
  hospitalar: "saude",
  hospital: "saude",
  hospitais: "saude",
  healthcare: "saude",
  "health care": "saude",
  retail: "varejo",
  ecommerce: "varejo",
  "e-commerce": "varejo",
  varejista: "varejo",
  ensino: "educacao",
  education: "educacao",
  transporte: "logistica",
  transportes: "logistica",
  logistics: "logistica",
  agronegocio: "agro",
  agricultura: "agro",
  agribusiness: "agro",
  energy: "energia",
  telecomunicacoes: "telecom",
  telecomunicacao: "telecom",
  seguro: "seguros",
  seguradora: "seguros",
  seguradoras: "seguros",
  insurance: "seguros",
  ti: "tecnologia",
  tech: "tecnologia",
  software: "tecnologia",
  saas: "tecnologia",
  "tecnologia da informacao": "tecnologia",
  farmaceutico: "farmaceutica",
  farmacia: "farmaceutica",
  pharma: "farmaceutica",
  "construcao civil": "construcao",
  imobiliaria: "imobiliario",
  imobiliarias: "imobiliario",
  "real estate": "imobiliario",
  alimenticio: "alimentos",
  alimenticia: "alimentos",
  alimentacao: "alimentos",
  automobilistico: "automotivo",
  automotiva: "automotivo",
  mineradora: "mineracao",
  advocacia: "juridico",
  "escritorio de advocacia": "juridico",
  legal: "juridico",
  consultorias: "consultoria",
  publicidade: "marketing",
  propaganda: "marketing",
  turismo: "hotelaria",
  hoteis: "hotelaria",
  hotel: "hotelaria",
  quimico: "quimica",
  quimicos: "quimica",
};

/**
 * Nomes de `organization_industries` da Apollo para a indústria do briefing, ou `null` quando
 * não há correspondência.
 */
export function resolveApolloIndustries(industry: string | null | undefined): string[] | null {
  if (!industry) return null;
  const normalized = normalize(industry);
  if (!normalized) return null;
  const key = APOLLO_INDUSTRIES[normalized] ? normalized : ALIASES[normalized];
  const names = key ? APOLLO_INDUSTRIES[key] : undefined;
  return names ? [...names] : null;
}
