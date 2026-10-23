// Искусственный интеллект ботов: цели, движение, прицеливание, способности.
import { BRAWLER_BY_ID, DIFFICULTY } from './config.js';
import { BUSH } from './maps.js';
import { TAU, angleTo, clamp, dist, rand, chance } from './utils.js';

export function createBotState(game, player, difficultyId) {
  const diff = DIFFICULTY[difficultyId] || DIFFICULTY.normal;
  return {
    diff,
    thinkTimer: rand(0, 0.3),
    pathTimer: 0,
    path: null,
    pathTarget: null,
    state: 'roam',
    targetId: null,
    healTargetId: null,
    aimAngle: rand(0, TAU),
    strafeDir: chance(0.5) ? 1 : -1,
    strafeTimer: rand(1, 3),
    fireDelay: 0,
    reactionDelay: 0,
    dodgeCooldown: 0,
    dodgeDir: 0,
    aimBias: rand(-1, 1),
    biasTimer: 0,
    superWait: 0,
    gadgetWait: rand(2, 8),
    lastSeen: new Map(),
    wanderAngle: rand(0, TAU),
    lastPos: { x: player.x, y: player.y },
    stuckTimer: 0,
    role: player.slot === 0 ? 'aggressive' : 'balanced',
  };
}

function visibleEnemies(game, p) {
  const out = [];
  for (const e of game.players) {
    if (!e.alive || e.team === p.team) continue;
    if (!game.canSee(p, e)) continue;
    out.push(e);
  }
  return out;
}

