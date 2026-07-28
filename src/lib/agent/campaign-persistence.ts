/**
 * Campaign Persistence (Story 22.16)
 *
 * Grava na tabela `campaigns` do tenant a campanha que o Agente TDEC cria. Antes desta
 * story a campanha do agente existia apenas no `agent_steps.output` e no Instantly: nao
 * aparecia em /campaigns e, como TODO o analytics (Epic 10/14), o `reply-sweep` e o
 * webhook partem de `campaigns` (por `id` ou por `external_campaign_id`), ela era
 * invisivel para o produto inteiro.
 *
 * Regras que este modulo centraliza:
 *
 * 1. CLIENT DE SESSAO — todas as escritas usam o client que o step ja tem (`this.supabase`,
 *    RLS por tenant) e mandam `tenant_id` explicito no INSERT. Service-role aqui seria
 *    escrever em nome de um tenant sem a rede de seguranca da RLS.
 *
 * 2. IDEMPOTENCIA SEM COLUNA NOVA — `existingCampaignId` (lido pelo step do proprio
 *    `agent_steps.output`) faz a re-execucao do `create_campaign` (ajuste pos-rejeicao,
 *    22.13) ATUALIZAR o nome da linha existente em vez de criar uma segunda campanha.
 *
 * 3. NOME TRUNCADO POR CODE POINT — `campaigns.name` e VARCHAR(200) e o nome do agente e
 *    `Campanha - ${campaignDescription}` com `campaignDescription` ja aceitando 200
 *    caracteres. Sem truncagem o Postgres rejeita a linha INTEIRA (22001), e a campanha
 *    some. `slice` cru sobre UTF-16 partiria um par substituto ao meio.
 *
 * 4. ASSOCIACAO PELO MECANISMO DO BUILDER — `campaign_leads.upsert(...,
 *    { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })`, exatamente como
 *    `POST /api/campaigns/[campaignId]/leads`. Casa com `unique_lead_per_campaign` e e
 *    idempotente por construcao (a segunda execucao nao insere nada).
 *
 * 5. NADA DE SEQUENCIA LOCAL — este modulo NAO escreve `email_blocks`/`delay_blocks`. A
 *    sequencia da campanha do agente vive no Instantly; grava-la aqui faria o builder
 *    parecer editavel e a edicao local nunca chegaria ao Instantly.
 *
 * O contrato de erro e deliberadamente assimetrico, espelhando quem chama:
 * - `persistAgentCampaign` NUNCA lanca (devolve `campaignId: null` / `degraded: true`) —
 *   e chamada no meio de um step que ja fez todo o trabalho caro;
 * - `markCampaignExported` / `markCampaignActive` LANCAM em erro, porque o supabase-js
 *   RETORNA `{ error }` em vez de lancar e os steps envolvem as duas num try/catch que
 *   precisa de algo para pegar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getExportRecord,
  updateExportStatus,
} from "@/lib/services/campaign-export-repository";

// ==============================================
// CONSTANTS
// ==============================================

/** `campaigns.name` e VARCHAR(200) (migration 00016). */
const CAMPAIGN_NAME_MAX_CODE_POINTS = 200;

/** Fatiamento do upsert de associacoes. */
const CHUNK_SIZE = 100;

// ==============================================
// TYPES
// ==============================================

export interface PersistAgentCampaignParams {
  /** Client de SESSAO (RLS por tenant). NUNCA service-role. */
  supabase: SupabaseClient;
  tenantId: string;
  /**
   * `campaigns.id` gravado por uma execucao anterior DESTE mesmo step (vem do
   * `agent_steps.output`). Presente = re-execucao: atualiza, nao cria.
   */
  existingCampaignId?: string | null;
  name: string;
  /** `leads.id` que a 22.15 persistiu. Vazio e estado valido (campanha com 0 leads). */
  leadIds: string[];
}

export interface PersistAgentCampaignResult {
  /** null = nem a linha da campanha foi gravada. */
  campaignId: string | null;
  /** Associacoes `campaign_leads` criadas AGORA (as que ja existiam nao contam). */
  associated: number;
  /**
   * A re-execucao nao conseguiu atualizar a linha: ela continua com o nome (e o estado)
   * da rodada ANTERIOR — tipicamente a que o usuario acabou de rejeitar.
   *
   * Separado de `associationDegraded` de proposito: sao falhas independentes e a bolha
   * que o step escreve precisa dizer QUAL aconteceu. Um booleano so fazia o step avisar
   * sobre contagem de leads quando o problema era o nome, e nunca contar ao usuario que a
   * campanha carrega o nome da versao rejeitada.
   */
  nameStale: boolean;
  /** A campanha existe, mas parte das associacoes de leads falhou. */
  associationDegraded: boolean;
  /** Uniao dos dois sinais acima — "algo saiu do ideal". */
  degraded: boolean;
}

