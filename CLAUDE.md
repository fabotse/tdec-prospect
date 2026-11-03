# TDec Prospect — instruções do projeto

## Regra nº 1: o cliente não pode sentir o desenvolvimento

O `.env.local` aponta para o **banco de produção do cliente** (projeto Supabase `kdgogyqyaxncqoyklyxx`). Não existe banco de teste (a story 23.0 foi adiada em 2026-10-15). Tudo que roda localmente fala com os dados reais e com as contas reais do Instantly e do Apollo.

Isto precisa continuar funcionando **sempre**, sem nenhuma restrição nova:

1. **As campanhas que já estão rodando** continuam enviando no Instantly. Nada é pausado ou removido, e o recebimento de respostas e aberturas (webhook + `reply-sweep`) segue funcionando.
2. **A busca de novos leads** (Apollo e demais fontes) funciona como antes.
3. **A criação de campanhas e o envio para o Instantly** (export e ativação) funcionam como antes. Por enquanto, não colocar nenhuma trava, filtro ou bloqueio novo no caminho até o Instantly.

### Ao terminar cada etapa (story, fix ou deploy)

Antes de dar a etapa por concluída, verificar e registrar nas Completion Notes da story:

- O que a mudança pode ter alterado para o cliente: arquivos, rotas, prompts, tabelas, jobs e integrações tocados.
- Os 3 pontos acima: confirmar que continuam funcionando. Por smoke real quando a mudança toca esses caminhos; por análise do diff quando não toca. Dizer qual dos dois foi feito.
- Se algum dos 3 pontos puder ser afetado, **parar e avisar o Fabossi antes** de seguir.

### Enquanto o `.env.local` apontar para produção

- Migrations: só **aditivas** (tabela, coluna nullable, índice). Nada de `DROP`, `ALTER` destrutivo, `UPDATE`/`DELETE` em dados existentes. Agentes escrevem, mas **nunca** aplicam; só o Fabossi aplica (não existe Supabase de teste; o `.env.local` aponta para produção). Marcar a issue no Linear com `precisa-felipe` e parar.
- Não criar, alterar nem reagendar jobs `pg_cron`, não publicar Edge Functions e não mudar secrets/variáveis sem pedido explícito.
- Smokes: nunca ativar campanhas de teste no Instantly, não mexer em campanhas reais do cliente e não enviar WhatsApp para leads.

## Sincronização entre máquinas (Mac do Fabossi ↔ Eden)

O trabalho acontece em duas máquinas: o Mac do Fabossi e a máquina do orquestrador Eden.

- Antes de começar qualquer trabalho: `git fetch` + `git pull` no branch de trabalho e ler a issue correspondente no Linear (projeto TDec-Prospect), incluindo os comentários mais recentes.
- Cada issue tem exatamente uma máquina dona por vez, registrada no Linear com os labels `maquina:mac` / `maquina:eden`. Não trabalhar numa issue que é da outra máquina.
- Nunca trabalhar no mesmo branch nas duas máquinas ao mesmo tempo.
- Ao final de cada sessão de trabalho: commit, push e comentário na issue do Linear com: o que foi feito, branch, SHA do commit, checks rodados (`npm run lint`, `npm run typecheck`, `npm run test:run`) e resultados, o que ficou pendente e o próximo dono.
- Migrations: agentes escrevem, mas **nunca** aplicam. Marcar a issue com `precisa-felipe` e parar; o Fabossi aplica (não existe Supabase de teste; o `.env.local` aponta para produção).
- Se o `.env.local` mudar numa máquina, sinalizar no Linear para a outra ser atualizada.
- O `sprint-status.yaml` continua sendo a fonte da verdade do BMad; o Linear espelha.

### Fila do orquestrador (qual issue pegar)

A ordem de trabalho fica no Linear, no projeto TDec-Prospect. A sequência completa e o motivo de cada posição estão no documento "Ordem de execução — fila do orquestrador" do projeto.

1. Candidatas: issues no status **Pronto para dev** com o label da sua máquina (`maquina:eden` ou `maquina:mac`).
2. Pegar a de **menor número no início do título** (`01 ·`, `02 ·` …) que não tenha nenhum bloqueio aberto ("blocked by" com issue que não esteja Done). Cada issue da fila é bloqueada pela anterior, então só uma fica liberada por vez. A prioridade (High/Medium/Low) só marca o bloco e serve de desempate.
3. Ao começar, mover a issue para **Em andamento**. Ao terminar e com o PR aberto, mover para **Review humano / PR**. Não marcar Done antes do merge e, quando houver, do smoke em produção.
4. Parar e chamar o Fabossi, mudando para **Precisa Felipe** com o label `precisa-felipe` e um comentário explicando o motivo, quando a issue:
   - tiver migration (escrever, nunca aplicar);
   - mexer em `pg_cron`, Edge Function publicada, secrets ou variáveis;
   - puder afetar um dos 3 pontos da Regra nº 1, em especial qualquer coisa no caminho até o Instantly (export e ativação).
5. Nunca pegar issue com `precisa-felipe`, issue fora de "Pronto para dev" ou issue da outra máquina. Fila vazia ou toda bloqueada: parar e avisar no Linear, sem inventar trabalho.
6. Não renumerar nem reordenar a fila. Quem define a ordem é o Fabossi; para mudar, peça a ele.

## Commits e gates

- Nunca commitar com `--no-verify`. Se o pre-commit falhar, corrigir o que ele apontou. O bmad-loop refaz o commit com o hook ligado, e o que foi pulado vira escalada.
- O pre-commit (lint-staged) e o CI usam a mesma régua: erro de ESLint bloqueia, warning não. `npm run lint`, `npm run typecheck` e `npm run test:run` precisam passar (são também os `[verify]` do `.bmad-loop/policy.toml`).
