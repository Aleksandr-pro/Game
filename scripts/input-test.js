// Тест ввода: клик мышью, удержание, стики, клавиши.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.performance = { now: () => Date.now() };

const gradient = { addColorStop() {} };
function makeCtx() { return new Proxy({}, { get: () => () => gradient, set: () => true }); }
window.HTMLCanvasElement.prototype.getContext = () => makeCtx();
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 810 });
window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
window.HTMLCanvasElement.prototype.releasePointerCapture = () => {};

const { Input } = await import('../src/input.js');
let ok = true;
const check = (c, m) => { if (!c) { console.error('❌', m); ok = false; } else console.log('✓', m); };

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const input = new Input(canvas);

function pointer(type, x, y, extra = {}) {
  const e = new window.MouseEvent(type.replace('pointer', 'pointer'), { bubbles: true, clientX: x, clientY: y, ...extra });
  Object.defineProperty(e, 'pointerType', { value: extra.pointerType || 'mouse' });
  Object.defineProperty(e, 'pointerId', { value: extra.pointerId ?? 1 });
  return e;
}

// Клик мышью = один выстрел на отпускании
canvas.dispatchEvent(pointer('pointerdown', 900, 300));
window.dispatchEvent(pointer('pointerup', 900, 300));
let shots = input.takeShots();
check(shots.length === 1 && shots[0].sx === 900, 'Клик мышью даёт выстрел с координатами');

// Удержание = очередь
canvas.dispatchEvent(pointer('pointerdown', 800, 400));
for (let i = 0; i < 30; i++) input.update(1 / 60);
check(input.takeShots().length >= 1, 'Удержание ЛКМ даёт очередь выстрелов');
window.dispatchEvent(pointer('pointerup', 800, 400));
input.takeShots();

// Движение WASD
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'd' }));
input.update(1 / 60);
check(input.moveVec.x > 0.9, 'Клавиша D двигает вправо');
window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'd' }));
input.update(1 / 60);
check(Math.abs(input.moveVec.x) < 0.01, 'Клавиша отпущена — движение остановлено');

// Супер и гаджет
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }));
check(input.takeSuper() === true, 'Space ставит супер в очередь');
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q' }));
check(input.takeGadget() === true, 'Q ставит гаджет в очередь');
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
check(input.takePause() === true, 'Esc ставит паузу в очередь');

// Тач-стики
canvas.dispatchEvent(pointer('pointerdown', 200, 700, { pointerType: 'touch', pointerId: 7 }));
window.dispatchEvent(pointer('pointermove', 260, 700, { pointerType: 'touch', pointerId: 7 }));
input.update(1 / 60);
check(input.moveVec.x > 0.5, 'Левый стик двигает вправо');
window.dispatchEvent(pointer('pointerup', 260, 700, { pointerType: 'touch', pointerId: 7 }));
input.update(1 / 60);

canvas.dispatchEvent(pointer('pointerdown', 1200, 700, { pointerType: 'touch', pointerId: 8 }));
window.dispatchEvent(pointer('pointermove', 1200, 620, { pointerType: 'touch', pointerId: 8 }));
input.update(1 / 60);
check(Math.abs(input.aimVec.y + 1) < 0.2, 'Правый стик целится вверх');
window.dispatchEvent(pointer('pointerup', 1200, 620, { pointerType: 'touch', pointerId: 8 }));
shots = input.takeShots();
check(shots.length === 1 && typeof shots[0].angle === 'number', 'Отпускание правого стика — выстрел по направлению');

// Тап = автоприцел
canvas.dispatchEvent(pointer('pointerdown', 1100, 720, { pointerType: 'touch', pointerId: 9 }));
window.dispatchEvent(pointer('pointerup', 1100, 720, { pointerType: 'touch', pointerId: 9 }));
shots = input.takeShots();
check(shots.length === 1 && shots[0].auto === true, 'Тап = выстрел с автоприцелом');

// reset
input.reset();
for (let i = 0; i < 5; i++) input.update(1 / 60);
check(input.takeShots().length === 0 && Math.abs(input.moveVec.x) < 0.01, 'reset() очищает состояние');

console.log(ok ? '\nINPUT OK' : '\nINPUT FAIL');
process.exit(ok ? 0 : 1);
