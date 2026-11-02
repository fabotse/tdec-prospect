// Extrai a data de um snippet de busca ("Aug 11, 2026 —", "11 de ago. de 2026", "3 days ago", "há 2 dias").
const TODAY = new Date('2026-10-28');
const MONTHS = { jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11 };

export function snippetDate(s = '') {
  let m = s.match(/\b([A-Z][a-z]{2})\w* (\d{1,2}), (20\d\d)\b/);
  if (m && MONTHS[m[1].toLowerCase()] != null) return new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(/\b(\d{1,2}) de ([a-zç]{3})\w*\.? de (20\d\d)\b/i);
  if (m && MONTHS[m[2].toLowerCase()] != null) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/\b(\d{1,2})\s+(days?|dias?|hours?|horas?|weeks?|semanas?|months?|meses|mês)\s+(ago|atrás)/i) || s.match(/\bhá\s+(\d{1,2})\s+(dias?|horas?|semanas?|meses|mês)/i);
  if (m) {
    const n = +m[1]; const u = m[2].toLowerCase();
    const d = u.startsWith('h') ? 0 : u.startsWith('w') || u.startsWith('s') ? 7 * n : u.startsWith('mo') || u.startsWith('me') || u.startsWith('mê') ? 30 * n : n;
    return new Date(TODAY.getTime() - d * 864e5);
  }
  return null;
}
