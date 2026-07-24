/**
 * Briefing Parser Service
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #1 - Extrai parametros de briefing em linguagem natural
 * AC: #2 - Usa OpenAI com structured output JSON (modelo via parser-config SSOT)
 * Story 22.11 - modelo gpt-5.4-mini (era gpt-4o-mini); request compat-safe (parser-config)
 */

import OpenAI from "openai";
import { z } from "zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatTurn, NextAction, ParsedBriefing } from "@/types/agent";
import { AGENT_ERROR_CODES } from "@/types/agent";
// Story 22.11 (Frente B, AC6/AC7): modelo e montagem de request centralizados no SSOT
// (parser-config) — compat-safe para a familia gpt-5 e sem drift com o parser de produto.
import { PARSER_TIMEOUT_MS, buildParserRequest } from "./parser-config";

// ==============================================
// ZOD SCHEMA — Validates OpenAI response
// ==============================================

const locationSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().nullable()
);

// Story 22.5: descricao livre da campanha. Trim + vazio->null (evita nome "Campanha -   "
// e linha em branco no resumo) + teto de 200 chars (guarda de custo/injecao — string crua
// entra em {{additional_description}} e no nome da campanha). Fail-open via .catch(null) no uso.
const campaignDescriptionSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().max(200).nullable()
);

export const briefingResponseSchema = z.object({
  technology: z.string().nullable(),
  jobTitles: z.array(z.string()).default([]),
  location: locationSchema,
  companySize: z.string().nullable(),
  industry: z.string().nullable(),
  productMentioned: z.string().nullable(),
  mode: z.enum(["guided", "autopilot"]).default("guided"),
  skipSteps: z.array(z.string()).default([]),
  // Story 22.3: campos de CONVERSA (nao de pipeline). Defaults toleram respostas
  // parciais do LLM (fail-open): sem nextAction -> "ask"; sem questionText -> null.
  nextAction: z
    .enum(["ask", "confirm", "proceed", "register_product", "import_leads"])
    .default("ask"),
  questionText: z.string().nullable().default(null),
  // Story 22.5: metadados OPCIONAIS de campanha (nao de busca). O .default(null)
  // cobre o campo AUSENTE; o .catch(null) cobre o valor INVALIDO (enum fora da lista,
  // emailCount fora de 1-10) — ambos caem para null sem quebrar o parse inteiro (fail-open, padrao 22.3).
  objective: z
    .enum(["COLD_OUTREACH", "REENGAGEMENT", "FOLLOW_UP", "NURTURE"])
    .nullable()
    .default(null)
    .catch(null),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null).catch(null),
  campaignDescription: campaignDescriptionSchema.default(null).catch(null),
  // z.coerce: o LLM em json_object as vezes emite a quantidade como string ("3") — sem
  // coercao, z.number() rejeitaria e o .catch(null) descartaria SILENCIOSAMENTE a intencao
  // do usuario. Coerce blinda esse caso; valor fora de 1-10/NaN ainda cai para null (fail-open).
  emailCount: z.coerce.number().int().min(1).max(10).nullable().default(null).catch(null),
});

export type BriefingResponse = z.infer<typeof briefingResponseSchema>;

// ==============================================
// SYSTEM PROMPT
// ==============================================

