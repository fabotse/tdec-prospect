/**
 * lt_interest_status — helper puro (leaf util), sem dependências de IA/rede.
 *
 * Extraído de `reply-classifier.ts` (review 21.3, patch P2) para que consumidores
 * puros — como `engagement-processor.ts` — não importem transitivamente todo o wiring
 * de fetch/OpenAI (evita acoplamento e risco de import cycle).
 */

/**
 * Task 2.4 (AC2) — parse defensivo do `lt_interest_status`. Fecha a divergência de tipagem
 * entre o caminho de resposta (`number`) e o de engajamento (`string`, ver Task 3.2).
 * `number` finito → ele mesmo; `string` numérica → parseInt; qualquer outra coisa → null.
 */
export function normalizeLtInterestStatus(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    return parseInt(raw.trim(), 10);
  }
  return null;
}
