import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sources = ['src/data.js', 'src/icons.js', 'src/learning.js', 'src/app.js'];

function toClassicScript(source) {
  return source
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/g, '')
    .replace(/export\s+(?=(?:const|let|function|class)\s)/g, '');
}

const bundle = sources.map((file) => `\n// ---- ${file} ----\n${toClassicScript(read(file))}`).join('\n');
const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');
let html = read('index.html');
let css = read('styles.css');
css = css.replace(/url\(['"]?(\.\/fonts\/[^)'" ]+)['"]?\)/g, (match, relativePath) => {
  const font = fs.readFileSync(path.join(root, relativePath)).toString('base64');
  return `url("data:font/woff2;base64,${font}")`;
});
html = html.replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="src/app.js"></script>', () => `<script>\n(() => {\n'use strict';\n${safeBundle}\n})();\n</script>`);

fs.mkdirSync(path.join(root, 'release'), { recursive: true });
fs.writeFileSync(path.join(root, 'release/Sana.html'), html);

const hash = crypto.createHash('sha256').update(html).update(read('sw.js')).digest('hex').slice(0, 12);
const worker = read('sw.js').replace(/const VERSION = '[^']+';/, `const VERSION = 'sana-${hash}';`);
fs.writeFileSync(path.join(root, 'sw.js'), worker);
console.log(`✓ release/Sana.html (${Math.round(Buffer.byteLength(html) / 1024)} КБ)`);
console.log(`✓ sw.js (кэш sana-${hash})`);
