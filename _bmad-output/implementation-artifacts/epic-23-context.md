# Epic 23 Context: Plataforma — Higiene & Proteção de Envio

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deixar a plataforma segura, monitorada (só com a infraestrutura atual, sem ferramenta paga nova) e com CI, e garantir que nenhuma campanha, manual ou do agente, atinja cliente, negociação em andamento, concorrente, parceiro, opt-out ou quem já foi contatado. Também faz o motor de oportunidades parar de contar aberturas automáticas de security gateway como interesse real. É um épico curto (cerca de 1 semana) de higiene, que antecede o Agente TDec 3.0 (Epic 24) e alimenta o Radar (Epic 25), porque a base de clientes da lista de supressão é insumo dele.

## Stories

- Story 23.0: Banco de teste espelhando produção (**ADIADA em 2026-10-15**)
- Story 23.1: Webhook e crons autenticados
- Story 23.2: Dependências sem vulnerabilidades críticas
- Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
- Story 23.4: CI no GitHub e base verde
- Story 23.5: Lista de supressão — cadastro e import
- Story 23.6: Supressão aplicada em todos os caminhos
- Story 23.7: Envio sem repetição
- Story 23.8: Oportunidades sem falso positivo de security gateway

## Requirements & Constraints

**Restrição operacional dominante: o desenvolvimento roda contra PRODUÇÃO.** A 23.0 (banco de teste) foi adiada e o `.env.local` aponta para o Supabase de produção do cliente (projeto `kdgogyqyaxncqoyklyxx`), com as contas reais do Instantly e do Apollo. Por isso:
- Precisam continuar funcionando sem nenhuma trava nova: (1) as campanhas já rodando no Instantly, incluindo o recebimento de respostas e aberturas (webhook + `reply-sweep`); (2) a busca de novos leads (Apollo e demais fontes); (3) a criação de campanhas e o export/ativação no Instantly.
- Migrations só aditivas (tabela, coluna nullable, índice): nada de `DROP`, `ALTER` destrutivo ou `UPDATE`/`DELETE` em dados existentes. Só se aplica com OK do Fabossi.
- Não criar, alterar nem reagendar jobs `pg_cron`, não publicar Edge Functions e não mudar secrets/variáveis sem pedido explícito.
- Smokes: nunca ativar campanha de teste no Instantly, não mexer em campanhas reais e não enviar WhatsApp para leads.
- Ao fim de cada story, registrar nas Completion Notes o que pode ter mudado para o cliente (arquivos, rotas, prompts, tabelas, jobs, integrações) e confirmar os 3 pontos acima, dizendo se foi por smoke real ou por análise do diff. Se algum dos 3 puder ser afetado, parar e avisar o Fabossi antes de seguir.

**Ordem de execução definida pelo Fabossi** (substitui a ordem numérica):
1. 23.4 (CI + base verde, risco zero) → 2. 23.2 (dependências, sem migration) → 3. 23.8 (ESG, sem migration) → depois o Marco 1 do Epic 24.
- Só em janela de deploy combinada: 23.1 e 23.3 (mexem em webhook, cron e tabela de produção).
- Só com decisão explícita do Fabossi: 23.5–23.7 (afetam o caminho de envio) e 23.0.

**Requisitos funcionais do épico:**
- O webhook do Instantly rejeita requisições sem segredo válido (token na URL ou header) com 401, sem gravar evento. Todas as rotas de cron/lote ficam fail-closed (401/503) quando o segredo da env está ausente ou não confere, com testes para "env ausente" e "segredo errado".
- Dependências de produção sem CVE crítico ou alto: `next` ≥ 16.4.x; `xlsx` 0.18.5 substituído por alternativa mantida no parser de upload, sem mudar o resultado do import Excel. `npm audit --omit=dev` limpo.
- Falha de job agendado, ou ausência de execução bem-sucedida dentro da janela esperada, vira notificação in-app para gestores. Exceções não tratadas (API, step do agente, cron) ficam numa tabela de erros consultável em Configurações, sem chaves nem PII. Fora do escopo: Sentry, Datadog ou qualquer ferramenta paga.
- CI no GitHub Actions para PRs na `main`: `eslint`, `tsc --noEmit` (incluindo `__tests__`) e `vitest run`. A base atual tem 6 erros de lint em `src` e 182 de tsc em `__tests__`, e precisa ficar verde.
- Lista de supressão por domínio e por e-mail, com motivo (cliente, negociação, concorrente, parceiro, opt-out) e origem. Aceita cadastro manual e import CSV com relatório de linhas aceitas e ignoradas. Valores normalizados; duplicados ignorados com aviso.
- A supressão vale na busca, no import, ao adicionar leads em campanha e no export, tanto manual quanto do agente. Suprimidos aparecem marcados e não são exportados ("N leads suprimidos não foram exportados"). Opt-outs classificados pelo loop de resposta entram automaticamente na lista (origem "opt-out automático").
- Export ao Instantly com `skip_if_in_workspace` e `skip_if_in_campaign` ligados (manual e agente), informando quantos o Instantly pulou. Leads em campanha exportada nos últimos 90 dias aparecem como "Já contatado" e podem ser mantidos conscientemente.
- Aberturas e cliques de leads com security gateway não contam para o limiar de oportunidade por engajamento; respostas continuam gerando oportunidade. As oportunidades já existentes desse tipo recebem a marcação "possível abertura automática", sem apagar histórico.

