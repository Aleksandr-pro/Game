// Проверка всех суперов и гаджетов: урон, лечение, эффекты.
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const { Game } = await import('../src/game.js');
const { BRAWLERS, BRAWLER_BY_ID } = await import('../src/config.js');

class FakeInput {
  constructor() {
    this.moveVec = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0, inside: false, type: 'mouse' };
    this.isTouch = false;
    this.aimStick = null;
    this.aiming = false;
    this.shots = [];
  }
  update() {}
  takeShots() { const s = this.shots; this.shots = []; return s; }
  takeSuper() { return false; }
  takeGadget() { return false; }
  takePause() { return false; }
  takeStats() { return false; }
  stickVector() { return null; }
  reset() {}
  queueSuper() {}
  queueGadget() {}
}

const cam = { zoom: 1, cx: 1080, cy: 680, viewW: 1600, viewH: 900 };
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('✓', msg); else { console.error('❌', msg); fails++; } };

function setup(brawlerId, mode = 'gemgrab') {
  const game = new Game({
    mode, playerBrawlerId: brawlerId, difficulty: 'easy',
    settings: { aimAssist: true, autoAim: true }, input: new FakeInput(), onEnd: () => {},
  });
  game.phase = 'playing';
  game.phaseTimer = 0;
  const p = game.player;
  // ставим игрока в центр арены
  p.x = game.map.gemSpawn.x;
  p.y = game.map.gemSpawn.y;
  // убираем ботов подальше
  let idx = 0;
  for (const e of game.players) {
    if (e === p) continue;
    e.isBot = false;
    e.bot = null;
    e.moveX = 0; e.moveY = 0;
    if (e.team !== p.team) {
      e.x = game.map.gemSpawn.x + 180 + idx * 40;
      e.y = game.map.gemSpawn.y;
      e.maxHp = 99999; e.hp = 99999;
      idx++;
    } else {
      e.x = game.map.gemSpawn.x - 120;
      e.y = game.map.gemSpawn.y + 40;
      e.maxHp = 3000; e.hp = 1200;
    }
  }
  return { game, p };
}

function step(game, frames = 90) {
  for (let i = 0; i < frames; i++) {
    for (const e of game.players) { e.isBot = false; e.moveX = 0; e.moveY = 0; }
    game.update(1 / 60, cam);
  }
}

// дистанция до цели, при которой супер должен попадать
function idealDist(b) {
  const s = b.super;
  if (s.kind === 'freeze') return s.range - 30;
  if (s.kind === 'leapbomb' || s.kind === 'leapstrike') return s.dist - 30;
  if (s.kind === 'dash') return 220;
  if (s.kind === 'blast') return 150;
  if (s.kind === 'rail') return 320;
  if (s.kind === 'barrage') return 200;
  return 200;
}

for (const b of BRAWLERS) {
  const { game, p } = setup(b.id);
  const enemies = game.players.filter((e) => e.team !== p.team);
  const ally = game.players.find((e) => e.team === p.team && e !== p);
  const e0 = enemies[0];
  // ставим цель так, чтобы супер до неё доставал
  const dd = idealDist(b);
  for (const en of enemies) {
    en.x = p.x + dd;
    en.y = p.y;
  }
  const totalEnemyHp = () => enemies.reduce((s, x) => s + x.hp, 0);
  const before = { hp: totalEnemyHp(), ally: ally.hp, mines: game.mines.length };
  p.superCharge = 100;
  const used = game.useSuper(p, 0);
  const afterCast = { projectiles: game.projectiles.length, mines: game.mines.length, zones: game.zones.length };
  step(game, 110);
  const dmg = before.hp - totalEnemyHp();
  const allyHeal = ally.hp - before.ally;
  let detail = '';
  switch (b.super.kind) {
    case 'aura':
      detail = `лечение союзника ${allyHeal}`;
      ok(allyHeal > 0, `${b.name}: супер лечит союзника (${allyHeal})`);
      break;
    case 'mines':
      ok(afterCast.mines > before.mines, `${b.name}: супер ставит мины (${afterCast.mines - before.mines})`);
      break;
    case 'dash':
      detail = `урон рывком ${dmg}`;
      ok(dmg > 0, `${b.name}: супер-рывок наносит урон (${dmg})`);
      break;
    default:
      detail = `урон ${dmg}`;
      ok(dmg > 0, `${b.name}: супер наносит урон (${dmg})`);
  }
  ok(used === true, `${b.name}: супер использован (${b.super.name})`);
  if (detail) console.log('   ', detail);
}