export interface MarkCampaignExportedParams {
  supabase: SupabaseClient;
  campaignId: string;
  externalCampaignId: string;
}

export interface MarkCampaignActiveParams {
  supabase: SupabaseClient;
  tenantId: string;
  campaignId: string;
}

// ==============================================
// PURE HELPERS (exportados — testados isoladamente)
// ==============================================

/**
 * Trim + teto de 200 CODE POINTS. Vazio -> null (nao existe campanha sem nome:
 * `campaigns.name` e NOT NULL e o nome e renderizado cru no card, no filtro da Central de
 * Oportunidades e no titulo da notificacao).
 */
export function normalizeCampaignName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const codePoints = [...trimmed];
  const truncated =
    codePoints.length > CAMPAIGN_NAME_MAX_CODE_POINTS
      ? codePoints.slice(0, CAMPAIGN_NAME_MAX_CODE_POINTS).join("")
      : trimmed;

  const final = truncated.trim();
  return final === "" ? null : final;
}

// ==============================================
// INTERNAL HELPERS
// ==============================================

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : fallbackMessage;
  return new Error(message);
}

function firstRowId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" && id !== "" ? id : null;
}

// ==============================================
// MAIN
// ==============================================

/**
 * Resolve-ou-insere a linha da campanha do agente e associa os leads aprovados.
 *
 * NUNCA lanca: quando chega aqui, a campanha ja custou creditos de Apollo/OpenAI e uma
 * falha de RLS/rede na escrita local nao pode derrubar o step.
 */
export async function persistAgentCampaign(
  params: PersistAgentCampaignParams
): Promise<PersistAgentCampaignResult> {
  const { supabase, tenantId, existingCampaignId, leadIds } = params;

  const name = normalizeCampaignName(params.name);
  if (!name) {
    console.error("[campaign-persistence] Nome de campanha inutilizavel; nada gravado");
    return {
      campaignId: null,
      associated: 0,
      nameStale: false,
      associationDegraded: false,
      degraded: true,
    };
  }

  let campaignId: string | null = null;
  let nameStale = false;
  let associationDegraded = false;

  // --- Fase 1: resolver a linha existente (re-execucao) ---
  if (existingCampaignId) {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .update({
          name,
          // A re-execucao produz uma campanha NOVA no Instantly. Manter o
          // `external_campaign_id` da rodada anterior faria analytics, reply-sweep e
          // webhook lerem a campanha SUPERSEDIDA, e o badge afirmaria uma ativacao que
          // nao vale para a sequencia nova. No caminho normal (rejeicao antes do export)
          // isto e no-op: os campos ja estao nulos e o status ja e `draft`.
          status: "draft",
          external_campaign_id: null,
          export_platform: null,
          exported_at: null,
          export_status: null,
        })
        .eq("id", existingCampaignId)
        .eq("tenant_id", tenantId)
        .select("id");

      if (error) {
        // NAO caimos para o insert aqui de proposito: nao sabemos se a linha existe, e
        // inserir criaria a SEGUNDA campanha que a idempotencia existe para evitar. A
        // campanha continua listada, so com o nome da rodada anterior.
        console.error(
          "[campaign-persistence] Falha ao atualizar a campanha existente:",
          error
        );
        campaignId = existingCampaignId;
        nameStale = true;
      } else if (Array.isArray(data) && data.length > 0) {
        campaignId = existingCampaignId;
      }
      // `data` vazio SEM erro = a linha nao existe mais (o usuario apagou a campanha
      // entre as duas execucoes) -> segue para o insert.
    } catch (updateError) {
      console.error(
        "[campaign-persistence] Erro inesperado ao atualizar a campanha existente:",
        updateError
      );
      campaignId = existingCampaignId;
      nameStale = true;
    }
  }

  // --- Fase 2: insert (1a execucao, ou a linha anterior sumiu) ---
  if (!campaignId) {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          tenant_id: tenantId,
          name,
          // ENUM `campaign_status`. Nada de status novo para "criada por agente": o
          // `getCampaignStatusConfig` faz lookup SEM fallback e um valor fora do enum
          // vira um badge com o texto `undefined`.
          status: "draft",
        })
        .select("id")
        .single();

      if (error) throw toError(error, "Falha ao inserir a campanha");

      campaignId = firstRowId(data);
      if (!campaignId) {
        throw new Error("Insert de campanha nao devolveu id");
      }
    } catch (insertError) {
      console.error("[campaign-persistence] Falha ao gravar a campanha:", insertError);
      return {
        campaignId: null,
        associated: 0,
        nameStale: false,
        associationDegraded: false,
        degraded: true,
      };
    }
  }

  // --- Fase 3: associacoes ---
  // A campanha JA esta gravada: daqui para baixo nenhuma falha pode apagar esse fato —
  // ela vira `degraded`, e o step avisa que a contagem de leads pode vir menor.
  let associated = 0;
  // `Array.isArray` antes do `.filter`: sem ele um `leadIds` nao-array faria esta funcao
  // LANCAR — depois da Fase 2 ja ter gravado a linha — e o catch do step entenderia
  // "nada gravado", mandaria a bolha errada e a re-execucao criaria uma SEGUNDA campanha.
  const uniqueLeadIds = Array.from(
    new Set(
      (Array.isArray(leadIds) ? leadIds : []).filter(
        (id): id is string => typeof id === "string" && id !== ""
      )
    )
  );

  for (const ids of chunk(uniqueLeadIds, CHUNK_SIZE)) {
    try {
      const rows = ids.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId }));
      const { data, error } = await supabase
        .from("campaign_leads")
        .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })
        .select();

      if (error) {
        console.error("[campaign-persistence] Falha ao associar leads a campanha:", error);
        associationDegraded = true;
        continue;
      }

      // `ignoreDuplicates` faz o PostgREST devolver SO as linhas realmente inseridas —
      // por isso o contador vem do retorno e nao do tamanho do lote.
      associated += Array.isArray(data) ? data.length : 0;
    } catch (associationError) {
      console.error(
        "[campaign-persistence] Erro inesperado ao associar leads a campanha:",
        associationError
      );
      associationDegraded = true;
    }
  }

  return {
    campaignId,
    associated,
    nameStale,
    associationDegraded,
    degraded: nameStale || associationDegraded,
  };
}

