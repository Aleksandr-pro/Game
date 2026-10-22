// Поиск пути A* по сетке арены.
import { WALL, CRATE, WATER } from './maps.js';
import { MinHeap } from './utils.js';

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function findPath(map, sx, sy, tx, ty) {
  const { width: w, height: h, grid, tile } = map;
  let startX = Math.floor(sx / tile);
  let startY = Math.floor(sy / tile);
  let goalX = Math.floor(tx / tile);
  let goalY = Math.floor(ty / tile);
  startX = Math.max(0, Math.min(w - 1, startX));
  startY = Math.max(0, Math.min(h - 1, startY));
  goalX = Math.max(0, Math.min(w - 1, goalX));
  goalY = Math.max(0, Math.min(h - 1, goalY));

  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const t = grid[y][x];
    return t === WALL || t === CRATE || t === WATER;
  };

  // Если цель в стене — ищем ближайшую свободную клетку
  if (blocked(goalX, goalY)) {
    let best = null;
    let bestD = Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (blocked(x, y)) continue;
        const d = (x - goalX) ** 2 + (y - goalY) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    if (!best) return null;
    goalX = best[0];
    goalY = best[1];
  }
  if (startX === goalX && startY === goalY) {
    return [{ x: tx, y: ty }];
  }

  const size = w * h;
  const gScore = new Float32Array(size).fill(Infinity);
  const fScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const startIdx = startY * w + startX;
  const goalIdx = goalY * w + goalX;
  gScore[startIdx] = 0;
  const heur = (x, y) => {
    const dx = Math.abs(x - goalX);
    const dy = Math.abs(y - goalY);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  fScore[startIdx] = heur(startX, startY);
  const open = new MinHeap();
  open.push(startIdx, fScore[startIdx]);
  let iterations = 0;
  const maxIter = 1600;

  while (open.size && iterations++ < maxIter) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goalIdx) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (blocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // не срезать углы
        if (blocked(cx + dx, cy) || blocked(cx, cy + dy)) continue;
      }
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        fScore[ni] = ng + heur(nx, ny);
        came[ni] = cur;
        open.push(ni, fScore[ni]);
      }
    }
  }

  if (came[goalIdx] === -1 && goalIdx !== startIdx) {
    return null;
  }

  const path = [];
  let node = goalIdx;
  let guard = 0;
  while (node !== startIdx && guard++ < 500) {
    const x = node % w;
    const y = (node - x) / w;
    path.push({ x: (x + 0.5) * tile, y: (y + 0.5) * tile });
    node = came[node];
    if (node === -1) return null;
  }
  path.reverse();
  path.push({ x: tx, y: ty });
  return path;
}

export function isBlockedAt(map, wx, wy) {
  const tx = Math.floor(wx / map.tile);
  const ty = Math.floor(wy / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  const t = map.grid[ty][tx];
  return t === WALL || t === CRATE || t === WATER;
}
