// Процедурные бесшовные текстуры.
//
// Считаются один раз в offscreen-canvas и переиспользуются: на кадр никакой
// генерации нет, только drawImage. Всё в try/catch — в тестовом окружении
// (jsdom) canvas может быть заглушкой, и игра должна работать без текстур.

const CACHE = new Map();
const MAX_CACHE = 24;

function hash2i(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Бесшовный value-noise: решётка замыкается через period.
function noise2(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const p = period;
  const x0 = ((xi % p) + p) % p;
  const y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const a = hash2i(x0, y0, seed);
  const b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed);
  const d = hash2i(x1, y1, seed);
  const sx = smooth(xf);
  const sy = smooth(yf);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function fbm(x, y, period, seed, octaves = 4, gain = 0.5, lacunarity = 2) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = period;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x * freq, y * freq, p, seed + o * 97) * amp;
    norm += amp;
    amp *= gain;
    p *= lacunarity;
    freq *= lacunarity;
  }
  return sum / norm;
}

// «Хребтовый» шум — трещины и прожилки.
function ridged(x, y, period, seed, octaves = 3) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = period;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise2(x * f, y * f, p, seed + o * 131) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.55;
    p *= 2;
    f *= 2;
  }
  return sum / norm;
}

function makeCanvas(size) {
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  } catch (_) {
    return null;
  }
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Возвращает canvas с текстурой или null, если canvas недоступен.
 * kind: stone | grass | ice | sand | metal | wood | fabric | water
 */
