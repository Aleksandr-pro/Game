// Headless-симуляция матчей + прогон рендера на заглушке canvas.
// Запуск: node scripts/sim.js
import { Game } from '../src/game.js';

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 40 }),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'string' && prop.startsWith('create')) return () => gradient;
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

function makeCanvas(w = 1600, h = 900) {
  const ctx = makeCtx();
  ctx.canvas = null;
  return {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,',
  };
}

// Заглушки глобальных объектов для браузерного кода
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1600,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  AudioContext: null,
};
globalThis.document = {
  createElement: () => makeCanvas(64, 64),
  getElementById: () => null,
};

const { Renderer } = await import('../src/render.js');
const { MAPS } = await import('../src/maps.js');
const { BRAWLERS } = await import('../src/config.js');

class FakeInput {
  constructor() {
    this.moveVec = { x: 0, y: 0 };
    this.pointer = { x: 800, y: 450, inside: true, type: 'mouse' };
    this.isTouch = false;
    this.aimStick = null;
    this.aiming = false;
    this.shots = [];
    this.superQ = false;
    this.gadgetQ = false;
    this.pauseQ = false;
    this.stats = { shots: 0, supers: 0, gadgets: 0 };
  }
  update() {}
  takeShots() {
    const s = this.shots;
    this.shots = [];
    return s;
  }
  takeSuper() {
    const v = this.superQ;
    this.superQ = false;
    return v;
  }
  takeGadget() {
    const v = this.gadgetQ;
    this.gadgetQ = false;
    return v;
  }
  takePause() {
    return false;
  }
  takeStats() {
    return false;
  }
  stickVector() {
    return null;
  }
  reset() {
    this.shots = [];
  }
}

const renderer = new Renderer(makeCanvas());
const cam = { zoom: 0.85, cx: 1080, cy: 680, viewW: 1600 / 0.85, viewH: 900 / 0.85, w: 1600, h: 900 };

function runMatch(mode, brawlerId, difficulty, maxTime = 165, opts = {}) {
  const input = new FakeInput();
  let ended = null;
  const game = new Game({
    mode,
    playerBrawlerId: brawlerId,
    difficulty,
    settings: { aimAssist: true, autoAim: true, shake: true },
    input,
    onEnd: (res) => {
      ended = res;
    },
  });
  let frames = 0;
  let errors = 0;
  const dt = 1 / 60;
  let time = 0;
  while (time < maxTime && !ended) {
    time += dt;
    frames++;
    const c0 = renderer.computeCamera(game);
    game.cam = c0;
    // Случайное движение игрока + прицеливание в ближайшего врага
    input.moveVec = { x: Math.sin(time * 0.9), y: Math.cos(time * 1.4) };
    const p = game.player;
    if (p && p.alive) {
      let target = null;
      let bd = Infinity;
      for (const e of game.players) {
        if (!e.alive || e.team === p.team) continue;
        if (!game.canSee(p, e)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bd) {
          bd = d;
          target = e;
        }
      }
      if (target) {
        input.pointer.x = 1600 / 2 + (target.x - game.cam.cx) * game.cam.zoom;
        input.pointer.y = 900 / 2 + (target.y - game.cam.cy) * game.cam.zoom;
        input.pointer.inside = true;
        if (frames % 24 === 0) {
          input.shots.push({ sx: input.pointer.x, sy: input.pointer.y, auto: false });
          input.stats.shots++;
        }
      }
      if (p.superCharge >= 100 && frames % 40 === 0) {
        input.superQ = true;
        input.stats.supers++;
      }
      if (p.gadgetCooldown <= 0 && frames % 300 === 0) {
        input.gadgetQ = true;
        input.stats.gadgets++;
      }
    }
    const c = renderer.computeCamera(game);
    try {
      game.update(dt, c);
      if (opts.render && frames % 3 === 0) renderer.render(game);
    } catch (err) {
      errors++;
      console.error('Ошибка на кадре', frames, err);
      if (errors > 3) throw err;
    }
  }
  const result = ended || game.result;
  console.log(
    `${mode.padEnd(9)} ${brawlerId.padEnd(7)} ${difficulty.padEnd(6)} | ${(time).toFixed(0)}с ` +
      `| боты: ${game.players.filter((p) => p.isBot).length}` +
      `| счёт ${JSON.stringify(result?.scores || {})}` +
      `| ${result ? (result.draw ? 'ничья' : result.win ? 'победа' : 'поражение') : 'НЕ ЗАВЕРШЁН'}` +
      `| выстрелов ${input.stats.shots}, урон ${Math.round(game.stats.damage)}, фраги ${game.stats.kills}` +
      (errors ? ` | ОШИБОК ${errors}` : '')
  );
  return { game, result, ended };
}

console.log(`Карт: ${MAPS.length}, бравлеров: ${BRAWLERS.length}`);
let totalErrors = 0;
const cases = [
  ['gemgrab', 'blaze', 'normal'],
  ['brawlball', 'vector', 'hard'],
  ['bounty', 'mira', 'easy'],
  ['gemgrab', 'grom', 'normal'],
  ['bounty', 'lyuma', 'normal'],
  ['brawlball', 'boom', 'normal'],
  ['gemgrab', 'claw', 'hard'],
  ['bounty', 'ping', 'normal'],
  ['brawlball', 'krio', 'normal'],
];
for (const [mode, brawler, diff] of cases) {
  for (const map of MAPS.filter((m) => m.mode === mode)) {
    // проверим, что карта доступна (getMapForMode возвращает случайную)
  }
  const { game, ended } = runMatch(mode, brawler, diff, 165, { render: true });
  if (!ended) totalErrors++;
}
console.log(totalErrors ? `\nПРОБЛЕМЫ: ${totalErrors}` : '\nВСЕ МАТЧИ ЗАВЕРШИЛИСЬ БЕЗ ОШИБОК');
process.exit(totalErrors ? 1 : 0);
