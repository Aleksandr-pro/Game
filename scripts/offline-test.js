// Проверка офлайн-сборки: один HTML-файл должен запускать игру без сервера.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const file = path.join(process.cwd(), 'release/BrawlArena.html');
let ok = true;
const check = (c, m) => { if (!c) { console.error('❌', m); ok = false; } else console.log('✓', m); };

check(fs.existsSync(file), 'Файл release/BrawlArena.html собран');
const html = fs.readFileSync(file, 'utf8');
check(!/src="src\/main\.js"/.test(html), 'В сборке нет внешних модулей');
check(!/href="styles\.css"/.test(html), 'CSS встроен в файл');
check(html.includes('<script>') && html.includes('</script>'), 'JS встроен в файл');
check(!/rel="manifest"/.test(html), 'Офлайн-сборка не зависит от манифеста');
check(html.length < 1_500_000, `Размер разумный (${Math.round(html.length / 1024)} КБ)`);

// Манифест
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
check(manifest.name && manifest.icons.length >= 3, 'Манифест валиден, иконки объявлены');
for (const icon of manifest.icons) {
  check(fs.existsSync(icon.src), `Иконка на месте: ${icon.src}`);
}
check(fs.existsSync('icons/apple-touch-icon.png'), 'Иконка для iOS');
check(fs.existsSync('sw.js') && /brawl-arena-[0-9a-f]{10}/.test(fs.readFileSync('sw.js', 'utf8')), 'Service worker с версией');

// Запуск сборки в jsdom
const errors = [];
const dom = new JSDOM(html, {
  url: 'file:///home/user/BrawlArena.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    const gradient = { addColorStop() {} };
    const makeCtx = (canvas) => new Proxy({ canvas, measureText: () => ({ width: 40 }) }, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p === 'string' && p.startsWith('create')) return () => gradient;
        return () => {};
      },
      set(t, p, v) { t[p] = v; return true; },
    });
    window.HTMLCanvasElement.prototype.getContext = function () {
      if (!this.__ctx) this.__ctx = makeCtx(this);
      return this.__ctx;
    };
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return 1280; } });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return 720; } });
    window.performance.now = () => Date.now();
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 8);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    window.addEventListener('error', (e) => errors.push(e.message));
    window.console.error = (...a) => errors.push(a.join(' '));
  },
});

await new Promise((r) => setTimeout(r, 400));
const win = dom.window;
check(!!win.__brawl, 'Игра инициализировалась из одного файла');
check(!win.document.getElementById('screen-home').classList.contains('hidden'), 'Главный экран отрисован');

win.document.getElementById('btn-play').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 3500));
const g = win.__brawl.game;
check(!!g, 'Матч запускается кнопкой «В бой»');
check(g && g.players.length === 6, 'На арене 6 бойцов');
check(g && g.time > 0.5, 'Игровой цикл идёт');
check(!win.document.getElementById('hud').classList.contains('hidden'), 'HUD активен');

// Модальное окно скачивания
win.document.getElementById('btn-download').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
check(!win.document.getElementById('screen-download').classList.contains('hidden'), 'Окно «Скачать игру» открывается');
const link = win.document.querySelector('#screen-download a[download]');
check(!!link && link.getAttribute('href').includes('BrawlArena.html'), 'Ссылка на скачивание офлайн-версии есть');
const apk = win.document.getElementById('apk-download');
check(!!apk && apk.getAttribute('href').includes('/releases/download/android-latest/BrawlArena.apk'), 'Ссылка на APK ведёт в постоянный релиз');
check(!!win.document.getElementById('check-update'), 'Кнопка проверки обновлений в окне скачивания');
check(/^v/.test(win.document.getElementById('app-version').textContent.trim()), 'Версия игры показана внизу экрана');

check(errors.length === 0, 'Нет ошибок при запуске' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(ok ? '\nOFFLINE OK' : '\nOFFLINE FAIL');
process.exit(ok ? 0 : 1);
