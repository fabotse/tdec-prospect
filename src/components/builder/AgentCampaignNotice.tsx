/**
 * Agent Campaign Notice
 * Story 22.16: Campanha do Agente visivel em /campaigns
 *
 * A campanha criada pelo Agente TDEC chega ao builder com `external_campaign_id`
 * preenchido e ZERO blocos locais — a sequencia dela vive no Instantly e nao e gravada
 * localmente de proposito (gravar faria o builder parecer editavel, e a edicao local
 * nunca chegaria ao Instantly). Sem este aviso o usuario abre um canvas vazio e conclui
 * que a campanha esta quebrada.
 *
 * A regra de visibilidade mora AQUI, e nao na pagina, para ser testavel sem montar o
 * builder inteiro. Ela NAO pega o rascunho manual vazio: esse nunca tem
 * `external_campaign_id`.
 */

"use client";

import { Bot } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface AgentCampaignNoticeProps {
  /** `campaigns.external_campaign_id` — null enquanto a campanha nao foi exportada. */
  externalCampaignId: string | null;
  /** `blocks.length > 0` do store zustand do builder. */
  storeHasBlocks: boolean;
  /**
   * A resposta de `useCampaignBlocks`: `undefined` = ainda nao sabemos (carregando, ou a
   * query falhou); `[]` = o banco RESPONDEU e nao ha sequencia local.
   */
  initialBlocks: unknown[] | undefined;
}

/**
 * Story 22.16 (review): a regra que decide se o builder TEM uma sequencia mora aqui, e
 * nao inline na pagina, porque e nela que o defeito mora — e um teste que a replique em
 * vez de importa-la nao trava nada (trocar a expressao na pagina deixaria a suite verde).
 *
 * Story 22.16 (review follow-up): quem CHAMA esta funcao tambem e o componente, nao a
 * pagina. Enquanto a pagina derivava e passava o booleano, um call site que mandasse o
 * `hasBlocks` cru do store — ou trocasse a ordem dos argumentos — ressuscitava o aviso
 * falso com a suite inteira verde, porque nenhum teste monta a pagina. Recebendo as duas
 * entradas BRUTAS, essa chamada errada deixa de ser representavel.
 *
 * `storeHasBlocks` vem do zustand, populado pelo `useEffect` de `loadBlocks`: no PRIMEIRO
 * render passado o gate de loading ele ainda e `false` mesmo com blocos no banco. E o
 * gate de erro da pagina cobre so a query da campanha, entao um `useCampaignBlocks` que
 * falha deixa `initialBlocks` `undefined` para sempre.
 *
 * Por isso a fonte da verdade e a resposta do banco: so afirmamos "sem sequencia" quando
 * `initialBlocks` chegou E chegou vazio. Na duvida, dizemos que ha sequencia — o que
 * suprime o aviso.
 */
export function builderHasSequence(
  storeHasBlocks: boolean,
  initialBlocks: unknown[] | undefined
): boolean {
  return storeHasBlocks || !(Array.isArray(initialBlocks) && initialBlocks.length === 0);
}

export function AgentCampaignNotice({
  externalCampaignId,
  storeHasBlocks,
  initialBlocks,
}: AgentCampaignNoticeProps) {
  if (!externalCampaignId) return null;
  if (builderHasSequence(storeHasBlocks, initialBlocks)) return null;

  return (
    <div className="px-6 pt-4">
      <Alert data-testid="agent-campaign-notice">
        <Bot className="h-4 w-4" />
        <AlertTitle>Campanha criada pelo Agente TDEC</AlertTitle>
        {/*
          Texto ACENTUADO: a convencao sem acento deste repositorio vale para comentarios
          de codigo e bolhas do chat, nao para copy renderizada numa tela onde todo o
          resto (BuilderHeader, dialogs, toasts) usa portugues acentuado.
        */}
        <AlertDescription>
          A sequência de e-mails desta campanha vive no Instantly, por isso o canvas
          aparece vazio. Alterações feitas aqui não são enviadas para o Instantly — edite a
          sequência por lá.
        </AlertDescription>
      </Alert>
    </div>
  );
}