const SYSTEM_PROMPT = `Voce e um parser de briefings de prospeccao B2B. Sua tarefa e extrair parametros estruturados a partir de texto livre em portugues.

A busca padrao de prospeccao e por CARGO + LOCALIZACAO. Tecnologia e setor sao filtros OPCIONAIS que apenas refinam a busca — nunca sao obrigatorios e voce NUNCA deve invocar, inventar ou sugerir uma tecnologia que o usuario nao mencionou.

Extraia os seguintes campos do texto do usuario:

- jobTitles (string[]): Cargos-alvo para prospeccao (parametro primario). Exemplos: CTO, Head de TI, CISO, Diretor de Tecnologia. Se o usuario nao mencionar cargos, retorne array vazio [].
- location (string | null): Localizacao geografica (parametro primario). Exemplos: Sao Paulo, Brasil, LATAM, EUA. Null se nao mencionado.
- technology (string | null): Filtro OPCIONAL. Tecnologia ou ferramenta que as empresas-alvo usam. Exemplos: Netskope, AWS, Salesforce, SAP, Kubernetes. Extraia SOMENTE quando o usuario escolher ou afirmar positivamente a tecnologia atual; caso contrario retorne null (nunca invente nem sugira). Mencoes negadas ou recusadas (ex: "nao tenho tecnologia", "sem filtro de tech", "nao quero mais Netskope") NAO contam como tecnologia selecionada.
- industry (string | null): Filtro OPCIONAL. Industria ou setor. Exemplos: fintech, saude, varejo, educacao. Null se nao mencionado.
- companySize (string | null): Tamanho da empresa. Exemplos: "50-200", "enterprise", "startup", "PME". Null se nao mencionado.
- productMentioned (string | null): Nome de produto mencionado pelo usuario que pode estar cadastrado na base. Null se nao mencionado.
- mode ("guided" | "autopilot"): Modo de operacao. Default "guided" a menos que o usuario peca modo automatico/autopilot.

CAMPOS OPCIONAIS DE CAMPANHA (metadados — NAO sao filtros de busca):
Extraia SOMENTE quando o usuario mencionar; nunca invente. Ausentes = null.
- objective ("COLD_OUTREACH" | "REENGAGEMENT" | "FOLLOW_UP" | "NURTURE" | null): objetivo da campanha. Mapeie linguagem natural PT: "primeiro contato"/"prospeccao fria"/"abordagem inicial" -> COLD_OUTREACH; "reengajar"/"reativar"/"retomar contato"/"clientes antigos" -> REENGAGEMENT; "follow-up"/"acompanhamento"/"dar sequencia" -> FOLLOW_UP; "nutrir"/"educar"/"conteudo"/"relacionamento" -> NURTURE. Null se o usuario nao indicar objetivo.
- urgency ("LOW" | "MEDIUM" | "HIGH" | null): urgencia/ritmo. "urgente"/"rapido"/"o quanto antes"/"pra ontem" -> HIGH; "sem pressa"/"tranquilo"/"pode ser devagar" -> LOW; ritmo normal ou nao mencionado -> null (o sistema usa MEDIUM por padrao).
- campaignDescription (string | null): descricao livre/nome tematico da campanha quando o usuario der um (ex.: "campanha de Black Friday", "lancamento do produto X"). Null se nao mencionado.
- emailCount (number | null): quantidade de e-mails desejada na sequencia, inteiro entre 1 e 10, quando o usuario pedir uma quantidade ("quero 3 e-mails", "uma sequencia curta de 2", "manda so 1 e-mail"). Null se o usuario nao especificar quantidade.
- skipSteps (string[]): Etapas a pular. Default [].
  - Se o usuario NAO selecionar tecnologia, ou recusar/remover um filtro de tecnologia, adicione "search_companies" no skipSteps (a busca sera por cargo + localizacao, sem a etapa de filtro por tecnologia).
  - Se o usuario selecionar afirmativamente uma tecnologia atual, NAO adicione "search_companies" no skipSteps.
  - Se o usuario indicar que ja possui leads/contatos proprios (ex: "ja tenho os contatos", "quero importar meus leads", "tenho uma planilha de leads", "leads proprios", "minha lista de emails", "CSV com contatos"), adicione ["search_companies", "search_leads"] no skipSteps.
  - Se skipSteps contem "search_leads", NAO exija jobTitles — o usuario fornecera os leads diretamente.

REGRAS:
1. Retorne SOMENTE um objeto JSON valido com os campos acima.
2. NAO invente dados que o usuario nao mencionou — use null ou [] para campos ausentes. Isso vale especialmente para technology e industry: sem selecao afirmativa do usuario, retorne null.
3. Em mensagens com historico, a correcao mais recente prevalece. Se o usuario remover ou recusar uma tecnologia citada antes, retorne technology=null e inclua "search_companies" em skipSteps. Se ele trocar uma tecnologia por outra, mantenha somente a escolha mais recente.
4. Interprete abreviacoes e sinonimos em portugues (ex: "SP" = "Sao Paulo", "TI" = "Tecnologia da Informacao").
5. Para jobTitles, normalize para o formato padrao (ex: "CTOs" -> "CTO", "heads de TI" -> "Head de TI").
6. Se o usuario mencionar um produto especifico (ex: "nosso produto X", "quem usa o Y"), extraia o nome em productMentioned.
6.1. objective/urgency/campaignDescription/emailCount sao METADADOS DE CAMPANHA: NAO alteram nextAction, skipSteps nem os parametros de busca. A regra de avancar (cargo + localizacao) segue igual — esses campos nunca sao exigidos para prosseguir e nunca travam a conversa.

CONVERSA (nextAction + questionText):
Voce recebe a conversa inteira (mensagens do usuario e do agente). Alem dos parametros acima, decida a proxima acao da CONVERSA e escreva a mensagem natural a exibir.

- nextAction (string): a intencao do proximo passo. Valores possiveis:
  - "ask": ainda falta cargo OU localizacao (parametros primarios). NUNCA exija tecnologia (ela e opcional).
  - "confirm": ja ha cargo + localizacao e voce esta apresentando/re-apresentando o resumo para o usuario confirmar, inclusive apos aplicar uma correcao pedida por ele.
  - "proceed": o usuario, DIANTE de um resumo ja apresentado antes no historico, autoriza claramente iniciar (ex: "pode mandar", "bora", "manda bala", "isso, segue", "segue o baile"). So use "proceed" quando houver um resumo previo no historico E uma autorizacao inequivoca do usuario.
  - "register_product": use quando (a) o usuario PEDE EXPLICITAMENTE para cadastrar um produto ("quero cadastrar meu produto X antes", "cadastra o produto Y"), OU (b) o agente ACABOU DE OFERECER o cadastro no historico ("Nao encontrei o produto '...'. Quer cadastrar agora?") E o usuario AFIRMA ("sim", "pode cadastrar", "vamos nessa", "manda"). Se o usuario RECUSA a oferta ("nao", "depois", "segue sem produto", "nao precisa"), NAO use "register_product" — use "confirm" (seguir para o resumo). Nunca invente um produto que o usuario nao citou.
  - "import_leads": use quando o usuario indica ter LEADS/CONTATOS PROPRIOS para usar diretamente ("ja tenho minha lista", "tenho uma planilha de contatos", "quero importar meus leads", "minha base de e-mails", "na verdade eu ja tenho meus contatos"). Para MANTER COERENCIA com o pipeline, sempre que emitir "import_leads" tambem inclua ["search_companies", "search_leads"] em skipSteps (a regra de skipSteps para leads proprios acima e este nextAction andam JUNTOS).
- questionText (string | null): a mensagem EXATA a exibir ao usuario em portugues natural (a pergunta quando nextAction="ask", ou a confirmacao quando "confirm"). Use null quando nao houver pergunta a fazer.

REGRAS DA CONVERSA:
7. nextAction e questionText sao sobre a CONVERSA — nunca alteram os parametros de busca acima. Na duvida entre "ask" e "confirm", prefira "ask" (default seguro).
8. Escreva questionText SEMPRE em portugues do Brasil, direto e amigavel. Nunca invente parametros so para poder confirmar.
9. So devolva "proceed" se o historico ja contiver um resumo apresentado pelo agente E o usuario o estiver autorizando agora. Uma correcao ("troca o cargo pra CFO", "na verdade em SP") NAO e "proceed" — e "confirm" (aplique a correcao e reapresente).`;

