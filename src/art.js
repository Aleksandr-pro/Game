// Художественное оформление арены: статичный фон, декор, амбиент-частицы.
// Всё рисуется процедурно — без картинок и внешних ресурсов.
import { TILE } from './config.js';
import { WALL, CRATE, WATER, BUSH } from './maps.js';

const TAU = Math.PI * 2;

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}

// ---------- Палитры и «характер» арен ----------
export const ARENA_STYLE = {
  mine: {
    ambient: 'spores',
    ambientColor: '#a9ffe4',
    prop: ['lantern', 'crystal', 'rail', 'barrel', 'mushroom'],
    ground: ['pebbles', 'cracks', 'moss'],
    light: '#63e6d6',
    rim: '#b8fff2',
    wallPattern: 'brick',
  },
  ice: {
    ambient: 'snow',
    ambientColor: '#dff4ff',
    prop: ['shards', 'drift', 'puddle', 'lantern', 'flower'],
    ground: ['ice', 'pebbles'],
    light: '#9fe9ff',
    rim: '#eaffff',
    wallPattern: 'ice',
  },
  stadium: {
    ambient: 'pollen',
    ambientColor: '#d9ffc7',
    prop: ['cone', 'tires', 'flag', 'chalk', 'sandbag', 'flower'],
    ground: ['grass', 'pebbles', 'chalk'],
    light: '#9dff9b',
    rim: '#e8ffe0',
    wallPattern: 'metal',
  },
  canyon: {
    ambient: 'embers',
    ambientColor: '#ffb877',
    prop: ['cactus', 'rocks', 'bones', 'barrel', 'log', 'flower'],
    ground: ['sand', 'pebbles', 'cracks'],
    light: '#ffc46b',
    rim: '#ffe6bb',
    wallPattern: 'rock',
  },
};

// ---------- Мелкие детали пола ----------
function pebbles(g, px, py, n, seed) {
  for (let i = 0; i < 3; i++) {
    const h1 = hash2(seed + i * 7, seed * 3 + i);
    const h2 = hash2(seed * 5 + i, seed + i * 11);
    const x = px + 12 + h1 * (TILE - 24);
    const y = py + 12 + h2 * (TILE - 24);
    const r = 2 + h1 * 3.4;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.ellipse(x + 1.4, y + 2, r, r * 0.7, 0, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.05 + h2 * 0.06})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.72, 0, 0, TAU);
    g.fill();
  }
}

function crack(g, px, py, seed, color) {
  const h1 = hash2(seed, 3);
  const h2 = hash2(seed * 2, 9);
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(px + 14 + h1 * 20, py + 10 + h2 * 12);
  g.lineTo(px + 30 + h1 * 18, py + 30 + h2 * 10);
  g.lineTo(px + 24 + h2 * 26, py + 54 + h1 * 10);
  g.lineTo(px + 40 + h1 * 22, py + 66);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(px + 30 + h1 * 18, py + 30 + h2 * 10);
  g.lineTo(px + 52 + h2 * 12, py + 24 + h1 * 12);
  g.stroke();
}

function grassTuft(g, px, py, seed, color) {
  const h = hash2(seed, 17);
  const x = px + 16 + h * (TILE - 32);
  const y = py + 22 + hash2(seed, 23) * (TILE - 44);
  g.strokeStyle = color;
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x + i * 2.6, y);
    g.quadraticCurveTo(x + i * 5, y - 7, x + i * 7.5, y - 13 - Math.abs(i) * 2.5);
    g.stroke();
  }
}

function moss(g, px, py, color) {
  const h = hash2(px, py);
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const h1 = hash2(px + i, py * 3 + i);
    g.beginPath();
    g.arc(px + 12 + h1 * (TILE - 24), py + 14 + h * (TILE - 28), 3 + h1 * 4, 0, TAU);
    g.fill();
  }
}

// Мелкий «мусор» на полу: камешки, щепки, ракушки, листья, гвозди.
function clutter(g, px, py, kind, seed, style) {
  const h1 = hash2(seed, 41);
  const h2 = hash2(seed * 3, 17);
  const h3 = hash2(seed * 7, 5);
  const x = px + 10 + h1 * (TILE - 20);
  const y = py + 10 + h2 * (TILE - 20);
  const r = 2 + h3 * 5;
  switch (kind) {
    case 'stone':
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath();
      g.ellipse(x + 1.5, y + 2, r, r * 0.7, 0.4, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.66, 0.4, 0, TAU);
      g.fill();
      break;
    case 'splinter':
      g.strokeStyle = 'rgba(40,28,16,0.32)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x - r, y + r * 0.4);
      g.lineTo(x + r * 1.4, y - r * 0.5);
      g.stroke();
      g.strokeStyle = 'rgba(255,235,200,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - r, y + r * 0.1);
      g.lineTo(x + r, y - r * 0.7);
      g.stroke();
      break;
    case 'leaf':
      g.fillStyle = 'rgba(90,170,90,0.3)';
      g.save();
      g.translate(x, y);
      g.rotate(h3 * 6);
      g.beginPath();
      g.ellipse(0, 0, r * 1.3, r * 0.6, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(40,90,40,0.3)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(-r * 1.2, 0);
      g.lineTo(r * 1.2, 0);
      g.stroke();
      g.restore();
      break;
    case 'shell':
      g.strokeStyle = 'rgba(255,245,225,0.4)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r, Math.PI, TAU);
      g.stroke();
      g.beginPath();
      g.arc(x, y, r * 0.55, Math.PI, TAU);
      g.stroke();
      break;
    case 'puddle':
      g.fillStyle = 'rgba(150,215,240,0.14)';
      g.beginPath();
      g.ellipse(x, y, r * 2.2, r * 1.1, h1 * 2, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x - r * 0.4, y - r * 0.2, r * 0.9, r * 0.4, h1 * 2, 0, TAU);
      g.stroke();
      break;
    case 'crack':
      g.strokeStyle = 'rgba(0,0,0,0.16)';
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x - r * 2, y - r);
      g.lineTo(x, y);
      g.lineTo(x + r * 1.6, y - r * 0.6);
      g.lineTo(x + r * 2.4, y + r * 0.8);
      g.stroke();
      break;
    case 'tuft':
      g.strokeStyle = 'rgba(120,190,110,0.35)';
      g.lineWidth = 1.5;
      g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(x + i * 2.4, y + r);
        g.quadraticCurveTo(x + i * 4, y, x + i * 6, y - r * 1.8);
        g.stroke();
      }
      break;
    case 'shard':
      g.fillStyle = 'rgba(220,248,255,0.24)';
      g.beginPath();
      g.moveTo(x, y - r * 1.6);
      g.lineTo(x + r * 0.7, y + r * 0.4);
      g.lineTo(x - r * 0.7, y + r * 0.4);
      g.closePath();
      g.fill();
      break;
    case 'ember':
      g.fillStyle = 'rgba(255,180,90,0.18)';
      g.beginPath();
      g.arc(x, y, r * 1.4, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,220,150,0.3)';
      g.beginPath();
      g.arc(x, y, r * 0.55, 0, TAU);
      g.fill();
      break;
    default:
      break;
  }
}

