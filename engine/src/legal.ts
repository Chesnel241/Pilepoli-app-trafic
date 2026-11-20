import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * La politique de confidentialité, publiée par le moteur lui-même (lien demandé par l'App Store et Google Play).
 * Source unique : engine/legal/PRIVACY.md. Le rendu Markdown est volontairement minimal (titres, listes, gras, italique).
 */
const FILE = fileURLToPath(new URL('../legal/PRIVACY.md', import.meta.url));
const md = (() => { try { return readFileSync(FILE, 'utf8'); } catch { return ''; } })();

/** Faux tant qu'il reste un « [… à compléter] » : la page ne doit pas partir aux stores dans cet état. */
export const privacyReady = md.length > 0 && !/\[[^\]]*compléter[^\]]*\]/i.test(md);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  let list = false;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list) { out.push('</ul>'); list = false; }
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!line) { flush(); continue; }
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (line.startsWith('- ')) {
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (list) { out.push('</ul>'); list = false; }
    para.push(line);
  }
  flush();
  return out.join('\n');
}

export const privacyHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pilepoil · Confidentialité</title>
<style>body{font:17px/1.55 -apple-system,system-ui,sans-serif;color:#0E0F12;max-width:680px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:30px;line-height:1.15;letter-spacing:-.5px}h2{font-size:20px;margin-top:32px}li{margin:4px 0}em{color:#5C5F6A}</style>
</head><body>
${renderMarkdown(md)}
</body></html>`;
