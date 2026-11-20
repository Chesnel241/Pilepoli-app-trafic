import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { C, placeWordmark, doc, png, t } from './lib.mjs';

/** Intro logo animée : le mot apparaît, le point citron « s'allume » et pulse, puis le slogan. */
const R = (process.env.OUT ?? new URL('../kit', import.meta.url).pathname) + '/06-video';
const FPS = 30, DUR = 3;
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const seg = (t0, t1, time) => ease((time - t0) / (t1 - t0));

function frame(W, H, time, { bg, width, slogan = 'Pile-poil à l’heure.', tagSize }) {
  const appear = seg(0, 0.55, time);
  const sc = 0.9 + 0.1 * appear;
  const wm = placeWordmark({ cx: W / 2, cy: H * 0.46, width, ink: C.white, dot1: C.white, dot2: 'none' });
  const d = wm.dots[1];
  const pop = time < 0.55 ? 0 : time < 0.75 ? 1.3 * seg(0.55, 0.75, time) : 1.3 - 0.3 * seg(0.75, 0.9, time);
  let rings = '';
  for (const start of [0.85, 1.55]) {
    const p = (time - start) / 1.1;
    if (p > 0 && p < 1) rings += `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r * (1 + 3 * ease(p))}" fill="none" stroke="${C.lime}" stroke-width="${d.r * 0.35 * (1 - p)}" opacity="${0.9 * (1 - p)}"/>`;
  }
  const tag = seg(1.0, 1.5, time);
  const inner =
    `<g opacity="${appear}" transform="translate(${W / 2} ${H * 0.46}) scale(${sc}) translate(${-W / 2} ${-H * 0.46})">` +
    wm.svg + rings + `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r * pop}" fill="${C.lime}"/></g>` +
    `<g opacity="${tag}" transform="translate(0 ${20 * (1 - tag)})">` +
    t(W / 2, H * 0.46 + wm.height * 0.5 + tagSize * 1.9, slogan, { size: tagSize, weight: 600, fill: bg ? C.violetSoft : C.white, anchor: 'middle' }) + '</g>';
  return doc(W, H, inner, bg);
}

function render(name, W, H, opts, codec) {
  const dir = `/tmp/frames-${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FPS * DUR; i++) png(frame(W, H, i / FPS, opts), `${dir}/f${String(i).padStart(4, '0')}.png`);
  const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`, ...codec, `${R}/${name}`];
  execFileSync('ffmpeg', args);
}

const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
render('intro-logo-1920x1080.mp4', 1920, 1080, { bg: C.violet, width: 980, tagSize: 64 }, h264);
render('intro-logo-vertical-1080x1920.mp4', 1080, 1920, { bg: C.violet, width: 760, tagSize: 56 }, h264);
render('intro-logo-noir-1920x1080.mp4', 1920, 1080, { bg: C.ink, width: 980, tagSize: 64 }, h264);
// Version transparente (canal alpha) à poser sur n'importe quelle vidéo : ProRes 4444.
render('logo-anime-transparent-1920x1080.mov', 1920, 1080, { bg: null, width: 980, tagSize: 64 },
  ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']);
// Image de contrôle à mi-animation.
png(frame(1920, 1080, 1.2, { bg: C.violet, width: 980, tagSize: 64 }), '/tmp/video-mid.png', 960);
console.log('vidéo OK');
