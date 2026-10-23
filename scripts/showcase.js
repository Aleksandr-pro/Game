// Красивые кадры для документации: бой у центра арены.
// node scripts/showcase.js <режим> <бравлер> <файл.png> [секунды]
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
    this.pointer = { x: 1000, y: 260, inside: true, type: 'mouse' };
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
const out = process.argv[4] || 'docs/screenshots/show.png';
const seconds = parseFloat(process.argv[5] || '6');

const input = new FI();
const game = new Game({
  mode, playerBrawlerId: brawler, difficulty: 'normal',
  settings: { aimAssist: true, autoAim: true, shake: false },
  input, onEnd: () => {},
});
const canvas = fakeCanvas(1600, 900);
const renderer = new Renderer(canvas);
const dt = 1 / 60;

// разогрев: боты успевают разойтись и начать бой
for (let i = 0; i < seconds * 60; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  input.moveVec = { x: Math.sin(i / 90), y: Math.cos(i / 130) };
  if (game.player.alive && i % 18 === 0) input.shots.push({ auto: true });
  game.update(dt, cam);
}

// ставим бойцов кучно у центра, чтобы кадр был «живым»
const map = game.map;
const cx = map.gemSpawn.x;
const cy = map.gemSpawn.y;
const p = game.player;
if (p) {
  p.x = cx - 120;
  p.y = cy + 40;
  p.hp = p.maxHp;
  p.angle = -0.2;
  p.superCharge = 100;
}
const SPOTS = [
  [-250, -150], [-235, 170], [250, -150], [250, 70], [175, 205], [55, 235],
];
let k = 0;
for (const bot of game.players) {
  if (bot === p) continue;
  const [ox, oy] = SPOTS[k % SPOTS.length];
  bot.x = cx + ox;
  bot.y = cy + oy;
  bot.hp = bot.maxHp * 0.7;
  bot.alive = true;
  bot.vx = 0;
  bot.vy = 0;
  bot.angle = ox > 0 ? Math.PI : 0;
  k++;
}
game.cameraTarget = { x: cx, y: cy };
game.pickups.push(
  { kind: 'gem', x: cx + 20, y: cy + 90, seed: 1.2, noPickup: 99 },
  { kind: 'gem', x: cx + 66, y: cy + 120, seed: 3.4, noPickup: 99 }
);

// вспышка боя: взрывы и выстрелы
for (let i = 0; i < 90; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  input.moveVec = { x: 0, y: 0 };
  if (i % 14 === 0) input.shots.push({ auto: true });
  game.update(dt, cam);
}
game.addExplosion(cx + 150, cy + 60, 70, { color: '#fff2b0', color2: '#ff8a2f' });
game.addExplosion(cx - 60, cy - 90, 55);
game.addFloater(cx + 40, cy - 130, 'СУПЕР!', '#ffd54a', 22);

// финальный кадр — «открытка»: игрок жив, вспышки урона нет
if (game.player) {
  game.player.alive = true;
  game.player.hp = game.player.maxHp;
  game.player.respawnTimer = 0;
  game.player.hitFlash = 0;
  game.player.x = cx - 120;
  game.player.y = cy + 40;
  game.player.vx = 0;
  game.player.vy = 0;
}
game.hurtFlash = 0;
game.floaters = [];
game.effects = game.effects.filter((e) => e.kind === 'explosion' || e.kind === 'flash');
for (const b of game.players) {
  if (b === game.player) continue;
  b.alive = true;
  b.hp = Math.max(b.maxHp * 0.45, b.hp);
  b.hitFlash = 0;
  b.respawnTimer = 0;
}
for (let i = 0; i < 6; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  game.update(dt, cam);
  renderer.render(game);
}
fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('saved', out, 'zoom', renderer.cam.zoom.toFixed(2));
