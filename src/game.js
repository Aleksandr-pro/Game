// Ядро матча: бойцы, стрельба, способности, режимы, физика.
import {
  BRAWLERS,
  BRAWLER_BY_ID,
  BOT_NAMES,
  DEFAULT_SETTINGS,
  DIFFICULTY,
  MATCH_TIME,
  MODES,
  RESPAWN_TIME,
  SUPER_GAIN,
  SUPER_MAX,
  TEAM_COLORS,
} from './config.js';
import { CRATE, WALL, WATER, getMapForMode } from './maps.js';
import { createBotState, updateBot } from './ai.js';
import { findPath, isBlockedAt } from './pathfinding.js';
import {
  TAU,
  angleTo,
  clamp,
  dist,
  lerp,
  pick,
  rand,
  randInt,
  segmentCircle,
  chance,
} from './utils.js';
import { audio } from './audio.js';

const TEAM_NAMES = ['Синие', 'Красные'];

export class Game {
  constructor(options) {
    this.opts = options;
    this.mode = options.mode;
    this.difficulty = options.difficulty || 'normal';
    this.settings = { ...DEFAULT_SETTINGS, ...(options.settings || {}) };
    this.input = options.input;
    this.onEnd = options.onEnd || (() => {});
    this.playerTeam = 0;
    this.phase = 'countdown';
    this.phaseTimer = 3.0;
    this.time = 0;
    this.timeLeft = MATCH_TIME;
    this.matchTime = MATCH_TIME;
    this.paused = false;
    this.isPaused = false;
    this.cam = null;
    this.players = [];
    this.projectiles = [];
    this.pickups = [];
    this.mines = [];
    this.zones = [];
    this.effects = [];
    this.particles = [];
    this.floaters = [];
    this.timers = [];
    this.feed = [];
    this.shake = 0;
    this.hurtFlash = 0;
    this.superFlash = 0;
    this.aimInfo = null;
    this.aimTarget = null;
    this.cameraTarget = null;
    this.teamScore = { 0: 0, 1: 0 };
    this.gems = { 0: 0, 1: 0 };
    this.hold = { team: null, timer: 0 };
    this.goals = { 0: 0, 1: 0 };
    this.revealUntil = 0;
    this.gemTimer = 1.2;
    this.starTimer = 14;
    this.ball = null;
    this.banner = null;
    this.carryFlash = 0;
    this.message = null;
    this.endDelay = 0;
    this.resultSent = false;
    this.result = null;
    this.stats = {
      damage: 0,
      healing: 0,
      kills: 0,
      deaths: 0,
      supers: 0,
      gadget: 0,
      gems: 0,
      goals: 0,
      stars: 0,
    };
    this.seed = randInt(1, 99999);
    this.setup();
  }

  // ---------- Создание матча ----------
  setup() {
    this.map = getMapForMode(this.mode);
    const modeDef = MODES[this.mode];
    this.timeLeft = modeDef.time;
    this.matchTime = modeDef.time;

    const playerBrawler = this.opts.playerBrawlerId || 'blaze';
    const used = new Set([playerBrawler]);
    const botPool = BRAWLERS.map((b) => b.id).filter((id) => id !== playerBrawler);
    const shuffled = [...botPool].sort(() => Math.random() - 0.5);
    const takeBot = () => {
      for (const id of shuffled) {
        if (!used.has(id)) {
          used.add(id);
          return id;
        }
      }
      return pick(botPool);
    };
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let nameIdx = 0;

    for (const team of [0, 1]) {
      for (let slot = 0; slot < 3; slot++) {
        const isPlayer = team === this.playerTeam && slot === 1;
        const spawn = this.map.spawns[team][slot] || this.map.spawns[team][1];
        const brawlerId = isPlayer ? playerBrawler : takeBot();
        const b = BRAWLER_BY_ID[brawlerId];
        const diff = DIFFICULTY[this.difficulty] || DIFFICULTY.normal;
        const p = {
          id: `p${team}_${slot}`,
          name: isPlayer ? (this.opts.playerName || 'Вы') : names[nameIdx++ % names.length],
          team,
          slot,
          brawlerId,
          isPlayer,
          isBot: !isPlayer,
          x: spawn.x,
          y: spawn.y,
          vx: 0,
          vy: 0,
          angle: team === 0 ? 0 : Math.PI,
          radius: b.radius,
          maxHp: Math.round(b.hp * (isPlayer ? 1 : diff.hp)),
          hp: Math.round(b.hp * (isPlayer ? 1 : diff.hp)),
          speed: b.speed,
          damageMult: isPlayer ? 1 : diff.damage,
          ammo: b.attack.ammo,
          maxAmmo: b.attack.ammo,
          ammoTimer: 0,
          cooldown: 0,
          superCharge: 0,
          gadgetCooldown: 0,
          alive: true,
          respawnTimer: 0,
          spawnShield: 0,
          kills: 0,
          deaths: 0,
          damageDealt: 0,
          healing: 0,
          gems: 0,
          stars: 0,
          streak: 0,
          hitFlash: 0,
          invuln: 0,
          slowTime: 0,
          slowAmount: 0,
          speedTime: 0,
          speedAmount: 0,
          shieldTime: 0,
          shieldReduce: 0,
          shieldHp: 0,
          invisTime: 0,
          revealTimer: 0,
          hidden: false,
          z: 0,
          dash: null,
          leap: null,
          carrying: false,
          ballLock: 0,
              lastDamageTime: -99,
          lastAttackerId: null,
          seed: rand(0, 10),
          aimOffset: 0,
          moveX: 0,
          moveY: 0,
          superActive: 0,
        };
        if (p.isBot) p.bot = createBotState(this, p, this.difficulty);
        this.players.push(p);
        if (isPlayer) this.player = p;
      }
    }

    if (this.mode === 'brawlball') {
      this.ball = {
        x: this.map.ballSpawn.x,
        y: this.map.ballSpawn.y,
        vx: 0,
        vy: 0,
        owner: null,
        cooldown: 0,
        spin: 0,
        radius: 18,
      };
    }

    this.mapVersion = 0;
    this.cameraTarget = { x: this.player.x + 40, y: this.player.y };

    this.banner = {
      text: this.map.name.toUpperCase(),
      sub: MODES[this.mode].name,
      life: 2.6,
      maxLife: 2.6,
      color: '#ffffff',
    };
  }

  getPlayer(id) {
    if (!id) return null;
    return this.players.find((p) => p.id === id) || null;
  }

