/**
 * Gera a planilha de custos (xlsx) ESTILIZADA do TDec Prospect — V1.
 * Preços coletados em 02/06/2026 nas páginas oficiais de cada fornecedor.
 * Requer exceljs:  npm install --no-save exceljs
 * Rodar:           node docs/apresentacao-v1/_build-cost-sheet.cjs
 */
const ExcelJS = require("exceljs");
const path = require("path");

const FX = 5.5; // R$ por US$ — PREMISSA EDITÁVEL
const brl = (usd) => Math.round(usd * FX);

/* ---------------------------------------------------------------- paleta TDec */
const C = {
  navy: "FF12263A", azure: "FF3D9BE0", azureDk: "FF2B7BB9", white: "FFFFFFFF",
  ink: "FF1A2733", muted: "FF6B7785", border: "FFD6DEE7", zebra: "FFF5F9FC",
  green: "FF1A8A4B", red: "FFB42318",
  // tints + accents por categoria
  infraT: "FFE6F1FB", infraA: "FF2B7BB9",
  iaT: "FFEEE8FB", iaA: "FF7C3AED",
  dadosT: "FFE2F6F1", dadosA: "FF0E9384",
  dispT: "FFFDF1DD", dispA: "FFB7791F",
  minT: "FFE7F5EC", minA: "FF1A8A4B",
  prodT: "FFFDEEDA", prodA: "FFB7791F",
};
const CAT = {
  "Infraestrutura": { t: C.infraT, a: C.infraA },
  "IA": { t: C.iaT, a: C.iaA },
  "Dados & enriquecimento": { t: C.dadosT, a: C.dadosA },
  "Disparo": { t: C.dispT, a: C.dispA },
};
const USD = '"US$ "#,##0;;"—"';
const BRL = '"R$ "#,##0;;"—"';

/* ------------------------------------------------------------------- helpers */
const fill = (cell, argb) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: C.border } };
const box = (cell) => (cell.border = { top: thin, left: thin, bottom: thin, right: thin });
const font = (cell, o = {}) => (cell.font = { name: "Calibri", size: 10, color: { argb: C.ink }, ...o });

