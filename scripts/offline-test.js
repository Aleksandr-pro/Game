import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'pipe' });
const html = fs.readFileSync('release/Sana.html', 'utf8');
assert.ok(html.includes('<style>'), 'CSS должен быть встроен');
assert.ok(html.includes("(() => {\n'use strict'"), 'JS должен быть встроен');
assert.ok(!html.includes('<script type="module" src="src/app.js">'), 'Офлайн-файл не должен зависеть от ES-модулей');
assert.ok(!/export\s+(?:const|function)/.test(html), 'В офлайн-бандле не должно быть export');
assert.ok(html.includes('data:font/woff2;base64,'), 'Шрифты должны быть встроены в автономный HTML');
assert.ok(!html.includes("url('./fonts/"), 'Автономный HTML не должен зависеть от внешних шрифтов');

const dom = new JSDOM(html, {
  url: 'https://sana.local/',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.ok(dom.window.document.querySelector('#main-content').textContent.includes('Твой персональный план готов'));
assert.equal(dom.window.document.querySelectorAll('.side-nav .nav-item').length, 4);
dom.window.close();
console.log('✓ Офлайн HTML собирается и запускается без внешних JS/CSS-файлов');
