// Рендерер: арена, бойцы, снаряды, эффекты, прицеливание.
import { BRAWLER_BY_ID, TEAM_COLORS, TILE } from './config.js';
import { WALL, CRATE, WATER, BUSH } from './maps.js';
import { ARENA_STYLE, paintArena, drawWaterLife, drawAmbient, drawDecals } from './art.js';
import {
  TAU,
  clamp,
  lerp,
  angleDiff,
  lerpAngle,
  withAlpha,
  shade,
  easeOutCubic,
} from './utils.js';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function star(ctx, cx, cy, spikes, outer, inner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / spikes - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function diamond(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy);
  ctx.closePath();
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.bgCache = new Map();
    this.t = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
  }

  // ---------- Статичный фон арены ----------
  // Арена рисуется процедурно в src/art.js и кэшируется: на кадр остаётся
  // только drawImage видимой части.
  buildBackground(map, version = 0) {
    const key = `${map.id}:v${version}`;
    if (this.bgCache.has(key)) return this.bgCache.get(key);
    const canvas = paintArena(map, version);
    this.bgCache.set(key, canvas);
    if (this.bgCache.size > 6) {
      const first = this.bgCache.keys().next().value;
      this.bgCache.delete(first);
    }
    return canvas;
  }

  // ---------- Камера ----------
  computeCamera(game) {
    const map = game.map;
    const w = this.width;
    const h = this.height;
    const fit = Math.min(w / map.worldW, h / map.worldH);
    // Держим примерно 7 плиток по высоте — как в Brawl Stars
    let zoom = clamp(h / 560, 0.62, 2.05);
    // гарантируем минимальную ширину обзора (важно для портретной ориентации)
    zoom = Math.min(zoom, w / 640);
    zoom = Math.max(zoom, fit);
    if (w / h > 2.2) zoom *= 0.92;
    zoom = Math.max(zoom, fit, 0.5);
    const viewW = w / zoom;
    const viewH = h / zoom;
    let fx = map.worldW / 2;
    let fy = map.worldH / 2;
    if (game.cameraTarget) {
      fx = game.cameraTarget.x;
      fy = game.cameraTarget.y;
    }
    let cx = fx;
    let cy = fy;
    if (viewW < map.worldW) cx = clamp(cx, viewW / 2, map.worldW - viewW / 2);
    else cx = map.worldW / 2;
    if (viewH < map.worldH) cy = clamp(cy, viewH / 2, map.worldH - viewH / 2);
    else cy = map.worldH / 2;
    return { zoom, cx, cy, viewW, viewH };
  }

  screenToWorld(sx, sy, cam) {
    return {
      x: (sx - this.width / 2) / cam.zoom + cam.cx,
      y: (sy - this.height / 2) / cam.zoom + cam.cy,
    };
  }

  // ---------- Главный рендер ----------
  render(game) {
    const ctx = this.ctx;
    const cam = this.computeCamera(game);
    this.cam = cam;
    this.t = game.time;
    const theme = game.map.theme;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.sky;
    ctx.fillRect(0, 0, this.width, this.height);

    let shakeX = 0;
    let shakeY = 0;
    if (game.shake > 0 && game.settings.shake) {
      const s = Math.min(game.shake, 24);
      shakeX = (Math.random() * 2 - 1) * s;
      shakeY = (Math.random() * 2 - 1) * s;
    }

    ctx.save();
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.cx, -cam.cy);

    const view = {
      x: cam.cx - cam.viewW / 2,
      y: cam.cy - cam.viewH / 2,
      w: cam.viewW,
      h: cam.viewH,
    };

    // Фон арены (рисуем только видимую часть — так быстрее)
    const bg = this.buildBackground(game.map, game.mapVersion);
    const sx = Math.max(0, Math.floor(view.x - 4));
    const sy = Math.max(0, Math.floor(view.y - 4));
    const sw = Math.min(bg.width - sx, Math.ceil(view.w + 8));
    const sh = Math.min(bg.height - sy, Math.ceil(view.h + 8));
    if (sw > 0 && sh > 0) ctx.drawImage(bg, sx, sy, sw, sh, sx, sy, sw, sh);
    else ctx.drawImage(bg, 0, 0);

    const style = ARENA_STYLE[game.map.id] || ARENA_STYLE.mine;

    // Живая вода
    if (game.map.theme.water) drawWaterLife(ctx, game.map, view, this.t, style);

    // Пылинки/снег/искры над ареной
    drawAmbient(ctx, game, view, this.t);

    // Следы взрывов
    drawDecals(ctx, game, view);

    // Ворота
    if (game.mode === 'brawlball') this.drawGoals(ctx, game);

    // Кусты
    this.drawBushes(ctx, game, view);

    // Зоны (заморозка, аура)
    this.drawZones(ctx, game);

    // Мины
    for (const mine of game.mines) this.drawMine(ctx, mine, game);

    // Подбираемые предметы
    for (const p of game.pickups) this.drawPickup(ctx, p, game);

    // Мяч
    if (game.ball) this.drawBall(ctx, game.ball, game);

    // Телеграфы супера и прицел
    this.drawWorldAim(ctx, game);

    // Мягкие тени бойцов
    for (const p of game.players) {
      if (!p.alive) continue;
      this.softShadow(ctx, p.x, p.y + p.radius * 0.74, p.radius * 1.16, p.radius * 0.52, 0.4, 1 - (p.z || 0) / 200);
    }

    // Бойцы
    const sorted = [...game.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (!p.alive) continue;
      this.drawBrawler(ctx, p, game, cam);
    }

    // Снаряды
    for (const proj of game.projectiles) this.drawProjectile(ctx, proj, game);

    // Частицы (в мировых координатах)
    this.drawParticles(ctx, game);

    // Лучи и взрывы
    this.drawEffects(ctx, game);

    // Всплывающие числа
    this.drawFloaters(ctx, game);

    ctx.restore();

    this.drawScreenFX(ctx, game);
    this.drawJoysticks(ctx, game);
    this.drawAimCursor(ctx, game, cam);
  }

  // Мягкая тень-эллипс с растушёвкой
  softShadow(ctx, x, y, rx, ry, alpha = 0.35, scale = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.65, `rgba(0,0,0,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, (ry / rx) * (0.55 + scale * 0.45));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBushes(ctx, game, view) {
    const theme = game.map.theme;
    const map = game.map;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] !== BUSH) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (px + TILE < view.x - 90 || px > view.x + view.w + 90) continue;
        if (py + TILE < view.y - 90 || py > view.y + view.h + 90) continue;

        const seed = hash2(x, y);
        const sway = Math.sin(this.t * 1.7 + x * 0.7 + y * 0.4);
        const t = this.t;

        // тень под кустом
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(px + 40, py + 74, 40, 14, 0, 0, TAU);
        ctx.fill();

        // тёмная подложка, чтобы куст читался на любом фоне
        ctx.fillStyle = shade(theme.bush2, -0.32);
        ctx.beginPath();
        ctx.ellipse(px + 40, py + 50, 40, 32, 0, 0, TAU);
        ctx.fill();

        // объёмные листья: несколько слоёв
        const lobes = [
          [20, 58, 22, 0.2],
          [58, 60, 23, 0.8],
          [38, 40, 27, 0.4],
          [15, 34, 17, 1.1],
          [63, 33, 18, 1.6],
          [41, 66, 19, 0.6],
          [30, 24, 13, 2.1],
          [52, 22, 12, 2.6],
        ];
        for (let i = 0; i < lobes.length; i++) {
          const [bx, by, br, ph] = lobes[i];
          const sx = Math.sin(t * 1.6 + ph + seed * 4) * (2.4 + by * 0.02);
          const sy = Math.cos(t * 1.3 + ph) * 0.8;
          const tone = i % 3 === 0 ? theme.bush3 : i % 3 === 1 ? theme.bush2 : theme.bush;
          const g = ctx.createRadialGradient(
            px + bx + sx - br * 0.35, py + by + sy - br * 0.45, br * 0.15,
            px + bx + sx, py + by + sy, br * 1.12
          );
          g.addColorStop(0, shade(tone, 0.18));
          g.addColorStop(0.55, tone);
          g.addColorStop(1, shade(tone, -0.34));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px + bx + sx, py + by + sy, br, 0, TAU);
          ctx.fill();
        }

        // освещённые верхушки
        ctx.fillStyle = 'rgba(190,255,205,0.2)';
        for (const [bx, by, br] of [[30, 22, 7], [50, 18, 6], [16, 30, 5]]) {
          ctx.beginPath();
          ctx.arc(px + bx + sway * 1.2, py + by, br, 0, TAU);
          ctx.fill();
        }

        // прожилки листвы
        ctx.strokeStyle = 'rgba(10,40,26,0.22)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 4; i++) {
          const a = -1.9 + i * 0.55;
          ctx.beginPath();
          ctx.moveTo(px + 40 + Math.cos(a) * 6, py + 46 + Math.sin(a) * 5);
          ctx.quadraticCurveTo(
            px + 40 + Math.cos(a) * 18 + sway, py + 46 + Math.sin(a) * 16,
            px + 40 + Math.cos(a) * 28 + sway * 1.4, py + 46 + Math.sin(a) * 26
          );
          ctx.stroke();
        }

        // контур
        ctx.strokeStyle = 'rgba(8,26,20,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px + 40, py + 50, 42, 34, 0, 0, TAU);
        ctx.stroke();

        // светлячки внутри куста
        for (let i = 0; i < 3; i++) {
          const a = t * 0.6 + i * 2.1 + x * 0.6;
          const gx = px + 38 + Math.cos(a) * (16 + i * 5);
          const gy = py + 42 + Math.sin(a * 1.3) * (12 + i * 4);
          const spark = 0.35 + Math.sin(t * 3 + i * 2) * 0.3;
          const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 9);
          gg.addColorStop(0, `rgba(220,255,190,${spark})`);
          gg.addColorStop(1, 'rgba(220,255,190,0)');
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(gx, gy, 9, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  drawGoals(ctx, game) {
    for (const team of [0, 1]) {
      const g = game.map.goals[team];
      if (!g) continue;
      const col = TEAM_COLORS[team];
      const pulse = 0.16 + Math.sin(this.t * 2.2 + team) * 0.05;

      // свечение ворот
      const grad = ctx.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
      grad.addColorStop(0, withAlpha(col.light, pulse * 1.6));
      grad.addColorStop(0.5, withAlpha(col.main, pulse));
      grad.addColorStop(1, withAlpha(col.main, pulse * 0.6));
      ctx.fillStyle = grad;
      roundRect(ctx, g.x, g.y, g.w, g.h, 14);
      ctx.fill();

      // сетка
      ctx.save();
      roundRect(ctx, g.x, g.y, g.w, g.h, 14);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.6;
      for (let yy = g.y + 12; yy < g.y + g.h; yy += 18) {
        ctx.beginPath();
        ctx.moveTo(g.x, yy);
        ctx.lineTo(g.x + g.w, yy);
        ctx.stroke();
      }
      for (let xx = g.x + 16; xx < g.x + g.w; xx += 20) {
        ctx.beginPath();
        ctx.moveTo(xx, g.y);
        ctx.lineTo(xx, g.y + g.h);
        ctx.stroke();
      }
      // блик
      const gl = ctx.createLinearGradient(g.x, g.y, g.x + g.w, g.y + g.h);
      gl.addColorStop(0, 'rgba(255,255,255,0.16)');
      gl.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.restore();

      // рамка-каркас
      ctx.strokeStyle = withAlpha(col.light, 0.95);
      ctx.lineWidth = 5;
      roundRect(ctx, g.x + 3, g.y + 3, g.w - 6, g.h - 6, 13);
      ctx.stroke();
      ctx.strokeStyle = withAlpha('#ffffff', 0.35);
      ctx.lineWidth = 1.6;
      roundRect(ctx, g.x + 8, g.y + 8, g.w - 16, g.h - 16, 10);
      ctx.stroke();

      // стойки по углам
      for (const [px, py] of [[g.x + 6, g.y + 6], [g.x + g.w - 6, g.y + 6], [g.x + 6, g.y + g.h - 6], [g.x + g.w - 6, g.y + g.h - 6]]) {
        ctx.fillStyle = withAlpha('#ffffff', 0.75);
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = withAlpha(col.main, 0.9);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, TAU);
        ctx.fill();
      }

      // бегущая полоса «гол!»
      ctx.strokeStyle = withAlpha(col.light, 0.5);
      ctx.lineWidth = 4;
      ctx.setLineDash([26, 30]);
      ctx.lineDashOffset = -this.t * 40;
      ctx.beginPath();
      ctx.moveTo(g.x + 10, g.y + g.h / 2);
      ctx.lineTo(g.x + g.w - 10, g.y + g.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // эмблема
      ctx.save();
      ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
      ctx.rotate(Math.sin(this.t * 1.4 + team) * 0.12);
      ctx.fillStyle = withAlpha('#ffffff', 0.22 + Math.sin(this.t * 3) * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(col.light, 0.75);
      ctx.font = `bold 34px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚽', 0, 2);
      ctx.restore();
    }
  }

  drawZones(ctx, game) {
    for (const z of game.zones) {
      const k = 1 - z.life / z.maxLife;
      const alpha = 0.2 * (1 - k) + 0.05;
      const col = z.color || '#9fe9ff';
      const grad = ctx.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r);
      grad.addColorStop(0, withAlpha(col, alpha * 1.6));
      grad.addColorStop(0.75, withAlpha(col, alpha));
      grad.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = this.t * 30;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * (0.55 + Math.sin(this.t * 2 + z.seed) * 0.05), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      if (z.kind === 'freeze') {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + this.t * 0.3;
          const rr = z.r * (0.6 + (i % 3) * 0.12);
          ctx.fillStyle = withAlpha('#dffaff', 0.35 + Math.sin(this.t * 3 + i) * 0.15);
          ctx.save();
          ctx.translate(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
          ctx.rotate(a);
          ctx.fillRect(-7, -2, 14, 4);
          ctx.restore();
        }
      }
    }
  }

  drawMine(ctx, mine, game) {
    const blink = mine.armed ? (Math.sin(this.t * 10) > 0 ? 1 : 0.3) : 0.5;
    const col = mine.armed ? '#ff4d4d' : '#ffb35c';

    // радиус поражения
    if (mine.armed) {
      const rg = ctx.createRadialGradient(mine.x, mine.y, 4, mine.x, mine.y, 44);
      rg.addColorStop(0, withAlpha(col, 0.16 * blink));
      rg.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 44, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.4 * blink);
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = this.t * 20;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 36 + Math.sin(this.t * 6) * 4, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(255,90,90,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 26, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(mine.x, mine.y + 12, 19, 7, 0, 0, TAU);
    ctx.fill();

    // корпус
    const body = ctx.createLinearGradient(mine.x, mine.y - 16, mine.x, mine.y + 12);
    body.addColorStop(0, '#4a5666');
    body.addColorStop(0.5, '#2b3340');
    body.addColorStop(1, '#171d26');
    ctx.fillStyle = body;
    roundRect(ctx, mine.x - 17, mine.y - 13, 34, 23, 9);
    ctx.fill();
    ctx.strokeStyle = '#0e131a';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // полосы
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, mine.x - 12, mine.y - 9, 24, 3, 2);
    ctx.fill();
    // лампочка
    const lg = ctx.createRadialGradient(mine.x, mine.y - 17, 0, mine.x, mine.y - 17, 14);
    lg.addColorStop(0, withAlpha(col, 0.9 * blink));
    lg.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(mine.x, mine.y - 17, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(col, blink);
    ctx.beginPath();
    ctx.arc(mine.x, mine.y - 17, 5, 0, TAU);
    ctx.fill();
    // ножки-шипы
    ctx.strokeStyle = '#39424f';
    ctx.lineWidth = 2;
    for (const [dx, dy] of [[-15, 8], [15, 8], [0, 12]]) {
      ctx.beginPath();
      ctx.moveTo(mine.x + dx * 0.6, mine.y + 7);
      ctx.lineTo(mine.x + dx, mine.y + dy);
      ctx.stroke();
    }
  }

  drawPickup(ctx, p, game) {
    const bob = Math.sin(this.t * 3 + p.seed) * 4;
    const isGem = p.kind === 'gem';
    const col = isGem ? '#b25cff' : '#ffc832';
    const light = isGem ? '#e8b3ff' : '#fff3b0';

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 16, 14, 5.5, 0, 0, TAU);
    ctx.fill();

    // ореол
    const glow = ctx.createRadialGradient(p.x, p.y + bob, 2, p.x, p.y + bob, 40);
    glow.addColorStop(0, withAlpha(col, 0.42));
    glow.addColorStop(0.5, withAlpha(col, 0.16));
    glow.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 40, 0, TAU);
    ctx.fill();

    // вращающееся кольцо
    ctx.strokeStyle = withAlpha(light, 0.45);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.t * 24 + p.seed * 6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, 20, 8, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isGem) {
      // кристалл
      const grad = ctx.createLinearGradient(p.x - 10, p.y - 20 + bob, p.x + 10, p.y + 16 + bob);
      grad.addColorStop(0, '#f4d6ff');
      grad.addColorStop(0.45, '#c46bff');
      grad.addColorStop(1, '#5f21c9');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 20 + bob);
      ctx.lineTo(p.x + 13, p.y - 4 + bob);
      ctx.lineTo(p.x + 7, p.y + 15 + bob);
      ctx.lineTo(p.x - 7, p.y + 15 + bob);
      ctx.lineTo(p.x - 13, p.y - 4 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // грани
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 18 + bob);
      ctx.lineTo(p.x - 3, p.y + 12 + bob);
      ctx.moveTo(p.x, p.y - 18 + bob);
      ctx.lineTo(p.x + 4, p.y + 12 + bob);
      ctx.stroke();
      // блик
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y - 11 + bob);
      ctx.lineTo(p.x + 2, p.y - 3 + bob);
      ctx.lineTo(p.x - 2, p.y + 2 + bob);
      ctx.closePath();
      ctx.fill();
      // искры
      for (let i = 0; i < 2; i++) {
        const a = this.t * 2 + i * Math.PI + p.seed;
        ctx.fillStyle = withAlpha('#ffffff', 0.55);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 17, p.y + bob + Math.sin(a) * 10, 1.4, 0, TAU);
        ctx.fill();
      }
    } else {
      // звезда
      star(ctx, p.x, p.y + bob, 5, 19, 9, this.t * 0.6);
      const grad = ctx.createLinearGradient(p.x, p.y - 18 + bob, p.x, p.y + 18 + bob);
      grad.addColorStop(0, '#fffbe0');
      grad.addColorStop(0.5, '#ffd94a');
      grad.addColorStop(1, '#e08a00');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#8a5a00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      star(ctx, p.x - 3, p.y - 4 + bob, 5, 7, 3, this.t * 0.6);
      ctx.fill();
    }
  }

  drawBall(ctx, ball, game) {
    if (ball.owner) return;
    const bob = Math.sin(this.t * 4) * 2;
    const r = 19;

    // след качения
    const sp = Math.hypot(ball.vx || 0, ball.vy || 0);
    if (sp > 90) {
      const a = Math.atan2(ball.vy, ball.vx);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(ball.x - Math.cos(a) * (12 + i * 13), ball.y - Math.sin(a) * (12 + i * 13), r * (0.9 - i * 0.18), 0, TAU);
        ctx.stroke();
      }
    }

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 19, 19, 8, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(ball.x, ball.y + bob);
    ctx.rotate(ball.spin || 0);

    const grad = ctx.createRadialGradient(-7, -8, 2, 0, 0, r * 1.15);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#f0f4f9');
    grad.addColorStop(1, '#bcc7d4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // пятна
    ctx.fillStyle = '#26303c';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.63, Math.sin(a) * r * 0.63, 4.4, 3.8, a, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, TAU);
    ctx.fill();

    // ободок и блик
    ctx.strokeStyle = 'rgba(60,70,84,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.26, r * 0.15, -0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(r * 0.24, r * 0.4, r * 0.18, r * 0.09, -0.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Боец ----------
  drawBrawler(ctx, p, game, cam) {
    const b = BRAWLER_BY_ID[p.brawlerId];
    if (!b) return;
    const isEnemy = p.team !== game.playerTeam;
    const viewer = game.player;
    // Скрытность в кустах и невидимость
    if (isEnemy && viewer && !game.canSee(viewer, p)) {
      if (Math.hypot(p.vx, p.vy) > 40) {
        ctx.fillStyle = 'rgba(160,220,150,0.18)';
        ctx.beginPath();
        ctx.arc(p.x, p.y + 6, p.radius * 0.9, 0, TAU);
        ctx.fill();
      }
      return;
    }

    const t = this.t;
    const us = 1 / (cam?.zoom || 1);
    const moving = Math.hypot(p.vx, p.vy) > 20;
    const speed = Math.hypot(p.vx, p.vy);
    const bob = moving ? Math.sin(t * 13 + p.seed) * 2.4 : Math.sin(t * 3 + p.seed) * 1.1;
    const face = p.angle;
    const teamCol = TEAM_COLORS[p.team];
    const bodyCol = b.color;
    const bodyCol2 = b.color2;
    const r = p.radius;

    // Цветовой акцент команды — помогает читать своих и чужих
    if (!p.portrait) {
      const aura = ctx.createRadialGradient(p.x, p.y + r * 0.2, r * 0.2, p.x, p.y + r * 0.2, r * 2.1);
      aura.addColorStop(0, withAlpha(teamCol.main, 0.16));
      aura.addColorStop(0.55, withAlpha(teamCol.main, 0.06));
      aura.addColorStop(1, withAlpha(teamCol.main, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + r * 0.2, r * 2.1, r * 1.3, 0, 0, TAU);
      ctx.fill();
    }

    // Тень на земле (отдельно от z)
    if (!p.portrait) {
      this.softShadow(ctx, p.x, p.y + r * 0.78, r * 1.05, r * 0.46, 0.42, 1 - clamp((p.z || 0) / 260, 0, 0.7));
    }

    // Командное кольцо + заряд супера
    if (!p.portrait && !p.isPlayer) {
      ctx.save();
      ctx.translate(p.x, p.y + r * 0.8);
      ctx.strokeStyle = withAlpha(teamCol.main, 0.55);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.08, r * 0.5, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(teamCol.light, 0.95);
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -t * 26;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.14, r * 0.53, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (!p.portrait && p.isPlayer) {
      // у игрока — заметное кольцо с индикатором супера
      ctx.save();
      ctx.translate(p.x, p.y + r * 0.8);
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0, withAlpha(teamCol.light, 0.9));
      g.addColorStop(1, withAlpha(teamCol.main, 0.45));
      ctx.strokeStyle = g;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.12, r * 0.52, 0, 0, TAU);
      ctx.stroke();
      const frac = clamp((p.superCharge || 0) / 100, 0, 1);
      ctx.strokeStyle = frac >= 1 ? '#ffd54a' : withAlpha('#ffe9a8', 0.85);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.26, r * 0.6, 0, -Math.PI * 0.62, -Math.PI * 0.62 + TAU * frac);
      ctx.stroke();
      if (frac >= 1) {
        const pulse = 0.35 + Math.sin(t * 5) * 0.18;
        const gg = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.6);
        gg.addColorStop(0, `rgba(255,213,74,${pulse * 0.5})`);
        gg.addColorStop(1, 'rgba(255,213,74,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.6, r * 0.8, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y - (p.z || 0));
    ctx.scale(1.68, 1.68);
    ctx.globalAlpha = 1;

    // Щит
    if (p.shieldTime > 0 || p.shieldHp > 0) {
      const rr2 = r + 13;
      const grad = ctx.createRadialGradient(0, 0, rr2 * 0.6, 0, 0, rr2);
      grad.addColorStop(0, 'rgba(160,230,255,0.05)');
      grad.addColorStop(0.85, 'rgba(160,230,255,0.18)');
      grad.addColorStop(1, 'rgba(200,245,255,0.42)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rr2, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = withAlpha('#9fe3ff', 0.6 + Math.sin(t * 8) * 0.15);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr2, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr2, Math.sin(a) * rr2, 3, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Замедление / заморозка
    if (p.slowTime > 0) {
      ctx.strokeStyle = withAlpha('#a8ecff', 0.5);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
        ctx.lineTo(Math.cos(a) * (r + 11), Math.sin(a) * (r + 11));
        ctx.stroke();
      }
    }

    // Невидимость
    if (p.invisTime > 0) ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.07;

    const legPhase = moving ? Math.sin(t * 16 + p.seed) * (2 + Math.min(speed, 220) * 0.02) : 0;
    const flip = Math.cos(face) < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(0, bob);

    // Короткий плащ за плечами — реагирует на движение
    const tailDir = moving ? clamp(-speed / 220, -1.6, -0.2) : 0;
    ctx.save();
    ctx.scale(flip, 1);
    const wave = Math.sin(t * 5 + p.seed) * 2.5;
    const cg = ctx.createLinearGradient(-r * 0.3, r * 0.1, -r * 0.9, r * 0.6);
    cg.addColorStop(0, withAlpha(teamCol.main, 0.92));
    cg.addColorStop(1, withAlpha(shade(teamCol.main, -0.4), 0.75));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, r * 0.1);
    ctx.quadraticCurveTo(-r * 0.66, r * 0.16 + wave * 0.4, -r * 0.72 - tailDir * 8, r * 0.56 + wave);
    ctx.quadraticCurveTo(-r * 0.44, r * 0.46 + wave * 0.6, -r * 0.18, r * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,12,20,0.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // Ноги с ботинками
    for (const side of [-1, 1]) {
      const lift = side > 0 ? legPhase : -legPhase;
      ctx.save();
      ctx.translate(side * r * 0.3, r * 0.52 + Math.abs(lift) * 0.15);
      const lg = ctx.createLinearGradient(0, -4, 0, r * 0.42);
      lg.addColorStop(0, shade(bodyCol, -0.22));
      lg.addColorStop(1, shade(bodyCol, -0.46));
      ctx.fillStyle = lg;
      roundRect(ctx, -r * 0.17, 0, r * 0.34, r * (0.3 + lift * 0.012), r * 0.13);
      ctx.fill();
      // ботинок
      ctx.fillStyle = shade(bodyCol2, -0.5);
      roundRect(ctx, -r * 0.22, r * (0.24 + lift * 0.012), r * 0.44, r * 0.18, r * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, -r * 0.18, r * (0.26 + lift * 0.012), r * 0.3, r * 0.05, r * 0.03);
      ctx.fill();
      ctx.restore();
    }

    // Торс
    const tg = ctx.createLinearGradient(-r * 0.6, r * 0.02, r * 0.55, r * 0.95);
    tg.addColorStop(0, shade(bodyCol2, 0.18));
    tg.addColorStop(0.45, bodyCol);
    tg.addColorStop(1, shade(bodyCol, -0.3));
    ctx.fillStyle = tg;
    roundRect(ctx, -r * 0.6, r * 0.02, r * 1.2, r * 0.96, r * 0.42);
    ctx.fill();
    // блик и обводка
    ctx.strokeStyle = 'rgba(6,12,20,0.36)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, -r * 0.44, r * 0.1, r * 0.36, r * 0.5, r * 0.18);
    ctx.fill();

    // Плечи
    for (const side of [-1, 1]) {
      const sg = ctx.createRadialGradient(side * r * 0.5 - 2, r * 0.2, 1, side * r * 0.52, r * 0.26, r * 0.3);
      sg.addColorStop(0, shade(bodyCol2, 0.3));
      sg.addColorStop(1, shade(bodyCol, -0.18));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(side * r * 0.54, r * 0.22, r * 0.23, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6,12,20,0.3)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Нагрудник
    const pl = ctx.createLinearGradient(0, r * 0.1, 0, r * 0.54);
    pl.addColorStop(0, withAlpha(teamCol.light, 0.5));
    pl.addColorStop(1, withAlpha(teamCol.main, 0.28));
    ctx.fillStyle = pl;
    roundRect(ctx, -r * 0.34, r * 0.1, r * 0.68, r * 0.34, r * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,12,20,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // застёжки-пряжки на груди
    ctx.fillStyle = shade(bodyCol2, -0.4);
    for (const side of [-1, 1]) {
      roundRect(ctx, side * r * 0.4 - r * 0.05, r * 0.12, r * 0.1, r * 0.3, r * 0.04);
      ctx.fill();
    }
    // воротник
    ctx.fillStyle = shade(bodyCol, -0.35);
    roundRect(ctx, -r * 0.26, r * 0.0, r * 0.52, r * 0.12, r * 0.05);
    ctx.fill();

    // Пояс с пряжкой
    ctx.fillStyle = shade(bodyCol2, -0.45);
    roundRect(ctx, -r * 0.58, r * 0.66, r * 1.16, r * 0.16, r * 0.07);
    ctx.fill();
    ctx.fillStyle = withAlpha(teamCol.light, 0.95);
    roundRect(ctx, -r * 0.1, r * 0.64, r * 0.2, r * 0.19, r * 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(0, r * 0.74, r * 0.04, 0, TAU);
    ctx.fill();

    // Эмблема на груди
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, r * 0.4, r * 0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(teamCol.main, 0.95);
    star(ctx, 0, r * 0.4, 5, r * 0.11, r * 0.045, 0);
    ctx.fill();

    // Руки
    for (const side of [-1, 1]) {
      const swing = side > 0 ? -legPhase * 0.5 : legPhase * 0.5;
      ctx.save();
      ctx.translate(side * r * 0.6, r * 0.36 + swing);
      const ag = ctx.createLinearGradient(0, -r * 0.2, 0, r * 0.24);
      ag.addColorStop(0, shade(bodyCol2, 0.1));
      ag.addColorStop(1, shade(bodyCol2, -0.3));
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.19, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6,12,20,0.28)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // перчатка
      ctx.fillStyle = shade(bodyCol2, -0.5);
      ctx.beginPath();
      ctx.arc(0, r * 0.12, r * 0.11, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Голова
    const headY = -r * 0.46;
    const headR = r * 0.67;
    const headGrad = ctx.createRadialGradient(-headR * 0.35, headY - headR * 0.42, headR * 0.12, 0, headY, headR * 1.18);
    headGrad.addColorStop(0, shade(bodyCol2, 0.28));
    headGrad.addColorStop(0.65, bodyCol2);
    headGrad.addColorStop(1, shade(bodyCol2, -0.22));
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, TAU);
    ctx.fill();

    // ободок шлема
    ctx.strokeStyle = 'rgba(6,12,20,0.34)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, TAU);
    ctx.stroke();

    // наушники
    for (const side of [-1, 1]) {
      ctx.fillStyle = shade(bodyCol, -0.32);
      ctx.beginPath();
      ctx.ellipse(side * headR * 0.94, headY + headR * 0.08, headR * 0.2, headR * 0.28, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(teamCol.light, 0.8);
      ctx.beginPath();
      ctx.arc(side * headR * 0.98, headY + headR * 0.08, headR * 0.08, 0, TAU);
      ctx.fill();
    }

    // Визор
    const vg = ctx.createLinearGradient(0, headY - headR * 0.28, 0, headY + headR * 0.38);
    vg.addColorStop(0, '#2c4863');
    vg.addColorStop(0.5, '#0f1c2b');
    vg.addColorStop(1, '#060c14');
    ctx.fillStyle = vg;
    roundRect(ctx, -headR * 0.8, headY - headR * 0.26, headR * 1.6, headR * 0.64, headR * 0.31);
    ctx.fill();
    // рамка визора в цвет команды
    ctx.strokeStyle = withAlpha(teamCol.light, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // брови-акценты
    ctx.strokeStyle = withAlpha(teamCol.light, 0.7);
    ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.52, headY - headR * 0.3);
      ctx.lineTo(side * headR * 0.24, headY - headR * 0.36);
      ctx.stroke();
    }

    // бегущий блик по визору
    const sweep = ((t * 0.42 + p.seed * 0.2) % 1) * 2 - 0.5;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -headR * 0.78, headY - headR * 0.24, headR * 1.56, headR * 0.62, headR * 0.3);
    ctx.clip();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#dff6ff';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.8 + sweep * headR * 1.7, headY - headR * 0.02, headR * 0.16, headR * 0.5, 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Глаза
    const eyeCol = isEnemy ? '#ff8c9d' : '#9ef6ff';
    const eyeShift = clamp(p.aimOffset || 0, -1, 1) * headR * 0.12;
    for (const side of [-1, 1]) {
      const ex = side * headR * 0.31 + eyeShift;
      const ey = headY + headR * 0.06;
      const gg = ctx.createRadialGradient(ex, ey, 0, ex, ey, headR * 0.3);
      gg.addColorStop(0, withAlpha(eyeCol, 0.75));
      gg.addColorStop(1, withAlpha(eyeCol, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(ex, ey, headR * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, headR * 0.1, headR * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = eyeCol;
      ctx.beginPath();
      ctx.ellipse(ex, ey + headR * 0.01, headR * 0.075, headR * 0.11, 0, 0, TAU);
      ctx.fill();
    }

    // Блик шлема
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.36, headY - headR * 0.5, headR * 0.28, headR * 0.12, -0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(headR * 0.4, headY - headR * 0.44, headR * 0.18, headR * 0.08, 0.5, 0, TAU);
    ctx.fill();

    // Аксессуар персонажа
    this.drawAccessory(ctx, b, r, headY, t, headR);

    // Вспышка урона
    if (p.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.62, p.hitFlash * 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, headY * 0.4, r * 1.06, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // body

    // Оружие поверх тела, повёрнутое по прицелу
    ctx.save();
    const recoil = p.recoil || 0;
    ctx.translate(0, bob - recoil * 3);
    ctx.rotate(face + Math.PI / 2);
    this.drawWeapon(ctx, b, r, t, p);
    ctx.restore();

    ctx.restore(); // общий save

    if (p.portrait) return;

    // Корона супера
    if (p.superCharge >= 100 && p.alive) {
      ctx.save();
      ctx.translate(p.x, p.y - p.radius * 1.75 - (p.z || 0) * 0.4);
      const s = 1 + Math.sin(t * 6 + p.seed) * 0.08;
      ctx.scale(s, s);
      ctx.rotate(Math.sin(t * 2) * 0.12);
      ctx.fillStyle = 'rgba(255,213,74,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();
      star(ctx, 0, 0, 5, 11, 5, t * 0.5);
      const cg = ctx.createLinearGradient(0, -11, 0, 11);
      cg.addColorStop(0, '#fff3b0');
      cg.addColorStop(1, '#ffb400');
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = '#b47f00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Полоса здоровья и ник
    this.drawNameplate(ctx, p, game, isEnemy, us);

    // Кристаллы/звёзды над головой
    if (p.gems > 0 && game.mode === 'gemgrab') {
      this.drawCountBadge(ctx, p.x + p.radius + 13 / (cam?.zoom || 1), p.y - p.radius * 1.35, p.gems, '#b25cff', 'gem', us);
    }
    if (p.stars > 0 && game.mode === 'bounty') {
      this.drawCountBadge(ctx, p.x + p.radius + 13 / (cam?.zoom || 1), p.y - p.radius * 1.35, p.stars, '#ffc832', 'star', us);
    }
    if (p.carrying) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + p.radius * 0.1, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 10, p.y + p.radius * 0.1 + Math.sin(a) * 10, 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawAccessory(ctx, b, r, headY, t, headR = r * 0.72) {
    ctx.save();
    switch (b.id) {
      case 'blaze': {
        // рога
        ctx.fillStyle = '#ffd166';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.36, headY - r * 0.42);
          ctx.lineTo(s * r * 0.62, headY - r * 0.95);
          ctx.lineTo(s * r * 0.16, headY - r * 0.55);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'vector': {
        // антенна
        ctx.strokeStyle = '#8ff3ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, headY - r * 0.6);
        ctx.lineTo(0, headY - r * 1.1);
        ctx.stroke();
        ctx.fillStyle = '#8ff3ff';
        ctx.beginPath();
        ctx.arc(0, headY - r * 1.14, r * 0.12, 0, TAU);
        ctx.fill();
        break;
      }
      case 'mira': {
        // капюшон
        ctx.fillStyle = shade(b.color, -0.15);
        ctx.beginPath();
        ctx.arc(0, headY - r * 0.1, r * 0.72, Math.PI * 0.95, Math.PI * 2.05);
        ctx.lineTo(r * 0.5, headY + r * 0.1);
        ctx.lineTo(-r * 0.5, headY + r * 0.1);
        ctx.closePath();
        ctx.fill();
        // перо
        ctx.fillStyle = '#ffa9e8';
        ctx.beginPath();
        ctx.ellipse(r * 0.3, headY - r * 0.72, r * 0.1, r * 0.3, 0.7, 0, TAU);
        ctx.fill();
        break;
      }
      case 'grom': {
        // шлем-каска
        ctx.fillStyle = '#4b5b6b';
        ctx.beginPath();
        ctx.arc(0, headY - r * 0.05, r * 0.68, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = '#6d7f91';
        ctx.fillRect(-r * 0.68, headY - r * 0.1, r * 1.36, r * 0.12);
        // заклёпки
        ctx.fillStyle = '#ffe99a';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(s * r * 0.42, headY - r * 0.28, r * 0.08, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'lyuma': {
        // цветок
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 0.5;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#b7ffda';
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * r * 0.3, headY - r * 0.68 + Math.sin(a) * r * 0.18, r * 0.16, r * 0.1, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(0, headY - r * 0.68, r * 0.09, 0, TAU);
        ctx.fill();
        break;
      }
      case 'boom': {
        // фитиль
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, headY - r * 0.55);
        ctx.quadraticCurveTo(r * 0.3, headY - r * 0.95, r * 0.1, headY - r * 1.1);
        ctx.stroke();
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath();
        ctx.arc(r * 0.1, headY - r * 1.12, r * 0.12 + Math.sin(t * 20) * 2, 0, TAU);
        ctx.fill();
        break;
      }
      case 'claw': {
        // ушки
        ctx.fillStyle = '#ffb0c2';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.28, headY - r * 0.5);
          ctx.lineTo(s * r * 0.52, headY - r * 1.02);
          ctx.lineTo(s * r * 0.6, headY - r * 0.42);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'ping': {
        // диск-антенна
        ctx.strokeStyle = '#a9fbff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, headY - r * 0.78, r * 0.26, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#26d0ce';
        ctx.beginPath();
        ctx.arc(0, headY - r * 0.78, r * 0.1, 0, TAU);
        ctx.fill();
        break;
      }
      case 'krio': {
        // ледяная корона
        ctx.fillStyle = '#cdf6ff';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.3 - r * 0.1, headY - r * 0.55);
          ctx.lineTo(i * r * 0.3, headY - r * (0.95 - Math.abs(i) * 0.12));
          ctx.lineTo(i * r * 0.3 + r * 0.1, headY - r * 0.55);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  drawWeapon(ctx, b, r, t, p) {
    const kind = b.attack.kind;
    const tint = b.color2;
    ctx.save();
    // оружие в правой руке: локальная ось «вперёд» — вверх
    ctx.translate(r * 0.58, -r * 0.02);
    ctx.scale(0.95, 0.95);
    ctx.rotate(-0.08);

    // кисть
    ctx.fillStyle = shade(tint, -0.4);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,12,20,0.32)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 0.06, r * 0.08, 0, TAU);
    ctx.fill();

    const metal = (x1, y1, x2, y2, dark = '#1d2531', mid = '#39465a', light = '#5d6d85') => {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, light);
      g.addColorStop(0.45, mid);
      g.addColorStop(1, dark);
      return g;
    };

    const barrel = (len, w, opts = {}) => {
      // ствол
      ctx.fillStyle = metal(-w, 0, w, 0, opts.dark || '#1d2531', opts.mid || '#3b485c', opts.light || '#64748c');
      roundRect(ctx, -w, -len, w * 2, len + r * 0.1, w * 0.55);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,14,0.6)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // дульный срез
      ctx.fillStyle = '#0e141d';
      ctx.beginPath();
      ctx.ellipse(0, -len, w * 0.85, w * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // блик по стволу
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, -w * 0.62, -len + w * 0.35, w * 0.32, len * 0.72, w * 0.16);
      ctx.fill();
    };

    if (kind === 'spread') {
      // дробовик
      barrel(r * 1.02, r * 0.17, { dark: '#1b222c', mid: '#39424f', light: '#6c7787' });
      // раструб
      ctx.fillStyle = metal(-r * 0.3, 0, r * 0.3, 0, '#232c38', '#48566a', '#8393a8');
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 1.02);
      ctx.lineTo(-r * 0.3, -r * 1.18);
      ctx.lineTo(r * 0.3, -r * 1.18);
      ctx.lineTo(r * 0.2, -r * 1.02);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,14,0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // цевьё
      ctx.fillStyle = metal(-r * 0.3, 0, r * 0.3, 0, '#3a2418', '#6b4527', '#9a6a3c');
      roundRect(ctx, -r * 0.24, -r * 0.62, r * 0.48, r * 0.34, r * 0.1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,14,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // приклад
      ctx.fillStyle = '#2a3543';
      roundRect(ctx, -r * 0.14, -r * 0.12, r * 0.28, r * 0.34, r * 0.09);
      ctx.fill();
      ctx.fillStyle = withAlpha(tint, 0.95);
      roundRect(ctx, -r * 0.19, -r * 0.34, r * 0.38, r * 0.1, r * 0.05);
      ctx.fill();
    } else if (kind === 'burst') {
      barrel(r * 1.05, r * 0.15);
      // кожух с прорезями
      ctx.fillStyle = '#212b38';
      roundRect(ctx, -r * 0.21, -r * 0.86, r * 0.42, r * 0.5, r * 0.1);
      ctx.fill();
      ctx.fillStyle = '#8ff3ff';
      for (let i = 0; i < 3; i++) {
        roundRect(ctx, -r * 0.15, -r * 0.78 + i * r * 0.14, r * 0.3, r * 0.06, r * 0.03);
        ctx.fill();
      }
      // магазин
      ctx.fillStyle = '#2c3a4b';
      roundRect(ctx, -r * 0.11, -r * 0.3, r * 0.22, r * 0.42, r * 0.06);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,14,0.5)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // прицел
      ctx.fillStyle = '#4a5b70';
      roundRect(ctx, -r * 0.05, -r * 0.98, r * 0.1, r * 0.14, r * 0.04);
      ctx.fill();
    } else if (kind === 'single') {
      // снайперка
      barrel(r * 1.62, r * 0.115, { dark: '#241f38', mid: '#3d3459', light: '#6f5f9e' });
      ctx.fillStyle = '#2c2547';
      roundRect(ctx, -r * 0.19, -r * 1.05, r * 0.38, r * 0.4, r * 0.08);
      ctx.fill();
      ctx.fillStyle = '#c07bff';
      roundRect(ctx, -r * 0.22, -r * 0.5, r * 0.44, r * 0.12, r * 0.05);
      ctx.fill();
      // оптика
      ctx.fillStyle = '#1a1626';
      roundRect(ctx, -r * 0.13, -r * 1.24, r * 0.26, r * 0.36, r * 0.1);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,150,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, -r * 1.24, r * 0.11, r * 0.05, 0, 0, TAU);
      ctx.fill();
      // приклад
      ctx.fillStyle = '#2b2440';
      roundRect(ctx, -r * 0.14, -r * 0.14, r * 0.28, r * 0.36, r * 0.08);
      ctx.fill();
    } else if (kind === 'lob') {
      // гранатомёт
      barrel(r * 0.86, r * 0.23, { dark: '#2a2018', mid: '#4a382a', light: '#7d6248' });
      ctx.fillStyle = '#3a2c20';
      roundRect(ctx, -r * 0.26, -r * 0.9, r * 0.52, r * 0.26, r * 0.1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,8,14,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // барабан
      ctx.fillStyle = '#232a34';
      ctx.beginPath();
      ctx.arc(r * 0.22, -r * 0.55, r * 0.19, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffcf4d';
      for (let i = 0; i < 3; i++) {
        const a = t * 1.5 + (i / 3) * TAU;
        ctx.beginPath();
        ctx.arc(r * 0.22 + Math.cos(a) * r * 0.1, -r * 0.55 + Math.sin(a) * r * 0.1, r * 0.04, 0, TAU);
        ctx.fill();
      }
      // бомба в другой руке
      const bb = Math.sin(t * 4) * 2;
      ctx.fillStyle = '#2b2b33';
      ctx.beginPath();
      ctx.arc(-r * 0.52, -r * 0.72 + bb, r * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(-r * 0.58, -r * 0.78 + bb, r * 0.07, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, -r * 0.9 + bb);
      ctx.quadraticCurveTo(-r * 0.4, -r * 1.06 + bb, -r * 0.46, -r * 1.16 + bb);
      ctx.stroke();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(-r * 0.46, -r * 1.18 + bb, r * 0.07 + Math.sin(t * 22) * 1.4, 0, TAU);
      ctx.fill();
    } else if (kind === 'healbolt') {
      // посох
      const sg = ctx.createLinearGradient(-r * 0.06, 0, r * 0.08, 0);
      sg.addColorStop(0, '#e5c889');
      sg.addColorStop(0.5, '#b9955a');
      sg.addColorStop(1, '#7d6034');
      ctx.fillStyle = sg;
      roundRect(ctx, -r * 0.06, -r * 1.1, r * 0.12, r * 1.35, r * 0.05);
      ctx.fill();
      // спираль
      ctx.strokeStyle = 'rgba(120,220,170,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.25 - i * r * 0.16, r * 0.1, 0, Math.PI);
        ctx.stroke();
      }
      // кристалл
      const glowR = r * 0.24 + Math.sin(t * 3) * 2;
      const gg = ctx.createRadialGradient(0, -r * 1.2, 2, 0, -r * 1.2, glowR * 2.6);
      gg.addColorStop(0, 'rgba(210,255,230,0.95)');
      gg.addColorStop(0.4, 'rgba(61,220,151,0.7)');
      gg.addColorStop(1, 'rgba(61,220,151,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, -r * 1.2, glowR * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#eafff3';
      ctx.beginPath();
      ctx.arc(0, -r * 1.2, glowR * 0.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(61,220,151,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.42);
      ctx.lineTo(glowR * 0.6, -r * 1.2);
      ctx.lineTo(0, -r * 0.98);
      ctx.lineTo(-glowR * 0.6, -r * 1.2);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'bounce') {
      // диск-метатель
      barrel(r * 0.72, r * 0.19, { dark: '#17262e', mid: '#294048', light: '#4d7a83' });
      ctx.fillStyle = '#20323a';
      roundRect(ctx, -r * 0.26, -r * 0.8, r * 0.52, r * 0.2, r * 0.08);
      ctx.fill();
      ctx.strokeStyle = '#a9fbff';
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.94 - i * r * 0.16, r * 0.24 - i * r * 0.04, 0, Math.PI, true);
        ctx.stroke();
      }
      ctx.fillStyle = '#26d0ce';
      ctx.beginPath();
      ctx.arc(0, -r * 0.9, r * 0.08, 0, TAU);
      ctx.fill();
    }

    // Клинки Когтя
    if (b.id === 'claw') {
      ctx.strokeStyle = 'rgba(255,220,235,0.95)';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.12, -r * 0.4);
        ctx.quadraticCurveTo(s * r * 0.56, -r * 1.15, s * r * 0.2, -r * 1.6);
        ctx.stroke();
      }
    }
    // Кристалл Крио на предплечье
    if (b.id === 'krio') {
      ctx.strokeStyle = 'rgba(160,230,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.02, -r * 0.5);
      ctx.lineTo(r * 0.12, -r * 0.18);
      ctx.stroke();
      const kg = ctx.createLinearGradient(0, -r * 1.7, 0, -r * 0.9);
      kg.addColorStop(0, '#ffffff');
      kg.addColorStop(0.6, '#b7ecff');
      kg.addColorStop(1, '#6ec8f0');
      ctx.fillStyle = kg;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.68);
      ctx.lineTo(r * 0.22, -r * 1.24);
      ctx.lineTo(0, -r * 0.92);
      ctx.lineTo(-r * 0.22, -r * 1.24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawNameplate(ctx, p, game, isEnemy, us = 1) {
    const y = p.y - p.radius * 1.46;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.scale(us, us);

    const w = 58;
    const h = 9;
    const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
    const accent = isEnemy ? TEAM_COLORS[p.team].main : '#5df08a';

    // подпись
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,8,14,0.8)';
    const label = p.isPlayer ? 'ВЫ' : `${p.name}`;
    ctx.strokeText(label, 0, -6);
    ctx.fillStyle = isEnemy ? 'rgba(255,205,212,0.95)' : 'rgba(226,248,255,0.98)';
    ctx.fillText(label, 0, -6);

    // подложка
    ctx.fillStyle = 'rgba(6,11,18,0.82)';
    roundRect(ctx, -w / 2 - 3, -4, w + 6, h + 6, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // здоровье с градиентом
    if (hpFrac > 0) {
      const g = ctx.createLinearGradient(-w / 2, 0, -w / 2, h);
      g.addColorStop(0, isEnemy ? '#ff8a9d' : '#7dffb0');
      g.addColorStop(1, isEnemy ? '#d0344d' : '#2fbf6a');
      ctx.fillStyle = g;
      roundRect(ctx, -w / 2, 0, w * hpFrac, h, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, -w / 2 + 1, 1, w * hpFrac - 2, 3, 2);
      ctx.fill();
    }
    // щит
    if (p.shieldHp > 0) {
      ctx.fillStyle = withAlpha('#9fe3ff', 0.85);
      roundRect(ctx, -w / 2, 0, w * clamp(p.shieldHp / p.maxHp, 0, 1), h, 4);
      ctx.fill();
    }
    // деления
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + (w * i) / 4, 1);
      ctx.lineTo(-w / 2 + (w * i) / 4, h - 1);
      ctx.stroke();
    }
    // рамка
    ctx.strokeStyle = 'rgba(8,14,22,0.55)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, -w / 2, 0, w, h, 4);
    ctx.stroke();

    if (p.superCharge >= 100) {
      const s = 1 + Math.sin(this.t * 5) * 0.12;
      ctx.save();
      ctx.translate(w / 2 + 9, h / 2);
      ctx.scale(s, s);
      star(ctx, 0, 0, 5, 5.5, 2.5, 0);
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
      ctx.strokeStyle = '#8a5c00';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    if (p.respawnTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.66)';
      roundRect(ctx, -24, -14, 48, 24, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(p.respawnTimer)}`, 0, -1);
    }
    ctx.restore();
  }

  drawCountBadge(ctx, x, y, count, color, icon, us = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(us, us);
    ctx.fillStyle = 'rgba(10,16,26,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 0, 0.5);
    ctx.restore();
  }

  // ---------- Снаряды ----------
  drawProjectile(ctx, p, game) {
    if (p.kind === 'lob') {
      // тень на земле
      const k = clamp(p.arcT / p.arcTime, 0, 1);
      const h = Math.sin(k * Math.PI) * 70;
      const sh = 1 - h / 140;
      ctx.fillStyle = `rgba(0,0,0,${0.3 * (0.6 + sh * 0.4)})`;
      ctx.beginPath();
      ctx.ellipse(p.tx, p.ty, 17 * sh, 8 * sh, 0, 0, TAU);
      ctx.fill();

      // предупреждение о зоне
      const warn = p.team === 0 ? '#8fd4ff' : '#ffa3b4';
      const fill = ctx.createRadialGradient(p.tx, p.ty, 2, p.tx, p.ty, p.splash);
      fill.addColorStop(0, withAlpha(warn, 0.06 + k * 0.12));
      fill.addColorStop(1, withAlpha(warn, 0));
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.splash, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(warn, 0.4 + Math.sin(this.t * 10) * 0.15);
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = this.t * 30;
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.splash * (0.55 + k * 0.45), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // бомба в полёте
      const bx = p.x;
      const by = p.y - h;
      const glow = ctx.createRadialGradient(bx, by, 2, bx, by, p.radius * 3);
      glow.addColorStop(0, 'rgba(255,190,90,0.5)');
      glow.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bx, by, p.radius * 3, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(this.t * 6);
      const bg = ctx.createRadialGradient(-p.radius * 0.3, -p.radius * 0.35, 1, 0, 0, p.radius * 1.1);
      bg.addColorStop(0, '#5b6270');
      bg.addColorStop(0.7, '#2b2f3a');
      bg.addColorStop(1, '#15181f');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.team === 0 ? '#8fd4ff' : '#ffa3b4';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(-p.radius * 0.32, -p.radius * 0.36, p.radius * 0.24, 0, TAU);
      ctx.fill();
      ctx.restore();
      // искра фитиля
      const sx = bx + Math.cos(this.t * 9) * 4;
      const sy = by - p.radius - 4;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
      sg.addColorStop(0, 'rgba(255,240,170,0.95)');
      sg.addColorStop(0.4, 'rgba(255,190,80,0.6)');
      sg.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, TAU);
      ctx.fill();
      return;
    }
    if (p.kind === 'mine') return;

    const col = p.color || (p.team === 0 ? '#8fd4ff' : '#ffa3b4');
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const nx = p.vx / sp;
    const ny = p.vy / sp;
    const heal = p.heal > 0;

    // свет на земле
    const ground = ctx.createRadialGradient(p.x, p.y + p.radius * 1.2, 1, p.x, p.y + p.radius * 1.2, p.radius * 2.4);
    ground.addColorStop(0, withAlpha(col, 0.16));
    ground.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 1.2, p.radius * 2.4, p.radius * 1.2, 0, 0, TAU);
    ctx.fill();

    // хвост из нескольких сегментов
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const len = (p.radius * 1.4 + i * p.radius * 1.6) * (0.5 + Math.min(sp, 900) / 900);
      ctx.strokeStyle = withAlpha(col, 0.32 - i * 0.07);
      ctx.lineWidth = p.radius * (1.1 - i * 0.22);
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len * 0.15, p.y - ny * len * 0.15);
      ctx.lineTo(p.x - nx * len, p.y - ny * len);
      ctx.stroke();
    }

    // аура
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3.4);
    glow.addColorStop(0, withAlpha(col, 0.6));
    glow.addColorStop(0.45, withAlpha(col, 0.24));
    glow.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 3.4, 0, TAU);
    ctx.fill();

    // ядро
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle || 0);
    const core = ctx.createRadialGradient(-p.radius * 0.3, -p.radius * 0.3, 0, 0, 0, p.radius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.45, shade(col, 0.35));
    core.addColorStop(1, col);
    ctx.fillStyle = core;
    if (heal) {
      // «сгусток лечения» — капля
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 0.95, p.radius * 1.25, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 1.25, p.radius * 0.82, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = withAlpha('#ffffff', 0.75);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-p.radius * 0.3, -p.radius * 0.25, p.radius * 0.3, p.radius * 0.16, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();

    // искры вокруг
    for (let i = 0; i < 3; i++) {
      const a = this.t * 6 + i * 2.1 + p.radius;
      const rr2 = p.radius * (1.5 + i * 0.35);
      ctx.fillStyle = withAlpha(col, 0.5);
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * rr2, p.y + Math.sin(a) * rr2, 1.6, 0, TAU);
      ctx.fill();
    }

    if (p.bounces > 0) {
      ctx.strokeStyle = withAlpha(col, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 3, 0, TAU);
      ctx.stroke();
    }
    if (heal) {
      ctx.strokeStyle = 'rgba(240,255,245,0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y);
      ctx.lineTo(p.x + 4, p.y);
      ctx.moveTo(p.x, p.y - 4);
      ctx.lineTo(p.x, p.y + 4);
      ctx.stroke();
    }
  }

  // ---------- Прицеливание ----------
  drawWorldAim(ctx, game) {
    const p = game.player;
    if (!p || !p.alive) return;
    const aim = game.aimInfo;
    if (!aim) return;
    const b = BRAWLER_BY_ID[p.brawlerId];
    const a = aim.angle;
    const col = aim.super ? '#ffd54a' : '#ffffff';
    ctx.save();

    if (aim.super) {
      // индикатор супера
      const s = b.super;
      if (s.kind === 'rail') {
        ctx.strokeStyle = withAlpha('#ffd54a', 0.35);
        ctx.lineWidth = 8;
        ctx.setLineDash([18, 14]);
        ctx.lineDashOffset = -this.t * 60;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * s.range, p.y + Math.sin(a) * s.range);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (s.kind === 'leapbomb' || s.kind === 'leapstrike' || s.kind === 'freeze' || s.kind === 'mines' || s.kind === 'blast' || s.kind === 'barrage' || s.kind === 'dash') {
        const range = s.range || s.dist || (s.kind === 'dash' ? s.dist : 300);
        const rad = s.splash || s.radius || 80;
        ctx.fillStyle = withAlpha('#ffd54a', 0.13);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * range, p.y + Math.sin(a) * range, rad, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha('#ffd54a', 0.6);
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * range, p.y + Math.sin(a) * range, rad, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = withAlpha('#ffd54a', 0.3);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * range, p.y + Math.sin(a) * range);
        ctx.stroke();
      } else if (s.kind === 'aura') {
        ctx.fillStyle = withAlpha('#7dffb0', 0.12);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha('#7dffb0', 0.6);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      // обычная атака
      const atk = b.attack;
      if (atk.kind === 'lob') {
        const tx = p.x + Math.cos(a) * atk.range;
        const ty = p.y + Math.sin(a) * atk.range;
        ctx.fillStyle = withAlpha('#ffb066', 0.14);
        ctx.beginPath();
        ctx.arc(tx, ty, atk.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha('#ffd9a3', 0.75);
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -this.t * 40;
        ctx.beginPath();
        ctx.arc(tx, ty, atk.radius, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // дуга
        ctx.strokeStyle = withAlpha('#ffd9a3', 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const k = i / 12;
          const x = lerp(p.x, tx, k);
          const y = lerp(p.y, ty, k) - Math.sin(k * Math.PI) * 60;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (atk.kind === 'healbolt') {
        const ally = game.aimTarget && game.aimTarget.team === p.team;
        const c = ally ? '#7dffb0' : '#eafff3';
        ctx.strokeStyle = withAlpha(c, 0.5);
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * atk.range, p.y + Math.sin(a) * atk.range);
        ctx.stroke();
      } else {
        // конус/луч
        const spread = atk.spread || 0;
        const len = atk.range;
        const grad = ctx.createLinearGradient(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        grad.addColorStop(0, withAlpha(col, 0.22));
        grad.addColorStop(1, withAlpha(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, len, a - spread / 2, a + spread / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = withAlpha(col, 0.55);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = -this.t * 50;
        ctx.beginPath();
        ctx.arc(p.x, p.y, len, a - spread / 2, a + spread / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // линия направления
    const lineLen = 90;
    ctx.strokeStyle = withAlpha(col, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * (p.radius + 8), p.y + Math.sin(a) * (p.radius + 8));
    ctx.lineTo(p.x + Math.cos(a) * (p.radius + 8 + lineLen), p.y + Math.sin(a) * (p.radius + 8 + lineLen));
    ctx.stroke();

    // маркер цели
    const tgt = game.aimTarget;
    if (tgt && tgt.alive) {
      ctx.strokeStyle = tgt.team === p.team ? '#7dffb0' : '#ff5c72';
      ctx.lineWidth = 3;
      const s2 = tgt.radius + 10 + Math.sin(this.t * 8) * 3;
      for (let i = 0; i < 4; i++) {
        const aa = i * (Math.PI / 2) + Math.PI / 4 + this.t * 1.5;
        ctx.beginPath();
        ctx.arc(tgt.x, tgt.y, s2, aa, aa + 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawAimCursor(ctx, game, cam) {
    const gameIn = game.aimInfo;
    if (!gameIn) return;
    const p = game.player;
    if (!p || !p.alive) return;
    const sx = this.width / 2 + (gameIn.point.x - cam.cx) * cam.zoom;
    const sy = this.height / 2 + (gameIn.point.y - cam.cy) * cam.zoom;
    const isTouch = game.input.isTouch;
    if (isTouch) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.t * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, 13, a, a + 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Эффекты ----------
  drawParticles(ctx, game) {
    for (const p of game.particles) {
      const k = clamp(p.life / p.maxLife, 0, 1);
      const alpha = k * (p.alpha ?? 1);
      if (alpha <= 0.01) continue;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.life * p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.stretch || 1));
        ctx.restore();
      } else if (p.shape === 'ring') {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width || 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 1.1), 0, TAU);
        ctx.stroke();
      } else if (p.shape === 'star') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.life * p.spin);
        star(ctx, 0, 0, 5, p.size, p.size * 0.45, 0);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'glow') {
        const r = p.size * (p.shrink ? 0.4 + k * 0.6 : 1) * 3;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, withAlpha(p.color, alpha));
        g.addColorStop(0.4, withAlpha(p.color, alpha * 0.45));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'smoke') {
        const r = p.size * (1.8 - k * 0.9);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, withAlpha(p.color, alpha * 0.55));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'streak') {
        const len = Math.max(3, Math.hypot(p.vx, p.vy) * 0.045);
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.shrink ? k : 1), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawEffects(ctx, game) {
    for (const e of game.effects) {
      const k = clamp(e.life / e.maxLife, 0, 1);
      const grow = 1 - k;
      if (e.kind === 'explosion') {
        const r = e.radius * (0.3 + grow * 0.9);

        // ударная волна
        ctx.strokeStyle = withAlpha(e.color || '#ffd9a8', 0.5 * k * k);
        ctx.lineWidth = 1.5 + 3 * k;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * (0.3 + grow * 1.35), 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = withAlpha('#ffffff', 0.28 * k * k);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * (0.2 + grow * 1.05), 0, TAU);
        ctx.stroke();

        const grad = ctx.createRadialGradient(e.x, e.y, r * 0.05, e.x, e.y, r);
        grad.addColorStop(0, withAlpha('#ffffff', 0.95 * k));
        grad.addColorStop(0.3, withAlpha(e.color || '#fff2b0', 0.85 * k));
        grad.addColorStop(0.62, withAlpha(e.color2 || '#ff9b3d', 0.55 * k));
        grad.addColorStop(1, withAlpha(e.color2 || '#ff9b3d', 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.fill();

        // рваные языки огня
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + (e.seed || 0);
          const rr2 = e.radius * (0.25 + grow * 0.9) * (0.7 + (i % 3) * 0.14);
          const fx = e.x + Math.cos(a) * rr2;
          const fy = e.y + Math.sin(a) * rr2;
          const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, e.radius * 0.32 * k + 4);
          fg.addColorStop(0, withAlpha('#ffd98a', 0.7 * k));
          fg.addColorStop(1, withAlpha('#ff7a2f', 0));
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx, fy, e.radius * 0.32 * k + 4, 0, TAU);
          ctx.fill();
        }
      } else if (e.kind === 'smoke') {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + grow * 1.4;
          const rr2 = e.radius * (0.2 + grow * 0.85) * (0.7 + (i % 2) * 0.3);
          const sx = e.x + Math.cos(a) * rr2;
          const sy = e.y + Math.sin(a) * rr2 - grow * 14;
          const sr = e.radius * (0.35 + grow * 0.5) * k;
          const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, sr));
          sg.addColorStop(0, `rgba(150,158,170,${0.2 * k})`);
          sg.addColorStop(1, 'rgba(150,158,170,0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, sr), 0, TAU);
          ctx.fill();
        }
      } else if (e.kind === 'beam') {
        const ex = e.x + Math.cos(e.angle) * e.length;
        const ey = e.y + Math.sin(e.angle) * e.length;
        ctx.lineCap = 'round';
        ctx.strokeStyle = withAlpha(e.color || '#4aa8ff', 0.3 * k);
        ctx.lineWidth = e.width * 2.4 * k + 12;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = withAlpha('#8ff3ff', 0.6 * k);
        ctx.lineWidth = e.width * k + 6;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = withAlpha('#ffffff', 0.95 * k);
        ctx.lineWidth = e.width * k * 0.45 + 2;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // искры по лучу
        for (let i = 0; i < 6; i++) {
          const kk = ((i / 6 + grow * 0.5) % 1);
          const px = lerp(e.x, ex, kk);
          const py = lerp(e.y, ey, kk);
          ctx.fillStyle = withAlpha('#eaffff', 0.7 * k);
          ctx.beginPath();
          ctx.arc(px, py, 2 + (1 - k) * 2, 0, TAU);
          ctx.fill();
        }
      } else if (e.kind === 'dash') {
        const g = ctx.createLinearGradient(
          e.x - Math.cos(e.angle) * e.radius, e.y - Math.sin(e.angle) * e.radius,
          e.x + Math.cos(e.angle) * e.radius, e.y + Math.sin(e.angle) * e.radius
        );
        g.addColorStop(0, withAlpha(e.color || '#ffffff', 0));
        g.addColorStop(0.6, withAlpha(e.color || '#ffffff', 0.3 * k));
        g.addColorStop(1, withAlpha(e.color || '#ffffff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.5, e.angle, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(e.color || '#ffffff', 0.5 * k);
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          const off = i * e.radius * 0.32;
          ctx.beginPath();
          ctx.moveTo(e.x - Math.cos(e.angle) * e.radius + Math.cos(e.angle + Math.PI / 2) * off,
            e.y - Math.sin(e.angle) * e.radius + Math.sin(e.angle + Math.PI / 2) * off);
          ctx.lineTo(e.x + Math.cos(e.angle) * e.radius + Math.cos(e.angle + Math.PI / 2) * off,
            e.y + Math.sin(e.angle) * e.radius + Math.sin(e.angle + Math.PI / 2) * off);
          ctx.stroke();
        }
      } else if (e.kind === 'spark') {
        ctx.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
          const a = e.angle + (i / 10) * TAU + grow * 0.4;
          const inner = 6 + grow * 5;
          const outer = 12 + 22 * grow * (i % 2 ? 0.65 : 1);
          ctx.strokeStyle = withAlpha(e.color || '#ffffff', 0.85 * k);
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * inner, e.y + Math.sin(a) * inner);
          ctx.lineTo(e.x + Math.cos(a) * outer, e.y + Math.sin(a) * outer);
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 20);
        g.addColorStop(0, withAlpha(e.color || '#ffffff', 0.5 * k));
        g.addColorStop(1, withAlpha(e.color || '#ffffff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20, 0, TAU);
        ctx.fill();
      } else if (e.kind === 'ring') {
        const rr2 = e.radius * (0.15 + grow * 1.05);
        ctx.strokeStyle = withAlpha(e.color || '#ffffff', 0.85 * k);
        ctx.lineWidth = (e.width || 4) * k + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rr2, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = withAlpha('#ffffff', 0.35 * k);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rr2 * 0.68, 0, TAU);
        ctx.stroke();
      } else if (e.kind === 'flash') {
        const s = e.size || 30;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, s * (0.5 + grow));
        g.addColorStop(0, withAlpha('#ffffff', 0.9 * k));
        g.addColorStop(0.35, withAlpha(e.color || '#ffe9a8', 0.6 * k));
        g.addColorStop(1, withAlpha(e.color || '#ffe9a8', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, s * (0.5 + grow), 0, TAU);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.85 * k);
        star(ctx, e.x, e.y, 4, s * 0.7 * k, s * 0.22 * k, grow * 1.5);
        ctx.fill();
      } else if (e.kind === 'heal') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + this.t;
          const rr2 = e.radius * (0.5 + grow * 0.7);
          const px = e.x + Math.cos(a) * rr2;
          const py = e.y + Math.sin(a) * rr2 - grow * 18;
          ctx.fillStyle = withAlpha('#7dffb0', 0.7 * k);
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, TAU);
          ctx.fill();
          if (i % 2 === 0) {
            ctx.fillStyle = withAlpha('#eafff3', 0.6 * k);
            ctx.fillRect(px - 4, py - 0.8, 8, 1.6);
            ctx.fillRect(px - 0.8, py - 4, 1.6, 8);
          }
        }
      } else if (e.kind === 'text') {
        ctx.font = `bold ${e.size || 26}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const scale = 1 + (1 - k) * 0.12;
        ctx.save();
        ctx.translate(e.x, e.y - (1 - k) * 24);
        ctx.scale(scale, scale);
        ctx.lineWidth = 6;
        ctx.strokeStyle = withAlpha('#04070c', 0.8 * k);
        ctx.strokeText(e.text, 0, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = withAlpha('#000000', 0.5 * k);
        ctx.strokeText(e.text, 0, 0);
        ctx.fillStyle = withAlpha(e.color || '#ffffff', k);
        ctx.fillText(e.text, 0, 0);
        ctx.restore();
      }
    }
  }

  drawFloaters(ctx, game) {
    const us = 1 / (this.cam?.zoom || 1);
    for (const f of game.floaters) {
      const k = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = `bold ${(f.size || 18) * us}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  ensureGrain(ctx) {
    if (this.grain) return this.grain;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * 0.05 + 0.01;
      g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
    }
    this.grain = ctx.createPattern(c, 'repeat');
    return this.grain;
  }

  drawScreenFX(ctx, game) {
    const w = this.width;
    const h = this.height;
    const p = game.player;

    // Лёгкая цветокоррекция: свет сверху, тень снизу
    const grade = ctx.createLinearGradient(0, 0, 0, h);
    grade.addColorStop(0, 'rgba(120,190,255,0.06)');
    grade.addColorStop(0.45, 'rgba(0,0,0,0)');
    grade.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, w, h);

    // Виньетка
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.76);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(0,0,0,0.14)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Плёночное зерно
    const grain = this.ensureGrain(ctx);
    if (grain) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      const ox = (Math.floor(this.t * 24) % 128);
      const oy = (Math.floor(this.t * 18) % 128);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();
    }

    // Готовый супер — мягкое свечение по краям
    if (p && p.alive && p.superCharge >= 100) {
      const pulse = 0.1 + Math.sin(this.t * 3) * 0.035;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,213,74,0)');
      g.addColorStop(1, `rgba(255,196,50,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Красная рамка при низком HP
    if (p && p.alive && p.hp / p.maxHp < 0.32) {
      const pulse = 0.2 + Math.sin(game.time * 7) * 0.1;
      const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.68);
      g2.addColorStop(0, 'rgba(255,0,40,0)');
      g2.addColorStop(1, `rgba(255,0,40,${pulse})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    }
    // Вспышка урона
    if (game.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,60,${game.hurtFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
    // Подсветка при получении супера
    if (game.superFlash > 0) {
      const g3 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      g3.addColorStop(0, 'rgba(255,213,74,0)');
      g3.addColorStop(1, `rgba(255,213,74,${game.superFlash * 0.2})`);
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);
    }
    // Экран после смерти
    if (p && !p.alive) {
      ctx.fillStyle = 'rgba(4,8,16,0.34)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const y = h * 0.5 + (i - 1) * 46;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 70, y);
        ctx.lineTo(w / 2 + 70, y);
        ctx.stroke();
      }
    }
  }

  drawJoysticks(ctx, game) {
    if (!game.input.isTouch) return;
    const mv = game.input.stickVector('move');
    const am = game.input.stickVector('aim');
    const drawStick = (s, color, label) => {
      if (!s) return;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = withAlpha(color, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.ox, s.oy, 46, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha(color, 0.16);
      ctx.beginPath();
      ctx.arc(s.ox, s.oy, 46, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(color, 0.8);
      ctx.beginPath();
      ctx.arc(s.ox + s.dx, s.oy + s.dy, 20, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, s.ox, s.oy + 70);
      ctx.restore();
    };
    drawStick(mv, '#7fe3ff', 'ДВИЖЕНИЕ');
    drawStick(am, '#ffd54a', 'ПРИЦЕЛ · отпусти = выстрел');
  }
}

export { roundRect, star, diamond };


// ---------- Портреты для меню ----------
let portraitRenderer = null;

export function drawPortrait(ctx, brawlerId, time, width, height, offsetX = 0, offsetY = 0) {
  if (!portraitRenderer) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    portraitRenderer = new Renderer(c);
  }
  const b = BRAWLER_BY_ID[brawlerId];
  if (!b) return;
  portraitRenderer.t = time;
  const r = b.radius;
  const fake = {
    id: 'portrait',
    name: '',
    team: 0,
    brawlerId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2 + 0.34,
    radius: r,
    hp: b.hp,
    maxHp: b.hp,
    alive: true,
    seed: 1.4,
    z: 0,
    hitFlash: 0,
    shieldTime: 0,
    shieldHp: 0,
    slowTime: 0,
    invisTime: 0,
    superCharge: 0,
    gems: 0,
    stars: 0,
    carrying: false,
    aimOffset: 0,
    respawnTimer: 0,
    portrait: true,
    isPlayer: false,
  };
  const fakeGame = {
    playerTeam: 0,
    player: fake,
    mode: 'gemgrab',
    canSee: () => true,
    input: { isTouch: false },
  };
  ctx.save();
  ctx.translate(offsetX + width / 2, offsetY + height * 0.62);
  const s = (Math.min(width, height) * 0.27) / r;
  ctx.scale(s, s);
  portraitRenderer.drawBrawler(ctx, fake, fakeGame, { zoom: 1 });
  ctx.restore();
}