export function getTexture(kind, opts = {}) {
  const size = opts.size || 192;
  const seed = opts.seed || 1;
  const key = `${kind}:${size}:${seed}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const canvas = makeCanvas(size);
  if (!canvas) {
    CACHE.set(key, null);
    return null;
  }
  let image = null;
  let data = null;
  try {
    const ctx = canvas.getContext('2d');
    image = ctx.createImageData(size, size);
    data = image && image.data;
  } catch (_) {
    data = null;
  }
  if (!data || !data.length) {
    CACHE.set(key, null);
    return null;
  }

  const S = size;
  const period = 8; // сколько «клеток» шума на текстуру
  const px = (v) => Math.max(0, Math.min(255, v));

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * period;
      const v = (y / S) * period;
      let r = 128;
      let g = 128;
      let b = 128;
      let a = 255;

      switch (kind) {
        case 'stone': {
          const base = fbm(u, v, period, seed, 5);
          const grain = fbm(u * 6, v * 6, period * 6, seed + 3, 2);
          const crack = ridged(u * 1.4, v * 1.4, 8, seed + 11, 3);
          let k = 150 + (base - 0.5) * 70 + (grain - 0.5) * 26;
          k -= Math.max(0, crack - 0.62) * 240;
          r = k * 0.98;
          g = k * 1.0;
          b = k * 1.04;
          break;
        }
        case 'grass': {
          const clump = fbm(u, v, period, seed, 4);
          const blade = noise2(u * 2.5 + v * 0.6, v * 26, period * 26, seed + 7);
          const fine = fbm(u * 12, v * 12, period * 12, seed + 5, 2);
          const k = 120 + (clump - 0.5) * 66 + (blade - 0.5) * 58 + (fine - 0.5) * 22;
          r = k * 0.86;
          g = k * 1.1;
          b = k * 0.82;
          break;
        }
        case 'ice': {
          const facet = ridged(u * 1.1, v * 1.1, 8, seed + 2, 3);
          const frost = fbm(u * 5, v * 5, period * 5, seed + 9, 3);
          const sparkle = noise2(u * 24, v * 24, period * 24, seed + 21);
          let k = 150 + facet * 90 + (frost - 0.5) * 34;
          if (sparkle > 0.94) k += 70;
          r = k * 0.92;
          g = k * 1.02;
          b = k * 1.14;
          break;
        }
        case 'sand': {
          const dune = fbm(u * 0.8, v * 0.8, period, seed + 4, 3);
          const ripple = Math.sin((v * 8 + dune * 6) * Math.PI) * 0.5 + 0.5;
          const speck = noise2(u * 30, v * 30, period * 30, seed + 8);
          const k = 160 + (dune - 0.5) * 44 + ripple * 26 + (speck - 0.5) * 34;
          r = k * 1.06;
          g = k * 0.98;
          b = k * 0.84;
          break;
        }
        case 'metal': {
          const brush = noise2(u * 2, v * 40, period * 40, seed + 6);
          const dirt = fbm(u * 3, v * 3, period * 3, seed + 12, 3);
          const k = 140 + (brush - 0.5) * 46 + (dirt - 0.5) * 40;
          r = k * 0.98;
          g = k * 1.0;
          b = k * 1.06;
          break;
        }
        case 'wood': {
          const grain = Math.sin((u * 3 + fbm(u * 0.9, v * 0.35, period, seed + 1, 3) * 9) * Math.PI * 2);
          const knots = ridged(u * 0.7, v * 1.6, 8, seed + 15, 2);
          const k = 150 + grain * 26 + (knots - 0.5) * 44;
          r = k * 1.12;
          g = k * 0.86;
          b = k * 0.62;
          break;
        }
        case 'water': {
          const wave = fbm(u * 1.2, v * 2.2, period, seed + 3, 4);
          const foam = ridged(u * 3, v * 3, period * 3, seed + 9, 2);
          const k = 140 + (wave - 0.5) * 70 + Math.max(0, foam - 0.7) * 170;
          r = k * 0.86;
          g = k * 1.0;
          b = k * 1.12;
          break;
        }
        case 'fabric':
        default: {
          const weave = (Math.sin(x * 1.7) + Math.sin(y * 1.7)) * 5;
          const n = fbm(u * 6, v * 6, period * 6, seed + 2, 3);
          const k = 150 + (n - 0.5) * 46 + weave;
          r = k;
          g = k;
          b = k;
          a = 255;
          break;
        }
      }

      const i = (y * S + x) * 4;
      data[i] = clamp255(px(r));
      data[i + 1] = clamp255(px(g));
      data[i + 2] = clamp255(px(b));
      data[i + 3] = a;
    }
  }

  try {
    canvas.getContext('2d').putImageData(image, 0, 0);
  } catch (_) {
    CACHE.set(key, null);
    return null;
  }

  if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, canvas);
  return canvas;
}

/** Заливает прямоугольник текстурой (тайлингом), не создавая градиентов на кадр. */
export function fillTile(ctx, kind, x, y, w, h, opts = {}) {
  const tex = getTexture(kind, { size: opts.size || 192, seed: opts.seed || 1 });
  if (!tex) return false;
  const scale = opts.scale || 1;
  const tw = Math.max(8, Math.round(tex.width * scale));
  const th = Math.max(8, Math.round(tex.height * scale));
  const ox = opts.offsetX || 0;
  const oy = opts.offsetY || 0;
  const prevA = ctx.globalAlpha;
  const prevC = ctx.globalCompositeOperation;
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.composite) ctx.globalCompositeOperation = opts.composite;
  const startX = x + (((ox % tw) + tw) % tw) - tw;
  const startY = y + (((oy % th) + th) % th) - th;
  for (let yy = startY; yy < y + h; yy += th) {
    for (let xx = startX; xx < x + w; xx += tw) {
      // не рисуем то, что целиком за пределами области
      if (xx + tw < x || yy + th < y) continue;
      ctx.drawImage(tex, xx, yy, tw, th);
    }
  }
  ctx.globalAlpha = prevA;
  ctx.globalCompositeOperation = prevC;
  return true;
}

/** Маленькая тайловая текстура для CSS-фонов меню. */
export function textureDataURL(kind = 'fabric', size = 96, alpha = 0.06) {
  const tex = getTexture(kind, { size });
  if (!tex) return '';
  try {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) return '';
    g.globalAlpha = alpha;
    g.drawImage(tex, 0, 0);
    return c.toDataURL('image/png');
  } catch (_) {
    return '';
  }
}

export function clearTextureCache() {
  CACHE.clear();
}
