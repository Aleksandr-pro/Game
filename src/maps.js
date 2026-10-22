// Карты арены. Каждая карта задаётся левой половиной (14 колонок) и
// зеркалится вправо — так гарантируется честная симметрия.
import { TILE } from './config.js';

export const FLOOR = 0;
export const WALL = 1;
export const CRATE = 2;
export const WATER = 3;
export const BUSH = 4;

export const THEMES = {
  mine: {
    sky: '#0a1c24',
    floor: '#23505d',
    floor2: '#275a68',
    floorLine: '#173c47',
    wall: '#3c7683',
    wallTop: '#7cb7c0',
    wallDark: '#1d4149',
    bush: '#339e6b',
    bush2: '#237a54',
    bush3: '#45bc84',
    water: '#1f5a83',
    water2: '#2f7aa6',
    accent: '#63e6d6',
    shadow: 'rgba(4,14,18,0.35)',
    deco: 'stone',
  },
  ice: {
    sky: '#0b1a30',
    floor: '#254566',
    floor2: '#2a4d71',
    floorLine: '#17324c',
    wall: '#4a779f',
    wallTop: '#a3d3f3',
    wallDark: '#22405e',
    bush: '#328e97',
    bush2: '#256f78',
    bush3: '#45b5bc',
    water: '#1f679c',
    water2: '#3589c0',
    accent: '#9fe9ff',
    shadow: 'rgba(4,12,26,0.4)',
    deco: 'ice',
  },
  stadium: {
    sky: '#0a2118',
    floor: '#24704a',
    floor2: '#2a7c52',
    floorLine: '#185437',
    wall: '#4a7265',
    wallTop: '#96c2b1',
    wallDark: '#22453a',
    bush: '#3a9650',
    bush2: '#2b7640',
    bush3: '#4fb162',
    water: '#1d5f8f',
    water2: '#2f7fb4',
    accent: '#9dff9b',
    shadow: 'rgba(3,14,10,0.4)',
    deco: 'field',
  },
  canyon: {
    sky: '#1c100c',
    floor: '#7f5535',
    floor2: '#8b5f3c',
    floorLine: '#5e3c24',
    wall: '#3f2c1c',
    wallTop: '#6d4b2e',
    wallDark: '#281a10',
    bush: '#3f7d3c',
    bush2: '#2f6330',
    bush3: '#57a34b',
    water: '#1f5d7a',
    water2: '#2f7fa0',
    accent: '#ffc46b',
    shadow: 'rgba(18,8,4,0.4)',
    deco: 'sand',
  },
};

const LEGEND = {
  '#': WALL,
  '=': CRATE,
  '~': WATER,
  '*': BUSH,
  '.': FLOOR,
  A: FLOOR,
  B: FLOOR,
  G: FLOOR,
  H: FLOOR,
};

const SWAP = { A: 'B', B: 'A', G: 'H', H: 'G' };

function mirrorHalf(halfRows, mapId) {
  return halfRows.map((row, y) => {
    if (row.length !== 14) {
      throw new Error(`[map:${mapId}] Строка ${y} имеет длину ${row.length}, нужно 14`);
    }
    const left = row;
    const right = [...row.slice(0, 13)].reverse().map((c) => SWAP[c] || c).join('');
    return left + right;
  });
}