const CLUTTER = {
  mine: ['stone', 'crack', 'splinter', 'puddle', 'tuft', 'stone'],
  ice: ['shard', 'stone', 'crack', 'puddle', 'shard'],
  stadium: ['tuft', 'stone', 'leaf', 'splinter', 'tuft'],
  canyon: ['stone', 'ember', 'crack', 'shell', 'splinter', 'stone'],
};

// ---------- Фон ----------
export function paintArena(map, version = 0) {
  const style = ARENA_STYLE[map.themeId] || ARENA_STYLE[map.id] || ARENA_STYLE.mine;
  const theme = map.theme;
  const W = map.worldW;
  const H = map.worldH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // 1. База: мягкий градиент «свет сверху»
  const base = g.createLinearGradient(0, 0, W * 0.35, H);
  base.addColorStop(0, shade(theme.floor2, 0.06));
  base.addColorStop(0.45, theme.floor);
  base.addColorStop(1, shade(theme.floor, -0.1));
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 2. Крупные световые пятна
  for (let i = 0; i < 7; i++) {
    const h1 = hash2(i + 1, 3);
    const h2 = hash2(7, i + 2);
    const x = (0.12 + h1 * 0.76) * W;
    const y = (0.1 + h2 * 0.8) * H;
    const rad = 220 + h1 * 380;
    const lg = g.createRadialGradient(x, y, 0, x, y, rad);
    lg.addColorStop(0, rgba(style.light, 0.1));
    lg.addColorStop(1, rgba(style.light, 0));
    g.fillStyle = lg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // 2.5. Крупные пятна: мох, гравий, влажные разводы
  for (let i = 0; i < 22; i++) {
    const h1 = hash2(i + 41, 7);
    const h2 = hash2(19, i + 53);
    const x = h1 * W;
    const y = h2 * H;
    const rad = 90 + h1 * 210;
    const light = h2 > 0.5;
    const col = light ? shade(theme.floor2, 0.16) : shade(theme.floor, -0.22);
    const pg = g.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    pg.addColorStop(0, `${col.replace('rgb(', 'rgba(').replace(')', `,${light ? 0.16 : 0.2})`)}`);
    pg.addColorStop(1, `${col.replace('rgb(', 'rgba(').replace(')', ',0)')}`);
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.55 + h1 * 0.35), h1 * 3, 0, TAU);
    g.fill();
  }

  // 2.6. Тонкий узор поверхности (диагональная штриховка)
  g.save();
  g.globalAlpha = 0.035;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  for (let i = -H; i < W + H; i += 46) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  g.restore();

  // 3. Плитка пола
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      const n = hash2(x, y);
      if (tile === WALL || tile === CRATE || tile === WATER) continue;

      const tone = shade(n > 0.5 ? theme.floor2 : theme.floor, (n - 0.5) * 0.06);
      g.fillStyle = tone;
      g.fillRect(px, py, TILE, TILE);

      // едва заметные швы и блик на стыке плит
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(px, py, TILE, 1.4);
      g.fillRect(px, py, 1.4, TILE);
      g.fillStyle = 'rgba(255,255,255,0.028)';
      g.fillRect(px + 1.6, py + 1.6, TILE - 1.6, 1.4);

      // мягкое световое пятно в углу плиты
      const hl = g.createRadialGradient(px + TILE * 0.28, py + TILE * 0.24, 2, px + TILE * 0.28, py + TILE * 0.24, TILE * 0.7);
      hl.addColorStop(0, 'rgba(255,255,255,0.035)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl;
      g.fillRect(px, py, TILE, TILE);

      // рисунок покрытия
      if (map.theme.deco === 'field' && x % 4 < 2) {
        g.fillStyle = 'rgba(255,255,255,0.032)';
        g.fillRect(px, py, TILE, TILE);
      }
      if (map.theme.deco === 'sand' && n > 0.55) {
        g.strokeStyle = 'rgba(255,225,180,0.07)';
        g.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          g.beginPath();
          g.arc(px + 20 + n * 30, py + 24 + i * 26, 22 + n * 8, 0.15, 2.3);
          g.stroke();
        }
      }
      if (map.theme.deco === 'ice') {
        // тонкие грани льда
        g.strokeStyle = 'rgba(205,242,255,0.07)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(px + 6 + n * 24, py + 2);
        g.lineTo(px + 26 + n * 24, py + 30 + n * 10);
        g.lineTo(px + 14 + n * 30, py + 78);
        g.stroke();
        g.strokeStyle = 'rgba(220,248,255,0.05)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(px + 44 + n * 18, py + 12);
        g.lineTo(px + 70, py + 40 + n * 12);
        g.stroke();
      }
      if (map.theme.deco === 'stone' && n > 0.72) {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.beginPath();
        g.arc(px + 20 + n * 40, py + 20 + (1 - n) * 40, 10 + n * 8, 0, TAU);
        g.fill();
      }
    }
  }

  // 4. Мелкий декор на полу
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== 0) continue;
      const n = hash2(x + 31, y + 17);
      const px = x * TILE;
      const py = y * TILE;
      const seed = x * 13 + y * 7;
      if (n > 0.86) pebbles(g, px, py, 3, seed);
      if (n > 0.93) crack(g, px, py, seed, 'rgba(0,0,0,0.18)');
      if (map.theme.deco === 'field' && n > 0.86) grassTuft(g, px, py, seed, 'rgba(150,230,140,0.22)');
      if (map.theme.deco === 'sand' && n > 0.9) grassTuft(g, px, py, seed, 'rgba(130,170,80,0.22)');
      if (map.theme.deco === 'stone' && n > 0.94) moss(g, px, py, 'rgba(70,160,110,0.22)');
      if (map.theme.deco === 'ice' && n > 0.9) {
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.arc(px + 20 + n * 40, py + 30 + (1 - n) * 30, 2.4, 0, TAU);
        g.fill();
      }
    }
  }

  // 4.5. Мелкий мусор — делает пол «живым»
  const clutterKinds = CLUTTER[map.id] || CLUTTER.mine;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== 0) continue;
      const h = hash2(x * 9 + 3, y * 13 + 7);
      if (h < 0.34) continue;
      const px = x * TILE;
      const py = y * TILE;
      const kind = clutterKinds[Math.floor(h * 97) % clutterKinds.length];
      clutter(g, px, py, kind, x * 31 + y * 17 + 5, style);
      if (h > 0.82) {
        const kind2 = clutterKinds[(Math.floor(h * 53) + 2) % clutterKinds.length];
        clutter(g, px, py, kind2, x * 7 + y * 29 + 11, style);
      }
    }
  }

  // 5. Вода
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== WATER) continue;
      const px = x * TILE;
      const py = y * TILE;
      const wg = g.createLinearGradient(px, py, px + TILE * 0.4, py + TILE);
      wg.addColorStop(0, theme.water2);
      wg.addColorStop(0.55, theme.water);
      wg.addColorStop(1, shade(theme.water, -0.22));
      g.fillStyle = wg;
      g.fillRect(px, py, TILE, TILE);

      // глубина
      const dg = g.createRadialGradient(px + TILE / 2, py + TILE / 2, 4, px + TILE / 2, py + TILE / 2, TILE * 0.7);
      dg.addColorStop(0, 'rgba(255,255,255,0.06)');
      dg.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = dg;
      g.fillRect(px, py, TILE, TILE);

      // каустика
      g.strokeStyle = 'rgba(170,240,255,0.16)';
      g.lineWidth = 2.4;
      const n = hash2(x, y);
      for (let i = 0; i < 3; i++) {
        const yy = py + 16 + i * 24 + n * 8;
        g.beginPath();
        g.moveTo(px + 6, yy);
        g.bezierCurveTo(px + 24, yy - 7, px + 42, yy + 8, px + 68, yy - 3);
        g.stroke();
      }
      // блики
      g.fillStyle = 'rgba(255,255,255,0.2)';
      for (let i = 0; i < 3; i++) {
        const h1 = hash2(x * 3 + i, y * 5 + i);
        g.beginPath();
        g.ellipse(px + 12 + h1 * 54, py + 14 + hash2(i, n * 100) * 50, 4 + h1 * 6, 1.6, 0, 0, TAU);
        g.fill();
      }
      // берег
      const isLand = (dx, dy) => {
        const t = map.grid[y + dy]?.[x + dx];
        return t !== undefined && t !== WATER;
      };
      g.strokeStyle = 'rgba(220,250,255,0.3)';
      g.lineWidth = 3;
      g.beginPath();
      if (isLand(0, -1)) { g.moveTo(px, py + 2); g.lineTo(px + TILE, py + 2); }
      if (isLand(0, 1)) { g.moveTo(px, py + TILE - 2); g.lineTo(px + TILE, py + TILE - 2); }
      if (isLand(-1, 0)) { g.moveTo(px + 2, py); g.lineTo(px + 2, py + TILE); }
      if (isLand(1, 0)) { g.moveTo(px + TILE - 2, py); g.lineTo(px + TILE - 2, py + TILE); }
      g.stroke();
    }
  }

  // 6. Ящики
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== CRATE) continue;
      const px = x * TILE;
      const py = y * TILE;
      // тень
      g.fillStyle = 'rgba(0,0,0,0.34)';
      rr(g, px + 7, py + 15, TILE - 10, TILE - 12, 12);
      g.fill();

      const wg = g.createLinearGradient(px, py, px, py + TILE);
      wg.addColorStop(0, '#c08a52');
      wg.addColorStop(0.35, '#a06a38');
      wg.addColorStop(1, '#6f4523');
      g.fillStyle = wg;
      rr(g, px + 5, py + 4, TILE - 10, TILE - 12, 10);
      g.fill();

      // доски
      g.strokeStyle = 'rgba(60,32,12,0.5)';
      g.lineWidth = 2;
      for (let i = 1; i < 3; i++) {
        const yy = py + 4 + ((TILE - 12) / 3) * i;
        g.beginPath();
        g.moveTo(px + 7, yy);
        g.lineTo(px + TILE - 7, yy);
        g.stroke();
      }
      // металлические уголки и центральная полоса
      g.fillStyle = 'rgba(84,90,102,0.9)';
      g.fillRect(px + 8, py + TILE / 2 - 5, TILE - 16, 9);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(px + 8, py + TILE / 2 - 5, TILE - 16, 2);
      g.fillStyle = 'rgba(84,90,102,0.75)';
      for (const [cx2, cy2] of [[6, 5], [TILE - 20, 5], [6, TILE - 23], [TILE - 20, TILE - 23]]) {
        g.fillRect(px + cx2, py + cy2, 14, 12);
      }

      // обводка + блик
      g.strokeStyle = 'rgba(48,26,10,0.9)';
      g.lineWidth = 3;
      rr(g, px + 5, py + 4, TILE - 10, TILE - 12, 10);
      g.stroke();
      g.strokeStyle = 'rgba(255,215,160,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px + 14, py + 8);
      g.lineTo(px + TILE - 16, py + 8);
      g.stroke();

      // гвозди
      g.fillStyle = '#3b4049';
      for (const [dx, dy] of [[13, 12], [TILE - 14, 12], [13, TILE - 18], [TILE - 14, TILE - 18]]) {
        g.beginPath();
        g.arc(px + dx, py + dy, 2.4, 0, TAU);
        g.fill();
      }
    }
  }

  // 7. Стены
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== WALL) continue;
      const px = x * TILE;
      const py = y * TILE;
      const n = hash2(x + 7, y + 13);
      const border = x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1;

      // тень на полу
      const sg = g.createLinearGradient(px + 8, py + TILE, px + 18, py + TILE + 26);
      sg.addColorStop(0, 'rgba(0,0,0,0.34)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      g.fillRect(px + 4, py + TILE - 4, TILE, 30);

      // тело стены
      const wg = g.createLinearGradient(px, py, px, py + TILE);
      if (border) {
        wg.addColorStop(0, shade(theme.wallDark, 0.28));
        wg.addColorStop(0.3, shade(theme.wallDark, 0.1));
        wg.addColorStop(1, shade(theme.wallDark, -0.35));
      } else {
        wg.addColorStop(0, theme.wallTop);
        wg.addColorStop(0.22, theme.wall);
        wg.addColorStop(1, theme.wallDark);
      }
      g.fillStyle = wg;
      rr(g, px + 1, py + 2, TILE - 2, TILE - 4, border ? 4 : 12);
      g.fill();

      if (border) {
        // предупреждающие полосы по краю арены
        g.save();
        g.beginPath();
        rr(g, px + 1, py + 2, TILE - 2, TILE - 4, 4);
        g.clip();
        g.globalAlpha = 0.1;
        g.strokeStyle = style.light;
        g.lineWidth = 10;
        for (let i = -TILE; i < TILE * 2; i += 26) {
          g.beginPath();
          g.moveTo(px + i, py + TILE + 10);
          g.lineTo(px + i + TILE, py - 10);
          g.stroke();
        }
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(px + 4, py + 4, TILE - 8, 2.5);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        rr(g, px + 1, py + 2, TILE - 2, TILE - 4, 4);
        g.stroke();
      }

      // верхняя «крышка»
      const cap = g.createLinearGradient(px, py, px, py + 20);
      cap.addColorStop(0, shade(theme.wallTop, 0.35));
      cap.addColorStop(0.6, shade(theme.wallTop, 0.05));
      cap.addColorStop(1, rgba(theme.wallTop, 0.1));
      g.fillStyle = cap;
      rr(g, px + 4, py + 3, TILE - 8, 19, 9);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(px + 10, py + 4, TILE - 20, 2.5);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(px + 8, py + 21, TILE - 16, 2);

      // узор
      if (style.wallPattern === 'brick') {
        g.strokeStyle = 'rgba(0,0,0,0.2)';
        g.lineWidth = 1.8;
        for (let i = 0; i < 2; i++) {
          const yy = py + 26 + i * 20;
          g.beginPath();
          g.moveTo(px + 6, yy);
          g.lineTo(px + TILE - 6, yy);
          g.stroke();
          const off = i % 2 ? 14 : 34;
          g.beginPath();
          g.moveTo(px + off, yy);
          g.lineTo(px + off, yy + 20);
          g.stroke();
        }
      } else if (style.wallPattern === 'metal') {
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.lineWidth = 2;
        rr(g, px + 10, py + 24, TILE - 20, TILE - 34, 8);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        for (const [dx, dy] of [[14, 28], [TILE - 14, 28], [14, TILE - 14], [TILE - 14, TILE - 14]]) {
          g.beginPath();
          g.arc(px + dx, py + dy, 2.6, 0, TAU);
          g.fill();
        }
        g.fillStyle = rgba(theme.accent, 0.1);
        g.fillRect(px + 18, py + TILE / 2 - 3, TILE - 36, 6);
      } else if (style.wallPattern === 'ice') {
        g.strokeStyle = 'rgba(235,250,255,0.22)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(px + 26 + n * 8, py + 22);
        g.lineTo(px + 44 + n * 6, py + 40);
        g.lineTo(px + 32 + n * 10, py + 60);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.moveTo(px + 52, py + 26);
        g.lineTo(px + 60, py + 44);
        g.stroke();
        g.fillStyle = 'rgba(235,250,255,0.12)';
        g.beginPath();
        g.ellipse(px + 30, py + 34, 10, 6, -0.5, 0, TAU);
        g.fill();
      } else {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.beginPath();
        g.arc(px + 22 + n * 20, py + 34 + n * 14, 9 + n * 6, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.2)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(px + 26 + n * 10, py + 24);
        g.lineTo(px + 36 + n * 8, py + 40);
        g.lineTo(px + 30 + n * 12, py + 56);
        g.lineTo(px + 40 + n * 10, py + 70);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(px + 52, py + 30);
        g.lineTo(px + 60, py + 46);
        g.stroke();
      }

      // обводка и подсветка
      g.strokeStyle = 'rgba(6,16,22,0.45)';
      g.lineWidth = 2.5;
      rr(g, px + 1, py + 2, TILE - 2, TILE - 4, 12);
      g.stroke();
      g.strokeStyle = rgba(style.rim, 0.35);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px + 12, py + 4);
      g.lineTo(px + TILE - 12, py + 4);
      g.stroke();
    }
  }

  // 7.7. Стартовые площадки команд
  const mapCx = W / 2;
  const mapCy = H / 2;
  for (const team of [0, 1]) {
    const col = team === 0 ? '#5fc8ff' : '#ff7a9c';
    for (const sp of map.spawns[team] || []) {
      const r2 = 62;
      const sg2 = g.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, r2);
      sg2.addColorStop(0, rgba(col, 0.3));
      sg2.addColorStop(0.7, rgba(col, 0.12));
      sg2.addColorStop(1, rgba(col, 0));
      g.fillStyle = sg2;
      g.beginPath();
      g.ellipse(sp.x, sp.y, r2, r2 * 0.66, 0, 0, TAU);
      g.fill();
      g.strokeStyle = rgba(col, 0.45);
      g.lineWidth = 2.5;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.ellipse(sp.x, sp.y, r2 * 0.8, r2 * 0.52, 0, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      // стрелка-указатель к центру
      const ang = Math.atan2(mapCy - sp.y, mapCx - sp.x);
      g.save();
      g.translate(sp.x + Math.cos(ang) * r2 * 0.52, sp.y + Math.sin(ang) * r2 * 0.36);
      g.rotate(ang);
      g.fillStyle = rgba(col, 0.4);
      g.beginPath();
      g.moveTo(9, 0);
      g.lineTo(-6, 6);
      g.lineTo(-6, -6);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  // 8. Эмблема арены в центре
  const cx = W / 2;
  const cy = H / 2;
  g.save();
  g.globalAlpha = 0.14;
  g.strokeStyle = style.light;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(cx, cy, 190, 0, TAU);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, 220, 0, TAU);
  g.stroke();
  g.fillStyle = style.light;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190, 7, 0, TAU);
    g.fill();
  }
  // звезда
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 96 : 42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();

  // 7.2. Мягкие тени от стен на полу (ambient occlusion)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== WALL) continue;
      const px = x * TILE;
      const py = y * TILE;
      const cast = (nx, ny, w, h, gx, gy, gx2, gy2) => {
        const gr = g.createLinearGradient(gx, gy, gx2, gy2);
        gr.addColorStop(0, 'rgba(0,0,0,0.3)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(nx, ny, w, h);
      };
      if (map.grid[y + 1]?.[x] !== WALL) cast(px, py + TILE - 2, TILE, 34, px, py + TILE, px, py + TILE + 34);
      if (map.grid[y - 1]?.[x] !== WALL) cast(px, py - 20, TILE, 22, px, py, px, py - 20);
    }
  }

  // 7.5. Разметка арены
  if (map.mode === 'brawlball') {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 150, 0, TAU);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 16, 0, TAU);
    g.stroke();
    g.beginPath();
    g.moveTo(0, cy);
    g.lineTo(cx - 170, cy);
    g.moveTo(cx + 170, cy);
    g.lineTo(W, cy);
    g.stroke();
    for (const team of [0, 1]) {
      const gl = map.goals[team];
      if (!gl) continue;
      g.strokeStyle = rgba(team === 0 ? '#7fd8ff' : '#ff8fa8', 0.6);
      g.lineWidth = 5;
      const inset = 46;
      const bx = team === 0 ? gl.x + gl.w : gl.x - inset;
      g.strokeRect(bx, gl.y - 8, inset, gl.h + 16);
      g.setLineDash([14, 10]);
      g.strokeStyle = rgba(team === 0 ? '#7fd8ff' : '#ff8fa8', 0.35);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(team === 0 ? gl.x + gl.w + 5 : gl.x - 5, gl.y + gl.h / 2, 60, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }

  // 7.6. Кромка арены по периметру
  for (let i = 0; i < map.width; i++) {
    const px = i * TILE;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(px, 0, TILE, 4);
    g.fillStyle = rgba(style.light, 0.12);
    g.fillRect(px, 4, TILE, 2);
  }
  for (let j = 0; j < map.height; j++) {
    const py = j * TILE;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, py, 4, TILE);
    g.fillStyle = rgba(style.light, 0.12);
    g.fillRect(4, py, 2, TILE);
  }

  // 8.5. Декор на стенах: баннеры, сосульки, снег, лианы
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== WALL) continue;
      const px = x * TILE;
      const py = y * TILE;
      const top = map.grid[y - 1]?.[x] !== WALL;
      const n = hash2(x * 7 + 1, y * 11 + 3);
      if (top && n > 0.62) {
        if (map.theme.deco === 'ice') {
          // снежная шапка и сосульки
          g.fillStyle = 'rgba(255,255,255,0.5)';
          rr(g, px + 6, py + 1, TILE - 12, 8, 4);
          g.fill();
          g.fillStyle = 'rgba(220,245,255,0.55)';
          for (let i = 0; i < 3; i++) {
            const ix = px + 16 + i * 20 + n * 6;
            g.beginPath();
            g.moveTo(ix, py + 6);
            g.lineTo(ix + 5, py + 6);
            g.lineTo(ix + 2.5, py + 20 + (i % 2) * 8);
            g.closePath();
            g.fill();
          }
        } else if (map.theme.deco === 'field') {
          // баннеры
          g.fillStyle = rgba(theme.accent, 0.35);
          g.beginPath();
          g.moveTo(px + 14, py + 6);
          g.lineTo(px + TILE - 14, py + 6);
          g.lineTo(px + TILE - 20, py + 26);
          g.lineTo(px + 20, py + 26);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(px + 20, py + 10, TILE - 40, 2);
        } else if (map.theme.deco === 'stone') {
          // лианы/мох
          g.strokeStyle = 'rgba(70,170,120,0.35)';
          g.lineWidth = 2.2;
          g.beginPath();
          g.moveTo(px + 20 + n * 20, py + 4);
          g.quadraticCurveTo(px + 28 + n * 24, py + 22, px + 18 + n * 26, py + 38);
          g.stroke();
          g.fillStyle = 'rgba(90,200,140,0.3)';
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.ellipse(px + 22 + n * 20 + i * 3, py + 12 + i * 9, 4, 2.4, 0.6, 0, TAU);
            g.fill();
          }
        } else {
          // факел на стене
          g.fillStyle = '#4a3520';
          g.fillRect(px + TILE / 2 - 3, py + 4, 6, 16);
          const fg2 = g.createRadialGradient(px + TILE / 2, py + 2, 0, px + TILE / 2, py + 2, 26);
          fg2.addColorStop(0, 'rgba(255,220,140,0.55)');
          fg2.addColorStop(1, 'rgba(255,170,60,0)');
          g.fillStyle = fg2;
          g.beginPath();
          g.arc(px + TILE / 2, py + 2, 26, 0, TAU);
          g.fill();
          g.fillStyle = '#ffd98a';
          g.beginPath();
          g.ellipse(px + TILE / 2, py - 1, 4.5, 8, 0, 0, TAU);
          g.fill();
        }
      }
    }
  }

  // 9. Реквизит
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== 0) continue;
      const n = hash2(x * 3 + 5, y * 5 + 11);
      if (n < 0.68) continue;
      // не засоряем центр и спавны
      const px = x * TILE + TILE / 2;
      const py = y * TILE + TILE / 2;
      if (Math.hypot(px - cx, py - cy) < 170) continue;
      let nearSpawn = false;
      for (const team of [0, 1]) {
        for (const s of map.spawns[team] || []) {
          if (Math.hypot(px - s.x, py - s.y) < 150) nearSpawn = true;
        }
      }
      if (nearSpawn) continue;
      const kind = style.prop[Math.floor(hash2(x, y) * style.prop.length) % style.prop.length];
      g.save();
      g.translate(px + (n - 0.5) * 22, py + (n - 0.5) * 18);
      drawProp(g, kind, style, n);
      g.restore();
    }
  }

  // 10. Затемнение краёв + зерно
  const edge = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.42, cx, cy, Math.max(W, H) * 0.72);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 2600; i++) {
    const hx = hash2(i, 1) * W;
    const hy = hash2(2, i) * H;
    g.fillStyle = `rgba(255,255,255,${0.012 + hash2(i, 3) * 0.02})`;
    g.fillRect(hx, hy, 1.6, 1.6);
  }

  return c;
}

