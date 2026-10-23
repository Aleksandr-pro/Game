// Тест интерфейса в jsdom: проверяем сборку экранов, HUD и переходы.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

const gradient = { addColorStop() {} };
function makeCtx(canvas) {
  const target = { canvas, measureText: () => ({ width: 40 }) };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'string' && prop.startsWith('create')) return () => gradient;
      return () => {};
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this.__ctx) this.__ctx = makeCtx(this);
  return this.__ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Image = window.Image;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;

const { UI } = await import('../src/ui.js');
const { Game } = await import('../src/game.js');
const { audio } = await import('../src/audio.js');
const { DEFAULT_SAVE, DEFAULT_SETTINGS, BRAWLERS } = await import('../src/config.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('❌', msg);
    process.exitCode = 1;
  } else {
    console.log('✓', msg);
  }
}

const save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
save.trophies = 123;
save.matches = 10;
save.wins = 6;
save.streak = 2;

const ui = new UI({
  save,
  settings: save.settings,
  audio,
  onPlay: () => {},
  onSelectBrawler: (id) => {
    save.selectedBrawler = id;
  },
  onSelectMode: (id) => {
    save.selectedMode = id;
    ui.updateHome();
  },
  onSettingsChange: () => {},
  onSoundToggle: () => {},
  onPauseClick: () => {},
  onResume: () => {},
  onLeave: () => {},
  onAgain: () => {},
  onMenu: () => {},
});

assert(document.querySelectorAll('.mode-card').length === 3, 'Три карточки режимов');
assert(document.querySelectorAll('.diff-btn').length === 3, 'Три кнопки сложности');
assert(document.getElementById('hero-name').textContent === 'Блейз', 'Имя героя на главной');
assert(document.getElementById('home-trophies').textContent === '123', 'Кубки отображаются');
assert((document.getElementById('map-preview').dataset.name || '').length > 3, 'Превью карты');

ui.openBrawlers();
assert(document.querySelectorAll('.brawler-card').length === BRAWLERS.length, 'Все бравлеры в меню');
ui.tick(1.2);
ui.selectBrawler('mira');
assert(save.selectedBrawler === 'mira', 'Бравлер выбирается');
assert(document.getElementById('hero-name').textContent === 'Мира', 'Главная обновилась после выбора');
ui._showBrawlerDetail('mira');

// Режимы
document.querySelector('.mode-card[data-mode="bounty"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert(save.selectedMode === 'bounty', 'Режим переключается');
ui.updateHome();
assert(document.getElementById('play-mode-name').textContent === 'Награда', 'Описание режима обновилось');

// Сложность
document.querySelector('.diff-btn[data-diff="hard"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert(save.settings.difficulty === 'hard', 'Сложность переключается');

class FakeInput {
  constructor() {
    this.moveVec = { x: 0, y: 0 };
    this.pointer = { x: 800, y: 450, inside: true, type: 'mouse' };
    this.isTouch = false;
    this.aimStick = null;
    this.aiming = false;
    this.shots = [];
    this.queue = { super: false, gadget: false };
  }
  update() {}
  takeShots() {
    const s = this.shots;
    this.shots = [];
    return s;
  }
  takeSuper() {
    const v = this.queue.super;
    this.queue.super = false;
    return v;
  }
  takeGadget() {
    const v = this.queue.gadget;
    this.queue.gadget = false;
    return v;
  }
  takePause() {
    return false;
  }
  queueSuper() {
    this.queue.super = true;
  }
  queueGadget() {
    this.queue.gadget = true;
  }
  stickVector() {
    return null;
  }
  reset() {}
}

const input = new FakeInput();
ui.setInput(input);

let ended = null;
const game = new Game({
  mode: 'gemgrab',
  playerBrawlerId: 'mira',
  difficulty: 'normal',
  settings: save.settings,
  input,
  onEnd: (r) => {
    ended = r;
  },
});
ui.startGameUI(game, input);
assert(!document.getElementById('hud').classList.contains('hidden'), 'HUD показан');
assert(document.getElementById('screen-home').classList.contains('hidden'), 'Главный экран скрыт');
assert(document.getElementById('ammo-pips').children.length === 3, 'Патроны отрисованы');
assert(document.getElementById('hud-brawler-name').textContent.includes('Мира'), 'Имя бравлера в HUD');

const cam = { zoom: 0.85, cx: 1080, cy: 680, viewW: 1600 / 0.85, viewH: 900 / 0.85 };
let errors = 0;
for (let i = 0; i < 400; i++) {
  try {
    game.update(1 / 60, cam);
    ui.updateHud(game);
    if (i % 10 === 0) ui.tick(i / 60);
  } catch (e) {
    errors++;
    console.error('HUD frame error', e);
    if (errors > 2) throw e;
  }
}
assert(errors === 0, 'HUD обновляется без ошибок');
assert(document.getElementById('hud-timer').textContent.match(/^\d:\d\d$/), 'Таймер в формате м:сс');
assert(document.getElementById('hp-fill').style.width.endsWith('%'), 'Полоса здоровья обновилась');

// Начисляем супер и проверяем кнопку
game.player.superCharge = 100;
game.player.gadgetCooldown = 0;
ui.updateHud(game);
assert(document.getElementById('btn-super').classList.contains('ready'), 'Кнопка супера активируется');
assert(document.getElementById('super-pct').textContent === '100%', 'Процент супера');

// Кнопки способностей прокидывают ввод
document.getElementById('btn-super').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
assert(input.queue.super === true, 'Кнопка супера отправляет ввод');
document.getElementById('btn-gadget').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
assert(input.queue.gadget === true, 'Кнопка гаджета отправляет ввод');

// Баннер
game.banner = { text: 'ГОЛ!', sub: 'Синие забивают', life: 2, color: '#fff' };
ui.updateHud(game);
assert(document.getElementById('banner-text').textContent === 'ГОЛ!', 'Баннер отображается');

// Результат
game.endMatch(0, 'test');
assert(game.result, 'Результат матча сформирован');
game.result.stats.goals = 1;
ui.showResult(game.result, 10);
assert(document.getElementById('result-title').textContent === 'ПОБЕДА', 'Экран победы');
assert(document.getElementById('result-score').textContent.includes(':'), 'Счёт на экране результата');
assert(document.getElementById('result-trophy').textContent.includes('10'), 'Кубки на экране результата');
ui.showHome();
assert(!document.getElementById('screen-home').classList.contains('hidden'), 'Возврат в меню');
assert(document.getElementById('hud').classList.contains('hidden'), 'HUD скрыт в меню');

// Пауза
ui.showPause(true);
assert(!document.getElementById('screen-pause').classList.contains('hidden'), 'Экран паузы');
ui.showPause(false);

// Настройки
document.getElementById('set-assist').checked = false;
document.getElementById('set-assist').dispatchEvent(new window.Event('change', { bubbles: true }));
assert(save.settings.aimAssist === false, 'Настройка прицеливания сохраняется');
document.getElementById('set-music').value = '10';
document.getElementById('set-music').dispatchEvent(new window.Event('input', { bubbles: true }));
assert(Math.abs(save.settings.music - 0.1) < 1e-6, 'Громкость музыки сохраняется');

ui.tick(3.4);
console.log(process.exitCode ? '\nЕСТЬ ОШИБКИ UI' : '\nUI OK');
