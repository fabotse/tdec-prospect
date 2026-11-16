/**
 * Decodificação de CSV lido no navegador.
 * Story 23.5 (movido na 25.1 para ser usado pela Lista de Supressão e pelos Contatos conhecidos).
 */

/** UTF-8 quando válido; senão Windows-1252 (CSV salvo pelo Excel em português). */
export function decodeCsv(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