function buildMap(def) {
  const rows = mirrorHalf(def.half, def.id);
  const height = rows.length;
  const width = rows[0].length;
  const grid = [];
  const spawns = { 0: [], 1: [] };
  const goalTiles = [];
  let crateCount = 0;

  for (let y = 0; y < height; y++) {
    const line = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      const tile = LEGEND[ch];
      if (tile === undefined) {
        throw new Error(`[map:${def.id}] Неизвестный символ "${ch}" в (${x},${y})`);
      }
      line.push(tile);
      const cx = (x + 0.5) * TILE;
      const cy = (y + 0.5) * TILE;
      if (ch === 'A') spawns[0].push({ x: cx, y: cy });
      if (ch === 'B') spawns[1].push({ x: cx, y: cy });
      if (ch === 'G' || ch === 'H') goalTiles.push({ x, y, team: ch === 'G' ? 0 : 1 });
      if (tile === CRATE) crateCount++;
    }
    grid.push(line);
  }

  // Прямоугольники ворот по плиткам
  const goals = { 0: null, 1: null };
  for (const team of [0, 1]) {
    const tiles = goalTiles.filter((t) => t.team === team);
    if (!tiles.length) continue;
    const minX = Math.min(...tiles.map((t) => t.x));
    const maxX = Math.max(...tiles.map((t) => t.x));
    const minY = Math.min(...tiles.map((t) => t.y));
    const maxY = Math.max(...tiles.map((t) => t.y));
    goals[team] = {
      x: minX * TILE,
      y: minY * TILE,
      w: (maxX - minX + 1) * TILE,
      h: (maxY - minY + 1) * TILE,
    };
  }

  const map = {
    id: def.id,
    name: def.name,
    mode: def.mode,
    width,
    height,
    tile: TILE,
    worldW: width * TILE,
    worldH: height * TILE,
    grid,
    spawns,
    goals,
    theme: THEMES[def.theme],
    gemSpawn: { x: (width * TILE) / 2, y: (height * TILE) / 2 },
    ballSpawn: { x: (width * TILE) / 2, y: (height * TILE) / 2 },
    crateCount,
    deco: def.deco || [],
  };
  return map;
}

const DEFS = [
  {
    id: 'mine',
    name: 'Кристальная шахта',
    mode: 'gemgrab',
    theme: 'mine',
    half: [
      '##############',
      '#~~...........',
      '#~~..*........',
      '#....*..===...',
      '#.......===...',
      '#.............',
      '#..##.....*...',
      '#.A##.........',
      '#.A...........',
      '#.A...........',
      '#..##.........',
      '#..##.....*...',
      '#.............',
      '#....*..===...',
      '#.~~.*..===...',
      '#.~~..........',
      '##############',
    ],
  },
  {
    id: 'ice',
    name: 'Ледяной разлом',
    mode: 'gemgrab',
    theme: 'ice',
    half: [
      '##############',
      '#....*........',
      '#..*..*.......',
      '#.....*..===..',
      '#..##.....#...',
      '#..##.....#...',
      '#..A..........',
      '#..A..*.......',
      '#..A..........',
      '#.............',
      '#..##.....#...',
      '#..##.....#...',
      '#.....*..===..',
      '#..*..*.......',
      '#....*........',
      '#.............',
      '##############',
    ],
  },
  {
    id: 'stadium',
    name: 'Стадион',
    mode: 'brawlball',
    theme: 'stadium',
    half: [
      '##############',
      '#....*........',
      '#....*........',
      '#.............',
      '#..===........',
      '#..A..........',
      '#....##.......',
      '#G...##.......',
      '#G..A.........',
      '#G...##.......',
      '#....##.......',
      '#..A..........',
      '#..===........',
      '#.............',
      '#....*........',
      '#....*........',
      '##############',
    ],
  },
  {
    id: 'canyon',
    name: 'Каньон',
    mode: 'bounty',
    theme: 'canyon',
    half: [
      '##############',
      '#...*.........',
      '#....*........',
      '#.......===...',
      '#..##.........',
      '#..##.........',
      '#..A..........',
      '#..A..*.......',
      '#..A.......~~.',
      '#.............',
      '#.....*.......',
      '#..##.........',
      '#..##.........',
      '#.......===...',
      '#....*........',
      '#...*.........',
      '##############',
    ],
  },
];

export const MAPS = DEFS.map(buildMap);

export function mapsForMode(mode) {
  return MAPS.filter((m) => m.mode === mode);
}

export function getMapForMode(mode) {
  const list = mapsForMode(mode);
  return list[Math.floor(Math.random() * list.length)];
}

export function isSolidTile(tile) {
  return tile === WALL || tile === CRATE || tile === WATER;
}

export function blocksBullets(tile) {
  return tile === WALL || tile === CRATE;
}
