// Замер стоимости кадра: сколько миллисекунд уходит на render() в бою.
// node scripts/perf-test.js [mode] [frames]
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
  takeGadget() { return false; }
  takePause() { return false; }
  stickVector() { return null; }
  reset() {}
  queueSuper() {}
  queueGadget() {}
}

const mode = process.argv[2] || 'gemgrab';
const frames = Number(process.argv[3] || 300);
const W = 1600;
const H = 900;

const input = new FI();
const game = new Game({
  mode, playerBrawlerId: 'blaze', difficulty: 'normal',
  settings: { aimAssist: true, autoAim: true, shake: false },
  input, onEnd: () => {},
});
const canvas = fakeCanvas(W, H);
const renderer = new Renderer(canvas);

// прогрев: матч, кэш фона, первая отрисовка
for (let i = 0; i < 200; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  input.moveVec = { x: Math.sin(i / 60), y: Math.cos(i / 90) };
  if (i % 20 === 0 && game.player.alive) input.shots.push({ auto: true });
  game.update(1 / 60, cam);
  renderer.render(game);
}

const times = [];
for (let i = 0; i < frames; i++) {
  const cam = renderer.computeCamera(game);
  game.cam = cam;
  input.moveVec = { x: Math.sin(i / 50), y: Math.cos(i / 70) };
  if (i % 15 === 0 && game.player.alive) input.shots.push({ auto: true });
  game.update(1 / 60, cam);
  const t0 = performance.now();
  renderer.render(game);
  const ms = performance.now() - t0;
  times.push(ms);
  if (ms > 40 && times.length > 2) {
    console.log(`  медленный кадр #${i}: ${ms.toFixed(1)} мс, время матча ${game.time.toFixed(1)} с,` +
      ` частиц ${game.particles.length}, эффектов ${game.effects.length}, снарядов ${game.projectiles.length}`);
  }
}

times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p50 = times[Math.floor(times.length * 0.5)];
const p95 = times[Math.floor(times.length * 0.95)];
const budget = 16.6;
console.log(`кадров: ${times.length}`);
console.log(`среднее: ${avg.toFixed(2)} мс`);
console.log(`медиана: ${p50.toFixed(2)} мс`);
console.log(`p95: ${p95.toFixed(2)} мс`);
console.log(`максимум: ${times[times.length - 1].toFixed(2)} мс`);
if (p95 > budget) {
  console.error(`❌ p95 ${p95.toFixed(2)} мс — больше бюджета кадра ${budget} мс`);
  process.exit(1);
}
console.log(`✓ укладывается в 60 FPS (бюджет ${budget} мс)`);
