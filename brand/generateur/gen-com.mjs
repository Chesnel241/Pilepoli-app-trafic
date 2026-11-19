import { C, placeWordmark, symbol, doc, out, png, t, display, chip, rail } from './lib.mjs';

const R = process.env.OUT ?? new URL('../kit', import.meta.url).pathname;

/* ---------- 04 Réseaux sociaux ---------- */
const S = 1080;

// Avatar de profil (lisible en rond).
png(doc(S, S, symbol({ box: S, ratio: 0.5 }).svg, C.violet), `${R}/04-reseaux-sociaux/avatar-profil-1080.png`);

// Post 1 : lancement.
{
  const wm = placeWordmark({ cx: S / 2, cy: 470, width: 780, ink: C.white, dot1: C.white, dot2: C.lime });
  const inner = wm.svg +
    t(S / 2, 640, 'Pile-poil à l’heure.', { size: 54, weight: 600, fill: C.violetSoft, anchor: 'middle' }) +
    `<rect x="${S / 2 - 250}" y="820" width="500" height="84" rx="42" fill="${C.lime}"/>` +
    t(S / 2, 875, 'Bientôt sur iOS et Android', { size: 32, weight: 800, anchor: 'middle' });
  png(doc(S, S, inner, C.violet), `${R}/04-reseaux-sociaux/post-1-lancement-1080.png`);
}

// Post 2 : la promesse (honnêteté des horaires).
{
  const inner =
    display(90, 260, 'Ton bus passe', { size: 104 }) +
    display(90, 375, 'vraiment ?', { size: 104 }) +
    chip(90, 470, 'En direct', { size: 34 }) +
    chip(90, 560, 'Estimé', { bg: C.amberBg, fg: C.amberInk, dot: '#B87800', size: 34 }) +
    chip(90, 650, 'Pas vu depuis 12 min', { bg: C.redBg, fg: C.redInk, dot: '#D12F35', size: 34 }) +
    t(90, 840, 'Pilepoil te dit la vérité sur chaque passage.', { size: 38, weight: 600, fill: '#3A3D46' }) +
    placeWordmark({ cx: 900, cy: 975, width: 260 }).svg;
  png(doc(S, S, inner, C.white), `${R}/04-reseaux-sociaux/post-2-promesse-1080.png`);
}

// Post 3 : la bonne sortie.
{
  const inner =
    `<rect x="90" y="150" width="400" height="400" rx="100" fill="${C.ink}"/>` +
    t(290, 250, 'SORTIE', { size: 44, weight: 800, fill: C.white, anchor: 'middle', ls: 6 }) +
    display(290, 500, '3', { size: 270, fill: C.lime, anchor: 'middle' }) +
    display(90, 700, 'Descends.', { size: 96 }) +
    display(90, 805, 'On te dit par où sortir.', { size: 70 }) +
    placeWordmark({ cx: 900, cy: 975, width: 260 }).svg;
  png(doc(S, S, inner, C.lime), `${R}/04-reseaux-sociaux/post-3-sortie-1080.png`);
}

