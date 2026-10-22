import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
function fakeCanvas(w, h) { const c = createCanvas(w, h); c.clientWidth = w; c.clientHeight = h; c.style = {}; return c; }
globalThis.window = { devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900, addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false }) };
globalThis.document = { createElement: () => fakeCanvas(64, 64) };
const { Renderer, drawPortrait } = await import('../src/render.js');
const { BRAWLERS } = await import('../src/config.js');
const cols = 3, rows = Math.ceil(BRAWLERS.length / cols), cw = 300, ch = 300;
const canvas = fakeCanvas(cols * cw, rows * ch);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#101a2b';
ctx.fillRect(0, 0, canvas.width, canvas.height);
BRAWLERS.forEach((b, i) => {
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  drawPortrait(ctx, b.id, 1.2, cw - 20, ch - 20, x + 10, y + 10);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(b.name, x + cw / 2, y + ch - 14);
});
fs.writeFileSync('shots/portraits.png', canvas.toBuffer('image/png'));
console.log('ok');