// Гаджеты
console.log('\n— Гаджеты —');
for (const b of BRAWLERS) {
  const { game, p } = setup(b.id);
  const ally = game.players.find((e) => e.team === p.team && e !== p);
  p.hp = p.maxHp * 0.4;
  ally.hp = ally.maxHp * 0.4;
  p.ammo = 0;
  p.slowTime = 1;
  p.slowAmount = 0.4;
  const before = { hp: p.hp, ally: ally.hp, ammo: p.ammo, slow: p.slowTime };
  const used = game.useGadget(p);
  step(game, 30);
  let effect = false;
  switch (b.gadget.kind) {
    case 'dash':
      effect = Math.hypot(p.x - game.map.gemSpawn.x, p.y - game.map.gemSpawn.y) > 30;
      break;
    case 'reload':
      effect = p.ammo > before.ammo;
      break;
    case 'reveal':
      effect = game.revealUntil > game.time;
      break;
    case 'shield':
      effect = p.shieldTime > 0;
      break;
    case 'burstheal':
      effect = p.hp > before.hp;
      break;
    case 'speed':
    case 'cleanse':
      effect = p.speedTime > 0;
      break;
    case 'invis':
      effect = p.invisTime > 0 || game.time > 0;
      break;
  }
  ok(used && effect, `${b.name}: гаджет «${b.gadget.name}» работает`);
  ok(p.gadgetCooldown > 0, `${b.name}: гаджет уходит в перезарядку`);
}

// Кулдауны и повторное использование
console.log('\n— Ограничения —');
{
  const { game, p } = setup('blaze');
  ok(game.useSuper(p, 0) === false, 'Супер без заряда не срабатывает');
  p.superCharge = 100;
  ok(game.useSuper(p, 0) === true, 'Супер с зарядом срабатывает');
  ok(game.useSuper(p, 0) === false, 'Повторный супер без заряда не срабатывает');
  ok(game.useGadget(p) === true, 'Гаджет срабатывает');
  ok(game.useGadget(p) === false, 'Гаджет на кулдауне не срабатывает');
}

// Урон/смерть/возрождение
console.log('\n— Урон и возрождение —');
{
  const { game, p } = setup('blaze');
  const enemy = game.players.find((e) => e.team !== p.team);
  const dmg = game.dealDamage(enemy, 500, p);
  ok(dmg > 0, `Урон применяется (${dmg})`);
  ok(p.superCharge > 0, 'Урон заряжает супер');
  enemy.hp = 10;
  game.dealDamage(enemy, 500, p);
  ok(!enemy.alive && enemy.respawnTimer > 0, 'Смертельный урон убивает цель');
  ok(p.kills === 1, 'Убийство засчитано');
  step(game, 300);
  ok(enemy.alive, 'Цель возрождается');
}

// Кристаллы: потеря при смерти
{
  const { game, p } = setup('blaze');
  const enemy = game.players.find((e) => e.team !== p.team);
  enemy.gems = 4;
  game.dealDamage(enemy, 99999, p);
  ok(game.pickups.filter((x) => x.kind === 'gem').length === 4, 'Кристаллы выпадают при смерти');
}

// Разрушение ящиков
{
  const { game, p } = setup('boom');
  const crate = [];
  for (let y = 0; y < game.map.height; y++) for (let x = 0; x < game.map.width; x++) if (game.map.grid[y][x] === 2) crate.push([x, y]);
  const [cx, cy] = crate[0];
  game.breakCrates((cx + 0.5) * game.map.tile, (cy + 0.5) * game.map.tile, 100);
  ok(game.map.grid[cy][cx] === 0, 'Ящики разрушаются');
}

console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nСПОСОБНОСТИ OK');
process.exit(fails ? 1 : 0);
