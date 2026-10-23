// Рендерер: арена, бойцы, снаряды, эффекты, прицеливание.
import { BRAWLER_BY_ID, TEAM_COLORS, TILE } from './config.js';
import { WALL, CRATE, WATER, BUSH } from './maps.js';
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
  buildBackground(map, version = 0) {
    const key = `${map.id}:v${version}`;
    if (this.bgCache.has(key)) return this.bgCache.get(key);
    const theme = map.theme;
    const c = document.createElement('canvas');
    c.width = map.worldW;
    c.height = map.worldH;
    const g = c.getContext('2d');

    // Пол
    g.fillStyle = theme.floor;
    g.fillRect(0, 0, map.worldW, map.worldH);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        const n = hash2(x, y);
        if (tile !== WALL && tile !== CRATE && tile !== WATER) {
          g.fillStyle = n > 0.5 ? theme.floor2 : theme.floor;
          g.fillRect(px, py, TILE, TILE);
          // лёгкая текстура
          g.fillStyle = withAlpha(theme.floorLine, 0.28);
          g.fillRect(px, py, TILE, 2);
          g.fillRect(px, py, 2, TILE);
          if (n > 0.86) {
            g.fillStyle = withAlpha(theme.floorLine, 0.45);
            const s = 6 + n * 14;
            g.beginPath();
            g.arc(px + 20 + n * 40, py + 18 + (1 - n) * 44, s * 0.35, 0, TAU);
            g.fill();
          }
          if (theme.deco === 'field') {
            // полосы газона
            if (x % 2 === 0) {
              g.fillStyle = 'rgba(255,255,255,0.035)';
              g.fillRect(px, py, TILE, TILE);
            }
          }
          if (theme.deco === 'ice') {
            g.strokeStyle = 'rgba(180,230,255,0.09)';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(px + 8 + n * 50, py + 6);
            g.lineTo(px + 30 + n * 30, py + 34);
            g.lineTo(px + 14 + n * 40, py + 62);
            g.stroke();
          }
          if (theme.deco === 'sand') {
            g.fillStyle = 'rgba(255,220,160,0.05)';
            g.beginPath();
            g.arc(px + 20 + n * 45, py + 24 + (1 - n) * 36, 10 + n * 10, 0, TAU);
            g.fill();
          }
        }
      }
    }

    // Вода
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] !== WATER) continue;
        const px = x * TILE;
        const py = y * TILE;
        const grad = g.createLinearGradient(px, py, px, py + TILE);
        grad.addColorStop(0, theme.water2);
        grad.addColorStop(1, theme.water);
        g.fillStyle = grad;
        g.fillRect(px, py, TILE, TILE);
        g.strokeStyle = 'rgba(150,230,255,0.22)';
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i < 2; i++) {
          const yy = py + 22 + i * 26;
          g.moveTo(px + 10, yy);
          g.bezierCurveTo(px + 26, yy - 8, px + 44, yy + 8, px + 62, yy - 2);
        }
        g.stroke();
      }
    }

    // Ящики (разрушаемые)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] !== CRATE) continue;
        const px = x * TILE;
        const py = y * TILE;
        g.fillStyle = 'rgba(0,0,0,0.28)';
        roundRect(g, px + 5, py + 12, 70, 62, 12);
        g.fill();
        const grad = g.createLinearGradient(px, py, px, py + TILE);
        grad.addColorStop(0, '#b57a44');
        grad.addColorStop(1, '#7d4e28');
        g.fillStyle = grad;
        roundRect(g, px + 5, py + 5, 70, 64, 10);
        g.fill();
        g.strokeStyle = '#4d2e14';
        g.lineWidth = 4;
        g.stroke();
        g.strokeStyle = 'rgba(255,210,150,0.4)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(px + 12, py + 20);
        g.lineTo(px + 68, py + 20);
        g.moveTo(px + 12, py + 50);
        g.lineTo(px + 68, py + 50);
        g.stroke();
        g.fillStyle = '#4d2e14';
        for (const [dx, dy] of [[14, 14], [58, 14], [14, 52], [58, 52]]) {
          g.beginPath();
          g.arc(px + dx, py + dy, 3.4, 0, TAU);
          g.fill();
        }
      }
    }

    // Стены
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] !== WALL) continue;
        const px = x * TILE;
        const py = y * TILE;
        // тень
        g.fillStyle = 'rgba(0,0,0,0.32)';
        roundRect(g, px + 6, py + 12, TILE - 6, TILE - 6, 12);
        g.fill();
        const grad = g.createLinearGradient(px, py, px, py + TILE);
        grad.addColorStop(0, theme.wallTop);
        grad.addColorStop(0.28, theme.wall);
        grad.addColorStop(1, theme.wallDark);
        g.fillStyle = grad;
        roundRect(g, px + 2, py + 2, TILE - 4, TILE - 4, 12);
        g.fill();
        // верхняя подсветка
        g.strokeStyle = withAlpha(theme.accent, 0.35);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(px + 12, py + 7);
        g.lineTo(px + TILE - 12, py + 7);
        g.stroke();
        // трещины/камни
        const n = hash2(x + 7, y + 13);
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(px + 20 + n * 20, py + 26);
        g.lineTo(px + 38 + n * 10, py + 44);
        g.lineTo(px + 30 + n * 18, py + 62);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.beginPath();
        g.arc(px + 56 - n * 10, py + 24 + n * 12, 6, 0, TAU);
        g.fill();
      }
    }

    // Декор по краям
    g.globalAlpha = 0.6;
    for (let i = 0; i < 60; i++) {
      const n1 = hash2(i, 3);
      const n2 = hash2(5, i * 7);
      const px = n1 * map.worldW;
      const py = n2 * map.worldH;
      if (map.grid[Math.floor(py / TILE)]?.[Math.floor(px / TILE)] !== 0) continue;
      g.fillStyle = withAlpha(theme.floorLine, 0.4);
      g.beginPath();
      g.arc(px, py, 3 + n1 * 5, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    this.bgCache.set(key, c);
    if (this.bgCache.size > 6) {
      const first = this.bgCache.keys().next().value;
      this.bgCache.delete(first);
    }
    return c;
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

    // Тени бойцов
    for (const p of game.players) {
      if (!p.alive) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.radius * 0.72, p.radius * 0.92, p.radius * 0.45, 0, 0, TAU);
      ctx.fill();
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

  drawBushes(ctx, game, view) {
    const theme = game.map.theme;
    const map = game.map;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] !== BUSH) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (px + TILE < view.x - 80 || px > view.x + view.w + 80 || py + TILE < view.y - 80 || py > view.y + view.h + 80) continue;
        const sway = Math.sin(this.t * 1.8 + x * 0.7 + y * 0.4) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath();
        ctx.ellipse(px + 40, py + 72, 36, 12, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = theme.bush2;
        roundRect(ctx, px + 4, py + 12, 72, 64, 24);
        ctx.fill();
        const blobs = [
          [22, 54, 23],
          [57, 55, 24],
          [40, 36, 27],
          [17, 31, 18],
          [63, 30, 18],
          [40, 66, 21],
        ];
        for (let i = 0; i < blobs.length; i++) {
          const [bx, by, br] = blobs[i];
          ctx.fillStyle = i % 3 === 0 ? theme.bush3 : i % 3 === 1 ? theme.bush : theme.bush2;
          ctx.beginPath();
          ctx.arc(px + bx + sway * (i / 6), py + by, br, 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(8, 26, 20, 0.3)';
        ctx.lineWidth = 2;
        roundRect(ctx, px + 4, py + 12, 72, 64, 24);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        for (let i = 0; i < 5; i++) {
          const a = this.t * 0.5 + i * 1.9 + x * 0.6;
          ctx.beginPath();
          ctx.arc(px + 38 + Math.cos(a) * 20, py + 40 + Math.sin(a) * 15, 2.8 + (i % 2), 0, TAU);
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
      const pulse = 0.16 + Math.sin(this.t * 2.2 + team) * 0.04;
      ctx.fillStyle = withAlpha(col.main, pulse);
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = withAlpha(col.light, 0.9);
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -this.t * 26;
      ctx.strokeRect(g.x + 4, g.y + 4, g.w - 8, g.h - 8);
      ctx.setLineDash([]);
      // сетка
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      for (let yy = g.y + 14; yy < g.y + g.h; yy += 20) {
        ctx.beginPath();
        ctx.moveTo(g.x, yy);
        ctx.lineTo(g.x + g.w, yy);
        ctx.stroke();
      }
      for (let xx = g.x + 18; xx < g.x + g.w; xx += 22) {
        ctx.beginPath();
        ctx.moveTo(xx, g.y);
        ctx.lineTo(xx, g.y + g.h);
        ctx.stroke();
      }
      // значок
      ctx.fillStyle = withAlpha(col.light, 0.55 + Math.sin(this.t * 3) * 0.15);
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚽', g.x + g.w / 2, g.y + g.h / 2);
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
    if (!mine.armed) {
      ctx.strokeStyle = 'rgba(255,90,90,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 26, 0, TAU);
      ctx.stroke();
    }
    const blink = mine.armed ? (Math.sin(this.t * 10) > 0 ? 1 : 0.35) : 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(mine.x, mine.y + 10, 18, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b3340';
    roundRect(ctx, mine.x - 16, mine.y - 12, 32, 22, 8);
    ctx.fill();
    ctx.strokeStyle = '#121821';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = withAlpha('#ff4d4d', blink);
    ctx.beginPath();
    ctx.arc(mine.x, mine.y - 4, 6.5, 0, TAU);
    ctx.fill();
    if (mine.armed) {
      ctx.strokeStyle = withAlpha('#ff6b6b', 0.35 * blink);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 34 + Math.sin(this.t * 6) * 5, 0, TAU);
      ctx.stroke();
    }
  }

  drawPickup(ctx, p, game) {
    const bob = Math.sin(this.t * 3 + p.seed) * 4;
    if (p.kind === 'gem') {
      const glow = ctx.createRadialGradient(p.x, p.y + bob, 2, p.x, p.y + bob, 34);
      glow.addColorStop(0, 'rgba(200,120,255,0.5)');
      glow.addColorStop(1, 'rgba(200,120,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 34, 0, TAU);
      ctx.fill();
      // кристалл
      const grad = ctx.createLinearGradient(p.x, p.y - 18, p.x, p.y + 16);
      grad.addColorStop(0, '#e8b3ff');
      grad.addColorStop(0.5, '#b25cff');
      grad.addColorStop(1, '#6c2bd9');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 19 + bob);
      ctx.lineTo(p.x + 12, p.y - 4 + bob);
      ctx.lineTo(p.x + 7, p.y + 14 + bob);
      ctx.lineTo(p.x - 7, p.y + 14 + bob);
      ctx.lineTo(p.x - 12, p.y - 4 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y - 13 + bob);
      ctx.lineTo(p.x + 4, p.y - 4 + bob);
      ctx.lineTo(p.x - 1, p.y + 1 + bob);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'star') {
      const glow = ctx.createRadialGradient(p.x, p.y + bob, 2, p.x, p.y + bob, 34);
      glow.addColorStop(0, 'rgba(255,210,90,0.5)');
      glow.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 34, 0, TAU);
      ctx.fill();
      star(ctx, p.x, p.y + bob, 5, 17, 8, this.t);
      const grad = ctx.createLinearGradient(p.x, p.y - 16, p.x, p.y + 16);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(1, '#ffb400');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#b06f00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawBall(ctx, ball, game) {
    if (ball.owner) return;
    const bob = Math.sin(this.t * 4) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 18, 20, 9, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(ball.x, ball.y + bob);
    ctx.rotate(ball.spin || 0);
    const r = 19;
    const grad = ctx.createRadialGradient(-6, -8, 2, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#cfd8e3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#222b38';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 4.2, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (ball.vx || ball.vy) {
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 120) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(ball.x - ball.vx * 0.045, ball.y - ball.vy * 0.045);
        ctx.stroke();
      }
    }
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
    const moving = Math.hypot(p.vx, p.vy) > 20;
    const bob = moving ? Math.sin(t * 13 + p.seed) * 2.4 : Math.sin(t * 3 + p.seed) * 1.1;
    const face = p.angle;
    const teamCol = TEAM_COLORS[p.team];
    const bodyCol = b.color;
    const bodyCol2 = b.color2;

    ctx.save();
    ctx.translate(p.x, p.y - (p.z || 0));
    ctx.scale(1.5, 1.5);
    ctx.globalAlpha = 1;

    if (!p.portrait) {
      // Индикатор команды
      ctx.strokeStyle = withAlpha(teamCol.main, 0.85);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, p.radius * 0.78, p.radius * 1.05, p.radius * 0.5, 0, 0, TAU);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1;
    }

    // Щит
    if (p.shieldTime > 0) {
      ctx.save();
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = withAlpha('#9fe3ff', 0.55 + Math.sin(t * 8) * 0.15);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 12, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (p.radius + 12), Math.sin(a) * (p.radius + 12), 3.5, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Замедление / заморозка
    if (p.slowTime > 0) {
      ctx.strokeStyle = withAlpha('#a8ecff', 0.55);
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (p.radius + 2), Math.sin(a) * (p.radius + 2));
        ctx.lineTo(Math.cos(a) * (p.radius + 10), Math.sin(a) * (p.radius + 10));
        ctx.stroke();
      }
    }

    // Невидимость
    if (p.invisTime > 0) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 10) * 0.07;
    }

    const r = p.radius;
    const legPhase = moving ? Math.sin(t * 13 + p.seed) * 1 : 0;
    const flip = Math.cos(face) < 0 ? -1 : 1;

    // Оружие держим по направлению прицела (отдельно от тела)
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(face + Math.PI / 2);
    this.drawWeapon(ctx, b, r, t, p);
    ctx.restore();

    // Тело
    ctx.save();
    ctx.translate(0, bob);
    ctx.scale(flip, 1);

    // Ноги
    ctx.fillStyle = shade(bodyCol, -0.34);
    roundRect(ctx, -r * 0.5, r * 0.52 + legPhase, r * 0.36, r * 0.36, r * 0.14);
    ctx.fill();
    roundRect(ctx, r * 0.14, r * 0.52 - legPhase, r * 0.36, r * 0.36, r * 0.14);
    ctx.fill();

    // Торс
    const grad = ctx.createLinearGradient(-r * 0.5, 0, r * 0.5, r);
    grad.addColorStop(0, bodyCol2);
    grad.addColorStop(0.5, bodyCol);
    grad.addColorStop(1, shade(bodyCol, -0.24));
    ctx.fillStyle = grad;
    roundRect(ctx, -r * 0.55, r * 0.06, r * 1.1, r * 0.9, r * 0.4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,22,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Руки
    ctx.fillStyle = shade(bodyCol2, -0.12);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.6, r * 0.42 + (side > 0 ? -legPhase : legPhase) * 0.6, r * 0.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,14,22,0.25)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Эмблема
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, r * 0.5, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(teamCol.main, 0.95);
    ctx.beginPath();
    ctx.arc(0, r * 0.5, r * 0.08, 0, TAU);
    ctx.fill();

    // Голова
    const headY = -r * 0.42;
    const headR = r * 0.72;
    const headGrad = ctx.createRadialGradient(-headR * 0.3, headY - headR * 0.4, headR * 0.15, 0, headY, headR * 1.15);
    headGrad.addColorStop(0, shade(bodyCol2, 0.16));
    headGrad.addColorStop(1, shade(bodyCol2, -0.1));
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,22,0.28)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Визор
    ctx.fillStyle = '#0d1724';
    roundRect(ctx, -headR * 0.74, headY - headR * 0.22, headR * 1.48, headR * 0.6, headR * 0.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Блик визора
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, -headR * 0.62, headY - headR * 0.16, headR * 1.24, headR * 0.16, headR * 0.08);
    ctx.fill();

    // Глаза
    const eyeCol = isEnemy ? '#ff8c9d' : '#9ef6ff';
    const eyeShift = clamp(p.aimOffset || 0, -1, 1) * headR * 0.12;
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol;
    ctx.shadowBlur = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * headR * 0.3 + eyeShift, headY + headR * 0.08, headR * 0.11, headR * 0.15, 0, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Блик шлема
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.34, headY - headR * 0.46, headR * 0.26, headR * 0.13, -0.55, 0, TAU);
    ctx.fill();

    // Аксессуар персонажа
    this.drawAccessory(ctx, b, r, headY, t, headR);

    // Вспышка урона
    if (p.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.6, p.hitFlash * 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, headY * 0.4, r * 1.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // тело
    ctx.restore(); // общий save

    if (p.portrait) return;

    // Корона супера
    if (p.superCharge >= 100 && p.alive) {
      ctx.save();
      ctx.translate(p.x, p.y - p.radius * 1.75);
      const s = 1 + Math.sin(t * 6 + p.seed) * 0.08;
      ctx.scale(s, s);
      ctx.rotate(Math.sin(t * 2) * 0.12);
      star(ctx, 0, 0, 5, 10, 4.5, t * 0.5);
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
      ctx.strokeStyle = '#b47f00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Полоса здоровья и ник
    this.drawNameplate(ctx, p, game, isEnemy, 1 / (cam?.zoom || 1));

    // Кристаллы/звёзды над головой
    if (p.gems > 0 && game.mode === 'gemgrab') {
      this.drawCountBadge(ctx, p.x + p.radius + 13 / (cam?.zoom || 1), p.y - p.radius * 1.35, p.gems, '#b25cff', 'gem', 1 / (cam?.zoom || 1));
    }
    if (p.stars > 0 && game.mode === 'bounty') {
      this.drawCountBadge(ctx, p.x + p.radius + 13 / (cam?.zoom || 1), p.y - p.radius * 1.35, p.stars, '#ffc832', 'star', 1 / (cam?.zoom || 1));
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
    ctx.save();
    // оружие в правой руке, "вперёд" — вверх по локальной оси
    ctx.translate(r * 0.58, -r * 0.04);
    ctx.scale(0.82, 0.82);
    ctx.rotate(-0.1);
    if (kind === 'spread') {
      if (b.id === 'grom') {
        ctx.fillStyle = '#3b4656';
        roundRect(ctx, -r * 0.22, -r * 1.0, r * 0.44, r * 1.05, r * 0.12);
        ctx.fill();
        ctx.fillStyle = '#e8b13f';
        roundRect(ctx, -r * 0.26, -r * 0.55, r * 0.52, r * 0.2, r * 0.08);
        ctx.fill();
        ctx.fillStyle = '#222a36';
        ctx.beginPath();
        ctx.arc(0, -r * 1.0, r * 0.2, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#2f3a4a';
        roundRect(ctx, -r * 0.2, -r * 0.9, r * 0.4, r * 0.95, r * 0.1);
        ctx.fill();
        ctx.fillStyle = b.color2;
        roundRect(ctx, -r * 0.25, -r * 0.62, r * 0.5, r * 0.16, r * 0.07);
        ctx.fill();
        // раструб
        ctx.fillStyle = '#47566b';
        ctx.beginPath();
        ctx.moveTo(-r * 0.24, -r * 0.86);
        ctx.lineTo(-r * 0.34, -r * 1.08);
        ctx.lineTo(r * 0.34, -r * 1.08);
        ctx.lineTo(r * 0.24, -r * 0.86);
        ctx.closePath();
        ctx.fill();
      }
    } else if (kind === 'burst') {
      ctx.fillStyle = '#2c3748';
      roundRect(ctx, -r * 0.16, -r * 1.1, r * 0.32, r * 1.2, r * 0.08);
      ctx.fill();
      ctx.fillStyle = '#8ff3ff';
      roundRect(ctx, -r * 0.08, -r * 0.95, r * 0.16, r * 0.42, r * 0.06);
      ctx.fill();
      ctx.fillStyle = '#1b2330';
      roundRect(ctx, -r * 0.12, -r * 0.25, r * 0.24, r * 0.34, r * 0.08);
      ctx.fill();
    } else if (kind === 'single') {
      ctx.fillStyle = '#33304a';
      roundRect(ctx, -r * 0.12, -r * 1.45, r * 0.24, r * 1.55, r * 0.08);
      ctx.fill();
      ctx.fillStyle = '#6a5b95';
      roundRect(ctx, -r * 0.08, -r * 1.3, r * 0.16, r * 0.5, r * 0.05);
      ctx.fill();
      ctx.fillStyle = '#c07bff';
      roundRect(ctx, -r * 0.3, -r * 0.55, r * 0.6, r * 0.2, r * 0.08);
      ctx.fill();
    } else if (kind === 'lob') {
      ctx.fillStyle = '#4a3a2e';
      roundRect(ctx, -r * 0.24, -r * 0.55, r * 0.48, r * 0.6, r * 0.2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, -r * 0.62, r * 0.26, Math.PI, 0);
      ctx.fill();
      // бомба в руке
      const bb = Math.sin(t * 4) * 2;
      ctx.fillStyle = '#2b2b33';
      ctx.beginPath();
      ctx.arc(-r * 0.1, -r * 0.95 + bb, r * 0.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 1.12 + bb);
      ctx.lineTo(-r * 0.02, -r * 1.26 + bb);
      ctx.stroke();
    } else if (kind === 'healbolt') {
      // посох
      ctx.strokeStyle = '#c8a86a';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.1);
      ctx.lineTo(0, -r * 1.15);
      ctx.stroke();
      const glowR = r * 0.26 + Math.sin(t * 3) * 2;
      const gg = ctx.createRadialGradient(0, -r * 1.2, 2, 0, -r * 1.2, glowR * 2.4);
      gg.addColorStop(0, 'rgba(200,255,220,0.95)');
      gg.addColorStop(0.4, 'rgba(61,220,151,0.8)');
      gg.addColorStop(1, 'rgba(61,220,151,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, -r * 1.2, glowR * 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#eafff3';
      ctx.beginPath();
      ctx.arc(0, -r * 1.2, glowR * 0.75, 0, TAU);
      ctx.fill();
    } else if (kind === 'bounce') {
      ctx.fillStyle = '#2a3a45';
      roundRect(ctx, -r * 0.2, -r * 0.95, r * 0.4, r * 0.95, r * 0.12);
      ctx.fill();
      ctx.strokeStyle = '#a9fbff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -r * 1.0, r * 0.24, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#26d0ce';
      ctx.beginPath();
      ctx.arc(0, -r * 1.0, r * 0.1, 0, TAU);
      ctx.fill();
    }
    // Клинки Когтя
    if (b.id === 'claw') {
      ctx.strokeStyle = '#ffd9e2';
      ctx.lineWidth = 3.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.1, -r * 0.5);
        ctx.quadraticCurveTo(s * r * 0.5, -r * 1.2, s * r * 0.18, -r * 1.55);
        ctx.stroke();
      }
    }
    // Кристалл Крио
    if (b.id === 'krio') {
      ctx.fillStyle = '#9fe9ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.lineTo(r * 0.2, -r * 1.2);
      ctx.lineTo(0, -r * 1.55);
      ctx.lineTo(-r * 0.2, -r * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawNameplate(ctx, p, game, isEnemy, us = 1) {
    const y = p.y - p.radius * 1.42;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.scale(us, us);
    const w = 54;
    const h = 8;
    const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(8,14,22,0.78)';
    roundRect(ctx, -w / 2 - 2, -3, w + 4, h + 5, 5);
    ctx.fill();
    const col = isEnemy ? TEAM_COLORS[p.team].main : '#5df08a';
    ctx.fillStyle = col;
    roundRect(ctx, -w / 2, 0, w * hpFrac, h, 3.5);
    ctx.fill();
    if (p.shieldHp > 0) {
      ctx.fillStyle = withAlpha('#9fe3ff', 0.9);
      roundRect(ctx, -w / 2, 0, w * clamp(p.shieldHp / p.maxHp, 0, 1), h, 3.5);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + (w * i) / 4, 0);
      ctx.lineTo(-w / 2 + (w * i) / 4, h);
      ctx.stroke();
    }
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = isEnemy ? 'rgba(255,205,212,0.92)' : 'rgba(224,246,255,0.96)';
    const label = p.isPlayer ? 'ВЫ' : `${p.name}`;
    ctx.fillText(label, 0, -5);
    if (p.superCharge >= 100) {
      ctx.fillStyle = '#ffd54a';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('★', w / 2 + 9, h / 2);
    }
    if (p.respawnTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, -24, -12, 48, 24, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(p.respawnTimer)}`, 0, 0);
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
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(p.tx, p.ty, 16 * (1 - k * 0.2), 8, 0, 0, TAU);
      ctx.fill();
      const h = Math.sin(k * Math.PI) * 70;
      ctx.save();
      ctx.translate(p.x, p.y - h);
      ctx.rotate(this.t * 6);
      ctx.fillStyle = '#2b2f3a';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.team === 0 ? '#8fd4ff' : '#ffa3b4';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath();
      ctx.arc(0, -p.radius - 3, 4 + Math.sin(this.t * 20) * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      // предупреждение о зоне
      ctx.strokeStyle = withAlpha(p.team === 0 ? '#8fd4ff' : '#ffa3b4', 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.splash, 0, TAU);
      ctx.stroke();
      return;
    }
    if (p.kind === 'mine') return;
    // светящийся снаряд
    const col = p.color || (p.team === 0 ? '#8fd4ff' : '#ffa3b4');
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const nx = p.vx / sp;
    const ny = p.vy / sp;
    const trail = Math.min(28, sp * 0.02);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3.2);
    glow.addColorStop(0, withAlpha(col, 0.55));
    glow.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 3.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(col, 0.5);
    ctx.lineWidth = p.radius * 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - nx * trail, p.y - ny * trail);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 0.72, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 0.42, 0, TAU);
    ctx.fill();
    if (p.bounces > 0) {
      ctx.strokeStyle = withAlpha(col, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 2, 0, TAU);
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
      ctx.globalAlpha = k * (p.alpha ?? 1);
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.life * p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.stretch || 1));
        ctx.restore();
      } else if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width || 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 1.1), 0, TAU);
        ctx.stroke();
      } else if (p.shape === 'star') {
        star(ctx, p.x, p.y, 5, p.size, p.size * 0.45, p.rot + p.life * p.spin);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
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
        const r = e.radius * (0.35 + grow * 0.85);
        const grad = ctx.createRadialGradient(e.x, e.y, r * 0.1, e.x, e.y, r);
        grad.addColorStop(0, withAlpha(e.color || '#fff2b0', 0.85 * k));
        grad.addColorStop(0.45, withAlpha(e.color2 || '#ff9b3d', 0.6 * k));
        grad.addColorStop(1, withAlpha(e.color2 || '#ff9b3d', 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha('#fff8d6', 0.8 * k);
        ctx.lineWidth = 4 * k + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.92, 0, TAU);
        ctx.stroke();
      } else if (e.kind === 'beam') {
        const ex = e.x + Math.cos(e.angle) * e.length;
        const ey = e.y + Math.sin(e.angle) * e.length;
        ctx.lineCap = 'round';
        ctx.strokeStyle = withAlpha('#ffffff', 0.85 * k);
        ctx.lineWidth = e.width * k * 0.5 + 2;
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
        ctx.strokeStyle = withAlpha('#4aa8ff', 0.3 * k);
        ctx.lineWidth = e.width * 2 * k + 10;
        ctx.stroke();
      } else if (e.kind === 'dash') {
        ctx.fillStyle = withAlpha(e.color || '#ffffff', 0.35 * k);
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.5, e.angle, 0, TAU);
        ctx.fill();
      } else if (e.kind === 'spark') {
        ctx.strokeStyle = withAlpha(e.color || '#ffffff', 0.9 * k);
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) {
          const a = e.angle + (i / 6) * TAU;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8);
          ctx.lineTo(e.x + Math.cos(a) * (12 + 20 * grow), e.y + Math.sin(a) * (12 + 20 * grow));
          ctx.stroke();
        }
      } else if (e.kind === 'ring') {
        ctx.strokeStyle = withAlpha(e.color || '#ffffff', 0.8 * k);
        ctx.lineWidth = (e.width || 4) * k + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * (0.2 + grow), 0, TAU);
        ctx.stroke();
      } else if (e.kind === 'text') {
        ctx.font = `bold ${e.size || 26}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = withAlpha(e.color || '#ffffff', k);
        ctx.strokeStyle = withAlpha('rgba(0,0,0,0.7)', k);
        ctx.lineWidth = 4;
        const scale = 1 + (1 - k) * 0.12;
        ctx.save();
        ctx.translate(e.x, e.y - (1 - k) * 24);
        ctx.scale(scale, scale);
        ctx.strokeText(e.text, 0, 0);
        ctx.fillText(e.text, 0, 0);
        ctx.restore();
      } else if (e.kind === 'confetti') {
        // рисуем частицами
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

  drawScreenFX(ctx, game) {
    // Виньетка
    const w = this.width;
    const h = this.height;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Красная рамка при низком HP
    const p = game.player;
    if (p && p.alive && p.hp / p.maxHp < 0.32) {
      const pulse = 0.18 + Math.sin(game.time * 7) * 0.08;
      const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
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
      g3.addColorStop(0, `rgba(255,213,74,0)`);
      g3.addColorStop(1, `rgba(255,213,74,${game.superFlash * 0.18})`);
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);
    }
    // Рамка режима при респавне
    if (p && !p.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, h);
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
  ctx.translate(offsetX + width / 2, offsetY + height * 0.58);
  const s = (Math.min(width, height) * 0.34) / r;
  ctx.scale(s, s);
  portraitRenderer.drawBrawler(ctx, fake, fakeGame, { zoom: 1 });
  ctx.restore();
}