/**
 * Carimba os quatro campos de export pelo caminho CANONICO do builder.
 *
 * `external_campaign_id` nao e cosmetico: o `engagement-processor` filtra
 * `.not("external_campaign_id","is",null)`, e o `reply-sweep` e o webhook do Instantly
 * encontram a campanha SO por esse campo. Enquanto ele for null, a campanha do agente
 * fica fora do Epic 10, do 14 e do 21 mesmo estando na lista.
 *
 * LANCA em erro (o supabase-js RETORNA `{ error }`): o caller envolve num try/catch.
 *
 * E lanca TAMBEM quando o UPDATE casou ZERO linhas. O PostgREST devolve `{ error: null }`
 * nesse caso (campanha apagada no meio da execucao, id de outro tenant, RLS), e sem a
 * conferencia o step reportaria sucesso silencioso sobre uma campanha que continua sem
 * `external_campaign_id` — invisivel para analytics/reply-sweep/webhook, exatamente o
 * defeito que esta story existe para matar.
 */
export async function markCampaignExported(
  params: MarkCampaignExportedParams
): Promise<void> {
  const { supabase, campaignId, externalCampaignId } = params;

  // O `SupabaseClient` que `updateExportStatus` aceita e ESTRUTURAL (uma interface local
  // do repositorio), incompativel nominalmente com o do supabase-js. O cast mora AQUI e
  // em nenhum outro lugar do fluxo do agente — mesmo precedente de
  // `src/app/api/campaigns/[campaignId]/export-status/route.ts`.
  const structuralClient = supabase as unknown as Parameters<typeof updateExportStatus>[0];

  const { error } = await updateExportStatus(structuralClient, campaignId, {
    externalCampaignId,
    exportPlatform: "instantly",
    exportedAt: new Date().toISOString(),
    exportStatus: "success",
  });

  if (error) throw toError(error, "Falha ao marcar a campanha como exportada");

  // Confirmacao por LEITURA em vez de `.select()` no update: `updateExportStatus` e o
  // caminho canonico do builder e a story proibe mexer nele. `getExportRecord` ja existe
  // no mesmo repositorio e le exatamente os campos que acabamos de gravar.
  const { data: record, error: readError } = await getExportRecord(
    structuralClient,
    campaignId
  );

  if (readError) throw toError(readError, "Falha ao conferir o export da campanha");
  if (!record || record.externalCampaignId !== externalCampaignId) {
    throw new Error(
      `O export nao foi gravado na campanha ${campaignId} (nenhuma linha correspondente).`
    );
  }
}

/**
 * Marca a campanha como `active` — SO depois de a ativacao no Instantly estar confirmada.
 *
 * Primeiro uso real do enum `campaign_status` no produto (ate aqui nada escrevia
 * `campaigns.status`). LANCA em erro, pelo mesmo motivo de `markCampaignExported` — e
 * tambem quando o UPDATE casou ZERO linhas, que o PostgREST reporta como sucesso.
 */
export async function markCampaignActive(
  params: MarkCampaignActiveParams
): Promise<void> {
  const { supabase, tenantId, campaignId } = params;

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    // Sem o `.select()` nao ha como distinguir "atualizou" de "nao encontrou linha": a
    // campanha ficaria como Rascunho na lista, para sempre e em silencio.
    .select("id");

  if (error) throw toError(error, "Falha ao marcar a campanha como ativa");
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      `A campanha ${campaignId} nao foi marcada como ativa (nenhuma linha correspondente).`
    );
  }
}