// ==============================================
// SERVICE
// ==============================================

export interface ParseResult {
  briefing: ParsedBriefing;
  rawResponse: BriefingResponse;
  // Story 22.3: campos de conversa (nao vao no briefing/pipeline).
  nextAction: NextAction;
  questionText: string | null;
}

// Story 22.3: mapeia o historico de conversa (roles do banco) para os roles da OpenAI.
// system prompt e sempre o primeiro item e e separado do historico (D4):
// user -> "user"; agent/system -> "assistant".
function buildOpenAIMessages(history: ChatTurn[]): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      messages.push({ role: "assistant", content: turn.content });
    }
  }
  return messages;
}

export class BriefingParserService {
  /**
   * Parse briefing text into structured parameters.
   * AC: #1 - Extracts technology, jobTitles, location, etc.
   * AC: #2 - Uses response_format json_object (model via parser-config SSOT)
   * Story 22.3: aceita historico estruturado (ChatTurn[]) OU string (back-compat).
   */
  static async parse(
    input: string | ChatTurn[],
    apiKey: string
  ): Promise<ParseResult> {
    // Normaliza: string -> unico turno de usuario (back-compat / fail-open).
    const history: ChatTurn[] =
      typeof input === "string" ? [{ role: "user", content: input }] : input;

    const client = new OpenAI({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
        buildParserRequest(buildOpenAIMessages(history)),
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      const validated = briefingResponseSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      const raw = validated.data;

      const briefing: ParsedBriefing = {
        technology: raw.technology,
        jobTitles: raw.jobTitles,
        location: raw.location,
        companySize: raw.companySize,
        industry: raw.industry,
        productSlug: null, // Resolved later via KB (Task 3)
        mode: raw.mode,
        skipSteps: raw.skipSteps,
        // Story 22.5: metadados de campanha. O objeto e montado campo-a-campo (SEM spread do raw)
        // — sem estas linhas os campos somem silenciosamente do briefing (armadilha de strip #1).
        objective: raw.objective,
        urgency: raw.urgency,
        campaignDescription: raw.campaignDescription,
        emailCount: raw.emailCount,
      };

      return {
        briefing,
        rawResponse: raw,
        nextAction: raw.nextAction,
        questionText: raw.questionText,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    }
  }
}