function bestEnemy(game, p, enemies) {
  let best = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    const d = dist(p.x, p.y, e.x, e.y);
    let score = 1200 - d;
    score += (1 - e.hp / e.maxHp) * 420;
    if (e.invisible) score -= 500;
    if (p.brawlerId === 'mira' || p.brawlerId === 'vector') score += d * 0.25;
    if (p.brawlerId === 'grom' || p.brawlerId === 'claw' || p.brawlerId === 'blaze') score -= d * 0.2;
    if (e.gems > 0) score += e.gems * 60;
    if (e.carrying) score += 300;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function predictPos(game, target, p, extra = 0) {
  const b = BRAWLER_BY_ID[p.brawlerId];
  const speed = b.attack.kind === 'lob' ? 900 : b.attack.speed || 1500;
  const d = dist(p.x, p.y, target.x, target.y);
  const t = clamp(d / speed, 0, 0.55) + extra;
  return { x: target.x + target.vx * t, y: target.y + target.vy * t };
}

function nearestBush(map, x, y) {
  let best = null;
  let bestD = Infinity;
  const tx0 = Math.floor(x / map.tile);
  const ty0 = Math.floor(y / map.tile);
  const R = 7;
  for (let ty = Math.max(0, ty0 - R); ty <= Math.min(map.height - 1, ty0 + R); ty++) {
    for (let tx = Math.max(0, tx0 - R); tx <= Math.min(map.width - 1, tx0 + R); tx++) {
      if (map.grid[ty][tx] !== BUSH) continue;
      const wx = (tx + 0.5) * map.tile;
      const wy = (ty + 0.5) * map.tile;
      const d = dist(x, y, wx, wy);
      if (d < bestD) {
        bestD = d;
        best = { x: wx, y: wy };
      }
    }
  }
  return best;
}

function teamGems(game, team) {
  let s = 0;
  for (const p of game.players) if (p.team === team && p.alive) s += p.gems;
  return s;
}

function ownGoal(game, team) {
  const g = game.map.goals[team];
  if (!g) return { x: game.map.worldW / 2, y: game.map.worldH / 2 };
  return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
}

function enemyGoal(game, team) {
  return ownGoal(game, 1 - team);
}

function think(game, p, ai) {
  const enemies = visibleEnemies(game, p);
  const d = ai.diff;
  const b = BRAWLER_BY_ID[p.brawlerId];
  const hpRatio = p.hp / p.maxHp;
  const target = bestEnemy(game, p, enemies);
  if (target) ai.targetId = target.id;
  const targetPlayer = game.getPlayer(ai.targetId);
  const targetDist = targetPlayer && targetPlayer.alive && game.canSee(p, targetPlayer)
    ? dist(p.x, p.y, targetPlayer.x, targetPlayer.y)
    : Infinity;
  const attackRange = game.attackRange(p);

  let state = 'roam';
  let moveX = null;
  let moveY = null;

  const allyLow = game.players.find(
    (a) => a.team === p.team && a.alive && a.id !== p.id && a.hp / a.maxHp < 0.5 && dist(p.x, p.y, a.x, a.y) < 620
  );
  ai.healTargetId = b.attack.kind === 'healbolt' && allyLow ? allyLow.id : null;

  const lowHp = hpRatio < 0.32;
  const danger = enemies.length > 0 && targetDist < attackRange + 180;

  // --- Отступление ---
  if (lowHp && danger && !ai.healTargetId) {
    state = 'retreat';
    const bush = nearestBush(game.map, p.x, p.y);
    const spawn = game.map.spawns[p.team][1] || { x: game.map.worldW / 2, y: game.map.worldH / 2 };
    if (bush && chance(0.55)) {
      moveX = bush.x;
      moveY = bush.y;
    } else {
      moveX = spawn.x;
      moveY = spawn.y;
    }
  } else if (game.mode === 'gemgrab') {
    const myGems = teamGems(game, p.team);
    const gems = game.pickups.filter((k) => k.kind === 'gem');
    let gemTarget = null;
    let gemD = Infinity;
    for (const gm of gems) {
      const gd = dist(p.x, p.y, gm.x, gm.y);
      if (gd < gemD) {
        gemD = gd;
        gemTarget = gm;
      }
    }
    if (gemTarget && gemD < 800 && (myGems < 10 || gemD < 260) && !(danger && hpRatio < 0.5)) {
      state = 'collect';
      moveX = gemTarget.x;
      moveY = gemTarget.y;
    } else if (danger && hpRatio > 0.35) {
      state = 'fight';
    } else if (myGems >= 10) {
      state = 'defend';
      const home = game.map.spawns[p.team][1];
      moveX = home.x + (p.slot - 1) * 80;
      moveY = home.y - 110;
    } else {
      state = 'roam';
      const center = game.map.gemSpawn;
      const ang = ai.wanderAngle;
      moveX = center.x + Math.cos(ang) * 210;
      moveY = center.y + Math.sin(ang) * 150;
      if (dist(p.x, p.y, moveX, moveY) < 90) ai.wanderAngle += 1.3;
      if (target && targetDist < attackRange * 1.2 && hpRatio > 0.35) state = 'fight';
    }
  } else if (game.mode === 'brawlball') {
    const ball = game.ball;
    const eGoal = enemyGoal(game, p.team);
    const oGoal = ownGoal(game, p.team);
    if (ball) {
      // кто из союзников ближе всех к мячу
      let closest = null;
      let cd = Infinity;
      for (const a of game.players) {
        if (!a.alive || a.team !== p.team) continue;
        const ad = dist(a.x, a.y, ball.x, ball.y);
        if (ad < cd) {
          cd = ad;
          closest = a;
        }
      }
      const ballD = dist(p.x, p.y, ball.x, ball.y);
      if (ball.owner === p.id) {
        state = 'carry';
        moveX = eGoal.x;
        moveY = eGoal.y;
      } else if (ball.owner && game.getPlayer(ball.owner)?.team === p.team) {
        const carrier = game.getPlayer(ball.owner);
        if (carrier) {
          state = 'support';
          moveX = carrier.x + (eGoal.x - carrier.x) * 0.42 + (p.slot - 1) * 70;
          moveY = carrier.y + (eGoal.y - carrier.y) * 0.42 + (p.slot - 1) * 90;
        }
      } else if (closest && closest.id === p.id) {
        state = 'chaseBall';
        moveX = ball.x;
        moveY = ball.y;
      } else {
        state = 'position';
        // прикрываем направление к своим воротам, но держимся ближе к мячу
        moveX = ball.x + (oGoal.x - ball.x) * 0.32 + (p.slot - 1) * 120;
        moveY = ball.y + (oGoal.y - ball.y) * 0.32 + (p.slot - 1) * 80;
        if (dist(p.x, p.y, moveX, moveY) < 70) {
          moveX = ball.x + (eGoal.x - ball.x) * 0.25;
          moveY = ball.y + (eGoal.y - ball.y) * 0.25;
        }
      }
      // роль защитника: слот 0 держит свои ворота
      const ourGoalDist = dist(ball.x, ball.y, oGoal.x, oGoal.y);
      const enemyGoalDist = dist(ball.x, ball.y, eGoal.x, eGoal.y);
      const defending = ourGoalDist < enemyGoalDist || ball.owner !== null && game.getPlayer(ball.owner)?.team !== p.team;
      if (p.slot === 0 && ball.owner !== p.id && defending) {
        state = 'defend';
        moveX = oGoal.x + (ball.x - oGoal.x) * 0.34;
        moveY = oGoal.y + (ball.y - oGoal.y) * 0.34;
      } else if (ballD < 620 && ourGoalDist < 280 && ball.owner !== p.id) {
        state = 'defend';
        moveX = ball.x + (oGoal.x - ball.x) * 0.5;
        moveY = ball.y + (oGoal.y - ball.y) * 0.5;
      }
    }
  } else if (game.mode === 'bounty') {
    const star = game.pickups.find((k) => k.kind === 'star');
    if (star && dist(p.x, p.y, star.x, star.y) < 850 && (!danger || hpRatio > 0.5)) {
      state = 'collect';
      moveX = star.x;
      moveY = star.y;
    } else if (danger && hpRatio > 0.3) {
      state = 'fight';
    } else if (targetPlayer && targetPlayer.alive) {
      state = 'hunt';
      moveX = targetPlayer.x;
      moveY = targetPlayer.y;
    } else {
      state = 'roam';
      const ang = ai.wanderAngle;
      moveX = game.map.worldW / 2 + Math.cos(ang) * 430;
      moveY = game.map.worldH / 2 + Math.sin(ang) * 280;
      if (dist(p.x, p.y, moveX, moveY) < 80) ai.wanderAngle += 1.7;
    }
  }

  // В бою держим дистанцию / кайтим
  if (state === 'fight' && targetPlayer) {
    const pref = game.preferredRange(p);
    if (targetDist < pref * 0.65) {
      const away = angleTo(targetPlayer.x, targetPlayer.y, p.x, p.y);
      moveX = p.x + Math.cos(away) * 180;
      moveY = p.y + Math.sin(away) * 180;
    } else if (targetDist > pref * 1.05) {
      moveX = targetPlayer.x;
      moveY = targetPlayer.y;
    } else {
      // кружим вокруг цели
      const a = angleTo(targetPlayer.x, targetPlayer.y, p.x, p.y) + ai.strafeDir * 1.1;
      moveX = targetPlayer.x + Math.cos(a) * pref * 0.85;
      moveY = targetPlayer.y + Math.sin(a) * pref * 0.85;
    }
  }

  // Лишние движения: не стоим на месте
  if (state === 'roam' || state === 'defend' || state === 'position') {
    ai.wanderPhase = (ai.wanderPhase || 0) + 0.6;
    moveX += Math.cos(ai.wanderPhase + p.seed) * 60;
    moveY += Math.sin(ai.wanderPhase + p.seed) * 60;
  }

  ai.state = state;
  ai.moveTarget = moveX !== null ? { x: moveX, y: moveY } : null;

  // ---------- Прицеливание ----------
  const healTarget = ai.healTargetId ? game.getPlayer(ai.healTargetId) : null;
  const aimEntity = healTarget || (targetPlayer && targetPlayer.alive && game.canSee(p, targetPlayer) ? targetPlayer : null);
  ai.aimEntityId = aimEntity ? aimEntity.id : null;
  if (aimEntity) {
    const pred = predictPos(game, aimEntity, p, 0);
    let ang = angleTo(p.x, p.y, pred.x, pred.y);
    ai.biasTimer -= 0.2;
    if (ai.biasTimer <= 0) {
      ai.biasTimer = rand(1.2, 2.6);
      ai.aimBias = rand(-1, 1);
    }
    ai.aimAngle = ang;
    const distToTarget = dist(p.x, p.y, aimEntity.x, aimEntity.y);
    const err = d.aimError * (0.6 + distToTarget / 700) + Math.abs(ai.aimBias) * d.aimError * 0.5;
    ai.aimErrorNow = rand(-err, err);
    ai.wantsFire =
      distToTarget < attackRange * 0.97 &&
      !aimEntity.invisible &&
      (b.attack.kind === 'lob' || game.hasLineOfSight(p.x, p.y, aimEntity.x, aimEntity.y));
  } else {
    ai.wantsFire = false;
    ai.aimErrorNow = 0;
  }

  // ---------- Супер ----------
  if (p.superCharge >= 100 && ai.superWait <= 0) {
    const use = decideSuper(game, p, ai, targetPlayer, enemies, hpRatio);
    if (use && chance(d.superUse)) {
      game.useSuper(p, ai.aimAngle + rand(-0.05, 0.05));
      ai.superWait = 0.6;
    }
  }

  // ---------- Гаджет ----------
  if (p.gadgetCooldown <= 0 && ai.gadgetWait <= 0) {
    const gadget = b.gadget;
    let use = false;
    if (gadget.kind === 'shield' || gadget.kind === 'cleanse') use = hpRatio < 0.55 || p.slowTime > 0;
    else if (gadget.kind === 'burstheal') use = hpRatio < 0.5 || !!allyLow;
    else if (gadget.kind === 'reload') use = p.ammo === 0 && targetDist < attackRange;
    else if (gadget.kind === 'dash') use = hpRatio < 0.4 && targetDist < 400;
    else if (gadget.kind === 'invis') use = targetDist < 600 && hpRatio > 0.4;
    else if (gadget.kind === 'speed') use = targetDist > attackRange && targetDist < 900;
    else if (gadget.kind === 'reveal') use = enemies.length === 0 && chance(0.4);
    if (use) {
      game.useGadget(p);
      ai.gadgetWait = rand(4, 9);
    }
  }
}

function decideSuper(game, p, ai, target, enemies, hpRatio) {
  const b = BRAWLER_BY_ID[p.brawlerId];
  const s = b.super;
  const t = target && target.alive ? target : null;
  const d = t ? dist(p.x, p.y, t.x, t.y) : Infinity;
  const anyNear = enemies.some((e) => dist(p.x, p.y, e.x, e.y) < 500);
  switch (s.kind) {
    case 'aura': {
      const wounded = game.players.some((a) => a.team === p.team && a.alive && a.hp / a.maxHp < 0.6 && dist(p.x, p.y, a.x, a.y) < s.radius);
      return wounded || (hpRatio < 0.6 && anyNear);
    }
    case 'rail':
      return !!t && d < s.range * 0.95 && game.hasLineOfSight(p.x, p.y, t.x, t.y);
    case 'leapbomb':
      return !!t && d < s.dist + 120 && d > 80;
    case 'leapstrike':
      return !!t && d < s.dist + 120 && d > 60;
    case 'dash':
      return !!t && d < s.dist + 100 && d > 80;
    case 'mines':
      return anyNear || (!!t && d < 500);
    case 'freeze':
      return !!t && d < s.range * 0.95 && game.hasLineOfSight(p.x, p.y, t.x, t.y);
    case 'barrage':
      return !!t && d < 500;
    case 'blast':
      return !!t && d < s.range * 0.95;
    default:
      return !!t && d < 500;
  }
}

function executeMovement(game, p, ai, dt) {
  const b = BRAWLER_BY_ID[p.brawlerId];
  let dirX = 0;
  let dirY = 0;

  // Уклонение от снарядов
  if (ai.diff.dodge > 0) {
    ai.dodgeCooldown -= dt;
    if (ai.dodgeCooldown <= 0) {
      let danger = null;
      for (const proj of game.projectiles) {
        if (proj.team === p.team || proj.kind === 'lob') continue;
        const rx = p.x - proj.x;
        const ry = p.y - proj.y;
        const sp = Math.hypot(proj.vx, proj.vy);
        if (sp < 1) continue;
        const nx = proj.vx / sp;
        const ny = proj.vy / sp;
        const forward = rx * nx + ry * ny;
        if (forward < 0 || forward > 340) continue;
        const lateral = Math.abs(rx * ny - ry * nx);
        if (lateral < p.radius + proj.radius + 26) {
          danger = { nx, ny };
          break;
        }
      }
      if (danger && chance(ai.diff.dodge)) {
        ai.dodgeDir = chance(0.5) ? 1 : -1;
        ai.dodgeCooldown = 0.6;
        ai.dodgeTime = 0.32;
        ai.dodgeNX = danger.nx;
        ai.dodgeNY = danger.ny;
      }
    }
  }
  if (ai.dodgeTime > 0) {
    ai.dodgeTime -= dt;
    const px = -ai.dodgeNY * ai.dodgeDir;
    const py = ai.dodgeNX * ai.dodgeDir;
    dirX = px;
    dirY = py;
  } else if (ai.moveTarget) {
    const map = game.map;
    // путь
    ai.pathTimer -= dt;
    const needsPath =
      !ai.path ||
      ai.pathTimer <= 0 ||
      !ai.pathTarget ||
      dist(ai.pathTarget.x, ai.pathTarget.y, ai.moveTarget.x, ai.moveTarget.y) > 60;
    if (needsPath) {
      ai.pathTimer = rand(0.55, 0.9);
      ai.pathTarget = { x: ai.moveTarget.x, y: ai.moveTarget.y };
      const targetBlocked =
        game.isSolidWorld(ai.moveTarget.x, ai.moveTarget.y) ||
        !game.hasLineOfSight(p.x, p.y, ai.moveTarget.x, ai.moveTarget.y);
      if (targetBlocked) {
        ai.path = game.findPath(p.x, p.y, ai.moveTarget.x, ai.moveTarget.y);
      } else {
        ai.path = [{ x: ai.moveTarget.x, y: ai.moveTarget.y }];
      }
    }
    if (ai.path && ai.path.length) {
      let wp = ai.path[0];
      let wd = dist(p.x, p.y, wp.x, wp.y);
      let guard = 0;
      while (wd < 24 && ai.path.length > 1 && guard++ < 8) {
        ai.path.shift();
        wp = ai.path[0];
        wd = dist(p.x, p.y, wp.x, wp.y);
      }
      if (wd > 12) {
        dirX = (wp.x - p.x) / wd;
        dirY = (wp.y - p.y) / wd;
      } else if (ai.path.length === 1) {
        ai.path = null;
      }
    }
  }

  // разделение с союзниками
  for (const a of game.players) {
    if (a === p || !a.alive) continue;
    const dd = dist(p.x, p.y, a.x, a.y);
    if (dd < p.radius * 2.4 && dd > 0.01) {
      dirX += ((p.x - a.x) / dd) * 0.55;
      dirY += ((p.y - a.y) / dd) * 0.55;
    }
  }

  // Ограничение скорости в бою: аккуратнее
  const len = Math.hypot(dirX, dirY);
  if (len > 1.8) {
    dirX /= len;
    dirY /= len;
  }

  p.moveX = dirX;
  p.moveY = dirY;
  p.angle = ai.aimEntityId ? ai.aimAngle : Math.atan2(dirY, dirX) || p.angle;

  // Выстрел
  if (ai.wantsFire && p.ammo > 0) {
    ai.reactionDelay -= dt;
    if (ai.reactionDelay <= 0) {
      const err = ai.aimErrorNow || 0;
      game.tryFire(p, ai.aimAngle + err);
      ai.reactionDelay = ai.diff.reaction * rand(0.5, 1.2);
    }
  } else {
    ai.reactionDelay = Math.max(0, ai.reactionDelay - dt * 0.5);
  }

  // Мяч: бот бьёт по воротам
  if (game.mode === 'brawlball' && p.carrying) {
    const goal = enemyGoal(game, p.team);
    const gd = dist(p.x, p.y, goal.x, goal.y);
    const ang = angleTo(p.x, p.y, goal.x, goal.y);
    p.angle = ang;
    const los = game.hasLineOfSight(p.x, p.y, goal.x, goal.y);
    let rate = 0;
    if (gd < 360) rate = 1.6;
    else if (gd < 520 && los) rate = 0.8;
    else if (los) rate = 0.22;
    if (rate > 0 && p.cooldown <= 0 && chance(dt * rate)) {
      const err = rand(-0.09, 0.09) + (1 - ai.diff.aimError * 3) * 0;
      game.tryFire(p, ang + err);
    }
  }
  // Супер у Lyuma на союзника
  if (ai.healTargetId && p.superCharge >= 100 && chance(dt * 0.8)) {
    game.useSuper(p, 0);
  }
}

export function updateBot(game, p, dt) {
  const ai = p.bot;
  if (!ai) return;
  ai.thinkTimer -= dt;
  ai.superWait = Math.max(0, (ai.superWait || 0) - dt);
  ai.gadgetWait = Math.max(0, (ai.gadgetWait || 0) - dt);
  ai.strafeTimer -= dt;
  if (ai.strafeTimer <= 0) {
    ai.strafeTimer = rand(1.4, 3.6);
    ai.strafeDir *= -1;
  }
  if (ai.thinkTimer <= 0) {
    ai.thinkTimer = ai.diff.reaction * rand(0.75, 1.3);
    if (!game.isPaused) think(game, p, ai);
  }
  executeMovement(game, p, ai, dt);
}
