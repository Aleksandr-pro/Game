import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

const output = path.join(process.cwd(), 'icons');
fs.mkdirSync(output, { recursive: true });

function drawIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2b775c');
  gradient.addColorStop(1, '#174c3b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.arc(size * 0.87, size * 0.12, size * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.1, size * 0.94, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  const scale = maskable ? 0.82 : 1;
  ctx.save();
  ctx.translate(size * (1 - scale) / 2, size * (1 - scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.078;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.24, size * 0.69);
  ctx.lineTo(size * 0.41, size * 0.69);
  ctx.lineTo(size * 0.41, size * 0.52);
  ctx.lineTo(size * 0.58, size * 0.52);
  ctx.lineTo(size * 0.58, size * 0.35);
  ctx.lineTo(size * 0.76, size * 0.35);
  ctx.stroke();
  ctx.fillStyle = '#dff47b';
  ctx.beginPath();
  ctx.arc(size * 0.27, size * 0.3, size * 0.067, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return canvas;
}

function save(size, name, maskable = false) {
  fs.writeFileSync(path.join(output, name), drawIcon(size, maskable).toBuffer('image/png'));
  console.log(`✓ icons/${name} (${size}×${size})`);
}

save(192, 'icon-192.png');
save(512, 'icon-512.png');
save(512, 'icon-maskable-512.png', true);
save(180, 'apple-touch-icon.png');
save(64, 'favicon-64.png');
