/**
 * Preparação de reunião — texto simples para copiar (puro, client-safe)
 * Story: 24.23 - Preparação de reunião
 *
 * Itens sem fonte saem com o prefixo "[Sugestão]". Fatos saem com a fonte (host) e a data.
 */

import type { MeetingPrep, MeetingPrepOrigin } from "@/types/meeting-prep";

export const FACT_KIND_LABEL: Record<string, string> = {
  news: "Notícia",
  job: "Vaga",
  post: "Post",
  site: "Site",
  technology: "Tecnologia",
};

export const ORIGIN_LABEL: Record<MeetingPrepOrigin, string> = {
  dossie: "Dossiê",
  resposta: "Resposta",
  kb: "Base de conhecimento",
  sugestao: "Sugestão",
};

export const EVENT_LABEL: Record<string, string> = {
  email_opened: "Abriu o e-mail",
  email_clicked: "Clicou no link",
  email_replied: "Respondeu",
  email_bounced: "E-mail voltou",
  email_unsubscribed: "Descadastrou",
};

/**
 * Rótulo de um mapa por chave vinda do jsonb, só por chave própria: `__proto__` ou
 * `constructor` não podem devolver um objeto (o React quebraria ao renderizar).
 */
export function labelFor(map: Record<string, string>, key: string): string {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : key;
}

const DATE_TIME_BRT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_UTC = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ISO -> "dd/mm/aaaa hh:mm" (Brasília). Inválido -> "". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATE_TIME_BRT.format(date).replace(",", "");
}

/** YYYY-MM-DD -> dd/mm/aaaa, sem deslocamento de fuso. */
export function formatDay(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : DATE_UTC.format(date);
}

/** Host de uma URL http(s), ou null. */
export function sourceHost(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : null;
  } catch {
    return null;
  }
}

function prefix(origin: MeetingPrepOrigin): string {
  return origin === "sugestao" ? "[Sugestão] " : "";
}

export function formatMeetingPrepText(prep: MeetingPrep, title?: string | null): string {
  const out: string[] = [];
  const name = title?.trim() || prep.account.companyName || "";
  out.push(name ? `Preparação de reunião — ${name}` : "Preparação de reunião");
  const generated = formatDateTime(prep.generatedAt);
  if (generated) out.push(`Gerado em ${generated}`);

  out.push("", "RESUMO DA CONTA");
  if (prep.account.status !== "found") {
    out.push("Sem pesquisa da conta.");
  } else {
    const researched = formatDateTime(prep.account.researchedAt);
    if (researched) {
      out.push(`Pesquisa de ${researched.slice(0, 10)}${prep.account.expired ? " (desatualizada)" : ""}`);
    }
    // Mesma ordem do MeetingPrepPanel: gatilho e hipótese antes dos fatos.
    if (prep.account.whyNow) {
      out.push(`Gatilho: ${prep.account.whyNow.gatilho}`);
      if (prep.account.whyNow.hipoteseDor) out.push(`Hipótese de dor: ${prep.account.whyNow.hipoteseDor}`);
    }
    if (prep.account.facts.length === 0) out.push("Nenhum fato na pesquisa.");
    for (const fact of prep.account.facts) {
      const meta = [labelFor(FACT_KIND_LABEL, fact.kind), formatDay(fact.data)];
      const host = sourceHost(fact.fonteUrl);
      meta.push(host ? `fonte: ${host}` : "fonte inválida");
      out.push(`- ${fact.fato} (${meta.filter(Boolean).join(", ")})`);
    }
  }

  const e = prep.engagement;
  out.push("", "ENGAJAMENTO E RESPOSTA");
  if (e.campaignName) out.push(`Campanha: ${e.campaignName}`);
  if (e.replySubject) out.push(`Assunto: ${e.replySubject}`);
  if (e.replyText) {
    const at = formatDateTime(e.repliedAt);
    out.push(`Resposta${at ? ` (${at})` : ""}: ${e.replyText}`);
  }
  if (e.openCount !== null || e.clickCount !== null) {
    out.push(`Aberturas: ${e.openCount ?? 0} · Cliques: ${e.clickCount ?? 0}`);
  }
  const booked = formatDateTime(e.meetingBookedAt);
  if (booked) out.push(`Reunião marcada em ${booked}`);
  for (const ev of e.events) {
    const at = formatDateTime(ev.at);
    out.push(`- ${labelFor(EVENT_LABEL, ev.type)}${at ? ` em ${at}` : ""}`);
  }

  out.push("", "PONTOS DE CONVERSA");
  prep.talkingPoints.forEach((p, i) => out.push(`${i + 1}. ${prefix(p.origin)}${p.text}`));

  out.push("", "OBJEÇÕES PROVÁVEIS");
  if (prep.objections.length === 0) out.push("Nenhuma objeção prevista.");
  prep.objections.forEach((o, i) => {
    out.push(`${i + 1}. ${prefix(o.origin)}${o.objection}`);
    out.push(`   Resposta: ${o.answer}`);
  });

  return out.join("\n");
}
