/**
 * Gera a planilha de custos ESTILIZADA do TDec Prospect — modelo "plano + quantidade".
 * Base: operação de ~1.000 leads/mês. Preços re-verificados em 09/06/2026.
 * Requer exceljs. Rodar: node docs/apresentacao-v1/_build-custos-operacao.cjs
 * Saída: docs/custos-operacao-tdec.xlsx
 */
const ExcelJS = require("exceljs");
const path = require("path");

const FX = 5.5; // R$ por US$ — premissa editável
const brl = (usd) => Math.round(usd * FX);

/* paleta TDec (azure on navy) */
const C = {
  navy: "FF12263A", azure: "FF3D9BE0", azureDk: "FF2B7BB9", white: "FFFFFFFF",
  ink: "FF1A2733", muted: "FF6B7785", border: "FFD6DEE7", zebra: "FFF5F9FC",
  green: "FF1A8A4B", amber: "FFB7791F", red: "FFB42318",
  infraT: "FFE6F1FB", infraA: "FF2B7BB9",
  dadosT: "FFE2F6F1", dadosA: "FF0E9384",
  enxT: "FFE7F5EC", enxA: "FF1A8A4B",
  compT: "FFFDF1DD", compA: "FFB7791F",
  escT: "FFFCEAE7", escA: "FFB42318",
};

const fill = (cell, argb) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: C.border } };
const box = (cell) => (cell.border = { top: thin, left: thin, bottom: thin, right: thin });
const font = (cell, o = {}) => (cell.font = { name: "Calibri", size: 10, color: { argb: C.ink }, ...o });
const USD = '"US$ "#,##0;;"—"';
const BRL = '"R$ "#,##0;;"—"';

