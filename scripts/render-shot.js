// Рендер арены в PNG через @napi-rs/canvas (для проверки графики).
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

function fakeCanvas(w, h) {
  const c = createCanvas(w, h);
  c.clientWidth = w;
  c.clientHeight = h;
  c.style = {};
  return c;
}
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1600,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};
globalThis.document = { createElement: () => fakeCanvas(64, 64) };

const { Game } = await import('../src/game.js');
const { Renderer } = await import('../src/render.js');

class FI {
  constructor() {
    this.moveVec = { x: 0, y: 0 };
    this.pointer = { x: 900, y: 300, inside: true, type: 'mouse' };
    this.isTouch = false;
    this.aimStick = null;
    this.aiming = false;
    this.shots = [];
    this.superQ = false;
    this.gadgetQ = false;
  }
  update() {}
  takeShots() { const s = this.shots; this.shots = []; return s; }
  takeSuper() { const v = this.superQ; this.superQ = false; return v; }
  takeGadget() { const v = this.gadgetQ; this.gadgetQ = false; return v; }
  takePause() { return false; }
  stickVector() { return null; }
  reset() {}
  queueSuper() {}
  queueGadget() {}
}

const mode = process.argv[2] || 'gemgrab';
const brawler = process.argv[3] || 'blaze';
const out = process.argv[4] || 'shots/arena.png';
const seconds = parseFloat(process.argv[5] || '7');

const input = new FI();
const game = new Game({
  mode, playerBrawlerId: brawler, difficulty: 'normal',
  settings: { aimAssist: true, autoAim: true, shake: false },
  input, onEnd: () => {},
});
const w = 1600, h = 900;
const canvas = fakeCanvas(w, h);
const renderer = new Renderer(canvas);
const dt = 1 / 60;
const steps = Math.round(seconds * 60);
for (let i = 0; i < steps; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  const p = game.player;
  // простое поведение игрока
  input.moveVec = { x: Math.sin(i / 120), y: Math.cos(i / 150) };
  if (p.alive && i % 20 === 0) {
    input.shots.push({ auto: true });
  }
  if (i === steps - 40) {
    p.superCharge = 100;
    input.superQ = true;
  }
  game.update(dt, cam);
  if (i > steps - 6) renderer.render(game);
}
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('player', game.player.x|0, game.player.y|0, 'cam', renderer.cam.cx|0, renderer.cam.cy|0, renderer.cam.zoom.toFixed(2));console.log('saved', out, 'phase', game.phase, 'time', game.time.toFixed(1), 'projectiles', game.projectiles.length, 'scale', renderer.cam.zoom.toFixed(2));