async function build() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TDec Prospect";
  wb.created = new Date(0); // determinístico

  /* ========================================================= Sheet 1: Resumo */
  const r = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  r.columns = [{ width: 44 }, { width: 13 }, { width: 13 }, { width: 82 }];

  r.mergeCells("A1:D1");
  let c = r.getCell("A1");
  c.value = "TDec Prospect — Estimativa de Custos de Plataformas (V1)";
  font(c, { size: 15, bold: true, color: { argb: C.white } });
  fill(c, C.navy); c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  r.getRow(1).height = 32;

  r.mergeCells("A2:D2");
  c = r.getCell("A2");
  c.value = `Preços coletados em 02/06/2026 nas páginas oficiais   ·   Câmbio premissa: R$ ${FX.toFixed(2)} / US$   ·   Valores mensais`;
  font(c, { size: 9.5, italic: true, color: { argb: C.white } });
  fill(c, C.azure); c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  r.getRow(2).height = 20;

  // header cenários
  const rh = r.getRow(4);
  ["CENÁRIO", "US$/mês", "R$/mês", "O que inclui"].forEach((h, i) => {
    const cell = rh.getCell(i + 1);
    cell.value = h; font(cell, { bold: true, color: { argb: C.white } });
    fill(cell, C.azureDk); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i === 0 || i === 3 ? "left" : "center", indent: i === 0 ? 1 : 0 };
  });
  rh.height = 22;

  const scen = [
    ["Stack mínimo  (piloto / baixo volume)", 184, 1012, "Supabase Pro · Vercel Pro · OpenAI ~$15 · Apollo Basic · Apify grátis · Instantly Growth · Z-API. theirStack e SignalHire opcionais.", C.minT, C.minA],
    ["Stack produção  (volume real)", 486, 2677, "Apollo Pro · theirStack Tier 1 · SignalHire · Apify Starter · Instantly Hypergrowth + infraestrutura + IA ~$50.", C.prodT, C.prodA],
  ];
  scen.forEach((s, idx) => {
    const row = r.getRow(5 + idx); row.height = 42;
    const a = row.getCell(1); a.value = s[0]; font(a, { bold: true, size: 11, color: { argb: s[5] } }); fill(a, s[4]); box(a); a.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    const b = row.getCell(2); b.value = s[1]; b.numFmt = USD; font(b, { bold: true, size: 14, color: { argb: s[5] } }); fill(b, s[4]); box(b); b.alignment = { vertical: "middle", horizontal: "center" };
    const cc = row.getCell(3); cc.value = s[2]; cc.numFmt = BRL; font(cc, { bold: true, size: 12, color: { argb: s[5] } }); fill(cc, s[4]); box(cc); cc.alignment = { vertical: "middle", horizontal: "center" };
    const d = row.getCell(4); d.value = s[3]; font(d, { size: 9.5, color: { argb: C.ink } }); fill(d, s[4]); box(d); d.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  });

  // modelo de custo
  r.mergeCells("A8:D8");
  c = r.getCell("A8"); c.value = "MODELO DE CUSTO — três tipos, separados e transparentes";
  font(c, { bold: true, size: 11, color: { argb: C.navy } }); c.alignment = { vertical: "middle", indent: 0 };
  r.getRow(8).height = 24;

  const model = [
    ["1 · Infraestrutura — FIXO, pago pela TDec", "Supabase + Vercel: a base que mantém a plataforma no ar.", C.infraT, C.infraA],
    ["2 · IA por uso — CENTAVOS", "OpenAI: paga-se por texto gerado. 10 mil e-mails ≈ US$ 3.", C.iaT, C.iaA],
    ["3 · APIs 'traga sua chave' — por CLIENTE", "Apollo, SignalHire, Apify, theirStack, Instantly, Z-API: cada cliente usa a própria conta.", C.dadosT, C.dadosA],
  ];
  model.forEach((m, idx) => {
    const row = r.getRow(9 + idx); row.height = 26;
    r.mergeCells(`B${9 + idx}:D${9 + idx}`);
    const a = row.getCell(1); a.value = m[0]; font(a, { bold: true, size: 10, color: { argb: m[3] } }); fill(a, m[2]); box(a); a.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    const b = row.getCell(2); b.value = m[1]; font(b, { size: 9.5, color: { argb: C.ink } }); fill(b, m[2]); box(b); b.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  });

  r.mergeCells("A13:D13");
  c = r.getCell("A13");
  c.value = "Maior custo: volume de envio (Instantly) e revelação de TELEFONE (Apollo = 8 créditos/telefone, SignalHire).  A IA é o MENOR custo da operação.";
  font(c, { italic: true, size: 9.5, color: { argb: C.muted } }); c.alignment = { vertical: "middle", wrapText: true };
  r.getRow(13).height = 30;
  r.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  /* ==================================================== Sheet 2: Plataformas */
  const p = wb.addWorksheet("Plataformas", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  const widths = [4, 18, 22, 52, 26, 12, 13, 12, 70, 22, 14, 36];
  widths.forEach((w, i) => (p.getColumn(i + 1).width = w));

  p.mergeCells("A1:L1");
  c = p.getCell("A1"); c.value = "Detalhe por plataforma — preços reais (acesso 02/06/2026)";
  font(c, { size: 14, bold: true, color: { argb: C.white } }); fill(c, C.navy); c.alignment = { vertical: "middle", indent: 1 };
  p.getRow(1).height = 28;

  const header = ["#", "Plataforma", "Categoria", "Para que serve no app", "Plano (mín → produção)", "US$/mês (mín)", "US$/mês (prod)", "R$/mês (prod)", "Modelo de cobrança / o que medir", "Quem paga", "Obrigatória?", "Fonte"];
  const hr = p.getRow(3);
  header.forEach((h, i) => {
    const cell = hr.getCell(i + 1); cell.value = h;
    font(cell, { bold: true, size: 9.5, color: { argb: C.white } }); fill(cell, C.azure); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i >= 5 && i <= 7 ? "center" : "left", wrapText: true, indent: i >= 5 && i <= 7 ? 0 : 1 };
  });
  hr.height = 34;

  // [#, Plataforma, Categoria, serve, plano, min, prod, brlProd, modelo, paga, obrig, fonte]
  const rows = [
    [1, "Supabase", "Infraestrutura", "Autenticação + banco Postgres multi-tenant + Edge Functions + cron", "Pro", 25, 25, brl(25), "Assinatura mensal + uso (DB, egress, usuários ativos, invocações). Cron roda a cada 5 min.", "TDec (operador)", "Sim", "supabase.com/pricing"],
    [2, "Vercel", "Infraestrutura", "Hospedagem do app Next.js", "Pro (1 → 2 assentos)", 20, 40, brl(40), "US$ 20/assento/mês + uso (banda, funções, builds). Hobby não permite uso comercial.", "TDec (operador)", "Sim", "vercel.com/pricing"],
    [3, "OpenAI", "IA", "Toda a IA: e-mails, icebreakers, busca conversacional, transcrição de voz", "Uso (pré-pago)", 15, 50, brl(50), "Por token (entrada + saída). gpt-4o-mini ~US$ 0,0003/e-mail. Whisper US$ 0,006/min.", "TDec ou cliente (DECIDIR)", "Sim p/ IA", "openai.com/api/pricing"],
    [4, "Apollo.io", "Dados & enriquecimento", "Busca de leads + revelar e-mail/telefone", "Basic ($59) → Professional ($99)", 59, 99, brl(99), "Por crédito. E-mail = 1 crédito; TELEFONE = 8 créditos. Overage US$ 0,20/crédito (mín. 250). Sem rollover.", "Cliente (chave própria)", "Não", "apollo.io/pricing"],
    [5, "theirStack", "Dados & enriquecimento", "Busca de empresas por tecnologia (technographic)", "Free (0) → Tier 1 ($59)", 0, 59, brl(59), "3 créditos por empresa retornada. Tier 1 = 1.500 créditos ≈ 500 empresas/mês. Créditos valem 12 meses.", "Cliente (chave própria)", "Não", "theirstack.com/pricing"],
    [6, "SignalHire", "Dados & enriquecimento", "Busca de telefone sob demanda (callback assíncrono)", "Phones ($69) → Both ($139)", 0, 69, brl(69), "1 crédito por contato revelado. Plano Phones = 435 créditos/mês. API usa os mesmos créditos.", "Cliente (chave própria)", "Não", "signalhire.com/pricing"],
    [7, "Apify", "Dados & enriquecimento", "Scraping de posts do LinkedIn → icebreakers + monitoramento", "Free ($5 saldo) → Starter ($29)", 0, 29, brl(29), "Actor 'supreme_coder/linkedin-post': US$ 1 por 1.000 posts (~US$ 0,003/lead). Free cobre ~1.600 leads.", "Cliente (chave própria)", "Não", "apify.com/supreme_coder/linkedin-post"],
    [8, "Instantly", "Disparo", "Envio de cold e-mail + analytics (canal principal)", "Growth ($47) → Hypergrowth ($97)", 47, 97, brl(97), "Assinatura mensal por volume (contatos/e-mails). API em todos os planos; WEBHOOKS só a partir do Hypergrowth.", "Cliente (chave própria)", "Não", "instantly.ai/pricing"],
    [9, "Snov.io", "Disparo", "Exportação alternativa (ADIADA — não usada agora)", "Starter ($39)", 0, 0, 0, "Créditos (busca/verificação) + recipients (envio). Trial NÃO libera API. Fluxo adiado por decisão de produto.", "Cliente (chave própria)", "Não (adiado)", "snov.io/pricing"],
    [10, "Z-API", "Disparo", "WhatsApp para leads quentes", "Ultimate (R$ 99,99)", 18, 18, 100, "Assinatura mensal POR INSTÂNCIA de WhatsApp. Mensagens ILIMITADAS, sem custo por mensagem. Gateway não-oficial.", "Cliente (chave própria)", "Não", "z-api.io"],
    [11, "Anthropic (Claude)", "IA", "2º provedor de IA (planejado — NÃO implementado)", "—", 0, 0, 0, "Por token (futuro). Hoje o código lança 'não implementado'. OpenAI é o caminho ativo.", "—", "Não (planejado)", "anthropic.com/pricing"],
  ];

  rows.forEach((d, i) => {
    const rowIdx = 4 + i;
    const row = p.getRow(rowIdx);
    const zebra = i % 2 === 1;
    const cat = CAT[d[2]] || { t: C.zebra, a: C.ink };
    // estimar altura pelo texto que quebra (cols 4 e 9)
    const lines = Math.max(2, Math.ceil(String(d[3]).length / 50), Math.ceil(String(d[8]).length / 66));
    row.height = 14 * lines + 6;

    d.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val; box(cell);
      let f = { size: 9.5, color: { argb: C.ink } };
      let align = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
      if (zebra) fill(cell, C.zebra);

      if (ci === 0) { f = { size: 10, bold: true, color: { argb: cat.a } }; align = { vertical: "middle", horizontal: "center" }; }
      else if (ci === 1) { f = { size: 10, bold: true, color: { argb: C.ink } }; }
      else if (ci === 2) { fill(cell, cat.t); f = { size: 9, bold: true, color: { argb: cat.a } }; }
      else if (ci >= 5 && ci <= 6) { cell.numFmt = USD; f = { size: 11, bold: true, color: { argb: C.azureDk } }; align = { vertical: "middle", horizontal: "center" }; }
      else if (ci === 7) { cell.numFmt = BRL; f = { size: 9.5, color: { argb: C.muted } }; align = { vertical: "middle", horizontal: "center" }; }
      else if (ci === 8) { f = { size: 8.5, color: { argb: C.ink } }; }
      else if (ci === 9) { f = { size: 9, color: { argb: C.ink }, bold: /TDec/.test(String(val)) }; }
      else if (ci === 10) {
        align = { vertical: "middle", horizontal: "center", wrapText: true };
        const sim = String(val).startsWith("Sim");
        f = { size: 9, bold: true, color: { argb: sim ? C.green : C.muted } };
      } else if (ci === 11) { f = { size: 8.5, color: { argb: C.azureDk }, underline: false }; }
      font(cell, f);
    });
  });

  // total
  const tIdx = 4 + rows.length;
  const tr = p.getRow(tIdx); tr.height = 24;
  const thick = { style: "medium", color: { argb: C.navy } };
  const totals = { 5: rows.reduce((s, x) => s + x[5], 0), 6: rows.reduce((s, x) => s + x[6], 0), 7: rows.reduce((s, x) => s + x[7], 0) };
  for (let ci = 1; ci <= 12; ci++) {
    const cell = tr.getCell(ci);
    fill(cell, C.navy);
    cell.border = { top: thick, bottom: thin, left: thin, right: thin };
    cell.alignment = { vertical: "middle", horizontal: ci >= 6 && ci <= 8 ? "center" : "left", indent: ci <= 2 ? 1 : 0, wrapText: ci === 9 };
    if (ci === 2) { cell.value = "TOTAL"; font(cell, { bold: true, size: 11, color: { argb: C.white } }); }
    else if (ci === 6 || ci === 7) { cell.value = totals[ci]; cell.numFmt = USD; font(cell, { bold: true, size: 12, color: { argb: "FF8FD3FF" } }); }
    else if (ci === 8) { cell.value = totals[7]; cell.numFmt = BRL; font(cell, { bold: true, size: 10, color: { argb: "FF8FD3FF" } }); }
    else if (ci === 9) { cell.value = "Z-API em R$ (≈US$ 18). Snov.io e Anthropic = 0 (fora da V1)."; font(cell, { italic: true, size: 8.5, color: { argb: "FFC9D6E2" } }); }
    else font(cell, { color: { argb: C.white } });
  }

  p.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 12 } };
  p.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

  /* ============================================= Sheet 3: Custo por unidade */
  const u = wb.addWorksheet("Custo por unidade", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  [50, 36, 18, 56].forEach((w, i) => (u.getColumn(i + 1).width = w));

  u.mergeCells("A1:D1");
  c = u.getCell("A1"); c.value = "Custo por unidade — IA e fontes de dados";
  font(c, { size: 14, bold: true, color: { argb: C.white } }); fill(c, C.navy); c.alignment = { vertical: "middle", indent: 1 };
  u.getRow(1).height = 28;

  const uh = u.getRow(3);
  ["Item", "Serviço / modelo", "Custo aprox.", "Notas"].forEach((h, i) => {
    const cell = uh.getCell(i + 1); cell.value = h;
    font(cell, { bold: true, size: 9.5, color: { argb: C.white } }); fill(cell, C.azure); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i === 2 ? "center" : "left", indent: i === 2 ? 0 : 1 };
  });
  uh.height = 22;

  const urows = [
    ["1 e-mail personalizado (~800 in + 300 out)", "OpenAI gpt-4o-mini", "US$ 0,0003", "~3.300 e-mails por US$ 1", false],
    ["1 icebreaker (~1.500 in + 150 out)", "OpenAI gpt-4o-mini", "US$ 0,0003", "~3.170 por US$ 1", false],
    ["10.000 e-mails personalizados", "OpenAI gpt-4o-mini", "US$ 3,00", "Em gpt-4o seria ~US$ 50", false],
    ["10.000 icebreakers", "OpenAI gpt-4o-mini", "US$ 3,15", "", false],
    ["Transcrição de voz (busca por voz)", "OpenAI whisper-1", "US$ 0,006 / min", "Atual: gpt-4o-mini-transcribe ~US$ 0,003/min", false],
    ["Posts do LinkedIn por lead", "Apify (supreme_coder/linkedin-post)", "US$ 0,003 / lead", "US$ 1 / 1.000 posts; ~3 posts por lead", false],
    ["1 empresa retornada (technographic)", "theirStack", "3 créditos", "Tier 1: 1.500 créditos ≈ 500 empresas/mês", false],
    ["Revelar 1 e-mail", "Apollo.io", "1 crédito", "Overage US$ 0,20/crédito", false],
    ["Revelar 1 TELEFONE", "Apollo.io", "8 créditos", "Overage ~US$ 1,60 — maior custo unitário de dados", true],
    ["Revelar 1 contato (e-mail + telefone)", "SignalHire", "1 crédito", "Plano Phones: 435 créditos/mês", false],
  ];
  urows.forEach((d, i) => {
    const row = u.getRow(4 + i); row.height = 20;
    for (let ci = 0; ci < 4; ci++) {
      const cell = row.getCell(ci + 1); cell.value = d[ci]; box(cell);
      if (d[4]) fill(cell, C.dispT); else if (i % 2 === 1) fill(cell, C.zebra);
      const accent = d[4] ? C.dispA : C.ink;
      font(cell, { size: 9.5, bold: ci === 2 || (d[4] && ci === 0), color: { argb: ci === 2 ? C.azureDk : accent } });
      cell.alignment = { vertical: "middle", horizontal: ci === 2 ? "center" : "left", wrapText: true, indent: ci === 2 ? 0 : 1 };
    }
  });

  const noteStart = 4 + urows.length + 1;
  [
    "Nota: gpt-4o-mini / gpt-4o ainda funcionam via API, mas saíram da página de preços.",
    "Equivalentes atuais: gpt-5.4-nano (US$ 0,20 / US$ 1,25 por 1M tokens) e gpt-5.4-mini (US$ 0,75 / US$ 4,50).",
  ].forEach((t, i) => {
    u.mergeCells(`A${noteStart + i}:D${noteStart + i}`);
    const cell = u.getCell(`A${noteStart + i}`); cell.value = t;
    font(cell, { italic: true, size: 9, color: { argb: C.muted } }); cell.alignment = { vertical: "middle", indent: 1 };
    u.getRow(noteStart + i).height = 18;
  });
  u.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  /* ----------------------------------------------------------------- escrever */
  const outFile = path.join(__dirname, "custos-tdec-prospect-v1.xlsx");
  await wb.xlsx.writeFile(outFile);
  console.log("OK ->", outFile);
}

build().catch((e) => { console.error(e); process.exit(1); });