// Story 1080 × 1920 : la consigne du moment.
{
  const W = 1080, H = 1920;
  const inner =
    placeWordmark({ cx: W / 2, cy: 260, width: 520, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    `<rect x="90" y="560" width="900" height="520" rx="64" fill="${C.ink}"/>` +
    `<rect x="140" y="610" width="96" height="96" rx="28" fill="${C.rerB}"/>` +
    display(188, 685, 'B', { size: 64, fill: C.white, anchor: 'middle' }) +
    t(266, 672, 'Bon train, détecté', { size: 36, weight: 600, fill: '#D7D7DE' }) +
    display(140, 840, 'Descends à', { size: 92, fill: C.white }) +
    display(140, 945, 'Châtelet', { size: 92, fill: C.white }) +
    t(140, 1030, 'Dans 3 min, aucun arrêt avant', { size: 40, weight: 600, fill: C.lime }) +
    rail(90, 1200, 900, { color: C.lime, w: 70 }) +
    display(W / 2, 1520, 'Toi, tu ne touches', { size: 84, fill: C.white, anchor: 'middle' }) +
    display(W / 2, 1620, 'à rien.', { size: 84, fill: C.lime, anchor: 'middle' }) +
    t(W / 2, 1780, 'Bientôt sur iOS et Android', { size: 40, weight: 700, fill: C.violetSoft, anchor: 'middle' });
  png(doc(W, H, inner, C.violet), `${R}/04-reseaux-sociaux/story-1080x1920.png`);
}

// Bannières.
function banner(name, W, H, wmWidth, tagSize, safeLeft = 0) {
  const cx = safeLeft || W * 0.3;
  const inner =
    rail(0, H * 0.72, W, { color: C.lime, w: Math.max(22, H * 0.06), trainAt: 0.78 }) +
    placeWordmark({ cx, cy: H * 0.4, width: wmWidth, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    t(W * 0.62, H * 0.44, 'Pile-poil à l’heure.', { size: tagSize, weight: 600, fill: C.violetSoft });
  png(doc(W, H, inner, C.violet), `${R}/04-reseaux-sociaux/${name}`);
}
banner('banniere-linkedin-1584x396.png', 1584, 396, 520, 46);
banner('banniere-x-1500x500.png', 1500, 500, 520, 48);
{
  // YouTube : la zone visible partout est le centre (1546 × 423).
  const W = 2560, H = 1440;
  const inner =
    rail(0, 860, W, { color: C.lime, w: 46, trainAt: 0.7 }) +
    placeWordmark({ cx: W / 2, cy: 660, width: 760, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    t(W / 2, 800, 'Pile-poil à l’heure.', { size: 56, weight: 600, fill: C.violetSoft, anchor: 'middle' });
  png(doc(W, H, inner, C.violet), `${R}/04-reseaux-sociaux/banniere-youtube-2560x1440.png`);
}
// Aperçu de lien (Open Graph).
{
  const W = 1200, H = 630;
  const inner =
    placeWordmark({ cx: W / 2, cy: 270, width: 640, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    t(W / 2, 410, 'Métro, RER, bus. Simple et à l’heure.', { size: 42, weight: 600, fill: C.violetSoft, anchor: 'middle' }) +
    rail(0, 540, W, { color: C.lime, w: 30, trainAt: 0.66 });
  png(doc(W, H, inner, C.violet), `${R}/03-web/og-image-1200x630.png`);
}

/* ---------- 05 Print : flyer A5 (300 dpi) ---------- */
const copy = {
  fr: {
    slogan: 'Pile-poil à l’heure.', h1: 'Ton train passe', h2: 'vraiment ?',
    items: [['En direct ou pas,', 'on te le dit toujours.'], ['Trois gestes :', 'destination, trajet, Go.'], ['On te guide jusqu’à', 'la bonne sortie.']],
    soon: 'Bientôt sur iOS et Android',
  },
  en: {
    slogan: 'Right on time.', h1: 'Is your train', h2: 'really coming?',
    items: [['Live or not,', 'we always tell you.'], ['Three taps:', 'destination, route, Go.'], ['We guide you to', 'the right exit.']],
    soon: 'Coming soon on iOS and Android',
  },
};
for (const [lang, c] of Object.entries(copy)) {
  const W = 1748, H = 2480;
  let inner =
    `<rect width="${W}" height="1000" fill="${C.violet}"/>` +
    placeWordmark({ cx: W / 2, cy: 400, width: 1150, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    t(W / 2, 640, c.slogan, { size: 92, weight: 600, fill: C.violetSoft, anchor: 'middle' }) +
    rail(0, 840, W, { color: C.lime, w: 80, trainAt: 0.7 }) +
    display(150, 1230, c.h1, { size: 150 }) +
    display(150, 1390, c.h2, { size: 150, fill: C.violet });
  c.items.forEach(([a, b], i) => {
    const y = 1560 + i * 200;
    inner += `<circle cx="190" cy="${y + 40}" r="40" fill="${C.lime}"/>` + display(190, y + 62, String(i + 1), { size: 58, anchor: 'middle' }) +
      t(270, y + 30, a, { size: 58, weight: 800 }) + t(270, y + 100, b, { size: 58, weight: 500, fill: '#3A3D46' });
  });
  inner +=
    `<rect x="150" y="2190" width="1060" height="130" rx="65" fill="${C.ink}"/>` +
    t(680, 2275, c.soon, { size: 54, weight: 800, fill: C.lime, anchor: 'middle' }) +
    `<rect x="1330" y="2060" width="260" height="260" rx="28" fill="none" stroke="${C.ink}" stroke-width="6" stroke-dasharray="18 12"/>` +
    t(1460, 2200, '[QR CODE]', { size: 34, weight: 700, fill: C.ink, anchor: 'middle' }) +
    t(1460, 2390, '[pilepoil.fr]', { size: 36, weight: 700, fill: '#3A3D46', anchor: 'middle' });
  png(doc(W, H, inner, C.white), `${R}/05-print/flyer-A5-${lang}.png`);
}

/* ---------- 06 Vidéo : images fixes ---------- */
{
  const W = 1920, H = 1080;
  png(doc(W, H,
    placeWordmark({ cx: W / 2, cy: 470, width: 980, ink: C.white, dot1: C.white, dot2: C.lime }).svg +
    t(W / 2, 680, 'Pile-poil à l’heure.', { size: 64, weight: 600, fill: C.violetSoft, anchor: 'middle' }) +
    t(W / 2, 880, 'Bientôt sur iOS et Android', { size: 40, weight: 700, fill: C.lime, anchor: 'middle' }), C.violet),
    `${R}/06-video/carton-fin-1920x1080.png`);
  // Bandeau titre (lower third) sur fond transparent, à poser sur une vidéo.
  png(doc(W, H,
    `<rect x="90" y="830" width="860" height="150" rx="40" fill="${C.ink}" opacity="0.92"/>` +
    `<rect x="120" y="860" width="90" height="90" rx="24" fill="${C.violet}"/>` +
    symbol({ box: 90, ratio: 0.6, offsetX: 120, offsetY: 860 }).svg +
    t(240, 900, '[Prénom Nom]', { size: 44, weight: 800, fill: C.white }) +
    t(240, 950, '[Fonction], Pilepoil', { size: 32, weight: 600, fill: C.lime })),
    `${R}/06-video/bandeau-titre-transparent-1920x1080.png`);
}

console.log('com OK');
