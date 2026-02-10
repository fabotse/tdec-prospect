# ADR: Padrao SSE Streaming para Geracao de IA

**Data:** 2026-02-10
**Status:** Aceito
**Contexto:** Action Item #7 da Retrospectiva Epic 10

---

## Contexto

O projeto implementa Server-Sent Events (SSE) para streaming de respostas de IA, permitindo que o usuario veja o texto sendo gerado em tempo real.

## Implementacao

### Endpoint
`POST /api/ai/generate` — `src/app/api/ai/generate/route.ts` (linhas 216-254)

### Ativacao
O streaming e ativado quando `options.stream === true` no body da requisicao.

### Padrao Tecnico

```typescript
const stream = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of provider.generateStream(prompt, options)) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
        );
      }
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    } catch (error) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ error: message })}\n\n`)
      );
      controller.close();
    }
  },
});

return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});
```

## Protocolo SSE

| Aspecto | Detalhe |
|---------|---------|
| Formato do chunk | `data: {"text": "..."}\n\n` |
| Sinal de conclusao | `data: [DONE]\n\n` |
| Formato de erro | `data: {"error": "..."}\n\n` |
| Content-Type | `text/event-stream` |
| Cache-Control | `no-cache` |

## Componentes Envolvidos

- **API Route:** `src/app/api/ai/generate/route.ts` — cria o `ReadableStream`
- **Provider:** `provider.generateStream()` — retorna `AsyncGenerator<string>` com chunks de texto
- **Frontend (consumo):** Usa `EventSource` ou `fetch` + `ReadableStream` reader

## Decisoes de Design

1. **Web Streams API** (nao Node.js Streams): Compativel com Edge Runtime e API routes do Next.js
2. **TextEncoder**: Converte strings para `Uint8Array` (formato esperado pelo controller)
3. **JSON por chunk**: Cada chunk e um objeto JSON serializado, facilitando parsing no frontend
4. **`[DONE]` sentinel**: Segue o padrao da OpenAI API para sinalizar fim do stream
5. **Erro via SSE**: Erros sao enviados como eventos SSE (nao como HTTP errors), pois o stream ja iniciou

## Limitacoes

- Nao suporta reconexao automatica (nao usa `id:` ou `retry:` do protocolo SSE)
- O frontend deve tratar o caso de conexao perdida independentemente
- Nao ha backpressure — se o cliente nao consumir rapido o suficiente, os chunks ficam em buffer
