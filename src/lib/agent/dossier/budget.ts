/**
 * CostBudget — teto de custo por execucao do dossie (US$)
 * Story: 24.19 - Dossie da conta
 *
 * O teto do Treg (`X-Treg-Route-Max-Cost`) limita cada chamada, nao o lote (spike 24.11,
 * §4), e miss e cobrado. Por isso o teto da execucao e nosso: antes de cada chamada
 * reserva-se o teto DA CHAMADA; depois, acerta-se pelo custo real.
 *
 * Seguro com concorrencia: `tryReserve` e sincrono (o event loop do JS nunca intercala
 * duas reservas), entao chamadas paralelas nunca passam juntas do teto.
 */

const EPSILON = 1e-9;

export class CostBudget {
  private spent = 0;
  private reserved = 0;
  private wasExhausted = false;

  constructor(private readonly maxUsd: number) {}

  /** Reserva `usd`. `false` (e `exhausted`) quando gasto + reservas + `usd` passaria do teto. */
  tryReserve(usd: number): boolean {
    const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;
    if (this.spent + this.reserved + amount > this.maxUsd + EPSILON) {
      this.wasExhausted = true;
      return false;
    }
    this.reserved += amount;
    return true;
  }

  /** Cabe `usd` agora (gasto + reservas em voo)? Sem efeito colateral. */
  canReserve(usd: number): boolean {
    const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;
    return this.spent + this.reserved + amount <= this.maxUsd + EPSILON;
  }

  /** Libera a reserva e soma o custo real (negativo/invalido conta 0). */
  settle(reservedUsd: number, actualUsd: number): void {
    const reserved = Number.isFinite(reservedUsd) && reservedUsd > 0 ? reservedUsd : 0;
    this.reserved = Math.max(0, this.reserved - reserved);
    const actual = Number.isFinite(actualUsd) && actualUsd > 0 ? actualUsd : 0;
    this.spent += actual;
  }

  get spentUsd(): number {
    return this.spent;
  }

  /** `true` depois que alguma reserva foi recusada. */
  get exhausted(): boolean {
    return this.wasExhausted;
  }
}