async function build() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TDec Prospect";
  wb.created = new Date(0);

  /* ============================================ Sheet 1: Resumo (cenários) */
  const r = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  r.columns = [{ width: 46 }, { width: 16 }, { width: 18 }, { width: 78 }];

  r.mergeCells("A1:D1");
  let c = r.getCell("A1");
  c.value = "TDec Prospect — Custos de Operação  ·  modelo plano + quantidade";
  font(c, { size: 15, bold: true, color: { argb: C.white } });
  fill(c, C.navy); c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  r.getRow(1).height = 32;

  r.mergeCells("A2:D2");
  c = r.getCell("A2");
  c.value = `Base de cálculo: ~1.000 leads/mês   ·   pesquisa 09/06/2026   ·   câmbio premissa: R$ ${FX.toFixed(2)} / US$   ·   valores mensais`;
  font(c, { size: 9.5, italic: true, color: { argb: C.white } });
  fill(c, C.azure); c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  r.getRow(2).height = 20;

  // header cenários
  const rh = r.getRow(4);
  ["CENÁRIO", "US$/mês", "R$/mês", "O que inclui"].forEach((h, i) => {
    const cell = rh.getCell(i + 1);
    cell.value = h; font(cell, { bold: true, color: { argb: C.white } });
    fill(cell, C.azureDk); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i >= 1 && i <= 2 ? "center" : "left", indent: i === 0 || i === 3 ? 1 : 0 };
  });
  rh.height = 22;

  const scen = [
    ["🟢  Enxuta  ·  1.000 leads/mês · só e-mail", "US$ 178", "≈ R$ 1.000", "Infra (Vercel + Supabase + Z-API) + Apollo Basic + Instantly Growth + Apify + OpenAI.", C.enxT, C.enxA],
    ["🟡  Completa  ·  1.000 leads/mês · + telefone", "US$ 277", "≈ R$ 1.540", "Tudo da Enxuta + SignalHire Phones Unlimited ($99 — telefone ilimitado, flat).", C.compT, C.compA],
    ["🔴  Escala  ·  5.000 leads/mês · completa", "US$ 780–980", "≈ R$ 4.300–5.400", "Apollo (export + seats) + Instantly Hypergrowth + SignalHire ($99 flat) + tiers maiores. Apollo domina.", C.escT, C.escA],
  ];
  scen.forEach((s, idx) => {
    const row = r.getRow(5 + idx); row.height = 40;
    const a = row.getCell(1); a.value = s[0]; font(a, { bold: true, size: 11, color: { argb: s[5] } }); fill(a, s[4]); box(a); a.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    const b = row.getCell(2); b.value = s[1]; font(b, { bold: true, size: 13, color: { argb: s[5] } }); fill(b, s[4]); box(b); b.alignment = { vertical: "middle", horizontal: "center" };
    const cc = row.getCell(3); cc.value = s[2]; font(cc, { bold: true, size: 12, color: { argb: s[5] } }); fill(cc, s[4]); box(cc); cc.alignment = { vertical: "middle", horizontal: "center" };
    const d = row.getCell(4); d.value = s[3]; font(d, { size: 9.5, color: { argb: C.ink } }); fill(d, s[4]); box(d); d.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  });

  // modelo de custo (2 blocos)
  r.mergeCells("A8:D8");
  c = r.getCell("A8"); c.value = "MODELO — dois blocos: um fixo, um variável";
  font(c, { bold: true, size: 11, color: { argb: C.navy } }); c.alignment = { vertical: "middle" };
  r.getRow(8).height = 24;

  const model = [
    ["BLOCO 1 · Infraestrutura — FIXO · paga a TDec", "Vercel + Supabase + Z-API. Piso ≈ R$ 347/mês. Quase não escala com volume.", C.infraT, C.infraA],
    ["BLOCO 2 · Dados & Disparo — VARIÁVEL · traga sua chave · cliente", "Plano + quantidade por ferramenta (aba Plataformas). Telefone (SignalHire) = $99 flat, ilimitado.", C.dadosT, C.dadosA],
  ];
  model.forEach((m, idx) => {
    const row = r.getRow(9 + idx); row.height = 28;
    r.mergeCells(`B${9 + idx}:D${9 + idx}`);
    const a = row.getCell(1); a.value = m[0]; font(a, { bold: true, size: 10, color: { argb: m[3] } }); fill(a, m[2]); box(a); a.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    const b = row.getCell(2); b.value = m[1]; font(b, { size: 9.5, color: { argb: C.ink } }); fill(b, m[2]); box(b); b.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  });

  r.mergeCells("A12:D12");
  c = r.getCell("A12");
  c.value = "Telefone NÃO escala (SignalHire $99/mês ilimitado, flat). O que cresce com volume é o Apollo (export credits + seats). A IA custa centavos.";
  font(c, { italic: true, size: 9.5, color: { argb: C.muted } }); c.alignment = { vertical: "middle", wrapText: true };
  r.getRow(12).height = 30;
  r.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  /* ===================================== Sheet 2: Plataformas (plano + qtd) */
  const p = wb.addWorksheet("Plataformas", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  const widths = [4, 20, 16, 38, 24, 12, 48, 20, 14, 30];
  widths.forEach((w, i) => (p.getColumn(i + 1).width = w));

  p.mergeCells("A1:J1");
  c = p.getCell("A1"); c.value = "Plataformas — plano + quantidade incluída (base ~1.000 leads/mês · 09/06/2026)";
  font(c, { size: 14, bold: true, color: { argb: C.white } }); fill(c, C.navy); c.alignment = { vertical: "middle", indent: 1 };
  p.getRow(1).height = 28;

  const header = ["#", "Bloco", "Ferramenta", "Função no app", "Plano (p/ ~1.000)", "US$/mês", "Quantidade incluída no plano", "Quem paga", "Obrigatória?", "Fonte"];
  const hr = p.getRow(3);
  header.forEach((h, i) => {
    const cell = hr.getCell(i + 1); cell.value = h;
    font(cell, { bold: true, size: 9.5, color: { argb: C.white } }); fill(cell, C.azure); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i === 5 ? "center" : "left", wrapText: true, indent: i === 5 ? 0 : 1 };
  });
  hr.height = 32;

  // [#, bloco, ferramenta, função, plano, usd, qtd, paga, obrig, fonte]
  const rows = [
    [1, "Infraestrutura", "Vercel", "Hospedagem do app (Next.js)", "Pro", 20, "1 TB transferência · 1M edge requests · por assento", "TDec", "Sim", "vercel.com/pricing"],
    [2, "Infraestrutura", "Supabase", "Banco + Auth multi-tenant + Edge Functions + cron", "Pro", 25, "DB 8 GB · 100 mil MAU · 2M invocações · 250 GB egress", "TDec", "Sim", "supabase.com/pricing"],
    [3, "Infraestrutura", "Z-API", "WhatsApp (Epic 11)", "Ultimate", 18, "1 número · mensagens ILIMITADAS (R$ 99,99/instância)", "Cliente", "Não", "z-api.io"],
    [4, "Dados & Disparo", "Apollo.io", "Busca de leads + revelar e-mail", "Basic", 59, "~1.000 e-mails/mês via API (export credits — NÃO ilimitado)", "Cliente", "Sim", "apollo.io/pricing"],
    [5, "Dados & Disparo", "SignalHire", "Telefone (callback assíncrono)", "Phones Unlimited", 99, "Telefones ILIMITADOS — flat, não escala por lead", "Cliente", "Opcional", "signalhire.com/pricing"],
    [6, "Dados & Disparo", "Instantly", "Disparo de cold e-mail + analytics", "Growth", 47, "1.000 contatos + 5.000 envios/mês · contas/warmup ilimitados", "Cliente", "Sim", "instantly.ai/pricing"],
    [7, "Dados & Disparo", "Apify", "Posts do LinkedIn → icebreakers", "Free → pay-as-you-go", 6, "3.000 posts/mês ($0,002/post) · Free cobre ~2.500", "Cliente", "Sim", "apify.com/supreme_coder/linkedin-post"],
    [8, "Dados & Disparo", "OpenAI", "Gerar e-mails + icebreakers + busca/voz", "Pay-as-you-go", 3, "~3.500 gerações/mês (gpt-4o-mini) · 10k e-mails ≈ US$ 3", "TDec ou cliente", "Sim p/ IA", "developers.openai.com"],
    [9, "Dados & Disparo", "TheirStack", "Busca de empresas por tecnologia", "API 1.500 (opcional)", 59, "1.500 créditos ≈ 500 empresas (3 créditos/empresa)", "Cliente", "Opcional", "theirstack.com/pricing"],
    [10, "Disparo (alt.)", "Snov.io", "Alternativa ao Instantly (ADIADA)", "—", 0, "Fluxo adiado por decisão de produto (Instantly cobre)", "Cliente", "Não (adiado)", "snov.io/pricing"],
    [11, "IA (planejado)", "Anthropic", "2º provedor de IA (planejado)", "—", 0, "Ainda não implementado no código; OpenAI é o ativo", "—", "Não (planejado)", "anthropic.com/pricing"],
  ];

  const blocoColor = (b) => b.startsWith("Infra") ? { t: C.infraT, a: C.infraA } : b.startsWith("Dados") ? { t: C.dadosT, a: C.dadosA } : { t: C.zebra, a: C.muted };

  rows.forEach((d, i) => {
    const row = p.getRow(4 + i);
    const zebra = i % 2 === 1;
    const bc = blocoColor(d[1]);
    const lines = Math.max(2, Math.ceil(String(d[3]).length / 38), Math.ceil(String(d[6]).length / 48));
    row.height = 14 * lines + 4;

    d.forEach((val, ci) => {
      const cell = row.getCell(ci + 1); cell.value = val; box(cell);
      let f = { size: 9.5, color: { argb: C.ink } };
      let align = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
      if (zebra) fill(cell, C.zebra);
      if (ci === 0) { f = { size: 10, bold: true, color: { argb: bc.a } }; align = { vertical: "middle", horizontal: "center" }; }
      else if (ci === 1) { fill(cell, bc.t); f = { size: 8.5, bold: true, color: { argb: bc.a } }; }
      else if (ci === 2) { f = { size: 10, bold: true, color: { argb: C.ink } }; }
      else if (ci === 5) { cell.numFmt = USD; f = { size: 11, bold: true, color: { argb: C.azureDk } }; align = { vertical: "middle", horizontal: "center" }; }
      else if (ci === 7) { f = { size: 9, color: { argb: C.ink }, bold: /TDec/.test(String(val)) }; }
      else if (ci === 8) {
        align = { vertical: "middle", horizontal: "center", wrapText: true };
        const v = String(val); const sim = v.startsWith("Sim");
        f = { size: 9, bold: true, color: { argb: sim ? C.green : v.startsWith("Opcional") ? C.amber : C.muted } };
      } else if (ci === 9) { f = { size: 8.5, color: { argb: C.azureDk } }; }
      font(cell, f);
    });
  });
  p.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 10 } };
  // nota rodapé
  const pNote = 4 + rows.length + 1;
  p.mergeCells(`A${pNote}:J${pNote}`);
  c = p.getCell(`A${pNote}`);
  c.value = "OpenAI não tem mensalidade (uso). SignalHire e TheirStack são opcionais (telefone / empresas). Totais por cenário na aba Resumo.";
  font(c, { italic: true, size: 9, color: { argb: C.muted } }); c.alignment = { vertical: "middle", indent: 1 };
  p.getRow(pNote).height = 18;
  p.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };

  /* =========================== Sheet 3: Composição + unidade + premissas */
  const u = wb.addWorksheet("Composição & premissas", { views: [{ showGridLines: false }] });
  [50, 16, 18, 44].forEach((w, i) => (u.getColumn(i + 1).width = w));

  u.mergeCells("A1:D1");
  c = u.getCell("A1"); c.value = "Composição da operação (1.000 leads/mês) + custo por unidade";
  font(c, { size: 14, bold: true, color: { argb: C.white } }); fill(c, C.navy); c.alignment = { vertical: "middle", indent: 1 };
  u.getRow(1).height = 28;

  // ---- Parte A: composição
  const ah = u.getRow(3);
  ["Componente", "US$/mês", "R$/mês", "Nota"].forEach((h, i) => {
    const cell = ah.getCell(i + 1); cell.value = h;
    font(cell, { bold: true, size: 9.5, color: { argb: C.white } }); fill(cell, C.azure); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i >= 1 && i <= 2 ? "center" : "left", indent: i === 0 || i === 3 ? 1 : 0 };
  });
  ah.height = 20;

  // [comp, usd, nota, kind, brlOverride?]  kind: 'item' | 'sub' | 'add'
  // brlOverride alinha os subtotais aos números dos slides (R$ ≈, mesma base US$ @ 5,50)
  const comp = [
    ["Infraestrutura fixa (Vercel + Supabase + Z-API)", 63, "Piso fixo — não escala", "item"],
    ["Apollo Basic — ~1.000 e-mails (export credits)", 59, "Via API, NÃO ilimitado", "item"],
    ["Instantly Growth — 1.000 contatos / 5.000 envios", 47, "Disparo", "item"],
    ["Apify — 3.000 posts ($0,002/post)", 6, "Icebreakers", "item"],
    ["OpenAI — IA (e-mails + icebreakers)", 3, "gpt-4o-mini", "item"],
    ["= ENXUTA (só e-mail)", 178, "infra + dados/disparo de e-mail", "sub", 1000],
    ["+ SignalHire Phones Unlimited (telefone)", 99, "ILIMITADO · flat · não escala", "add"],
    ["= COMPLETA (e-mail + telefone)", 277, "operação cheia de 1.000 leads", "sub", 1540],
    ["+ TheirStack (empresas por tecnologia)", 59, "OPCIONAL · menos usado", "add"],
  ];
  let rowI = 4;
  comp.forEach((d) => {
    const row = u.getRow(rowI++); row.height = 20;
    const isSub = d[3] === "sub", isAdd = d[3] === "add";
    const tint = isSub ? C.enxT : isAdd ? C.compT : (rowI % 2 === 0 ? C.zebra : C.white);
    const accent = isSub ? C.enxA : isAdd ? C.compA : C.ink;
    const rValue = d[4] != null ? d[4] : brl(d[1]);
    const a = row.getCell(1); a.value = d[0]; box(a); fill(a, tint); font(a, { size: 9.5, bold: isSub || isAdd, color: { argb: accent } }); a.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    const b = row.getCell(2); b.value = d[1]; b.numFmt = USD; box(b); fill(b, tint); font(b, { size: isSub ? 12 : 10, bold: isSub || isAdd, color: { argb: isSub ? accent : C.azureDk } }); b.alignment = { vertical: "middle", horizontal: "center" };
    const cc = row.getCell(3); cc.value = rValue; cc.numFmt = isSub ? '"≈ R$ "#,##0' : BRL; box(cc); fill(cc, tint); font(cc, { size: isSub ? 11 : 9.5, bold: isSub || isAdd, color: { argb: isSub ? accent : C.muted } }); cc.alignment = { vertical: "middle", horizontal: "center" };
    const dd = row.getCell(4); dd.value = d[2]; box(dd); fill(dd, tint); font(dd, { size: 9, italic: true, color: { argb: C.muted } }); dd.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  });

  // ---- Parte B: custo por unidade
  const ub = rowI + 1;
  u.mergeCells(`A${ub}:D${ub}`);
  c = u.getCell(`A${ub}`); c.value = "CUSTO POR UNIDADE";
  font(c, { bold: true, size: 11, color: { argb: C.navy } }); c.alignment = { vertical: "middle" };
  u.getRow(ub).height = 22;

  const unit = [
    ["1 e-mail personalizado", "OpenAI gpt-4o-mini", "~US$ 0,0003", "10.000 e-mails ≈ US$ 3"],
    ["1 post do LinkedIn", "Apify (supreme_coder/linkedin-post)", "US$ 0,002", "~3 posts/lead = ~US$ 0,006/lead"],
    ["Revelar 1 e-mail (via API)", "Apollo.io — Basic", "1 export credit", "Basic ≈ 1.000/mês — NÃO ilimitado"],
    ["Revelar 1 telefone", "SignalHire — Phones Unlimited", "incluso no $99", "ilimitado · flat · não escala"],
    ["1 empresa (technographic)", "TheirStack — API", "3 créditos", "1.500 créditos ≈ 500 empresas"],
    ["Transcrição de voz (busca por voz)", "OpenAI whisper-1", "US$ 0,006/min", "—"],
  ];
  let rb = ub + 1;
  // header da parte B
  const ubh = u.getRow(rb++);
  ["Item", "Serviço / modelo", "Custo", "Nota"].forEach((h, i) => {
    const cell = ubh.getCell(i + 1); cell.value = h;
    font(cell, { bold: true, size: 9.5, color: { argb: C.white } }); fill(cell, C.dadosA); box(cell);
    cell.alignment = { vertical: "middle", horizontal: i === 2 ? "center" : "left", indent: i === 2 ? 0 : 1 };
  });
  ubh.height = 20;
  unit.forEach((d, i) => {
    const row = u.getRow(rb++); row.height = 18;
    d.forEach((val, ci) => {
      const cell = row.getCell(ci + 1); cell.value = val; box(cell);
      if (i % 2 === 1) fill(cell, C.zebra);
      font(cell, { size: 9.5, bold: ci === 2, color: { argb: ci === 2 ? C.azureDk : C.ink } });
      cell.alignment = { vertical: "middle", horizontal: ci === 2 ? "center" : "left", wrapText: true, indent: ci === 2 ? 0 : 1 };
    });
  });

  // ---- Parte C: premissas / a confirmar
  const uc = rb + 1;
  u.mergeCells(`A${uc}:D${uc}`);
  c = u.getCell(`A${uc}`); c.value = "PREMISSAS & A CONFIRMAR";
  font(c, { bold: true, size: 11, color: { argb: C.navy } }); c.alignment = { vertical: "middle" };
  u.getRow(uc).height = 22;

  const notes = [
    ["Câmbio R$ 5,50 / US$ (editável — ajustar à cotação do dia).", false],
    ["⚠ Apollo via API: e-mail consome export credits (NÃO ilimitado). Confirmar no painel (Settings → API) a cota exata (~1.000/mês vs ~833 se 10k/ano) e se o Basic libera enrichment via API em volume.", true],
    ["SignalHire: Phones / Emails&Phones Unlimited = US$ 99/mês ilimitado (confirmado no site, jun/2026). Emails = US$ 69 = 1.000 créditos.", false],
    ["Telefone é flat ($99) — não escala por lead. O que escala é o Apollo (export credits + seats).", false],
    ["Escolher 1 disparador (Instantly OU Snov.io). Telefone via SignalHire, NÃO via Apollo (bucket mobile pequeno).", false],
  ];
  let rc = uc + 1;
  notes.forEach(([t, warn]) => {
    u.mergeCells(`A${rc}:D${rc}`);
    const cell = u.getCell(`A${rc}`); cell.value = t;
    if (warn) fill(cell, C.compT);
    font(cell, { size: 9, italic: !warn, bold: warn, color: { argb: warn ? C.amber : C.muted } });
    cell.alignment = { vertical: "middle", indent: 1, wrapText: true };
    u.getRow(rc).height = warn ? 30 : 18;
    rc++;
  });

  // fontes
  u.mergeCells(`A${rc}:D${rc}`);
  c = u.getCell(`A${rc}`);
  c.value = "Fontes: signalhire.com · theirstack.com · instantly.ai · apify.com · apollo.io (+docs) · supabase.com · vercel.com · developers.openai.com · z-api.io — acesso 09/06/2026.";
  font(c, { size: 8, color: { argb: C.muted } }); c.alignment = { vertical: "middle", indent: 1, wrapText: true };
  u.getRow(rc).height = 24;

  u.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  /* ----------------------------------------------------------- escrever */
  const outFile = path.join(__dirname, "..", "custos-operacao-tdec.xlsx");
  await wb.xlsx.writeFile(outFile);
  console.log("OK ->", path.resolve(outFile));
}

build().catch((e) => { console.error(e); process.exit(1); });
