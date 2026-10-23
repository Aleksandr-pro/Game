// Тест проверки обновлений: веб-версия, APK с мостом, отсутствие сети.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;

let ok = true;
const check = (c, m) => { if (!c) { console.error('❌', m); ok = false; } else console.log('✓', m); };

const updateInfo = {
  versionCode: 500,
  versionName: '1.5.0',
  apkUrl: 'https://github.com/Aleksandr-pro/Game/releases/download/android-latest/BrawlArena.apk',
  sha256: 'abc',
  size: 5_200_000,
};
const release = {
  tag_name: 'android-latest',
  name: 'Brawl Arena — Android (последняя версия)',
  published_at: '2026-10-23T00:00:00Z',
  body: 'Что нового: APK',
  assets: [
    { name: 'BrawlArena.apk', browser_download_url: updateInfo.apkUrl, size: updateInfo.size },
    { name: 'update.json', browser_download_url: 'https://example.com/update.json' },
  ],
};

let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls++;
  const u = String(url);
  if (u.includes('api.github.com')) {
    return { ok: true, status: 200, text: async () => JSON.stringify(release) };
  }
  if (u.includes('update.json')) {
    return { ok: true, status: 200, text: async () => JSON.stringify(updateInfo) };
  }
  throw new Error('unexpected ' + u);
};

const updater = await import('../src/updater.js');

// --- веб-версия ---
check(updater.isAndroidApp() === false, 'Браузер определяется как веб-версия');
const web = await updater.checkForUpdate(true);
check(web.ok && web.latest.versionCode === 500, 'Веб: версия из релиза получена');
check(web.available === true, 'Веб: доступна версия из релиза');
check(web.latest.versionName === '1.5.0', 'Веб: имя версии из update.json');
check(updater.formatSize(web.latest.size).includes('МБ'), 'Размер APK форматируется');

// --- APK с мостом ---
const calls = [];
window.AndroidApp = {
  versionCode: () => 500,
  versionName: () => '1.5.0',
  httpGet: (url) => {
    calls.push(url);
    const id = calls.length;
    setTimeout(() => {
      const body = url.includes('api.github.com') ? JSON.stringify(release) : JSON.stringify(updateInfo);
      window.__androidHttp(id, 200, body);
    }, 0);
    return id;
  },
  downloadUpdate: (url) => calls.push('DOWNLOAD:' + url),
  openUrl: (url) => calls.push('OPEN:' + url),
};
localStorage.clear();
const app = await updater.checkForUpdate(true);
check(updater.isAndroidApp() === true, 'APK определяется через мост');
check(app.current.code === 500, 'APK: текущая версия из BuildConfig');
check(app.ok && app.latest.versionCode === 500, 'APK: данные обновления получены');
check(app.available === false, 'APK: обновлений нет — версии совпадают');
check(calls.some((u) => u.includes('api.github.com')), 'APK: запрос идёт через Java-мост');

// --- новая версия найдена ---
window.AndroidApp.versionCode = () => 420;
window.AndroidApp.versionName = () => '1.4.0';
localStorage.clear();
const newer = await updater.checkForUpdate(true);
check(newer.available === true, 'APK: новая сборка определяется как обновление');
check(newer.latest.versionCode > newer.current.code, 'APK: сравнение по versionCode');

// --- установка ---
calls.length = 0;
const where = updater.installApk(newer.latest.apkUrl);
check(where === 'android' && calls.some((c) => c.startsWith('DOWNLOAD:')), 'APK: обновление скачивается через DownloadManager-мост');

// --- кэш ---
localStorage.clear();
await updater.checkForUpdate(true);
const before = fetchCalls;
const cached = await updater.checkForUpdate(false);
check(cached.ok && cached.cached === true, 'Повторная проверка берётся из кэша');
check(fetchCalls === before, 'Кэш не делает лишних запросов');

// --- офлайн ---
globalThis.fetch = async () => { throw new Error('нет сети'); };
delete window.AndroidApp;
localStorage.clear();
const offline = await updater.checkForUpdate(true);
check(offline.ok === false && !!offline.error, 'Без сети возвращается ошибка, а не падение');

console.log(ok ? '\nUPDATER OK' : '\nUPDATER FAIL');
process.exit(ok ? 0 : 1);
