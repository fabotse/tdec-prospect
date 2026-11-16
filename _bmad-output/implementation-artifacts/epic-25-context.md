# Epic 25 Context: Radar de Oportunidades

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A plataforma passa a trazer oportunidades sozinha, sem o vendedor ter que procurar. Um painel in-app (o "Radar") reúne, de tempos em tempos, gatilhos de compra sobre contas do ICP: vagas de segurança/infra, mudança de cargo de decisores, ex-clientes que foram para outra empresa e notícias relevantes. Cada sinal abre uma execução do agente (Analista de Contas, Epic 24) com 1 clique. O objetivo do cliente é ter poucos leads de altíssima qualidade abordados no momento certo. O Radar entrega o "por que agora" antes mesmo de existir um briefing, e prioriza contas onde a TDec já tem relacionamento.

## Stories

- Story 25.1: Contatos conhecidos
- Story 25.2: Ex-clientes que mudaram de empresa
- Story 25.3: Gatilhos das contas do ICP
- Story 25.4: Painel do Radar
- Story 25.5: Do sinal ao agente em 1 clique

## Requirements & Constraints

- **Ex-clientes em nova empresa:** contatos de clientes atuais e antigos (e parceiros) da TDec são acompanhados. Quando um deles muda de empresa, gera-se um sinal "contato conhecido em nova conta" com pessoa, empresa anterior, nova empresa, cargo e data detectada. Se a nova empresa já é cliente ou está suprimida, o sinal fica só como informativo e não vira oportunidade de prospecção.
- **Radar in-app:** sinais periódicos sobre contas do ICP, cada um com fonte, data e conta. Os sinais são deduplicados por conta e tipo. Contas suprimidas, clientes e contas contatadas recentemente ficam de fora. Cada sinal recebe uma relevância (regras + LLM barato contra o ICP e as dores) e tem o custo registrado.
- **Só in-app.** O envio do radar por WhatsApp foi descartado de propósito. Alertas usam contador na sidebar + notificação in-app.
- **Custo:** toda chamada paga registra uso em `api_usage_logs` com o tenant. Os jobs têm frequência configurável e teto de custo mensal controlado do nosso lado (o teto do Treg vale por chamada, não por lote). Nenhum retry pode cobrar duas vezes.
- **Fail-safe:** se o provedor falhar, o item é reprocessado no próximo ciclo e a falha aparece na saúde dos jobs (já existe). Uma fonte que cai não derruba a rodada.
- **Pipeline determinístico:** o LLM só classifica relevância e escreve conteúdo. Nunca decide ordem de steps, gasto de créditos ou envio.
- **LGPD:** sem e-mail pessoal. Fatos guardam a fonte. Resultados de vagas e notícias trazem posts e nomes de terceiros, então guardar só o fato e a fonte que interessam à conta, sem perfilar terceiros. Opt-out respeitado em todos os caminhos.
- **Regras de produção (o `.env.local` aponta para o banco do cliente):** migrations só aditivas (tabela, coluna nullable, índice). O agente escreve a migration e nunca aplica: marca `precisa-felipe` e para. Não criar nem alterar jobs `pg_cron`, Edge Functions ou secrets sem pedido explícito. 25.2 e 25.3 (pg_cron com custo recorrente) estão fora da fila automática e só andam com decisão do Fabossi. Nada pode afetar campanhas rodando, a busca de leads ou o export/ativação no Instantly.
- **Definition of Done:** inclui smoke real (tela + banco), não só testes mockados.

## Technical Decisions

- **Novas tabelas (migrations controladas, RLS por tenant, `tenant_id` em tudo):**
  - contatos conhecidos: tenant, nome, cargo, empresa/domínio atual, LinkedIn, tipo de relação (cliente atual, ex-cliente, parceiro);
  - sinais de conta: tipo, conta, fonte, data, relevância, status `novo` / `em andamento` / `descartado`, link para execução/campanha.
