// Проверка реальной инициализации приложения (main.js) в jsdom.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

const gradient = { addColorStop() {} };
function makeCtx(canvas) {
  const t = { canvas, measureText: () => ({ width: 40 }) };
  return new Proxy(t, {
    get(o, p) {
      if (p in o) return o[p];
      if (typeof p === 'string' && p.startsWith('create')) return () => gradient;
      return () => {};
    },
    set(o, p, v) {
      o[p] = v;
      return true;
    },
  });
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this.__ctx) this.__ctx = makeCtx(this);
  return this.__ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1440; } });
Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 810; } });

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.localStorage = window.localStorage;
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 8);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.matchMedia = window.matchMedia;

const errors = [];
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); origError(...a); };

await import('../src/main.js');
await new Promise((r) => setTimeout(r, 300));

const api = window.__brawl;
function assert(c, m) {
  if (!c) { console.error('❌', m); process.exitCode = 1; } else console.log('✓', m);
}
assert(!!api, 'Приложение инициализировано');
assert(document.getElementById('screen-home').classList.contains('hidden') === false, 'Главный экран виден');

// Играем матч через кнопку
document.getElementById('btn-play').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
assert(!!api.game, 'Матч создан по кнопке «В бой»');
assert(!document.getElementById('hud').classList.contains('hidden'), 'HUD включился');

// прогоняем кадры
await new Promise((r) => setTimeout(r, 5000));
const g = api.game;
assert(g && g.phase !== 'countdown', 'Отсчёт завершён, идёт бой');
assert(document.getElementById('hud-timer').textContent.length > 0, 'Таймер обновляется');
assert(Number(document.getElementById('hp-text').textContent) > 0, 'HP отображается');

// табло по Tab
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
assert(!document.getElementById('scoreboard').classList.contains('hidden'), 'Табло по Tab открывается');
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
await new Promise((r) => setTimeout(r, 200));

// пауза
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
assert(!document.getElementById('screen-pause').classList.contains('hidden'), 'Пауза по Esc');
document.getElementById('btn-resume').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
assert(document.getElementById('screen-pause').classList.contains('hidden'), 'Продолжение после паузы');

// завершение матча и сохранение
g.endMatch(0, 'test');
await new Promise((r) => setTimeout(r, 2600));
assert(!document.getElementById('screen-result').classList.contains('hidden'), 'Экран результата показан');
assert(api.save.matches >= 1, 'Матч записан в сохранение');
assert(JSON.parse(window.localStorage.getItem('brawlarena.save.v2')), 'Сохранение в localStorage');
document.getElementById('btn-menu').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
assert(!document.getElementById('screen-home').classList.contains('hidden'), 'Возврат в меню');

assert(errors.length === 0, 'Нет ошибок в консоли' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(process.exitCode ? '\nBOOTSTRAP FAIL' : '\nBOOTSTRAP OK');
process.exit(process.exitCode || 0);
