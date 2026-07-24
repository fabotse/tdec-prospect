# Story 22.14: Busca com 0 Resultados — diagnóstico honesto e recuperação em 1 clique

Status: draft

> **P1 — busca vazia hoje é apresentada como sucesso e trava o usuário.** "0 de 0 leads selecionados" + "Step concluído com sucesso" + botão Aprovar desabilitado = fim da linha.

## Story

As a usuário do Agente TDEC,
I want que, quando a busca não encontrar nenhum lead, o agente me diga o porquê provável e me ofereça ajustes prontos,
so that eu recupere a campanha em segundos em vez de ficar olhando uma tabela vazia sem saber o que fazer.

## Contexto (reproduzido em teste E2E, 2026-07-24)

Briefing legítimo mas nichado (Dono/Diretor + "clínicas de estética" + Atibaia + <11 funcionários) → busca retorna 0:

- Card "Revisão: Leads Encontrados — **0 de 0 leads selecionados**", tabela vazia, "Aprovar (0 leads)" desabilitado, filtro desabilitado.
- Logo abaixo, mensagem **contraditória**: *"Step 2 (search_leads) concluído com sucesso"*.
- Nenhuma sugestão de causa ou próximo passo. As únicas ações: "Rejeitar" (que hoje leva ao dead-end da 22.13) ou abandonar.
- Contraste: a mesma busca SEM indústria e SEM `<11` encontrou 248 leads — o problema era combinação de filtros, algo que o agente tinha plena condição de diagnosticar.

## Acceptance Criteria

1. **[Zero não é sucesso]** **Given** `search_leads` (ou `search_companies`) retornando 0 itens **Then** a mensagem de progresso NÃO diz "concluído com sucesso" — diz que a busca não encontrou resultados **And** o card de revisão vazio é substituído por um **empty-state de diagnóstico** (sem tabela vazia nem "Aprovar (0)").

2. **[Diagnóstico dos filtros]** **Given** o empty-state **Then** ele lista os filtros que estavam ativos (cargos, localização, indústria, tamanho, tech) **And** aponta os candidatos a causa em ordem de probabilidade — heurística determinística simples, sem LLM: filtros mais restritivos primeiro (indústria textual nichada > tamanho restritivo > cidade pequena > cargos raros).

3. **[Recuperação em 1 clique]** **Given** o diagnóstico **Then** o usuário vê chips/botões de ajuste imediato — no mínimo: "Remover filtro de indústria", "Remover filtro de tamanho", "Ampliar para região/estado" — **When** o usuário clica um **Then** o briefing é atualizado (PATCH) e a busca re-executa após confirmação de custo (mesmo mini-gate da 22.13/AC4).

4. **[Texto livre também funciona]** **Given** o handler de ajuste pós-rejeição (Story 22.13) **Then** o empty-state também aceita ajuste por texto livre no chat (rota da 22.13), sem exigir o clique nos chips.

5. **[Aviso de viabilidade ANTES de pagar (best effort)]** **Given** que a busca é paga **Then** avaliar no dev se a API de leads oferece contagem/preview barato (ex.: Apollo `pagination.total_entries` na 1ª página) — se sim, quando a combinação de filtros for muito restritiva, o plano de execução mostra um aviso de baixa viabilidade antes do "Iniciar Execução"; se não houver caminho barato, documentar o porquê e descartar (não inventar chamada cara).

6. **[Sem regressão]** **Given** buscas com resultados **Then** o fluxo de revisão atual permanece byte-a-byte (o empty-state só aparece com 0).

## Tasks / Subtasks

- [ ] **Task 1 — Mensagem honesta no step** (AC: #1): em `search-leads-step` (e `search-companies-step`), ramo `results.length === 0` → mensagem própria + flag no output (`emptyResult: true`).
- [ ] **Task 2 — Empty-state no card de revisão** (AC: #1, #2, #3): `AgentLeadReview` renderiza diagnóstico + chips quando `emptyResult`; heurística pura de ordenação de causa (helper testável).
- [ ] **Task 3 — Wiring dos chips** (AC: #3): chip → delta de briefing → PATCH → mini-gate de custo → re-execute (REUSAR a mecânica da 22.13).
- [ ] **Task 4 — Viabilidade pré-busca (spike)** (AC: #5): investigar contagem barata na API; implementar ou documentar descarte.
- [ ] **Task 5 — Testes RED→GREEN + smoke real** (AC: #6): RED = hoje 0 resultados renderiza tabela vazia + "sucesso"; smoke com briefing nichado real (o do teste: estética + Atibaia + <11 reproduz).

## Dev Notes

- **Dependência: Story 22.13** (handler de ajuste + mini-gate de custo). Os chips são atalhos determinísticos para o mesmo caminho.
- **NFR1**: diagnóstico e chips são heurística pura (sem LLM); o texto livre usa o parser da conversa (22.13). Zero migration (o flag `emptyResult` vive no output JSONB do step — NFR5).
- **Trap #1**: não pular o gate de custo na re-busca — cada clique de chip re-executa busca paga.
- **Trap #2**: `industry` na busca direta é matching textual frágil (evidência: "clínicas de estética" zerou; sem indústria, 248). O chip "Remover filtro de indústria" deve explicar isso ("indústria é o filtro mais impreciso da busca aberta").
- **Trap #3**: o piso de qualidade 11+ (22.6) interage com `<11` explícito do usuário — no diagnóstico, mostrar o tamanho EFETIVO usado (SSOT `resolveDirectSearchCompanySizes`).

### References

- [Source: src/lib/agent/steps/search-leads-step.ts] — step da busca (ramo isDirectEntry)
- [Source: src/components/agent/AgentLeadReview.tsx] — card de revisão (alvo do empty-state)
- [Source: src/lib/agent/search-defaults.ts] — SSOT tamanho efetivo (22.6)
- [Source: _bmad-output/implementation-artifacts/22-13-ajuste-pos-rejeicao-de-etapa.md] — handler de ajuste (dependência)
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência (0 vs 248 com filtros relaxados)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E — busca vazia tratada como sucesso, sem recuperação; contraste 0 → 248 leads ao relaxar filtros provado ao vivo. Status: draft. |
