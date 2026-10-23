// Сборка офлайн-версии: вся игра в одном HTML-файле.
// Результат — release/BrawlArena.html, открывается двойным щелчком без сервера.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
});

let js = result.outputFiles[0].text;
// безопасно встраиваем в <script>
js = js.replace(/<\/script/gi, '<\\/script');

const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// убираем внешние зависимости, которые не нужны офлайн
html = html
  .replace(/^\s*<link rel="manifest"[^>]*>\s*$/m, '')
  .replace(/^\s*<link rel="apple-touch-icon"[^>]*>\s*$/m, '')
  .replace(/^\s*<link rel="stylesheet" href="styles\.css"[^>]*>\s*$/m, '')
  .replace(/^\s*<script type="module" src="src\/main\.js"><\/script>\s*$/m, '')
  .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ctext y=%27.9em%27 font-size=%2790%27%3E%E2%9A%A1%3C/text%3E%3C/svg%3E" />')
  .replace('<title>Brawl Arena — 3 на 3</title>', '<title>Brawl Arena — 3 на 3 (офлайн)</title>');

if (html.includes('src/main.js')) {
  throw new Error('Не удалось вырезать подключение модуля из index.html');
}

html = html.replace(
  '</head>',
  `  <style>\n${css}\n  </style>\n</head>`
);
html = html.replace(
  '</body>',
  `  <script>\n${js}\n  </script>\n</body>`
);

// офлайн-файл не должен пытаться ставить service worker (нет http) — код уже проверяет протокол

const outFile = path.join(outDir, 'BrawlArena.html');
fs.writeFileSync(outFile, html);

const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ release/BrawlArena.html — ${sizeKb} КБ, один файл, работает без сервера`);

fs.writeFileSync(
  path.join(outDir, 'КАК-ИГРАТЬ.txt'),
  `BRAWL ARENA — офлайн-версия
==========================

1. Скачайте BrawlArena.html
2. Откройте файл двойным щелчком (или перетащите в окно браузера)
3. Играйте — интернет не нужен

Управление на ПК:
  WASD / стрелки — движение
  мышь           — прицел
  ЛКМ            — выстрел (удерживайте для очереди)
  ПКМ / Space    — суперспособность
  Q              — гаджет
  Tab            — табло матча
  Esc            — пауза

На телефоне:
  левый стик  — движение
  правый стик — прицел, отпустите для выстрела
  тап         — выстрел с автоприцелом
  кнопки справа внизу — супер и гаджет

Прогресс (кубки, победы, настройки) сохраняется в браузере.

Онлайн-версия с установкой как приложение: index.html из репозитория игры.
`
);
console.log('✓ release/КАК-ИГРАТЬ.txt');