**Não funcionais relevantes:** o fluxo manual não muda, exceto pelas proteções compartilhadas (supressão, dedupe), que são intencionais. LGPD: opt-out respeitado em todos os caminhos. A Definition of Done inclui smoke real (tela + banco), não só testes mockados, sempre dentro das regras de smoke acima.

## Technical Decisions

- **Fail-closed de cron:** o padrão de referência já existe em `replies/process-batch`. O caso conhecido fail-open é `monitoring/process-batch`.
- **Webhook:** a Edge Function `instantly-webhook` é publicada com `--no-verify-jwt`, então o segredo tem de ser validado no código. A URL com segredo deve ficar documentada para configurar no Instantly. Publicar a função ou mudar o secret exige autorização explícita.
- **Monitoramento sem serviço externo:** usar check agendado via pg_cron lendo `cron.job_run_details` / `net._http_response` e reaproveitar a infraestrutura de notificações do Epic 21. O `monitor-leads` está com `last_run_at` nulo (o cron nunca rodou) e precisa ser diagnosticado e corrigido ou documentado. Criar ou alterar job pg_cron depende de OK.
- **Supressão:** tabela nova (tenant, tipo domínio/e-mail, valor normalizado, motivo, origem, criado por/em) com RLS por tenant. Domínio em minúsculas, sem `www.` nem protocolo. Leitura para SDR; escrita só para gestor e diretor, conforme a matriz de níveis de acesso do Epic 20. O código não sobe antes de a migration estar aplicada.
- **Export:** as flags `skip_if_*` hoje estão `false` em `instantly.ts`. O step de export do agente aplica a mesma regra de supressão e grava a contagem no output.
- **ESG:** o `esg_code` já é capturado (Epic 14.5) e só falta ser usado em `opportunity-engine.ts`.
- **Parser Excel:** a troca de `xlsx` fica restrita a `src/lib/utils/xlsx-parser.ts`, e os testes de import precisam continuar verdes.
- Branch única do épico: `epic/23-plataforma-higiene`, com PR para `main` ao fim.

## UX & Interaction Patterns

- Tela Configurações → Lista de Supressão, no padrão visual das demais telas de Configurações: tabela domínio/e-mail/motivo/data, busca, adicionar, importar CSV e remover.
- Badges "Suprimido" (motivo no tooltip) e "Já contatado (campanha X, data)" nas tabelas de leads, na revisão do agente e no export.
- Seção simples de erros recentes em Configurações, visível para gestores.
- Na Central de Oportunidades, marcação "possível abertura automática" em oportunidades de engajamento com ESG.

## Cross-Story Dependencies

- 23.5 (tabela e cadastro) precede 23.6 (aplicação nos caminhos). 23.6 e 23.7 compartilham o caminho de export (`instantly.ts`), que também é tocado pelo Epic 24. Por isso o Epic 23 vem antes, e é isso que resolve a sobreposição.
- 23.6 depende do loop de resposta e da classificação `opt_out` do Epic 21. 23.3 reaproveita as notificações do Epic 21. 23.8 depende do ESG do Epic 14.5.
- 23.4 deve vir primeiro, porque dá a rede de segurança (CI verde) para as demais.
- A base de clientes da supressão é insumo do Epic 25 (ex-clientes e Radar).
- Sem a 23.0, nenhuma story tem ambiente isolado: cada mudança é validada contra produção, sob as restrições acima.
