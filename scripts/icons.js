// Генерация иконок приложения (PWA / установка на домашний экран).
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

const OUT = path.join(process.cwd(), 'icons');
fs.mkdirSync(OUT, { recursive: true });

function drawIcon(size, { maskable = false } = {}) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  const S = size;
  const pad = maskable ? S * 0.1 : 0;

  // фон
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, '#101b30');
  bg.addColorStop(0.55, '#16233d');
  bg.addColorStop(1, '#2a1740');
  g.fillStyle = bg;
  if (maskable) {
    g.fillRect(0, 0, S, S);
  } else {
    const r = S * 0.22;
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(S, 0, S, S, r);
    g.arcTo(S, S, 0, S, r);
    g.arcTo(0, S, 0, 0, r);
    g.arcTo(0, 0, S, 0, r);
    g.closePath();
    g.fill();
  }

  // сияние
  const glow = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.45, S * 0.62);
  glow.addColorStop(0, 'rgba(255, 190, 60, 0.38)');
  glow.addColorStop(0.45, 'rgba(120, 110, 255, 0.16)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S * 0.5;
  const R = (S - pad * 2) * 0.3;

  // кольцо арены
  g.strokeStyle = 'rgba(124, 224, 255, 0.55)';
  g.lineWidth = S * 0.03;
  g.beginPath();
  g.ellipse(cx, cy + R * 0.92, R * 1.12, R * 0.34, 0, 0, Math.PI * 2);
  g.stroke();

  // тело
  const body = g.createLinearGradient(cx - R, cy, cx + R, cy + R);
  body.addColorStop(0, '#ff8a3d');
  body.addColorStop(0.55, '#ff5d3a');
  body.addColorStop(1, '#c02f22');
  g.fillStyle = body;
  const bw = R * 1.5;
  const bh = R * 1.25;
  g.beginPath();
  g.roundRect(cx - bw / 2, cy + R * 0.12, bw, bh, R * 0.45);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = S * 0.012;
  g.stroke();

  // голова
  const headR = R * 0.78;
  const headY = cy - R * 0.5;
  const head = g.createRadialGradient(cx - headR * 0.35, headY - headR * 0.45, headR * 0.12, cx, headY, headR * 1.2);
  head.addColorStop(0, '#ffd66b');
  head.addColorStop(1, '#f0a52a');
  g.fillStyle = head;
  g.beginPath();
  g.arc(cx, headY, headR, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.32)';
  g.lineWidth = S * 0.012;
  g.stroke();

  // рожки
  g.fillStyle = '#ffd166';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * headR * 0.52, headY - headR * 0.62);
    g.lineTo(cx + s * headR * 0.95, headY - headR * 1.5);
    g.lineTo(cx + s * headR * 0.2, headY - headR * 0.8);
    g.closePath();
    g.fill();
  }

  // визор и глаза
  g.fillStyle = '#0c1522';
  g.beginPath();
  g.roundRect(cx - headR * 0.72, headY - headR * 0.26, headR * 1.44, headR * 0.62, headR * 0.3);
  g.fill();
  g.fillStyle = '#9ef6ff';
  g.shadowColor = '#9ef6ff';
  g.shadowBlur = S * 0.045;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * headR * 0.3, headY + headR * 0.06, headR * 0.11, headR * 0.15, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;

  // эмблема
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.arc(cx, cy + R * 0.72, R * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#38a3ff';
  g.beginPath();
  g.arc(cx, cy + R * 0.72, R * 0.09, 0, Math.PI * 2);
  g.fill();

  // молния
  if (!maskable) {
    g.save();
    g.translate(S * 0.79, S * 0.2);
    g.rotate(0.2);
    g.fillStyle = '#ffd54a';
    g.shadowColor = 'rgba(255, 200, 60, 0.9)';
    g.shadowBlur = S * 0.05;
    const q = S * 0.038;
    g.beginPath();
    g.moveTo(q * 0.6, -q * 3.1);
    g.lineTo(-q * 1.5, q * 0.4);
    g.lineTo(-q * 0.1, q * 0.4);
    g.lineTo(-q * 0.9, q * 3.1);
    g.lineTo(q * 1.6, -q * 0.4);
    g.lineTo(q * 0.1, -q * 0.4);
    g.closePath();
    g.fill();
    g.restore();
  }
  return c;
}

function save(size, name, opts) {
  const c = drawIcon(size, opts);
  fs.writeFileSync(path.join(OUT, name), c.toBuffer('image/png'));
  console.log(`✓ icons/${name} (${size}×${size})`);
}

save(192, 'icon-192.png');
save(512, 'icon-512.png');
save(512, 'icon-maskable-512.png', { maskable: true });
save(180, 'apple-touch-icon.png');
save(64, 'favicon-64.png');
