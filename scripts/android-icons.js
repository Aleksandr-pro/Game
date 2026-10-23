// Готовит иконки Android-приложения из общих иконок игры.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = process.cwd();
const res = path.join(root, 'android/app/src/main/res');

const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const legacy = await loadImage(path.join(root, 'icons/icon-512.png'));
const maskable = await loadImage(path.join(root, 'icons/icon-maskable-512.png'));

function resize(img, size, file) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, size, size);
  fs.writeFileSync(file, c.toBuffer('image/png'));
}

for (const [density, scale] of DENSITIES) {
  const dir = path.join(res, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  // обычная иконка: 48dp
  resize(legacy, Math.round(48 * scale), path.join(dir, 'ic_launcher.png'));
  // адаптивная иконка (foreground): 108dp, рисунок уже с отступами
  resize(maskable, Math.round(108 * scale), path.join(dir, 'ic_launcher_foreground.png'));
  console.log(`✓ mipmap-${density}`);
}

const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptive);
console.log('✓ mipmap-anydpi-v26/ic_launcher.xml');