// ---------- Реквизит ----------
function drawProp(g, kind, style, n) {
  switch (kind) {
    case 'lantern': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(0, 14, 16, 6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#3a4b52';
      g.fillRect(-3, -14, 6, 26);
      const glow = g.createRadialGradient(0, -20, 2, 0, -20, 40);
      glow.addColorStop(0, rgba(style.light, 0.4));
      glow.addColorStop(1, rgba(style.light, 0));
      g.fillStyle = glow;
      g.beginPath();
      g.arc(0, -20, 40, 0, TAU);
      g.fill();
      g.fillStyle = '#ffd98a';
      rr(g, -8, -28, 16, 17, 5);
      g.fill();
      g.strokeStyle = '#6b5330';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ffeec2';
      g.beginPath();
      g.arc(0, -20, 4, 0, TAU);
      g.fill();
      break;
    }
    case 'crystal': {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(0, 10, 18, 6, 0, 0, TAU);
      g.fill();
      for (const [dx, h, w] of [[-8, 20, 6], [6, 30, 7], [0, 14, 5]]) {
        const cg = g.createLinearGradient(dx, -h, dx, 8);
        cg.addColorStop(0, '#d7fff6');
        cg.addColorStop(1, style.light);
        g.fillStyle = cg;
        g.beginPath();
        g.moveTo(dx, -h);
        g.lineTo(dx + w, 0);
        g.lineTo(dx, 8);
        g.lineTo(dx - w, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 1.2;
        g.stroke();
      }
      break;
    }
    case 'rail': {
      g.strokeStyle = 'rgba(30,22,14,0.5)';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(-34, 12);
      g.lineTo(34, 4);
      g.stroke();
      g.strokeStyle = 'rgba(170,180,190,0.35)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-34, 8);
      g.lineTo(34, 0);
      g.stroke();
      g.strokeStyle = 'rgba(60,40,20,0.5)';
      g.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * 14, 2 + i * 2);
        g.lineTo(i * 14 + 4, 18 + i * 2);
        g.stroke();
      }
      break;
    }
    case 'barrel': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(0, 16, 16, 6, 0, 0, TAU);
      g.fill();
      const bg = g.createLinearGradient(-14, 0, 14, 0);
      bg.addColorStop(0, '#6b4a2b');
      bg.addColorStop(0.4, '#a06d3f');
      bg.addColorStop(1, '#5c3d22');
      g.fillStyle = bg;
      rr(g, -13, -14, 26, 30, 8);
      g.fill();
      g.fillStyle = 'rgba(60,62,70,0.85)';
      g.fillRect(-13, -6, 26, 4);
      g.fillRect(-13, 6, 26, 4);
      g.strokeStyle = 'rgba(30,18,8,0.8)';
      g.lineWidth = 2;
      rr(g, -13, -14, 26, 30, 8);
      g.stroke();
      g.fillStyle = 'rgba(255,220,170,0.2)';
      g.beginPath();
      g.ellipse(-6, -18, 9, 4, 0, 0, TAU);
      g.fill();
      break;
    }
    case 'shards': {
      g.fillStyle = 'rgba(0,0,0,0.24)';
      g.beginPath();
      g.ellipse(0, 12, 20, 6, 0, 0, TAU);
      g.fill();
      for (const [dx, h, rot] of [[-10, 26, -0.3], [4, 34, 0.12], [14, 18, 0.4]]) {
        g.save();
        g.translate(dx, 10);
        g.rotate(rot);
        const ig = g.createLinearGradient(0, -h, 0, 0);
        ig.addColorStop(0, 'rgba(255,255,255,0.85)');
        ig.addColorStop(1, 'rgba(150,220,255,0.4)');
        g.fillStyle = ig;
        g.beginPath();
        g.moveTo(0, -h);
        g.lineTo(7, 0);
        g.lineTo(-6, 4);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 1.2;
        g.stroke();
        g.restore();
      }
      break;
    }
    case 'drift': {
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath();
      g.ellipse(0, 6, 26, 12, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath();
      g.ellipse(-6, 2, 16, 8, 0, 0, TAU);
      g.fill();
      break;
    }
    case 'puddle': {
      const pg = g.createRadialGradient(0, 0, 2, 0, 0, 26);
      pg.addColorStop(0, 'rgba(190,240,255,0.35)');
      pg.addColorStop(1, 'rgba(120,200,240,0.08)');
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(0, 0, 26, 14, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(-4, -2, 10, 4, 0, 0, TAU);
      g.stroke();
      break;
    }
    case 'cone': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(0, 14, 14, 5, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#ff7a2f';
      g.beginPath();
      g.moveTo(0, -22);
      g.lineTo(12, 14);
      g.lineTo(-12, 14);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.moveTo(-6.5, -6);
      g.lineTo(6.5, -6);
      g.lineTo(9, 4);
      g.lineTo(-9, 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#d2591a';
      rr(g, -15, 12, 30, 5, 2);
      g.fill();
      break;
    }
    case 'tires': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(0, 16, 22, 7, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? '#2b3440' : '#222a34';
        rr(g, -20, 10 - i * 8, 40, 10, 5);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.lineWidth = 1.4;
        g.stroke();
      }
      break;
    }
    case 'flag': {
      g.strokeStyle = '#8a99a6';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, 16);
      g.lineTo(0, -34);
      g.stroke();
      const fg = g.createLinearGradient(0, -34, 26, -12);
      fg.addColorStop(0, rgba(style.light, 0.9));
      fg.addColorStop(1, rgba(style.light, 0.4));
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(2, -32);
      g.quadraticCurveTo(18, -28 + Math.sin(n * 6) * 3, 28, -24);
      g.lineTo(28, -8);
      g.quadraticCurveTo(16, -12, 2, -14);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(0, 18, 6, 0, TAU);
      g.fill();
      break;
    }
    case 'chalk': {
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-30, 6);
      g.lineTo(30, 6);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 6, 16, Math.PI, TAU);
      g.stroke();
      break;
    }
    case 'cactus': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(0, 16, 15, 6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#3f7d3c';
      rr(g, -8, -24, 16, 40, 7);
      g.fill();
      rr(g, -20, -10, 12, 10, 5);
      g.fill();
      rr(g, 8, -18, 12, 10, 5);
      g.fill();
      g.fillStyle = 'rgba(120,210,120,0.35)';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(-2 + (i % 2) * 5, -18 + i * 9, 2, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'rocks': {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(0, 12, 22, 7, 0, 0, TAU);
      g.fill();
      for (const [dx, dy, r] of [[-10, 4, 9], [8, 6, 7], [0, -6, 7]]) {
        const rg = g.createLinearGradient(dx - r, dy - r, dx + r, dy + r);
        rg.addColorStop(0, '#9a7350');
        rg.addColorStop(1, '#5d4028');
        g.fillStyle = rg;
        g.beginPath();
        g.ellipse(dx, dy, r, r * 0.8, 0.3, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(40,24,12,0.6)';
        g.lineWidth = 1.4;
        g.stroke();
      }
      break;
    }
    case 'mushroom': {
      g.fillStyle = 'rgba(0,0,0,0.24)';
      g.beginPath();
      g.ellipse(0, 10, 13, 5, 0, 0, TAU);
      g.fill();
      for (const [dx, dy, r2] of [[-7, 2, 8], [7, 6, 6]]) {
        const glow = g.createRadialGradient(dx, dy, 0, dx, dy, r2 * 2.6);
        glow.addColorStop(0, rgba(style.light, 0.35));
        glow.addColorStop(1, rgba(style.light, 0));
        g.fillStyle = glow;
        g.beginPath();
        g.arc(dx, dy, r2 * 2.6, 0, TAU);
        g.fill();
        g.fillStyle = '#e8fff4';
        g.beginPath();
        g.ellipse(dx, dy, r2, r2 * 0.72, 0, Math.PI, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.beginPath();
        g.arc(dx - 2, dy - 3, 1.6, 0, TAU);
        g.fill();
        g.strokeStyle = '#cfe9dd';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(dx, dy);
        g.lineTo(dx, dy + 7);
        g.stroke();
      }
      break;
    }
    case 'flower': {
      for (let i = 0; i < 3; i++) {
        const dx = (hash2(i, n * 100) - 0.5) * 26;
        const dy = (hash2(i + 4, n * 50) - 0.5) * 14;
        g.strokeStyle = 'rgba(120,200,120,0.4)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(dx, dy + 7);
        g.lineTo(dx, dy);
        g.stroke();
        g.fillStyle = i % 2 ? 'rgba(255,235,150,0.85)' : 'rgba(255,255,255,0.75)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          g.beginPath();
          g.ellipse(dx + Math.cos(a) * 3, dy + Math.sin(a) * 3, 2.6, 1.8, a, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(255,190,80,0.9)';
        g.beginPath();
        g.arc(dx, dy, 1.6, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'sandbag': {
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.beginPath();
      g.ellipse(0, 12, 22, 7, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 2; i++) {
        g.fillStyle = i ? '#8b7a4f' : '#a3905f';
        rr(g, -18 + i * 2, 4 - i * 9, 34, 11, 5);
        g.fill();
        g.strokeStyle = 'rgba(60,50,25,0.5)';
        g.lineWidth = 1.2;
        g.stroke();
      }
      break;
    }
    case 'log': {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(0, 12, 24, 7, 0, 0, TAU);
      g.fill();
      const lg = g.createLinearGradient(0, -6, 0, 10);
      lg.addColorStop(0, '#8a5f38');
      lg.addColorStop(1, '#4f351d');
      g.fillStyle = lg;
      rr(g, -24, -6, 48, 17, 8);
      g.fill();
      g.strokeStyle = 'rgba(40,24,12,0.7)';
      g.lineWidth = 1.6;
      g.stroke();
      g.fillStyle = 'rgba(200,160,110,0.5)';
      g.beginPath();
      g.ellipse(-22, 2, 4, 7, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(30,20,10,0.4)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(-22, 2, 2.4, 0, TAU);
      g.stroke();
      break;
    }
    case 'bones': {
      g.strokeStyle = 'rgba(240,232,210,0.55)';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-16, 6);
      g.lineTo(10, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(-6, 12);
      g.lineTo(14, 10);
      g.stroke();
      g.fillStyle = 'rgba(240,232,210,0.6)';
      g.beginPath();
      g.arc(-16, 6, 3.4, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(10, 0, 3.4, 0, TAU);
      g.fill();
      break;
    }
    default:
      break;
  }
}

// ---------- Анимированные слои поверх фона ----------
export function drawWaterLife(ctx, map, view, t, style) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x] !== WATER) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (px + TILE < view.x - 40 || px > view.x + view.w + 40) continue;
      if (py + TILE < view.y - 40 || py > view.y + view.h + 40) continue;
      const ph = hash2(x, y) * 6;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(210,250,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        const wx = px + k * TILE;
        const wy = py + 30 + Math.sin(k * 6 + t * 1.6 + ph) * 4 + Math.sin(t * 0.8 + ph) * 3;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const sx = px + 20 + Math.sin(t * 0.7 + ph) * 16;
      const sy = py + 56 + Math.cos(t * 1.1 + ph) * 8;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 5, 1.8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

// Амбиент: пыль/снег/искры/пыльца, медленно плывущие над ареной.
export function drawAmbient(ctx, game, view, t) {
  const style = ARENA_STYLE[game.map.themeId] || ARENA_STYLE[game.map.id] || ARENA_STYLE.mine;
  const kind = style.ambient;
  const N = 46;
  for (let i = 0; i < N; i++) {
    const h1 = hash2(i, 11);
    const h2 = hash2(13, i);
    const drift = kind === 'embers' ? -1 : 1;
    const speed = kind === 'snow' ? 26 : kind === 'embers' ? 30 : 14;
    let x = h1 * game.map.worldW + Math.sin(t * 0.35 + i) * 24 + t * speed * 0.35 * drift;
    let y = h2 * game.map.worldH + Math.cos(t * 0.28 + i * 1.7) * 18 - t * speed * (kind === 'embers' ? 0.5 : 0.15);
    x = ((x % game.map.worldW) + game.map.worldW) % game.map.worldW;
    y = ((y % game.map.worldH) + game.map.worldH) % game.map.worldH;
    if (x < view.x - 30 || x > view.x + view.w + 30 || y < view.y - 30 || y > view.y + view.h + 30) continue;
    const tw = 0.45 + Math.sin(t * 2.4 + i * 2.1) * 0.35;
    ctx.save();
    if (kind === 'snow') {
      ctx.fillStyle = `rgba(230,248,255,${0.22 + tw * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + h1 * 1.6, 0, TAU);
      ctx.fill();
    } else if (kind === 'embers') {
      ctx.fillStyle = `rgba(255,180,110,${0.18 + tw * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3 + h2 * 1.8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(255,200,140,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 6);
      ctx.stroke();
    } else if (kind === 'pollen') {
      ctx.fillStyle = `rgba(220,255,190,${0.16 + tw * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + h1 * 1.4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(190,255,235,${0.16 + tw * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + h2 * 1.6, 0, TAU);
      ctx.fill();
      if (i % 9 === 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = style.light;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// Пятна от взрывов и следы — медленно исчезают.
export function drawDecals(ctx, game, view) {
  if (!game.decals) return;
  for (const d of game.decals) {
    const k = Math.max(0, d.life / d.maxLife);
    if (d.kind === 'scorch') {
      const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(20,12,8,${0.42 * k})`);
      g.addColorStop(0.6, `rgba(30,20,12,${0.25 * k})`);
      g.addColorStop(1, 'rgba(30,20,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.72, d.rot || 0, 0, TAU);
      ctx.fill();
    } else if (d.kind === 'splash') {
      ctx.fillStyle = `rgba(160,230,255,${0.16 * k})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
}
