// Точка входа: загрузка сохранения, игровой цикл, смена экранов.
import { UI } from './ui.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { BRAWLER_BY_ID, DEFAULT_SAVE, DEFAULT_SETTINGS, MODES } from './config.js';

const SAVE_KEY = 'brawlarena.save.v2';

function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (_) {}
  const save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.assign(save, parsed);
      save.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      if (!MODES[save.selectedMode]) save.selectedMode = 'gemgrab';
      if (!BRAWLER_BY_ID[save.selectedBrawler]) save.selectedBrawler = 'blaze';
      if (!save.records) save.records = {};
    } catch (_) {}
  }
  if (!save.records) save.records = {};
  return save;
}

function persist(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (_) {}
}

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const save = loadSave();

let game = null;
let paused = false;
let gameOver = false;
let matchEnded = false;

const ui = new UI({
  save,
  settings: save.settings,
  audio,
  onPlay: () => startMatch(),
  onSelectBrawler: (id) => {
    save.selectedBrawler = id;
    persist(save);
  },
  onSelectMode: (id) => {
    save.selectedMode = id;
    persist(save);
    ui.updateHome();
  },
  onSettingsChange: () => {
    persist(save);
  },
  onSoundToggle: () => {
    const muted = save.settings.sfx <= 0.001 && save.settings.music <= 0.001;
    if (muted) {
      save.settings.sfx = 0.7;
      save.settings.music = 0.35;
      ui.toast('Звук включён');
    } else {
      save.settings.sfx = 0;
      save.settings.music = 0;
      ui.toast('Звук выключен');
    }
    audio.setSfxVolume(save.settings.sfx);
    audio.setMusicVolume(save.settings.music);
    ui.refreshSettingsUI();
    persist(save);
    audio.play('click');
  },
  onPauseClick: () => togglePause(),
  onResume: () => togglePause(false),
  onLeave: () => leaveMatch(),
  onAgain: () => startMatch(),
  onMenu: () => goMenu(),
});
ui.setInput(input);

audio.setSfxVolume(save.settings.sfx);
audio.setMusicVolume(save.settings.music);
ui.refreshSettingsUI();

// Первый жест включает звук в браузере
function firstGesture() {
  audio.resume();
  audio.startMusic();
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !gameOver && !paused) togglePause(true);
});

function startMatch() {
  audio.resume();
  audio.startMusic();
  if (game) {
    game = null;
  }
  ui.hideResult();
  ui.showPause(false);
  matchEnded = false;
  gameOver = false;
  paused = false;
  input.reset();
  input.isTouch = document.body.classList.contains('touch') || input.isTouch;
  game = new Game({
    mode: save.selectedMode,
    playerBrawlerId: save.selectedBrawler,
    difficulty: save.settings.difficulty || 'normal',
    settings: save.settings,
    input,
    onEnd: handleMatchEnd,
  });
  game.paused = false;
  ui.startGameUI(game, input);
  ui.toast(`Карта: ${game.map.name} · ${MODES[save.selectedMode].name}`);
  if ((save.matches || 0) === 0) {
    setTimeout(() => {
      ui.toast('WASD — движение · ЛКМ — выстрел · ПКМ/Space — супер · Q — гаджет');
    }, 2200);
  }
}

function handleMatchEnd(result) {
  if (matchEnded) return;
  matchEnded = true;
  gameOver = true;
  game.paused = true;
  paused = false;
  ui.showPause(false);

  // Награды
  let delta = result.win ? 10 : result.draw ? 3 : -2;
  if (result.win) {
    save.streak = (save.streak || 0) + 1;
    const bonus = Math.min(8, Math.max(0, (save.streak - 1) * 2));
    delta += bonus;
  } else if (result.lose) {
    save.streak = 0;
  }
  if (save.streak > (save.bestStreak || 0)) save.bestStreak = save.streak;
  const before = save.trophies || 0;
  save.trophies = Math.max(0, before + delta);
  const applied = save.trophies - before;

  save.matches = (save.matches || 0) + 1;
  if (result.win) save.wins = (save.wins || 0) + 1;
  else if (result.lose) save.losses = (save.losses || 0) + 1;

  const rec = save.records[save.selectedBrawler] || { matches: 0, wins: 0, kills: 0, damage: 0 };
  rec.matches += 1;
  if (result.win) rec.wins += 1;
  rec.kills += result.stats.kills || 0;
  rec.damage += Math.round(result.stats.damage || 0);
  save.records[save.selectedBrawler] = rec;
  persist(save);
  ui.updateHome();
  ui.showResult(result, applied);
}

function togglePause(force) {
  if (!game || gameOver) return;
  const next = typeof force === 'boolean' ? force : !paused;
  paused = next;
  game.paused = paused;
  ui.showPause(paused);
  if (paused) audio.play('click');
}

function leaveMatch() {
  game = null;
  gameOver = false;
  paused = false;
  matchEnded = false;
  input.reset();
  ui.showPause(false);
  ui.showHome();
}

function goMenu() {
  game = null;
  gameOver = false;
  paused = false;
  matchEnded = false;
  input.reset();
  ui.hideResult();
  ui.showHome();
}

// Закрытие оверлеев по Esc вне боя
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Сначала закрываем открытые оверлеи; паузу в бою обрабатывает Input
    for (const id of ['screen-settings', 'screen-help', 'screen-brawlers']) {
      const node = document.getElementById(id);
      if (node && !node.classList.contains('hidden')) {
        node.classList.add('hidden');
        return;
      }
    }
  }
});

// Двойной клик по канвасу не должен выделять элементы
canvas.addEventListener('dblclick', (e) => e.preventDefault());

let lastTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const time = now / 1000;

  ui.tick(time);

  if (game) {
    if (input.takePause() && !gameOver) togglePause();
    if (input.takeStats() && !gameOver && !paused) ui.toggleScoreboard();
    if (!paused && !gameOver) {
      const cam = renderer.computeCamera(game);
      game.update(dt, cam);
    }
    renderer.render(game);
    ui.updateHud(game);
    if (!gameOver) {
      // плавное обновление интерфейса
    }
  }

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    ui.setFps(Math.round(fpsFrames / fpsAccum));
    fpsAccum = 0;
    fpsFrames = 0;
  }

  requestAnimationFrame(frame);
}

renderer.resize();
requestAnimationFrame(frame);

// Публичный доступ для отладки
window.__brawl = {
  get game() {
    return game;
  },
  save,
  ui,
  renderer,
  startMatch,
};