- **Agendamento:** via `pg_cron`, padrão já usado no projeto. Não há orquestrador durável nesta fase. O epic pede para reavaliá-lo aqui. Idempotência vem do output parcial e do reprocessamento por ciclo.
- **Provedores (resultado do spike do Treg, 24.11):**
  - Notícias: `exa.web.search` via Treg, com `startPublishedDate` e `userLocation: BR` (~US$ 0,007/chamada).
  - Site e páginas: `treg.web.search` + `treg.web.extract`.
  - Estimativa: 100 contas × 2 buscas exa ≈ US$ 1,40 por rodada.
  - Vagas: exa com data. `theirstack.jobs.search` com filtro de cargo **não foi testado**, e a rota `companies.jobs` não filtra cargo e cobra miss.
  - Cache do Treg não confiável: usar cache próprio.
  - Toda chamada leva `Idempotency-Key`, `X-Treg-Route-Max-Cost`, `X-Treg-Meta` (tenant) e timeout ≥ 60 s.
  - Interface independente do provedor, com fallback para as fontes atuais.
- **Ponto em aberto:** o spike não validou nenhum provedor para (a) localizar a URL do LinkedIn de um contato nem (b) checar a empresa e o cargo atuais de uma pessoa. As capacidades `people.*` deram NO-GO ou ficaram sem teste, e a waterfall manda o nome do lead para até 14 fornecedores. 25.1 e 25.2 precisam definir esse provedor antes de implementar. Não presumir um.
- **Reuso obrigatório:**
  - o wrapper/serviço Treg do Epic 24, atrás do `base-service`, com chave por tenant criptografada (AES-256-GCM) e service-role no runtime do agente;
  - `promptManager`/`ai_prompts` para o prompt de relevância;
  - a lista de supressão (23.5) e o histórico de "já contatados";
  - a infraestrutura de notificações e oportunidades do Epic 21 (`meeting_booked`).
- **Supressão:** a tabela existe (23.5 done), mas a aplicação em todos os caminhos (23.6) ainda está em backlog. O filtro do Radar consulta a supressão diretamente e não pode colocar trava nova no caminho até o Instantly.

## UX & Interaction Patterns

- Nova área **Radar** na sidebar, com contador de sinais novos de alta relevância.
- **Radar → Contatos conhecidos:**
  - tabela com adicionar, editar, remover e importar CSV, no padrão das telas de Configurações e da Lista de Supressão;
  - ação de 1 clique para tornar contato conhecido o lead de uma oportunidade com reunião marcada;
  - sem URL do LinkedIn: o sistema tenta localizar e pede confirmação antes de salvar.
- **Painel:**
  - sinais agrupados por conta, ordenados por relevância e recência;
  - filtros por tipo, período e status;
  - descartar ou marcar "em andamento" salva o status e tira o sinal da lista de novos.
- **"Prospectar esta conta":** abre uma conversa nova do agente no modo lista de contas, com:
  - a conta preenchida e cargos sugeridos pelo ICP;
  - o sinal anexado como fato do dossiê e usado como gatilho "por que agora";
  - num sinal de ex-cliente, o contato conhecido como lead preferencial e a relação prévia no briefing para a copy.

## Cross-Story Dependencies

- **Ordem interna:**
  - 25.1 (cadastro) → 25.2 (job de mudança de empresa);
  - 25.2 + 25.3 (geram sinais) → 25.4 (painel) → 25.5 (sinal → agente).
- **Epic 23:** lista de supressão (23.5) e saúde dos jobs (23.3) prontas. A 23.6 (supressão em todos os caminhos) não está pronta.
- **Epic 24, todas done:** spike/serviço Treg (24.11), modo lista de contas ABM (24.17), dossiê da conta (24.19) e "motivo para abordar agora" (24.20).
- **Epic 21:** oportunidades (`meeting_booked`) e notificações in-app.
- Quando a execução criada a partir de um sinal termina, o sinal passa a "em andamento" com link para a execução e a campanha.
