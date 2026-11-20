// Outils partagés du kit de marque Pilepoil : police vectorisée, logo, symbole, rendu PNG.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const FONTS = new URL('../../mobile/node_modules/@expo-google-fonts', import.meta.url).pathname;
export const FONT_FILES = [
  `${FONTS}/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf`,
  `${FONTS}/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf`,
  `${FONTS}/inter/400Regular/Inter_400Regular.ttf`,
  `${FONTS}/inter/500Medium/Inter_500Medium.ttf`,
  `${FONTS}/inter/600SemiBold/Inter_600SemiBold.ttf`,
  `${FONTS}/inter/700Bold/Inter_700Bold.ttf`,
  `${FONTS}/inter/800ExtraBold/Inter_800ExtraBold.ttf`,
];

export const C = {
  violet: '#5B3DF5', lime: '#C8FF2E', ink: '#0E0F12', mist: '#F2F2F5', white: '#FFFFFF',
  violetLight: '#8F7BFF', violetSoft: '#E6E1FF', amberBg: '#FFE7B0', amberInk: '#6B4500', redBg: '#FFE1E1', redInk: '#A8191F',
  rerB: '#3C91DC', rerA: '#E3051C',
};

const load = (p) => { const b = fs.readFileSync(p); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
export const bricolage = load(FONT_FILES[0]);

const fmt = (n) => Math.round(n * 100) / 100;

/**
 * Le logo « pilepoil » vectorisé : les « i » sans point (ı) reçoivent deux points ronds,
 * violet (stable) et citron (en direct). Retourne le SVG intérieur et sa boîte.
 */
export function wordmark({ size = 200, x = 0, y = 0, ink = C.ink, dot1 = C.violet, dot2 = C.lime, dot2Scale = 1 } = {}) {
  const text = 'pılepoıl';
  const s = size / bricolage.unitsPerEm;
  const glyphs = [...text].map((ch) => bricolage.charToGlyph(ch));
  const baseY = y + size * 0.93;
  let gx = x;
  let d = '';
  const dots = [];
  let k = 0;
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  glyphs.forEach((glyph, idx) => {
    const p = glyph.getPath(gx, baseY, size);
    d += p.toPathData(2);
    const b = p.getBoundingBox();
    x1 = Math.min(x1, b.x1); x2 = Math.max(x2, b.x2); y1 = Math.min(y1, b.y1); y2 = Math.max(y2, b.y2);
    if (glyph.unicode === 0x131) {
      const g = glyph.getBoundingBox();
      dots.push({ cx: gx + ((g.x1 + g.x2) / 2) * s, cy: baseY - 668 * s, r: 98 * s, color: k === 0 ? dot1 : dot2, live: k === 1 });
      k++;
    }
    const next = glyphs[idx + 1];
    const kern = next ? bricolage.getKerningValue(glyph, next) : 0;
    gx += (glyph.advanceWidth + kern) * s - 0.045 * size;
  });
  const bb = { x1, y1, x2, y2 };
  const top = Math.min(bb.y1, ...dots.map((o) => o.cy - o.r));
  const svg = `<path d="${d}" fill="${ink}"/>` +
    dots.map((o) => `<circle cx="${fmt(o.cx)}" cy="${fmt(o.cy)}" r="${fmt(o.live ? o.r * dot2Scale : o.r)}" fill="${o.color}"/>`).join('');
  return { svg, box: { x1: bb.x1, y1: top, x2: bb.x2, y2: bb.y2 }, dots };
}

/** Place un logo dont on connaît la boîte, centré sur (cx, cy), à la largeur voulue. */
export function placeWordmark({ cx, cy, width, ...colors }) {
  const ref = wordmark({ size: 1000, ...colors });
  const w = ref.box.x2 - ref.box.x1, h = ref.box.y2 - ref.box.y1;
  const k = width / w;
  const tx = cx - (ref.box.x1 + w / 2) * k, ty = cy - (ref.box.y1 + h / 2) * k;
  return { svg: `<g transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(k * 1000) / 1000})">${ref.svg}</g>`, height: h * k, dots: ref.dots.map((o) => ({ cx: tx + o.cx * k, cy: ty + o.cy * k, r: o.r * k })) };
}

/**
 * Le symbole : « p » + point citron en haut à droite.
 * Centré dans un carré de `box` px, hauteur du p = `ratio` × box.
 */
export function symbol({ box = 1024, ratio = 0.56, pColor = C.white, dot = C.lime, offsetX = 0, offsetY = 0 } = {}) {
  const g = bricolage.charToGlyph('p');
  const b = g.getBoundingBox(); // unités police, y vers le haut
  const s = (box * ratio) / (b.y2 - b.y1);
  const r = 96, dcx = b.x2 + 28, dcy = b.y2 + 150;
  const minX = b.x1, maxX = dcx + r, maxY = Math.max(b.y2, dcy + r), minY = b.y1;
  const w = (maxX - minX) * s, h = (maxY - minY) * s;
  const ox = (box - w) / 2 - minX * s + offsetX;
  const baseline = (box - h) / 2 + maxY * s + offsetY; // y écran de la ligne de base
  const pth = g.getPath(ox, baseline, s * bricolage.unitsPerEm).toPathData(2);
  return {
    svg: `<path d="${pth}" fill="${pColor}"/><circle cx="${fmt(ox + dcx * s)}" cy="${fmt(baseline - dcy * s)}" r="${fmt(r * s)}" fill="${dot}"/>`,
    dot: { cx: ox + dcx * s, cy: baseline - dcy * s, r: r * s },
  };
}

export const doc = (w, h, inner, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${inner}</svg>`;

export function out(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function png(svg, file, width) {
  const r = new Resvg(svg, {
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  out(file, r.render().asPng());
}

/** Texte SVG (rendu avec les polices du kit). */
export const t = (x, y, str, { size = 40, weight = 600, fill = C.ink, family = 'Inter', anchor = 'start', ls = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}">${str}</text>`;
export const display = (x, y, str, o = {}) => t(x, y, str, { family: 'Bricolage Grotesque', weight: 800, ls: -(o.size ?? 40) * 0.03, ...o });

/** Pastille de statut (« En direct »...). */
export function chip(x, y, label, { bg = C.lime, fg = C.ink, dot = C.ink, size = 28 } = {}) {
  const h = size * 1.75, w = label.length * size * 0.58 + size * 2.4;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/>` +
    `<circle cx="${x + size * 0.95}" cy="${y + h / 2}" r="${size * 0.26}" fill="${dot}"/>` +
    t(x + size * 1.55, y + h / 2 + size * 0.36, label, { size, weight: 700, fill: fg });
}

/** Voie ferrée horizontale avec traverses et le petit train vu du dessus. */
export function rail(x, y, len, { color = C.rerB, w = 34, trainAt = 0.62, done = true } = {}) {
  let s = `<rect x="${x}" y="${y}" width="${len}" height="${w}" rx="5" fill="${color}" opacity="0.28"/>`;
  if (done) s += `<rect x="${x}" y="${y}" width="${len * trainAt}" height="${w}" rx="5" fill="${color}"/>`;
  for (let i = x + 10; i < x + len; i += 14) s += `<rect x="${i}" y="${y}" width="3" height="${w}" fill="#FFFFFF" opacity="0.55"/>`;
  const k = w / 34; // le train grandit avec la voie
  const tx = x + len * trainAt - 92 * k, ty = y + w / 2 - 13 * k;
  for (let i = 0; i < 3; i++) {
    const cx = tx + i * 31 * k;
    const head = i === 2;
    s += `<rect x="${cx}" y="${ty}" width="${(head ? 34 : 27) * k}" height="${26 * k}" rx="${(head ? 11 : 5) * k}" fill="${C.ink}" stroke="#FFFFFF" stroke-width="${3 * k}"/>`;
    s += `<rect x="${cx + 8 * k}" y="${ty + 9 * k}" width="${10 * k}" height="${8 * k}" rx="${2 * k}" fill="${C.violetLight}"/>`;
    if (head) s += `<circle cx="${cx + 28 * k}" cy="${ty + 7 * k}" r="${3 * k}" fill="${C.lime}"/><circle cx="${cx + 28 * k}" cy="${ty + 19 * k}" r="${3 * k}" fill="${C.lime}"/>`;
  }
  return s;
}
