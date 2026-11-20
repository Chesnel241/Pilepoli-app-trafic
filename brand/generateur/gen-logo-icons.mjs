import { C, wordmark, placeWordmark, symbol, doc, out, png, t, display } from './lib.mjs';

const R = process.env.OUT ?? new URL('../kit', import.meta.url).pathname;

/* ---------- 01 Logo ---------- */
function logoFile(name, colors, bg, pad = 0.12) {
  const ref = wordmark({ size: 1000, ...colors });
  const w = ref.box.x2 - ref.box.x1, h = ref.box.y2 - ref.box.y1;
  const p = w * pad;
  const W = Math.round(w + 2 * p), H = Math.round(h + 2 * p);
  const inner = `<g transform="translate(${p - ref.box.x1} ${p - ref.box.y1})">${ref.svg}</g>`;
  const svg = doc(W, H, inner, bg);
  out(`${R}/01-logo/${name}.svg`, svg);
  png(svg, `${R}/01-logo/${name}.png`, 2400);
}
logoFile('pilepoil-logo-couleur', { ink: C.ink, dot1: C.violet, dot2: C.lime });
logoFile('pilepoil-logo-blanc', { ink: C.white, dot1: C.white, dot2: C.lime });
logoFile('pilepoil-logo-noir-monochrome', { ink: C.ink, dot1: C.ink, dot2: C.ink });
logoFile('pilepoil-logo-blanc-monochrome', { ink: C.white, dot1: C.white, dot2: C.white });
logoFile('pilepoil-logo-sur-violet', { ink: C.white, dot1: C.white, dot2: C.lime }, C.violet, 0.22);
logoFile('pilepoil-logo-sur-noir', { ink: C.white, dot1: C.violetLight, dot2: C.lime }, C.ink, 0.22);

// Logo + slogan, plusieurs langues pour la com' internationale.
const slogans = { fr: 'Pile-poil à l’heure.', en: 'Right on time.', es: 'Justo a tiempo.', de: 'Auf die Minute genau.' };
for (const [lang, s] of Object.entries(slogans)) {
  for (const [variant, ink, d1, bg, sub] of [
    ['couleur', C.ink, C.violet, null, '#3A3D46'],
    ['sur-violet', C.white, C.white, C.violet, C.violetSoft],
  ]) {
    const W = 2400, H = 1000;
    const wm = placeWordmark({ cx: W / 2, cy: 420, width: 1500, ink, dot1: d1, dot2: C.lime });
    const svg = doc(W, H, wm.svg + t(W / 2, 760, s, { size: 120, weight: 600, fill: sub, anchor: 'middle' }), bg);
    out(`${R}/01-logo/slogan/pilepoil-slogan-${lang}-${variant}.svg`, svg);
    png(svg, `${R}/01-logo/slogan/pilepoil-slogan-${lang}-${variant}.png`);
  }
}

// Symbole seul (le « p » au point citron).
for (const [name, bg, pc, dot, rounded] of [
  ['symbole-violet', C.violet, C.white, C.lime, true],
  ['symbole-citron', C.lime, C.ink, C.violet, true],
  ['symbole-noir', C.ink, C.white, C.lime, true],
  ['symbole-transparent-violet', null, C.violet, C.lime, false],
  ['symbole-transparent-blanc', null, C.white, C.lime, false],
]) {
  const S = 1024;
  const shape = bg ? `<rect width="${S}" height="${S}" rx="${rounded ? 230 : 0}" fill="${bg}"/>` : '';
  const svg = doc(S, S, shape + symbol({ box: S, ratio: bg ? 0.56 : 0.74, pColor: pc, dot }).svg);
  out(`${R}/01-logo/symbole/${name}.svg`, svg);
  png(svg, `${R}/01-logo/symbole/${name}.png`, 1024);
}

/* ---------- 02 Icônes d'app ---------- */
const S = 1024;
const full = (bg = C.violet, ratio = 0.56) => doc(S, S, symbol({ box: S, ratio }).svg, bg);

// iOS : un seul fichier 1024, carré plein (iOS arrondit lui-même), sans transparence.
png(full(), `${R}/02-icones-app/ios/AppIcon-1024.png`, 1024);
out(`${R}/02-icones-app/ios/AppIcon-1024.svg`, full());

// Android adaptatif : avant-plan dans la zone de sécurité (66 %), fond plein, monochrome.
const fg = doc(S, S, symbol({ box: S, ratio: 0.38 }).svg);
png(fg, `${R}/02-icones-app/android/adaptive-foreground.png`, 1024);
png(doc(S, S, '', C.violet), `${R}/02-icones-app/android/adaptive-background.png`, 1024);
png(doc(S, S, symbol({ box: S, ratio: 0.38, pColor: '#FFFFFF', dot: '#FFFFFF' }).svg), `${R}/02-icones-app/android/adaptive-monochrome.png`, 1024);
png(full(), `${R}/02-icones-app/android/play-store-512.png`, 512);
for (const [dpi, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const rounded = doc(S, S, `<rect width="${S}" height="${S}" rx="${S * 0.22}" fill="${C.violet}"/>` + symbol({ box: S, ratio: 0.56 }).svg);
  png(rounded, `${R}/02-icones-app/android/mipmap-${dpi}/ic_launcher.png`, px);
  const round = doc(S, S, `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="${C.violet}"/>` + symbol({ box: S, ratio: 0.5 }).svg);
  png(round, `${R}/02-icones-app/android/mipmap-${dpi}/ic_launcher_round.png`, px);
}

// Fichiers prêts pour Expo (mobile/assets).
png(full(), `${R}/02-icones-app/expo/icon.png`, 1024);
png(fg, `${R}/02-icones-app/expo/android-icon-foreground.png`, 1024);
png(doc(S, S, '', C.violet), `${R}/02-icones-app/expo/android-icon-background.png`, 1024);
png(doc(S, S, symbol({ box: S, ratio: 0.38, pColor: '#FFFFFF', dot: '#FFFFFF' }).svg), `${R}/02-icones-app/expo/android-icon-monochrome.png`, 1024);
{
  const wm = placeWordmark({ cx: S / 2, cy: S / 2, width: 860, ink: C.white, dot1: C.white, dot2: C.lime });
  png(doc(S, S, wm.svg), `${R}/02-icones-app/expo/splash-icon.png`, 1024);
}

/* ---------- 03 Web ---------- */
// Petites tailles : symbole grossi pour rester lisible.
const small = doc(S, S, `<rect width="${S}" height="${S}" rx="${S * 0.22}" fill="${C.violet}"/>` + symbol({ box: S, ratio: 0.66 }).svg);
for (const px of [16, 32, 48]) png(small, `${R}/03-web/favicon-${px}.png`, px);
png(full(), `${R}/03-web/apple-touch-icon-180.png`, 180);
png(small, `${R}/03-web/icon-192.png`, 192);
png(small, `${R}/03-web/icon-512.png`, 512);
out(`${R}/03-web/favicon.svg`, small);
png(small, `${R}/02-icones-app/expo/favicon.png`, 48);

console.log('logo + icônes OK');