  // ---------- Общие хелперы ----------
  hasLineOfSight(x1, y1, x2, y2) {
    const map = this.map;
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / (map.tile * 0.28));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = x1 + (x2 - x1) * k;
      const y = y1 + (y2 - y1) * k;
      const tx = Math.floor(x / map.tile);
      const ty = Math.floor(y / map.tile);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
      const t = map.grid[ty][tx];
      if (t === WALL || t === CRATE) return false;
    }
    return true;
  }

  isSolidWorld(x, y) {
    return isBlockedAt(this.map, x, y);
  }

  findPath(x, y, tx, ty) {
    return findPath(this.map, x, y, tx, ty);
  }

  isInBush(x, y) {
    const tx = Math.floor(x / this.map.tile);
    const ty = Math.floor(y / this.map.tile);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    return this.map.grid[ty][tx] === 4;
  }

  canSee(viewer, target) {
    if (!target.alive) return false;
    if (viewer.team === target.team) return true;
    if (this.revealUntil > this.time) return true;
    if (target.invisTime > 0) {
      return dist(viewer.x, viewer.y, target.x, target.y) < 110;
    }
    if (target.hidden) {
      return dist(viewer.x, viewer.y, target.x, target.y) < 135;
    }
    return true;
  }

  attackRange(p) {
    const b = BRAWLER_BY_ID[p.brawlerId];
    if (b.attack.kind === 'lob') return b.attack.range;
    return b.attack.range;
  }

  preferredRange(p) {
    const b = BRAWLER_BY_ID[p.brawlerId];
    const r = b.attack.range;
    if (p.brawlerId === 'blaze' || p.brawlerId === 'grom' || p.brawlerId === 'claw') return Math.min(r * 0.72, 300);
    if (p.brawlerId === 'mira' || p.brawlerId === 'vector') return r * 0.82;
    if (p.brawlerId === 'boom') return r * 0.75;
    return r * 0.7;
  }

  // ---------- Эффекты ----------
  addShake(v) {
    this.shake = Math.min(26, this.shake + v);
  }

  addFloater(x, y, text, color = '#ffffff', size = 18) {
    this.floaters.push({ x: x + rand(-6, 6), y, text, color, size, life: 0.9, maxLife: 0.9, vy: -44 });
  }

  addEffect(kind, opts) {
    this.effects.push({ kind, life: opts.life || 0.4, maxLife: opts.life || 0.4, ...opts });
  }

  addParticle(opts) {
    this.particles.push({
      x: 0, y: 0, vx: 0, vy: 0, size: 4, color: '#ffffff', life: 0.5, maxLife: 0.5,
      shape: 'circle', rot: 0, spin: 0, drag: 0.92, gravity: 0, ...opts,
    });
    const p = this.particles[this.particles.length - 1];
    p.maxLife = p.life;
  }

  burst(x, y, color, count = 10, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(opts.minSpeed ?? 40, opts.maxSpeed ?? 240);
      this.addParticle({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 0),
        size: rand(opts.minSize ?? 2, opts.maxSize ?? 6),
        color: Array.isArray(color) ? pick(color) : color,
        life: rand(opts.minLife ?? 0.3, opts.maxLife ?? 0.7),
        shape: opts.shape || 'circle',
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 0.92,
        shrink: true,
      });
    }
  }

  addExplosion(x, y, radius, colors = {}) {
    this.addEffect('explosion', {
      x, y, radius,
      color: colors.color || '#fff2b0',
      color2: colors.color2 || '#ff9b3d',
      life: 0.5,
    });
    this.burst(x, y, [colors.color || '#fff2b0', colors.color2 || '#ff9b3d', '#ffffff'], 18, {
      maxSpeed: radius * 3.2,
      maxSize: 7,
      maxLife: 0.6,
    });
  }

  healPlayer(target, amount, source) {
    if (!target.alive) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = Math.round(target.hp - before);
    if (healed > 0) {
      this.addFloater(target.x, target.y - target.radius, `+${healed}`, '#7dffb0', 17);
      this.burst(target.x, target.y - 6, ['#7dffb0', '#b7ffda', '#eafff3'], 7, { maxSpeed: 90, maxSize: 4 });
      if (target.isPlayer && source === this.player) audio.play('heal');
      if (source) source.healing += healed;
      if (target.isPlayer) this.stats.healing += healed;
    }
    return healed;
  }

  // ---------- Урон ----------
  dealDamage(target, amount, source, opts = {}) {
    if (!target.alive || this.phase !== 'playing') return 0;
    if (target.invuln > 0) return 0;
    let dmg = amount * (source ? source.damageMult : 1);
    if (target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, dmg);
      target.shieldHp -= absorbed;
      dmg -= absorbed;
      this.burst(target.x, target.y, '#9fe3ff', 5, { maxSpeed: 100 });
      if (dmg <= 0) {
        if (target.isPlayer) this.hurtFlash = Math.max(this.hurtFlash, 0.25);
        return 0;
      }
    }
    if (target.shieldTime > 0) dmg *= 1 - target.shieldReduce;
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.hitFlash = 0.2;
    target.lastDamageTime = this.time;
    if (target.isPlayer) {
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.4);
      audio.play('hurt');
    }
    this.addFloater(target.x, target.y - target.radius - 8, `-${dmg}`, target.isPlayer ? '#ff8a9a' : '#ffffff', 19);
    this.burst(target.x, target.y, target.team === this.playerTeam ? '#8fd4ff' : '#ffa3b4', 5, {
      maxSpeed: 130,
      maxSize: 4,
    });

    if (source && source.id !== target.id) {
      source.damageDealt += dmg;
      if (source.isPlayer) this.stats.damage += dmg;
      const before = source.superCharge;
      source.superCharge = Math.min(SUPER_MAX, source.superCharge + dmg * SUPER_GAIN);
      if (before < SUPER_MAX && source.superCharge >= SUPER_MAX) {
        if (source.isPlayer) {
          audio.play('superReady');
          this.superFlash = 1;
          this.addFloater(source.x, source.y - 60, 'СУПЕР ГОТОВ!', '#ffd54a', 18);
        }
      }
      target.lastAttackerId = source.id;
      if (target.carrying && chance(0.28)) this.dropBall(target, false);
    }
    if (opts.knockback && opts.knockbackFrom) {
      const a = angleTo(opts.knockbackFrom.x, opts.knockbackFrom.y, target.x, target.y);
      target.vx += Math.cos(a) * opts.knockback;
      target.vy += Math.sin(a) * opts.knockback;
    }

    if (target.hp <= 0) {
      this.killPlayer(target, source);
    } else {
      const b = BRAWLER_BY_ID[target.brawlerId];
      audio.play('hit', { pan: 0 });
      if (opts.slow) {
        target.slowTime = Math.max(target.slowTime, opts.slowTime || 1.5);
        target.slowAmount = Math.max(target.slowAmount, opts.slow);
      }
    }
    return dmg;
  }

  killPlayer(victim, killer) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.respawnTimer = RESPAWN_TIME;
    victim.carrying = false;
    victim.invuln = 0;
    victim.slowTime = 0;
    victim.shieldTime = 0;
    victim.shieldHp = 0;
    victim.invisTime = 0;
    victim.dash = null;
    victim.leap = null;
    victim.z = 0;
    victim.superCharge = Math.max(0, victim.superCharge * 0.5);
    if (this.mode === 'brawlball') this.dropBall(victim, false);

    // потеря кристаллов
    if (this.mode === 'gemgrab' && victim.gems > 0) {
      const n = victim.gems;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sp = rand(60, 200);
        this.pickups.push({
          kind: 'gem',
          x: victim.x,
          y: victim.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          seed: rand(0, 10),
          noPickup: 0.35,
        });
      }
      this.addFloater(victim.x, victim.y - 40, `-${n} 💎`, '#c98bff', 16);
      victim.gems = 0;
    }

    this.burst(victim.x, victim.y, ['#ffffff', '#cfd8e3', BRAWLER_BY_ID[victim.brawlerId].color], 22, {
      maxSpeed: 280,
      maxSize: 7,
      maxLife: 0.8,
    });
    this.addEffect('ring', { x: victim.x, y: victim.y, radius: victim.radius * 3, color: '#ffffff', width: 4, life: 0.4 });
    audio.play('death');

    if (killer && killer !== victim) {
      killer.kills++;
      killer.superCharge = Math.min(SUPER_MAX, killer.superCharge + 8);
      if (killer.isPlayer) {
        this.stats.kills++;
        this.addFloater(killer.x, killer.y - 62, 'УБИЙСТВО!', '#ffd54a', 20);
      }
      if (this.mode === 'bounty') {
        const value = clamp(victim.streak + 1, 1, 7);
        this.teamScore[killer.team] += value;
        this.stats.stars += killer.isPlayer ? value : 0;
        killer.streak++;
        victim.streak = 0;
        this.addFloater(victim.x, victim.y - 62, `+${value} ★`, '#ffc832', 20);
        this.checkBountyWin();
      }
    }
    if (victim.isPlayer) this.stats.deaths++;
    victim.streak = killer ? 0 : victim.streak;

    this.feed.unshift({
      killer: killer ? killer.name : 'Арена',
      victim: victim.name,
      killerTeam: killer ? killer.team : -1,
      victimTeam: victim.team,
      life: 4.2,
      maxLife: 4.2,
    });
    if (this.feed.length > 4) this.feed.length = 4;

    this.addShake(5);
    if (victim.isPlayer) {
      this.addFloater(victim.x, victim.y - 70, 'ВЫ ВЫБЫЛИ', '#ff5c72', 18);
    }
  }

  // ---------- Стрельба ----------
  tryFire(p, angle) {
    if (!p.alive || this.phase !== 'playing' || p.cooldown > 0) return false;
    if (this.mode === 'brawlball' && p.carrying) {
      this.kickBall(p, angle);
      p.cooldown = 0.42;
      return true;
    }
    if (p.ammo <= 0) {
      if (p.isPlayer && this.time - (this._lastAmmoError || -9) > 0.7) {
        this._lastAmmoError = this.time;
        audio.play('error');
        this.addFloater(p.x, p.y - p.radius * 1.8, 'ПЕРЕЗАРЯДКА', '#ffd54a', 13);
      }
      return false;
    }
    const b = BRAWLER_BY_ID[p.brawlerId];
    const a = b.attack;
    p.ammo--;
    p.cooldown = a.cooldown;
    p.revealTimer = 0.9;
    const muzzleX = p.x + Math.cos(angle) * (p.radius + 8);
    const muzzleY = p.y + Math.sin(angle) * (p.radius + 8);
    const color = p.team === 0 ? '#8fd4ff' : '#ffa3b4';

    // отдача
    p.vx -= Math.cos(angle) * (a.kind === 'single' ? 46 : 14);
    p.vy -= Math.sin(angle) * (a.kind === 'single' ? 46 : 14);

    if (a.kind === 'spread') {
      const n = a.pellets;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - 0.5) * a.spread : 0;
        this.spawnBullet(p, muzzleX, muzzleY, angle + off + rand(-0.015, 0.015), a, color);
      }
      this.burst(muzzleX, muzzleY, [color, '#ffffff'], 6, { maxSpeed: 150, maxSize: 4 });
      audio.play(p.brawlerId === 'grom' ? 'shootHeavy' : 'shoot');
      this.addShake(1.4);
    } else if (a.kind === 'burst') {
      for (let i = 0; i < a.pellets; i++) {
        this.timers.push({
          t: i * (a.burstDelay || 0.07),
          fn: () => {
            if (!p.alive || this.phase !== 'playing') return;
            this.spawnBullet(p, muzzleX, muzzleY, angle + rand(-a.spread, a.spread), a, color);
            this.burst(muzzleX, muzzleY, [color, '#ffffff'], 3, { maxSpeed: 120, maxSize: 3 });
            audio.play('shoot');
          },
        });
      }
      this.addShake(1);
    } else if (a.kind === 'single') {
      this.spawnBullet(p, muzzleX, muzzleY, angle, a, color);
      this.burst(muzzleX, muzzleY, [color, '#ffffff'], 8, { maxSpeed: 220, maxSize: 4 });
      audio.play('snipe');
      this.addShake(2.2);
    } else if (a.kind === 'lob') {
      this.spawnLob(p, angle, a.range, a, color);
      audio.play('shootHeavy');
      this.addShake(1.2);
    } else if (a.kind === 'healbolt') {
      this.spawnBullet(p, muzzleX, muzzleY, angle, a, '#a9ffd0');
      this.burst(muzzleX, muzzleY, ['#a9ffd0', '#ffffff'], 5, { maxSpeed: 100 });
      audio.play('shoot');
    } else if (a.kind === 'bounce') {
      for (let i = 0; i < a.pellets; i++) {
        const off = (i / Math.max(1, a.pellets - 1) - 0.5) * a.spread;
        this.spawnBullet(p, muzzleX, muzzleY, angle + off, a, color, a.bounce);
      }
      this.burst(muzzleX, muzzleY, [color, '#ffffff'], 5, { maxSpeed: 140 });
      audio.play('shoot');
      this.addShake(1.2);
    }
    return true;
  }

  spawnBullet(p, x, y, angle, a, color, bounces = 0) {
    const speed = a.speed;
    this.projectiles.push({
      kind: 'bullet',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: a.radius || 9,
      damage: a.damage,
      heal: a.heal || 0,
      team: p.team,
      ownerId: p.id,
      life: (a.range || 600) / speed,
      maxLife: (a.range || 600) / speed,
      color,
      bounces,
      bouncesLeft: bounces,
      hitIds: new Set(),
      slow: a.slow || 0,
      slowTime: a.slowTime || 0,
      pierce: a.pierce || 0,
      angle,
    });
  }

  spawnLob(p, angle, range, a, color, opts = {}) {
    const targetX = p.x + Math.cos(angle) * range;
    const targetY = p.y + Math.sin(angle) * range;
    const sp = opts.speed || a.speed || 900;
    const distToTarget = dist(p.x, p.y, targetX, targetY);
    const arcTime = clamp(distToTarget / sp, 0.16, 1.1);
    this.projectiles.push({
      kind: 'lob',
      x: p.x,
      y: p.y,
      sx: p.x,
      sy: p.y,
      tx: targetX,
      ty: targetY,
      arcT: 0,
      arcTime,
      radius: opts.radius || 10,
      splash: opts.splash || a.radius || 70,
      damage: opts.damage ?? a.damage,
      team: p.team,
      ownerId: p.id,
      color,
      slow: opts.slow || 0,
      slowTime: opts.slowTime || 0,
      zone: opts.zone || null,
      knockback: opts.knockback || 0,
      hitIds: new Set(),
    });
  }

  kickBall(p, angle) {
    if (!this.ball || !p.carrying) return;
    const ball = this.ball;
    p.carrying = false;
    ball.owner = null;
    const speed = 980;
    ball.x = p.x + Math.cos(angle) * (p.radius + 16);
    ball.y = p.y + Math.sin(angle) * (p.radius + 16);
    ball.vx = Math.cos(angle) * speed + p.vx * 0.4;
    ball.vy = Math.sin(angle) * speed + p.vy * 0.4;
    ball.cooldown = 0.35;
    ball.lastTouchId = p.id;
    p.ballLock = 0.45;
    p.revealTimer = 0.6;
    this.burst(ball.x, ball.y, ['#ffffff', '#cfd8e3'], 8, { maxSpeed: 180 });
    audio.play('ball');
  }

  dropBall(p, forward = true) {
    if (!this.ball || this.ball.owner !== p.id) return;
    const ball = this.ball;
    ball.owner = null;
    p.carrying = false;
    const a = p.angle + rand(-0.5, 0.5);
    ball.x = p.x + Math.cos(a) * (p.radius + 12);
    ball.y = p.y + Math.sin(a) * (p.radius + 12);
    ball.vx = Math.cos(a) * (forward ? 320 : 120);
    ball.vy = Math.sin(a) * (forward ? 320 : 120);
    ball.cooldown = 0.3;
    p.ballLock = 0.5;
  }

  // ---------- Суперспособности ----------
  useSuper(p, angle) {
    if (!p.alive || p.superCharge < SUPER_MAX || this.phase !== 'playing') return false;
    const b = BRAWLER_BY_ID[p.brawlerId];
    const s = b.super;
    p.superCharge = 0;
    p.superActive = 0.45;
    p.revealTimer = 0.9;
    if (p.isPlayer) this.stats.supers++;
    audio.play('super');
    this.addShake(6);
    this.addEffect('ring', { x: p.x, y: p.y, radius: p.radius * 4.5, color: b.color2, width: 6, life: 0.55 });
    this.burst(p.x, p.y, [b.color, b.color2, '#ffffff'], 20, { maxSpeed: 300, maxSize: 6 });

    switch (s.kind) {
      case 'blast': {
        for (let i = 0; i < s.pellets; i++) {
          const off = (i / (s.pellets - 1) - 0.5) * s.spread;
          const proj = {
            kind: 'bullet', x: p.x + Math.cos(angle + off) * 20, y: p.y + Math.sin(angle + off) * 20,
            vx: Math.cos(angle + off) * s.speed, vy: Math.sin(angle + off) * s.speed,
            radius: s.radius || 13, damage: s.damage, team: p.team, ownerId: p.id,
            life: s.range / s.speed, maxLife: s.range / s.speed,
            color: '#ffb347', bounces: 0, bouncesLeft: 0, hitIds: new Set(),
            knockback: s.knockback, isSuper: true, slow: 0, slowTime: 0,
          };
          this.projectiles.push(proj);
        }
        this.addShake(6);
        break;
      }
      case 'rail': {
        const range = s.range;
        const startX = p.x;
        const startY = p.y;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        let hitDist = range;
        const step = 12;
        for (let d = 20; d < range; d += step) {
          const x = startX + dirX * d;
          const y = startY + dirY * d;
          if (this.isSolidWorld(x, y)) {
            hitDist = d;
            break;
          }
        }
        const ex = startX + dirX * hitDist;
        const ey = startY + dirY * hitDist;
        this.addEffect('beam', { x: startX, y: startY, angle, length: hitDist, width: 20, life: 0.5 });
        for (const e of this.players) {
          if (!e.alive || e.team === p.team) continue;
          const t = segmentCircle(startX, startY, ex, ey, e.x, e.y, e.radius + s.width / 2);
          if (t >= 0) {
            this.dealDamage(e, s.damage, p, { knockback: 120, knockbackFrom: { x: startX, y: startY } });
            this.burst(e.x, e.y, ['#8ff3ff', '#ffffff'], 10, { maxSpeed: 200 });
          }
        }
        this.burst(ex, ey, ['#8ff3ff', '#ffffff'], 12, { maxSpeed: 240 });
        this.addShake(9);
        break;
      }
      case 'leapbomb': {
        const range = s.dist;
        let tx = p.x + Math.cos(angle) * range;
        let ty = p.y + Math.sin(angle) * range;
        // не прыгаем в стену
        for (let k = 1; k >= 0.25; k -= 0.1) {
          const cx = p.x + Math.cos(angle) * range * k;
          const cy = p.y + Math.sin(angle) * range * k;
          if (!this.isSolidWorld(cx, cy)) {
            tx = cx;
            ty = cy;
            break;
          }
        }
        this.startLeap(p, tx, ty, 0.5, () => {
          this.addExplosion(tx, ty, s.splash, { color: '#ffffff', color2: '#c07bff' });
          this.addShake(8);
          for (const e of this.players) {
            if (!e.alive || e.team === p.team) continue;
            if (dist(tx, ty, e.x, e.y) < s.splash + e.radius) {
              this.dealDamage(e, s.damage, p, { slow: s.slow, slowTime: s.slowTime });
            }
          }
        });
        break;
      }
      case 'dash': {
        p.dash = {
          t: 0.3,
          vx: Math.cos(angle) * 1650,
          vy: Math.sin(angle) * 1650,
          damage: s.damage,
          knockback: s.knockback,
          hit: new Set(),
          isSuper: true,
        };
        p.invuln = Math.max(p.invuln, 0.32);
        break;
      }
      case 'aura': {
        const heal = s.heal;
        for (const a of this.players) {
          if (!a.alive || a.team !== p.team) continue;
          if (dist(p.x, p.y, a.x, a.y) < s.radius) {
            this.healPlayer(a, heal, p);
            a.shieldHp = Math.min(a.maxHp * 0.7, a.shieldHp + s.shield);
            a.shieldTime = Math.max(a.shieldTime, 2.2);
            a.shieldReduce = Math.max(a.shieldReduce, 0.2);
          }
        }
        this.zones.push({
          x: p.x, y: p.y, r: s.radius, life: s.time, maxLife: s.time,
          color: '#7dffb0', kind: 'heal', seed: rand(0, 10),
        });
        break;
      }
      case 'mines': {
        const perp = angle + Math.PI / 2;
        for (let i = 0; i < s.count; i++) {
          const off = (i - (s.count - 1) / 2) * (s.spread || 90);
          const mx = p.x + Math.cos(angle) * (s.range * 0.55) + Math.cos(perp) * off;
          const my = p.y + Math.sin(angle) * (s.range * 0.55) + Math.sin(perp) * off;
          if (this.isSolidWorld(mx, my)) continue;
          this.mines.push({
            x: mx, y: my, team: p.team, ownerId: p.id,
            damage: s.damage, radius: s.radius,
            armTimer: s.armTime, armed: false, life: s.life,
          });
        }
        break;
      }
      case 'leapstrike': {
        let best = null;
        let bestD = Infinity;
        for (const e of this.players) {
          if (!e.alive || e.team === p.team || !this.canSee(p, e)) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d < s.dist && d < bestD) {
            bestD = d;
            best = e;
          }
        }
        const tx = best ? best.x : p.x + Math.cos(angle) * s.dist * 0.8;
        const ty = best ? best.y : p.y + Math.sin(angle) * s.dist * 0.8;
        this.startLeap(p, tx, ty, 0.4, () => {
          this.addExplosion(tx, ty, 100, { color: '#ffd9e2', color2: '#ff3d6e' });
          this.addShake(8);
          for (const e of this.players) {
            if (!e.alive || e.team === p.team) continue;
            if (dist(tx, ty, e.x, e.y) < 115 + e.radius) {
              this.dealDamage(e, s.damage, p, { slow: s.slow, slowTime: s.slowTime });
            }
          }
        });
        break;
      }
      case 'barrage': {
        for (let i = 0; i < s.count; i++) {
          const a = angle + (i / s.count) * TAU;
          this.projectiles.push({
            kind: 'bullet',
            x: p.x + Math.cos(a) * 24,
            y: p.y + Math.sin(a) * 24,
            vx: Math.cos(a) * s.speed,
            vy: Math.sin(a) * s.speed,
            radius: 11,
            damage: s.damage,
            team: p.team,
            ownerId: p.id,
            life: s.range / s.speed,
            maxLife: s.range / s.speed,
            color: '#a9fbff',
            bounces: s.bounce,
            bouncesLeft: s.bounce,
            hitIds: new Set(),
            isSuper: true,
            slow: 0,
            slowTime: 0,
          });
        }
        this.addShake(5);
        break;
      }
      case 'freeze': {
        this.spawnLob(p, angle, s.range, { damage: s.damage, speed: 1100, radius: 12 }, '#bff4ff', {
          splash: s.radius,
          damage: s.damage,
          slow: s.slow,
          slowTime: s.slowTime,
          zone: { color: '#9fe9ff', time: 2.4, radius: s.radius, slow: s.slow, slowTime: s.slowTime },
          knockback: 80,
        });
        break;
      }
      default:
        break;
    }
    this.addFloater(p.x, p.y - p.radius * 2.2, s.name.toUpperCase(), '#ffd54a', 17);
    return true;
  }

  startLeap(p, tx, ty, dur, onLand) {
    p.leap = {
      t: 0,
      dur,
      sx: p.x,
      sy: p.y,
      ex: tx,
      ey: ty,
      onLand,
    };
    p.invuln = Math.max(p.invuln, dur + 0.15);
    p.dash = null;
  }

  // ---------- Гаджеты ----------
  useGadget(p) {
    if (!p.alive || p.gadgetCooldown > 0 || this.phase !== 'playing') return false;
    const b = BRAWLER_BY_ID[p.brawlerId];
    const g = b.gadget;
    p.gadgetCooldown = g.cooldown;
    if (p.isPlayer) this.stats.gadget++;
    audio.play('gadget');
    this.burst(p.x, p.y, [b.color2, '#ffffff'], 16, { maxSpeed: 240 });
    this.addEffect('ring', { x: p.x, y: p.y, radius: p.radius * 5, color: b.color2, width: 5, life: 0.5 });
    switch (g.kind) {
      case 'dash': {
        p.dash = {
          t: 0.22,
          vx: Math.cos(p.angle) * g.dist / 0.22,
          vy: Math.sin(p.angle) * g.dist / 0.22,
          damage: 0,
          hit: new Set(),
          isGadget: true,
        };
        break;
      }
      case 'reload':
        p.ammo = p.maxAmmo;
        p.ammoTimer = 0;
        break;
      case 'reveal':
        this.revealUntil = this.time + g.time;
        this.addFloater(p.x, p.y - 60, 'ВРАГИ РАСКРЫТЫ', '#ffd54a', 16);
        break;
      case 'shield':
        p.shieldTime = g.time;
        p.shieldReduce = g.amount;
        break;
      case 'burstheal': {
        for (const a of this.players) {
          if (!a.alive || a.team !== p.team) continue;
          if (dist(p.x, p.y, a.x, a.y) < g.radius) this.healPlayer(a, g.heal, p);
        }
        break;
      }
      case 'speed':
        p.speedTime = g.time;
        p.speedAmount = g.amount;
        break;
      case 'invis':
        p.invisTime = g.time;
        p.revealTimer = 0;
        break;
      case 'cleanse':
        p.slowTime = 0;
        p.speedTime = g.time;
        p.speedAmount = g.amount;
        break;
    }
    this.addFloater(p.x, p.y - p.radius * 2, g.name.toUpperCase(), b.color2, 15);
    return true;
  }

  // ---------- Обновление ----------
  update(dt, cam) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (cam) this.cam = cam;
    this.input.update(dt);

    // Таймеры
    if (this.timers.length) {
      for (const tm of this.timers) tm.t -= dt;
      const ready = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      for (const r of ready) r.fn();
    }

    this.shake = Math.max(0, this.shake - dt * 40);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    this.superFlash = Math.max(0, this.superFlash - dt * 1.4);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    for (const f of this.feed) f.life -= dt;
    this.feed = this.feed.filter((f) => f.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);

    // Пауза между голами
    if (this.phase === 'goal') {
      this.phaseTimer -= dt;
      this.updateProjectiles(dt);
      this.updateParticlesOnly(dt);
      if (this.phaseTimer <= 0) {
        this.phase = 'playing';
      }
      return;
    }

    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      const n = Math.ceil(this.phaseTimer);
      if (this.banner && this.banner.countdown && this.banner.life < 1.2 && n > 0) {
        // мигающая цифра обратного отсчёта
      }
      this.updateCountdownBanner();
      if (this.phaseTimer <= 0) {
        this.phase = 'playing';
        this.banner = { text: 'В БОЙ!', sub: '', life: 1.4, maxLife: 1.4, color: '#ffd54a' };
        audio.play('go');
      }
      // на месте
      for (const p of this.players) {
        p.vx = 0;
        p.vy = 0;
      }
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'ended') {
      this.endDelay -= dt;
      this.updateProjectiles(dt);
      if (this.endDelay <= 0 && !this.resultSent) {
        this.resultSent = true;
        this.onEnd(this.result);
      }
      return;
    }

    // Игровое время
    this.timeLeft -= dt;

    this.updatePlayerInput(dt);
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateBall(dt);
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    this.updateMode(dt);
    this.updateCamera(dt);

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finishByTime();
    }
  }

  updateCountdownBanner() {
    const n = Math.min(3, Math.max(1, Math.ceil(this.phaseTimer)));
    if (!this.banner || this.banner.text !== String(n)) {
      this.banner = { text: String(n), sub: 'ПРИГОТОВЬТЕСЬ', life: 1.2, maxLife: 1.2, color: '#cfe8ff' };
      audio.play('countdown');
    }
  }

  updateParticlesOnly(dt) {
    // эффекты уже обновлены выше, метод-заглушка для читаемости
  }

  // ---------- Управление игрока ----------
  updatePlayerInput(dt) {
    const p = this.player;
    if (!p) return;
    const input = this.input;
    const cam = this.cam;
    let aimAngle = p.angle;
    let aimPoint = null;

    if (cam && !input.isTouch && input.pointer.inside) {
      const world = {
        x: cam.cx + (input.pointer.x - (cam.viewW * cam.zoom) / 2) / cam.zoom,
        y: cam.cy + (input.pointer.y - (cam.viewH * cam.zoom) / 2) / cam.zoom,
      };
      aimPoint = world;
      aimAngle = angleTo(p.x, p.y, world.x, world.y);
    }

    // Стик прицела
    if (input.aimStick) {
      const s = input.stickVector('aim');
      if (s && s.len > 8) {
        aimAngle = s.angle;
        aimPoint = {
          x: p.x + Math.cos(aimAngle) * (this.attackRange(p) * 0.8),
          y: p.y + Math.sin(aimAngle) * (this.attackRange(p) * 0.8),
        };
      }
    } else if (input.isTouch && !input.aiming) {
      // Автоприцел по ближайшему врагу на мобильном
      const t = this.autoAim(p, this.attackRange(p) * 1.1, aimAngle, true);
      if (t) {
        const a = angleTo(p.x, p.y, t.x, t.y);
        if (this.settings.autoAim) aimAngle = a;
      }
    }

    // Помощь прицеливания мышью
    if (!input.isTouch && this.settings.aimAssist) {
      const snapped = this.snapAim(p, aimAngle, this.attackRange(p) * 1.05);
      if (snapped) {
        aimAngle = angleTo(p.x, p.y, snapped.x, snapped.y);
        this.aimTarget = snapped;
      } else {
        this.aimTarget = this.autoAim(p, this.attackRange(p) * 0.98, aimAngle, false);
      }
    } else {
      this.aimTarget = this.autoAim(p, this.attackRange(p) * 1.05, aimAngle, false);
    }

    // Движение
    p.moveX = input.moveVec.x;
    p.moveY = input.moveVec.y;

    // Поворот
    const moving = Math.hypot(p.moveX, p.moveY) > 0.1;
    if (input.aiming || input.aimStick || (!input.isTouch && input.pointer.inside)) {
      p.angle = aimAngle;
    } else if (moving) {
      p.angle = Math.atan2(p.moveY, p.moveX);
    } else if (this.aimTarget) {
      p.angle = angleTo(p.x, p.y, this.aimTarget.x, this.aimTarget.y);
    }

    const range = this.attackRange(p);
    if (!aimPoint) {
      aimPoint = { x: p.x + Math.cos(p.angle) * range * 0.8, y: p.y + Math.sin(p.angle) * range * 0.8 };
    }
    this.aimInfo = { angle: p.angle, point: aimPoint, super: false };

    // Выстрелы
    const shots = input.takeShots();
    for (const shot of shots) {
      if (!p.alive) break;
      let ang = p.angle;
      if (shot.auto) {
        const t = this.autoAim(p, range * 1.15, p.angle, true);
        ang = t ? angleTo(p.x, p.y, t.x, t.y) : p.angle;
      } else if (typeof shot.angle === 'number') {
        ang = shot.angle;
      } else if (typeof shot.sx === 'number' && cam) {
        const wx = cam.cx + (shot.sx - (cam.viewW * cam.zoom) / 2) / cam.zoom;
        const wy = cam.cy + (shot.sy - (cam.viewH * cam.zoom) / 2) / cam.zoom;
        ang = angleTo(p.x, p.y, wx, wy);
        if (this.settings.aimAssist) {
          const snapped = this.snapAim(p, ang, range * 1.05);
          if (snapped) ang = angleTo(p.x, p.y, snapped.x, snapped.y);
        }
      }
      if (p.ammo <= 0) {
        if (this.time - (this._lastAmmoError || -9) > 0.7) {
          this._lastAmmoError = this.time;
          audio.play('error');
          this.addFloater(p.x, p.y - p.radius * 1.8, 'ПЕРЕЗАРЯДКА', '#ffd54a', 13);
        }
        break;
      }
      this.tryFire(p, ang);
      p.angle = ang;
    }

    // Супер
    if (input.takeSuper() && p.alive) {
      if (p.superCharge >= SUPER_MAX) {
        const b = BRAWLER_BY_ID[p.brawlerId];
        const range = b.super.range || b.super.dist || 420;
        // На ПК супер летит туда, куда наведена мышь; на телефоне — автоприцел
        let ang = p.angle;
        const mouseAim = !input.isTouch && input.pointer.inside;
        if (!mouseAim) {
          const t = this.autoAim(p, range * 1.25, p.angle, true);
          if (t) ang = angleTo(p.x, p.y, t.x, t.y);
        } else if (this.settings.aimAssist) {
          const snapped = this.snapAim(p, ang, range);
          if (snapped) ang = angleTo(p.x, p.y, snapped.x, snapped.y);
        }
        this.useSuper(p, ang);
        this.aimInfo = { angle: ang, point: { x: p.x + Math.cos(ang) * range, y: p.y + Math.sin(ang) * range }, super: true };
      } else if (this.time - (this._lastSuperError || -9) > 0.8) {
        this._lastSuperError = this.time;
        audio.play('error');
        this.addFloater(p.x, p.y - p.radius * 1.8, 'СУПЕР НЕ ГОТОВ', '#9fb4d8', 13);
      }
    }

    // Гаджет
    if (input.takeGadget() && p.alive) {
      this.useGadget(p);
    }
  }

  autoAim(p, maxDist, baseAngle, preferThreat) {
    const brawler = BRAWLER_BY_ID[p.brawlerId];
    const wantHeal = brawler.attack.kind === 'healbolt';

    const scoreEntity = (e, ally) => {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > maxDist) return Infinity;
      if (!this.canSee(p, e)) return Infinity;
      let score = d;
      if (ally) {
        // лечим раненых
        score -= (1 - e.hp / e.maxHp) * 900;
      } else {
        if (preferThreat) score -= (1 - e.hp / e.maxHp) * 260;
        if (baseAngle !== null && baseAngle !== undefined) {
          const ang = angleTo(p.x, p.y, e.x, e.y);
          const diff = Math.abs(((ang - baseAngle + Math.PI * 3) % TAU) - Math.PI);
          score += diff * 260;
        }
        if (e.carrying) score -= 220;
        if (e.invisTime > 0) score += 300;
      }
      return score;
    };

    // Люма сначала ищет союзника, которого надо подлечить
    if (wantHeal) {
      let bestAlly = null;
      let bestAllyScore = Infinity;
      for (const e of this.players) {
        if (!e.alive || e.team !== p.team || e.id === p.id) continue;
        if (e.hp / e.maxHp > 0.82) continue;
        const sc = scoreEntity(e, true);
        if (sc < bestAllyScore) {
          bestAllyScore = sc;
          bestAlly = e;
        }
      }
      if (bestAlly) return bestAlly;
    }

    let best = null;
    let bestScore = Infinity;
    for (const e of this.players) {
      if (!e.alive || e.id === p.id || e.team === p.team) continue;
      const sc = scoreEntity(e, false);
      if (sc < bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    return best;
  }

  snapAim(p, angle, maxDist) {
    let best = null;
    let bestDiff = 0.22;
    for (const e of this.players) {
      if (!e.alive || e.team === p.team) continue;
      if (!this.canSee(p, e)) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > maxDist) continue;
      const a = angleTo(p.x, p.y, e.x, e.y);
      let diff = Math.abs(((a - angle + Math.PI * 3) % TAU) - Math.PI);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = e;
      }
    }
    return best;
  }

  // ---------- Обновление бойца ----------
  updatePlayer(p, dt) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawn(p);
      return;
    }
    p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
    p.invuln = Math.max(0, p.invuln - dt);
    p.spawnShield = Math.max(0, p.spawnShield - dt);
    p.revealTimer = Math.max(0, p.revealTimer - dt);
    p.superActive = Math.max(0, p.superActive - dt);
    p.ballLock = Math.max(0, p.ballLock - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.gadgetCooldown > 0) p.gadgetCooldown = Math.max(0, p.gadgetCooldown - dt);
    if (p.slowTime > 0) {
      p.slowTime -= dt;
      if (p.slowTime <= 0) p.slowAmount = 0;
    }
    if (p.speedTime > 0) {
      p.speedTime -= dt;
      if (p.speedTime <= 0) p.speedAmount = 0;
    }
    if (p.shieldTime > 0) p.shieldTime = Math.max(0, p.shieldTime - dt);
    if (p.invisTime > 0) p.invisTime = Math.max(0, p.invisTime - dt);

    // патроны
    if (p.ammo < p.maxAmmo) {
      p.ammoTimer += dt;
      const reload = BRAWLER_BY_ID[p.brawlerId].attack.reload;
      if (p.ammoTimer >= reload) {
        p.ammoTimer = 0;
        p.ammo++;
        if (p.alive && p.ammo < p.maxAmmo) audio.play('reload');
      }
    } else {
      p.ammoTimer = 0;
    }

    // скрытность в кустах
    p.hidden = this.isInBush(p.x, p.y) && p.revealTimer <= 0 && p.invisTime <= 0;

    // AI
    if (p.isBot && this.phase === 'playing') {
      updateBot(this, p, dt);
    }

    // Прыжок
    if (p.leap) {
      p.leap.t += dt;
      const k = clamp(p.leap.t / p.leap.dur, 0, 1);
      p.x = lerp(p.leap.sx, p.leap.ex, k);
      p.y = lerp(p.leap.sy, p.leap.ey, k);
      p.z = Math.sin(k * Math.PI) * 105;
      p.vx = 0;
      p.vy = 0;
      if (k >= 1) {
        const cb = p.leap.onLand;
        p.leap = null;
        p.z = 0;
        if (cb) cb();
      }
      return;
    }

    // Рывок
    if (p.dash) {
      const d = p.dash;
      d.t -= dt;
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const nx = p.x + (d.vx * dt) / steps;
        const ny = p.y + (d.vy * dt) / steps;
        if (this.circleHitsWall(nx, ny, p.radius)) {
          d.t = 0;
          this.burst(p.x, p.y, '#ffffff', 8, { maxSpeed: 160 });
          break;
        }
        p.x = nx;
        p.y = ny;
        if (d.damage > 0) {
          for (const e of this.players) {
            if (!e.alive || e.team === p.team || d.hit.has(e.id)) continue;
            if (dist(p.x, p.y, e.x, e.y) < p.radius + e.radius + 8) {
              d.hit.add(e.id);
              this.dealDamage(e, d.damage, p, { knockback: d.knockback, knockbackFrom: { x: p.x, y: p.y } });
              this.addShake(6);
            }
          }
        }
      }
      if (Math.random() < 0.6) {
        this.addParticle({
          x: p.x + rand(-8, 8), y: p.y + rand(-6, 6),
          vx: rand(-40, 40), vy: rand(-40, 40),
          size: rand(4, 9), color: p.team === 0 ? '#8fd4ff' : '#ffa3b4',
          life: 0.3, shrink: true,
        });
      }
      if (d.t <= 0) p.dash = null;
      return;
    }

    // Скорость
    const b = BRAWLER_BY_ID[p.brawlerId];
    let speed = b.speed;
    if (p.slowTime > 0) speed *= 1 - p.slowAmount;
    if (p.speedTime > 0) speed *= 1 + p.speedAmount;
    if (this.mode === 'brawlball' && p.carrying) speed *= 0.94;

    let mx = p.moveX || 0;
    let my = p.moveY || 0;
    const len = Math.hypot(mx, my);
    if (len > 0.001) {
      mx /= Math.max(1, len);
      my /= Math.max(1, len);
    }
    const targetVx = mx * speed;
    const targetVy = my * speed;
    const accel = p.isPlayer ? 18 : 14;
    p.vx = lerp(p.vx, targetVx, Math.min(1, accel * dt));
    p.vy = lerp(p.vy, targetVy, Math.min(1, accel * dt));

    // движение с коллизиями
    const dx = p.vx * dt;
    const dy = p.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (p.radius * 0.6)));
    for (let s = 0; s < steps; s++) {
      const nx = p.x + dx / steps;
      if (!this.circleHitsWall(nx, p.y, p.radius)) p.x = nx;
      else p.vx *= 0.4;
      const ny = p.y + dy / steps;
      if (!this.circleHitsWall(p.x, ny, p.radius)) p.y = ny;
      else p.vy *= 0.4;
    }
    p.x = clamp(p.x, p.radius, this.map.worldW - p.radius);
    p.y = clamp(p.y, p.radius, this.map.worldH - p.radius);

    // отталкивание от других бойцов
    for (const o of this.players) {
      if (o === p || !o.alive) continue;
      const dd = dist(p.x, p.y, o.x, o.y);
      const minD = p.radius + o.radius - 6;
      if (dd > 0.01 && dd < minD) {
        const push = (minD - dd) / 2;
        const nx = (p.x - o.x) / dd;
        const ny = (p.y - o.y) / dd;
        p.x += nx * push;
        p.y += ny * push;
        if (!o.isBot) {
          o.x -= nx * push * 0.6;
          o.y -= ny * push * 0.6;
        }
      }
    }
  }

  circleHitsWall(x, y, r) {
    const map = this.map;
    const t = map.tile;
    const minX = Math.max(0, Math.floor((x - r) / t));
    const maxX = Math.min(map.width - 1, Math.floor((x + r) / t));
    const minY = Math.max(0, Math.floor((y - r) / t));
    const maxY = Math.min(map.height - 1, Math.floor((y + r) / t));
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tile = map.grid[ty][tx];
        if (tile !== WALL && tile !== CRATE && tile !== WATER) continue;
        const rx = tx * t;
        const ry = ty * t;
        const closestX = clamp(x, rx, rx + t);
        const closestY = clamp(y, ry, ry + t);
        const ddx = x - closestX;
        const ddy = y - closestY;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  respawn(p) {
    const spawn = this.map.spawns[p.team][p.slot] || this.map.spawns[p.team][1];
    p.alive = true;
    p.hp = p.maxHp;
    p.x = spawn.x + rand(-20, 20);
    p.y = spawn.y + rand(-20, 20);
    p.vx = 0;
    p.vy = 0;
    p.ammo = p.maxAmmo;
    p.ammoTimer = 0;
    p.cooldown = 0.3;
    p.invuln = 1.3;
    p.spawnShield = 1.3;
    p.slowTime = 0;
    p.speedTime = 0;
    p.shieldTime = 0;
    p.shieldHp = 0;
    p.carrying = false;
    p.z = 0;
    p.dash = null;
    p.leap = null;
    p.hidden = false;
    p.revealTimer = 0;
    if (p.isBot) {
      p.bot.path = null;
      p.bot.thinkTimer = 0.15;
    }
    this.addEffect('ring', { x: p.x, y: p.y, radius: p.radius * 4, color: TEAM_COLORS[p.team].main, width: 4, life: 0.6 });
    this.burst(p.x, p.y, [TEAM_COLORS[p.team].light, '#ffffff'], 14, { maxSpeed: 180 });
  }

  // ---------- Снаряды ----------
  updateProjectiles(dt) {
    const alive = [];
    for (const proj of this.projectiles) {
      if (proj.kind === 'lob') {
        proj.arcT += dt;
        const k = clamp(proj.arcT / proj.arcTime, 0, 1);
        proj.x = lerp(proj.sx, proj.tx, k);
        proj.y = lerp(proj.sy, proj.ty, k);
        if (k >= 1) {
          this.lobExplode(proj);
          continue;
        }
        alive.push(proj);
        continue;
      }
      if (proj.kind === 'mine') {
        alive.push(proj);
        continue;
      }
      proj.life -= dt;
      if (proj.life <= 0) continue;
      const speed = Math.hypot(proj.vx, proj.vy);
      const travel = speed * dt;
      const steps = Math.max(1, Math.ceil(travel / Math.max(8, proj.radius * 0.9)));
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const prevX = proj.x;
        const prevY = proj.y;
        const nx = proj.x + (proj.vx * dt) / steps;
        const ny = proj.y + (proj.vy * dt) / steps;

        // стены
        const tx = Math.floor(nx / this.map.tile);
        const ty = Math.floor(ny / this.map.tile);
        const tile = this.map.grid[ty]?.[tx];
        if (tile === WALL || tile === CRATE) {
          if (tile === WALL && proj.bouncesLeft > 0) {
            // определяем ось отскока
            const hitX = this.isSolidWorld(nx, proj.y);
            const hitY = this.isSolidWorld(proj.x, ny);
            if (hitX) proj.vx *= -1;
            if (hitY) proj.vy *= -1;
            if (!hitX && !hitY) {
              proj.vx *= -1;
              proj.vy *= -1;
            }
            proj.bouncesLeft--;
            proj.x = prevX;
            proj.y = prevY;
            proj.vx += rand(-18, 18);
            proj.vy += rand(-18, 18);
            audio.play('bounce');
            this.burst(proj.x, proj.y, [proj.color, '#ffffff'], 4, { maxSpeed: 120, maxSize: 3 });
            continue;
          }
          this.burst(nx, ny, [proj.color, '#ffffff'], 5, { maxSpeed: 110, maxSize: 4 });
          dead = true;
          break;
        }
        // бойцы
        let hitPlayer = null;
        let hitT = 2;
        for (const e of this.players) {
          if (!e.alive || proj.hitIds.has(e.id)) continue;
          if (proj.heal > 0) {
            // снаряд Люмы бьёт врагов и лечит союзников
          } else if (e.team === proj.team) continue;
          if (e.id === proj.ownerId) continue;
          const t = segmentCircle(prevX, prevY, nx, ny, e.x, e.y, e.radius + proj.radius);
          if (t >= 0 && t < hitT) {
            hitT = t;
            hitPlayer = e;
          }
        }
        if (hitPlayer) {
          proj.x = lerp(prevX, nx, hitT);
          proj.y = lerp(prevY, ny, hitT);
          this.hitPlayerWithProjectile(proj, hitPlayer);
          proj.hitIds.add(hitPlayer.id);
          if (proj.pierce > 0) {
            proj.pierce--;
          } else {
            dead = true;
            break;
          }
        }
        proj.x = nx;
        proj.y = ny;
      }
      if (!dead) alive.push(proj);
    }
    this.projectiles = alive;
  }

  hitPlayerWithProjectile(proj, target) {
    if (proj.heal > 0 && target.team === proj.team) {
      this.healPlayer(target, proj.heal, this.getPlayer(proj.ownerId));
      this.burst(target.x, target.y, ['#7dffb0', '#eafff3'], 8, { maxSpeed: 120 });
      return;
    }
    const source = this.getPlayer(proj.ownerId);
    this.dealDamage(target, proj.damage, source, {
      knockback: proj.knockback,
      knockbackFrom: { x: proj.x, y: proj.y },
      slow: proj.slow,
      slowTime: proj.slowTime,
    });
    this.burst(proj.x, proj.y, [proj.color, '#ffffff'], 9, { maxSpeed: 190, maxSize: 5 });
    if (proj.isSuper) this.addShake(2);
  }

  lobExplode(proj) {
    this.addExplosion(proj.tx, proj.ty, proj.splash, { color: '#fff2b0', color2: proj.color });
    audio.play('explode');
    this.addShake(proj.isSuper ? 7 : 4);
    for (const e of this.players) {
      if (!e.alive) continue;
      const d = dist(proj.tx, proj.ty, e.x, e.y);
      if (d < proj.splash + e.radius) {
        if (e.team !== proj.team) {
          this.dealDamage(e, proj.damage, this.getPlayer(proj.ownerId), {
            knockback: proj.knockback,
            knockbackFrom: { x: proj.tx, y: proj.ty },
            slow: proj.slow,
            slowTime: proj.slowTime,
          });
        } else if (proj.zone && proj.zone.slow) {
          // свои не получают урон
        }
      }
    }
    // разрушаем ящики
    this.breakCrates(proj.tx, proj.ty, proj.splash);
    if (proj.zone) {
      this.zones.push({
        x: proj.tx, y: proj.ty, r: proj.zone.radius || proj.splash,
        life: proj.zone.time || 2.5, maxLife: proj.zone.time || 2.5,
        color: proj.zone.color || '#9fe9ff', kind: 'freeze',
        slow: proj.zone.slow || 0.4, slowTime: 0.8, team: proj.team,
        ownerId: proj.ownerId, seed: rand(0, 10), tick: 0,
      });
    }
  }

  breakCrates(x, y, radius) {
    const map = this.map;
    const t = map.tile;
    const minX = Math.max(0, Math.floor((x - radius) / t));
    const maxX = Math.min(map.width - 1, Math.floor((x + radius) / t));
    const minY = Math.max(0, Math.floor((y - radius) / t));
    const maxY = Math.min(map.height - 1, Math.floor((y + radius) / t));
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (map.grid[ty][tx] !== CRATE) continue;
        const cx = (tx + 0.5) * t;
        const cy = (ty + 0.5) * t;
        if (dist(x, y, cx, cy) < radius + 30) {
          map.grid[ty][tx] = 0;
          this.mapVersion++;
          this.burst(cx, cy, ['#b57a44', '#7d4e28', '#d9a05f'], 16, {
            maxSpeed: 220, maxSize: 8, shape: 'rect', gravity: 400, drag: 0.96,
          });
          this.addExplosion(cx, cy, 34, { color: '#e8c79a', color2: '#8a5a30' });
        }
      }
    }

  }

  // ---------- Мины и зоны ----------
  updateMines(dt) {
    const keep = [];
    for (const m of this.mines) {
      m.life -= dt;
      if (m.life <= 0) continue;
      if (!m.armed) {
        m.armTimer -= dt;
        if (m.armTimer <= 0) m.armed = true;
      }
      let boom = false;
      if (m.armed) {
        for (const p of this.players) {
          if (!p.alive || p.team === m.team) continue;
          if (dist(m.x, m.y, p.x, p.y) < 62 + p.radius) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        this.addExplosion(m.x, m.y, m.radius, { color: '#ffd9a3', color2: '#ff6b3d' });
        audio.play('explode');
        this.addShake(6);
        for (const p of this.players) {
          if (!p.alive || p.team === m.team) continue;
          if (dist(m.x, m.y, p.x, p.y) < m.radius + p.radius) {
            this.dealDamage(p, m.damage, this.getPlayer(m.ownerId), { knockback: 160, knockbackFrom: { x: m.x, y: m.y } });
          }
        }
        this.breakCrates(m.x, m.y, m.radius);
        continue;
      }
      keep.push(m);
    }
    this.mines = keep;
  }

  updateZones(dt) {
    const keep = [];
    for (const z of this.zones) {
      z.life -= dt;
      if (z.life <= 0) continue;
      // обновляем визуальное поле через рендерер
      z.seed = z.seed || 0;
      if (z.kind === 'freeze') {
        z.tick = (z.tick || 0) + dt;
        for (const p of this.players) {
          if (!p.alive) continue;
          if (dist(z.x, z.y, p.x, p.y) > z.r + p.radius) continue;
          if (p.team === z.team) continue;
          p.slowTime = Math.max(p.slowTime, 0.8);
          p.slowAmount = Math.max(p.slowAmount, z.slow);
        }
        if (z.tick > 0.55) {
          z.tick = 0;
          for (const p of this.players) {
            if (!p.alive || p.team === z.team) continue;
            if (dist(z.x, z.y, p.x, p.y) < z.r) {
              this.dealDamage(p, 46, this.getPlayer(z.ownerId), {});
            }
          }
        }
      }
      keep.push(z);
    }
    this.zones = keep;
  }

  // ---------- Подбираемые предметы ----------
  updatePickups(dt) {
    const keep = [];
    for (const pk of this.pickups) {
      if (pk.noPickup > 0) pk.noPickup -= dt;
      if (pk.vx || pk.vy) {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.vx *= 0.9;
        pk.vy *= 0.9;
        if (Math.abs(pk.vx) < 4) pk.vx = 0;
        if (Math.abs(pk.vy) < 4) pk.vy = 0;
        if (this.circleHitsWall(pk.x, pk.y, 10)) {
          pk.x -= pk.vx * dt * 2;
          pk.y -= pk.vy * dt * 2;
          pk.vx *= -0.5;
          pk.vy *= -0.5;
        }
      }
      let takenBy = null;
      if (!pk.noPickup || pk.noPickup <= 0) {
        for (const p of this.players) {
          if (!p.alive) continue;
          if (dist(p.x, p.y, pk.x, pk.y) < p.radius + 22) {
            takenBy = p;
            break;
          }
        }
      }
      if (takenBy) {
        if (pk.kind === 'gem') {
          takenBy.gems++;
          if (takenBy.isPlayer) {
            audio.play('gem');
            this.stats.gems++;
          }
          this.addFloater(takenBy.x, takenBy.y - 40, '+1 💎', '#d9a3ff', 16);
          this.burst(pk.x, pk.y, ['#c98bff', '#ffffff'], 8, { maxSpeed: 140 });
        } else if (pk.kind === 'star') {
          this.teamScore[takenBy.team] += 2;
          if (takenBy.isPlayer) {
            this.stats.stars += 2;
            audio.play('gem');
          }
          this.addFloater(takenBy.x, takenBy.y - 40, '+2 ★', '#ffc832', 18);
          this.checkBountyWin();
        }
        continue;
      }
      keep.push(pk);
    }
    this.pickups = keep;
  }

  // ---------- Режимы ----------
  updateMode(dt) {
    if (this.mode === 'gemgrab') {
      this.gemTimer -= dt;
      const gemCount = this.pickups.filter((p) => p.kind === 'gem').length;
      if (this.gemTimer <= 0 && gemCount < 12) {
        this.gemTimer = 2.4;
        const a = rand(0, TAU);
        const r = rand(0, 80);
        this.pickups.push({
          kind: 'gem',
          x: this.map.gemSpawn.x + Math.cos(a) * r,
          y: this.map.gemSpawn.y + Math.sin(a) * r,
          seed: rand(0, 10),
          noPickup: 0.2,
        });
      }
      this.gems[0] = 0;
      this.gems[1] = 0;
      for (const p of this.players) {
        if (!p.alive) continue;
        this.gems[p.team] += p.gems;
      }
      const lead = this.gems[0] >= 10 ? 0 : this.gems[1] >= 10 ? 1 : null;
      if (lead !== null) {
        if (this.hold.team !== lead) {
          this.hold.team = lead;
          this.hold.timer = 0;
        }
        this.hold.timer += dt;
        if (this.hold.timer >= 15) {
          this.endMatch(lead, 'hold');
          return;
        }
      } else {
        this.hold.timer = Math.max(0, this.hold.timer - dt * 1.6);
        if (this.hold.timer <= 0) this.hold.team = null;
      }
    } else if (this.mode === 'brawlball') {
      // обработка голов в updateBall
    } else if (this.mode === 'bounty') {
      this.starTimer -= dt;
      if (this.starTimer <= 0) {
        this.starTimer = 20;
        if (!this.pickups.some((p) => p.kind === 'star')) {
          this.pickups.push({
            kind: 'star',
            x: this.map.gemSpawn.x,
            y: this.map.gemSpawn.y,
            seed: rand(0, 10),
            noPickup: 0.3,
          });
        }
      }
    }
  }

  checkBountyWin() {
    if (this.mode !== 'bounty') return;
    if (this.teamScore[0] >= 20) this.endMatch(0, 'score');
    else if (this.teamScore[1] >= 20) this.endMatch(1, 'score');
  }

  updateBall(dt) {
    const ball = this.ball;
    if (!ball) return;
    ball.spin = (ball.spin || 0) + dt * 2;
    if (this.phase === 'goal') return;
    ball.cooldown = Math.max(0, ball.cooldown - dt);
    // движение мяча
    if (Math.hypot(ball.vx, ball.vy) > 3) {
      const steps = Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 10);
      for (let s = 0; s < steps; s++) {
        const nx = ball.x + (ball.vx * dt) / steps;
        const ny = ball.y + (ball.vy * dt) / steps;
        if (this.circleHitsWall(nx, ball.y, ball.radius)) {
          ball.vx *= -0.72;
          audio.play('ball');
        } else ball.x = nx;
        if (this.circleHitsWall(ball.x, ny, ball.radius)) {
          ball.vy *= -0.72;
          audio.play('ball');
        } else ball.y = ny;
      }
      ball.vx *= Math.pow(0.18, dt);
      ball.vy *= Math.pow(0.18, dt);
      if (Math.hypot(ball.vx, ball.vy) < 12) {
        ball.vx = 0;
        ball.vy = 0;
      }
    }
    // подбор мяча
    if (!ball.owner && ball.cooldown <= 0) {
      for (const p of this.players) {
        if (!p.alive || p.ballLock > 0) continue;
        if (dist(p.x, p.y, ball.x, ball.y) < p.radius + ball.radius + 4) {
          ball.owner = p.id;
          ball.lastTouchId = p.id;
          ball.vx = 0;
          ball.vy = 0;
          p.carrying = true;
          audio.play('pickup');
          this.burst(ball.x, ball.y, ['#ffffff', '#cfe8ff'], 8, { maxSpeed: 120 });
          break;
        }
      }
    }
    if (ball.owner) {
      const owner = this.getPlayer(ball.owner);
      if (!owner || !owner.alive) {
        ball.owner = null;
      } else {
        owner.carrying = true;
        ball.x = owner.x + Math.cos(owner.angle) * (owner.radius + 10);
        ball.y = owner.y + Math.sin(owner.angle) * (owner.radius + 10);
        ball.vx = owner.vx;
        ball.vy = owner.vy;
      }
    }
    // очистка флага у остальных
    for (const p of this.players) {
      if (!ball.owner || p.id !== ball.owner) p.carrying = false;
    }
    // гол
    if (this.phase === 'playing') {
      for (const team of [0, 1]) {
        const g = this.map.goals[team];
        if (!g) continue;
        if (
          ball.x > g.x && ball.x < g.x + g.w &&
          ball.y > g.y && ball.y < g.y + g.h
        ) {
          this.scoreGoal(1 - team);
          break;
        }
      }
    }
  }

  scoreGoal(team) {
    if (this.phase !== 'playing') return;
    this.goals[team]++;
    this.teamScore[team] = this.goals[team];
    if (team === this.playerTeam && this.ball && this.ball.lastTouchId === this.player.id) {
      this.stats.goals++;
    }
    audio.play('goal');
    this.addShake(9);
    this.banner = {
      text: 'ГОЛ!',
      sub: `${TEAM_NAMES[team]} забивают`,
      life: 2.2,
      maxLife: 2.2,
      color: TEAM_COLORS[team].light,
    };
    for (let i = 0; i < 40; i++) {
      this.addParticle({
        x: rand(0, this.map.worldW),
        y: rand(0, this.map.worldH * 0.5),
        vx: rand(-60, 60),
        vy: rand(60, 220),
        size: rand(4, 10),
        color: pick(['#ff5c72', '#ffd54a', '#5df08a', '#4aa8ff', '#c48bff']),
        life: rand(1, 2),
        shape: 'rect',
        gravity: 160,
        rot: rand(0, TAU),
        spin: rand(-8, 8),
      });
    }
    this.phase = 'goal';
    this.phaseTimer = 2.4;
    if (this.goals[team] >= 2) {
      this.banner = {
        text: 'ПОБЕДА!',
        sub: `${TEAM_NAMES[team]} забирают матч`,
        life: 3,
        maxLife: 3,
        color: team === this.playerTeam ? '#ffd54a' : '#ff5c72',
      };
      this.phase = 'goal';
      this.phaseTimer = 3;
      this.endMatch(team, 'goals');
      return;
    }
    // сброс позиций
    this.timers.push({
      t: 2.3,
      fn: () => {
        this.resetPositions();
        if (this.ball) {
          this.ball.x = this.map.ballSpawn.x;
          this.ball.y = this.map.ballSpawn.y;
          this.ball.vx = 0;
          this.ball.vy = 0;
          this.ball.owner = null;
          this.ball.cooldown = 0;
        }
      },
    });
  }

  resetPositions() {
    for (const p of this.players) {
      const spawn = this.map.spawns[p.team][p.slot] || this.map.spawns[p.team][1];
      p.alive = true;
      p.hp = p.maxHp;
      p.x = spawn.x;
      p.y = spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.ammo = p.maxAmmo;
      p.ammoTimer = 0;
      p.slowTime = 0;
      p.speedTime = 0;
      p.shieldTime = 0;
      p.shieldHp = 0;
      p.invisTime = 0;
      p.carrying = false;
      p.z = 0;
      p.dash = null;
      p.leap = null;
      p.angle = p.team === 0 ? 0 : Math.PI;
      p.invuln = 1;
      if (p.isBot) p.bot.path = null;
    }
    this.projectiles = [];
    this.mines = [];
    this.zones = [];
  }

  // ---------- Камера ----------
  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    if (p.alive) {
      const lookX = p.x + Math.cos(p.angle) * 55;
      const lookY = p.y + Math.sin(p.angle) * 55;
      if (!this.cameraTarget) this.cameraTarget = { x: lookX, y: lookY };
      this.cameraTarget.x = lerp(this.cameraTarget.x, lookX, Math.min(1, dt * 6));
      this.cameraTarget.y = lerp(this.cameraTarget.y, lookY, Math.min(1, dt * 6));
    } else {
      const anchor = this.mode === 'brawlball' && this.ball ? this.ball : this.map.gemSpawn;
      if (!this.cameraTarget) this.cameraTarget = { x: anchor.x, y: anchor.y };
      this.cameraTarget.x = lerp(this.cameraTarget.x, anchor.x, Math.min(1, dt * 2));
      this.cameraTarget.y = lerp(this.cameraTarget.y, anchor.y, Math.min(1, dt * 2));
    }
  }

  // ---------- Итоги ----------
  finishByTime() {
    if (this.phase === 'ended') return;
    if (this.mode === 'gemgrab') {
      const a = this.gems[0];
      const b = this.gems[1];
      if (a === b) {
        // при равенстве побеждает команда, удерживавшая кристаллы
        if (this.hold.team !== null && this.hold.timer > 0) this.endMatch(this.hold.team, 'time');
        else this.endMatch('draw', 'time');
      } else this.endMatch(a > b ? 0 : 1, 'time');
    } else if (this.mode === 'brawlball') {
      if (this.goals[0] === this.goals[1]) this.endMatch('draw', 'time');
      else this.endMatch(this.goals[0] > this.goals[1] ? 0 : 1, 'time');
    } else if (this.mode === 'bounty') {
      if (this.teamScore[0] === this.teamScore[1]) this.endMatch('draw', 'time');
      else this.endMatch(this.teamScore[0] > this.teamScore[1] ? 0 : 1, 'time');
    }
  }

  endMatch(winner, reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endDelay = 2.2;
    const draw = winner === 'draw';
    const win = !draw && winner === this.playerTeam;
    // Лучший игрок матча (MVP)
    let mvp = null;
    let mvpScore = -Infinity;
    for (const p of this.players) {
      const score =
        p.kills * 3 +
        p.deaths * -0.6 +
        p.damageDealt / 260 +
        p.healing / 320 +
        (p.team === this.playerTeam ? p.gems * 0.5 : p.gems * 0.5) +
        (this.mode === 'brawlball' && this.ball && this.ball.lastTouchId === p.id ? 2 : 0);
      if (score > mvpScore) {
        mvpScore = score;
        mvp = p;
      }
    }

    this.result = {
      mode: this.mode,
      modeName: MODES[this.mode].name,
      mapName: this.map.name,
      win,
      draw,
      winner,
      scores: this.mode === 'brawlball'
        ? { ...this.goals }
        : this.mode === 'gemgrab'
        ? { ...this.gems }
        : { ...this.teamScore },
      gems: { ...this.gems },
      duration: Math.round(this.matchTime - this.timeLeft),
      stats: { ...this.stats },
      mvp: mvp ? {
        name: mvp.name,
        brawlerId: mvp.brawlerId,
        team: mvp.team,
        isPlayer: mvp.isPlayer,
        kills: mvp.kills,
        damage: Math.round(mvp.damageDealt),
      } : null,
      player: this.player ? {
        name: this.player.name,
        brawlerId: this.player.brawlerId,
        kills: this.player.kills,
        deaths: this.player.deaths,
        damage: Math.round(this.player.damageDealt),
        gems: this.player.gems,
      } : null,
      reason,
    };
    this.banner = {
      text: draw ? 'НИЧЬЯ' : win ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ',
      sub: draw ? 'Равный бой' : win ? 'Отличная игра!' : 'Попробуй ещё раз',
      life: 3,
      maxLife: 3,
      color: draw ? '#cfe8ff' : win ? '#ffd54a' : '#ff5c72',
    };
    if (draw) audio.play('countdown');
    else audio.play(win ? 'win' : 'lose');
    // конфетти
    const count = win ? 60 : 18;
    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: rand(this.map.worldW * 0.3, this.map.worldW * 0.7),
        y: rand(this.map.worldH * 0.1, this.map.worldH * 0.5),
        vx: rand(-140, 140),
        vy: rand(-40, 180),
        size: rand(3, 9),
        color: pick(['#ff5c72', '#ffd54a', '#5df08a', '#4aa8ff', '#c48bff']),
        life: rand(1.2, 2.4),
        shape: 'rect',
        gravity: 220,
        rot: rand(0, TAU),
        spin: rand(-10, 10),
      });
    }
  }
}
