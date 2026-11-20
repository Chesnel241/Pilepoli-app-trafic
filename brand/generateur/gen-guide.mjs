import { C, placeWordmark, symbol, doc, png, t, display, chip, rail } from './lib.mjs';

/** Charte graphique en 6 pages paysage (1920 × 1080), assemblées ensuite en PDF. */
const R = '/tmp/guide';
const W = 1920, H = 1080;
const title = (n, s) => t(120, 140, `${n}`, { size: 26, weight: 800, fill: C.violet, ls: 3 }) + display(120, 230, s, { size: 76 });
const body = (x, y, lines, o = {}) => lines.map((l, i) => t(x, y + i * (o.lh ?? 46), l, { size: o.size ?? 30, weight: o.weight ?? 500, fill: o.fill ?? '#3A3D46' })).join('');
const foot = (n) => t(W - 120, H - 60, `Pilepoil · charte v0.1 · ${n}/6`, { size: 22, weight: 600, fill: '#8A8D96', anchor: 'end' });

const pages = [];

// 1. Couverture
pages.push(doc(W, H,
  placeWordmark({ cx: W / 2, cy: 470, width: 1100, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
  t(W / 2, 690, 'Charte de marque', { size: 56, weight: 700, fill: C.violetSoft, anchor: 'middle' }) +
  rail(0, 880, W, { color: C.lime, w: 70, trainAt: 0.72 }), C.violet));

// 2. Le logo
{
  const wm = placeWordmark({ cx: 640, cy: 560, width: 820 });
  const d = wm.dots;
  pages.push(doc(W, H, title('01  LE LOGO', 'Deux points, une promesse.') +
    `<rect x="160" y="330" width="960" height="460" rx="40" fill="${C.mist}"/>` + wm.svg +
    `<circle cx="1268" cy="398" r="18" fill="${C.lime}" stroke="${C.ink}" stroke-width="3"/>` +
    `<circle cx="1268" cy="608" r="18" fill="${C.violet}"/>` +
    display(1300, 412, 'Le point citron', { size: 40 }) + body(1300, 460, ['C’est « en direct » : il pulse', 'dans l’app, comme dans le logo.']) +
    display(1300, 622, 'Le point violet', { size: 40 }) + body(1300, 670, ['La base stable : le réseau', 'qu’on connaît par cœur.']) +
    body(160, 880, ['Toujours en minuscules. Ne jamais redessiner les points, changer leur ordre ou les mettre en même couleur', 'sur fond clair. Zone de protection : la hauteur du « o » tout autour du logo.'], { size: 26, lh: 40 }) + foot(2), C.white));
}

// 3. Couleurs
{
  const sw = (x, w, bg, fg, name, hex, use) =>
    `<rect x="${x}" y="320" width="${w}" height="420" rx="36" fill="${bg}" ${bg === C.white ? `stroke="#E2E2E8" stroke-width="3"` : ''}/>` +
    display(x + 36, 690, name, { size: 44, fill: fg }) + t(x, 800, hex, { size: 30, weight: 800 }) + body(x, 846, use, { size: 24, lh: 34 });
  pages.push(doc(W, H, title('02  LES COULEURS', 'Violet, citron, encre.') +
    sw(120, 520, C.violet, C.white, 'Violet', '#5B3DF5', ['La marque : fonds forts,', 'trajet recommandé.']) +
    sw(680, 400, C.lime, C.ink, 'Citron', '#C8FF2E', ['« En direct », Go, sorties.', 'Toujours avec du noir.']) +
    sw(1120, 300, C.ink, C.white, 'Encre', '#0E0F12', ['Texte, consignes,', 'panneaux de gare.']) +
    sw(1460, 160, C.mist, C.ink, '', '#F2F2F5', ['Brume : cartes.']) +
    sw(1660, 140, C.white, C.ink, '', '#FFFFFF', ['Blanc : fond.']) + foot(3), C.white));
}

// 4. Typographie et ton
pages.push(doc(W, H, title('03  TYPO ET TON', 'On parle comme un pote qui connaît le réseau.') +
  display(120, 420, 'Descends à Châtelet', { size: 110 }) +
  body(120, 480, ['Titres, chiffres, consignes : Bricolage Grotesque ExtraBold (Google Fonts, licence libre OFL)'], { size: 26 }) +
  t(120, 600, 'Suis le A rouge, 6 min de marge.', { size: 54, weight: 600, fill: C.ink }) +
  body(120, 650, ['Texte courant : Inter, de Regular à ExtraBold (Google Fonts, licence libre OFL)'], { size: 26 }) +
  chip(120, 760, '« Pas grave. C’est réglé. »', { size: 30 }) +
  chip(120, 840, '« Pas vu depuis 12 min. »', { size: 30 }) +
  chip(120, 920, '« Perturbation, veuillez patienter. »', { bg: C.redBg, fg: C.redInk, dot: '#D12F35', size: 30 }) +
  body(1000, 800, ['On tutoie. On fait court.', 'On ne présente jamais une estimation', 'comme une certitude.'], { size: 32, weight: 600, fill: C.ink, lh: 50 }) + foot(4), C.white));

// 5. Icône
pages.push(doc(W, H, title('04  L’ICÔNE', 'Le « p » et son point en direct.') +
  `<g transform="translate(120 330)"><rect width="460" height="460" rx="104" fill="${C.violet}"/>${symbol({ box: 460, ratio: 0.56 }).svg}</g>` +
  `<g transform="translate(660 330)"><rect width="300" height="300" rx="68" fill="${C.lime}"/>${symbol({ box: 300, ratio: 0.56, pColor: C.ink, dot: C.violet }).svg}</g>` +
  `<g transform="translate(1040 330)"><rect width="300" height="300" rx="68" fill="${C.ink}"/>${symbol({ box: 300, ratio: 0.56 }).svg}</g>` +
  body(660, 720, ['Principale : violet (stores, écran d’accueil).', 'Variantes citron et noir pour la com’ uniquement.', 'Petites tailles (favicon) : le « p » est agrandi pour rester lisible.'], { size: 28, lh: 44 }) + foot(5), C.white));

// 6. Éléments graphiques
pages.push(doc(W, H, title('05  ÉLÉMENTS GRAPHIQUES', 'La voie, le train, les pastilles.') +
  rail(120, 370, 1680, { color: C.rerB, w: 60, trainAt: 0.55 }) +
  body(120, 490, ['La voie ferrée : la partie faite est pleine, le reste pâle. Le petit train roule dessus. À utiliser en frise.'], { size: 28 }) +
  chip(120, 590, 'En direct', { size: 36 }) + chip(420, 590, 'Estimé', { bg: C.amberBg, fg: C.amberInk, dot: '#B87800', size: 36 }) +
  chip(680, 590, 'Pas vu', { bg: C.redBg, fg: C.redInk, dot: '#D12F35', size: 36 }) +
  body(120, 730, ['Les pastilles de statut : toujours avec le mot écrit, la couleur n’est jamais seule.'], { size: 28 }) +
  `<rect x="120" y="800" width="200" height="200" rx="50" fill="${C.ink}"/>` + t(220, 860, 'SORTIE', { size: 26, weight: 800, fill: C.white, anchor: 'middle', ls: 4 }) + display(220, 975, '3', { size: 130, fill: C.lime, anchor: 'middle' }) +
  body(380, 880, ['Le badge Sortie : noir, numéro citron, énorme.', 'C’est l’élément le plus reconnaissable de l’app.'], { size: 28, lh: 44 }) + foot(6), C.white));

pages.forEach((p, i) => png(p, `${R}/page-${i + 1}.png`));
console.log('charte OK');
