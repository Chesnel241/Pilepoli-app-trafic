import { t } from './i18n';
import type { ModeKey } from './lines';

/**
 * Mise en forme des messages de perturbation, souvent longs et écrits d'un bloc par les transporteurs.
 * On en tire : une phrase d'accroche, des faits étiquetés (Quand, Pourquoi, Où, Conseil) et le reste en paragraphes courts.
 */
export interface Structured {
  lead: string;
  facts: { label: string; text: string }[];
  paragraphs: string[];
}

const LABELS: [RegExp, 'when' | 'why' | 'where' | 'tip'][] = [
  [/^(quand|dates?|période|horaires?)$/i, 'when'],
  [/^(raison|motif|cause|pourquoi)$/i, 'why'],
  [/^(où|lieu|secteur|tronçon|arrêts? concernés?)$/i, 'where'],
  [/^(conseil|alternative|itinéraire conseillé|report|reports?|solution|que faire)$/i, 'tip'],
];
const FIELD = /\b(Quand|Dates?|Période|Raison|Motif|Cause|Où|Lieu|Secteur|Tronçon|Conseil|Alternative|Itinéraire conseillé|Reports?|Que faire)\s*:\s*/g;

/** « Bus 272 : Travaux… » → « Travaux… » (le nom de la ligne est déjà affiché à côté). */
export function cleanTitle(title: string): string {
  return title.replace(/^\s*(bus|métro|metro|rer|tram|tramway|train|ligne|transilien|noctilien)\s*[\w-]+\s*[:\-–]\s*/i, '').trim() || title;
}

function splitLong(text: string): string[] {
  const parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= 220) { out.push(p); continue; }
    // Phrases trop longues : coupées aux points, regroupées par deux.
    const sentences = p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((x) => x.trim()) ?? [p];
    for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
  }
  return out;
}

export function structure(message: string): Structured {
  const facts: Structured['facts'] = [];
  let body = message;
  const matches = [...message.matchAll(FIELD)];
  if (matches.length) {
    body = message.slice(0, matches[0].index).trim();
    matches.forEach((m, i) => {
      const end = i + 1 < matches.length ? matches[i + 1].index : message.length;
      const text = message.slice((m.index ?? 0) + m[0].length, end).trim().replace(/[.;,]\s*$/, '');
      const kind = LABELS.find(([re]) => re.test(m[1]))?.[1] ?? 'tip';
      if (text) facts.push({ label: t(`dis.${kind}`), text: text.charAt(0).toUpperCase() + text.slice(1) });
    });
  }
  const paragraphs = splitLong(body);
  return { lead: paragraphs.shift() ?? '', facts, paragraphs };
}

/** « Métro 4 », « RER B », « Ligne N », « Tram T2 », « Bus 272 ». */
export function lineName(code: string, mode: ModeKey): string {
  if (mode === 'metro') return t('ln.metro', { code });
  if (mode === 'rer') return t('ln.rer', { code });
  if (mode === 'train') return t('ln.train', { code });
  if (mode === 'tram') return /^T/i.test(code) ? t('ln.tram', { code }) : t('ln.tram', { code: `T${code}` });
  if (mode === 'cable') return t('ln.cable', { code });
  return t('ln.bus', { code });
}
