// Проверка обновлений Android-приложения через GitHub Releases.
//
// В APK данные о текущей версии приходят из Java-моста (window.AndroidApp).
// В браузере версии нет — показываем только ссылку на скачивание.
const REPO = 'Aleksandr-pro/Game';
const RELEASE_TAG = 'android-latest';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/tag/${RELEASE_TAG}`;
export const APK_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/BrawlArena.apk`;
const API_TAG_URL = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
const CACHE_KEY = 'brawlarena.updateCheck.v1';
const CHECK_INTERVAL = 1000 * 60 * 60 * 6; // не чаще раза в 6 часов

// Версия игры из сборки (подставляется esbuild при npm run build)
export const APP_VERSION = (() => {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  } catch (_) {
    return 'dev';
  }
})();

const bridge = () => (typeof window !== 'undefined' ? window.AndroidApp : null);

export function isAndroidApp() {
  const b = bridge();
  try {
    return !!(b && typeof b.versionCode === 'function');
  } catch (_) {
    return false;
  }
}

export function getCurrentVersion() {
  const b = bridge();
  if (!b) return { platform: 'web', code: 0, name: '' };
  try {
    return {
      platform: 'android',
      code: Number(b.versionCode()) || 0,
      name: String(b.versionName() || ''),
    };
  } catch (_) {
    return { platform: 'android', code: 0, name: '' };
  }
}

// ---------- HTTP ----------
// В APK страница открыта как file://, поэтому обычный fetch может упереться в CORS.
// Тогда используем Java-мост — он ходит в сеть без ограничений браузера.
let httpSeq = 1;
const httpWaiters = new Map();

if (typeof window !== 'undefined') {
  window.__androidHttp = (id, status, body) => {
    const waiter = httpWaiters.get(id);
    if (!waiter) return;
    httpWaiters.delete(id);
    clearTimeout(waiter.timer);
    if (status >= 200 && status < 300) waiter.resolve(body);
    else waiter.reject(new Error(`HTTP ${status}`));
  };
}

function bridgeGet(url) {
  const b = bridge();
  if (!b || typeof b.httpGet !== 'function') return Promise.reject(new Error('нет моста'));
  return new Promise((resolve, reject) => {
    let id;
    try {
      id = b.httpGet(url, 'application/vnd.github+json');
    } catch (e) {
      reject(e);
      return;
    }
    if (!id) {
      reject(new Error('мост недоступен'));
      return;
    }
    const timer = setTimeout(() => {
      httpWaiters.delete(id);
      reject(new Error('таймаут'));
    }, 13000);
    httpWaiters.set(id, { resolve, reject, timer });
  });
}

async function fetchText(url, timeoutMs = 9000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      signal: controller ? controller.signal : undefined,
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getJson(url) {
  const errors = [];
  // сначала мост Android (надёжнее для file://), затем обычный fetch
  if (isAndroidApp()) {
    try {
      return JSON.parse(await bridgeGet(url));
    } catch (e) {
      errors.push(e.message);
    }
  }
  try {
    return JSON.parse(await fetchText(url));
  } catch (e) {
    errors.push(e.message);
  }
  throw new Error(errors.join(' / ') || 'нет связи');
}

// ---------- Проверка ----------
export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (_) {}
}

/**
 * Возвращает { ok, available, current, latest, error }.
 * Никогда не бросает исключение — сеть может быть недоступна.
 */
export async function checkForUpdate(force = false) {
  const current = getCurrentVersion();
  const cached = readCache();
  if (!force && cached && Date.now() - (cached.checkedAt || 0) < CHECK_INTERVAL && cached.latest) {
    return {
      ok: true,
      available: cached.latest.versionCode > current.code,
      current,
      latest: cached.latest,
      cached: true,
      error: null,
    };
  }

  try {
    const release = await getJson(API_TAG_URL);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const findAsset = (name) => assets.find((a) => a.name === name);

    // Основной источник данных — update.json рядом с APK
    let info = null;
    const updateAsset = findAsset('update.json');
    if (updateAsset && updateAsset.browser_download_url) {
      try {
        const raw = isAndroidApp()
          ? await bridgeGet(updateAsset.browser_download_url)
          : await fetchText(updateAsset.browser_download_url);
        info = JSON.parse(raw);
      } catch (_) {
        info = null;
      }
    }

    const apkAsset = findAsset('BrawlArena.apk');
    const latest = {
      versionCode: Number(info?.versionCode) || parseBuildFromTag(release.tag_name) || 0,
      versionName: info?.versionName || release.name || '',
      apkUrl: apkAsset?.browser_download_url || info?.apkUrl || APK_URL,
      sha256: info?.sha256 || '',
      size: Number(info?.size) || apkAsset?.size || 0,
      publishedAt: release.published_at || '',
      notes: release.body || '',
    };

    writeCache({ checkedAt: Date.now(), latest });
    return {
      ok: true,
      available: latest.versionCode > current.code,
      current,
      latest,
      cached: false,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      available: false,
      current,
      latest: cached?.latest || null,
      error: e.message || 'ошибка сети',
    };
  }
}

function parseBuildFromTag(tag) {
  const m = /b(\d+)/.exec(tag || '');
  return m ? Number(m[1]) : 0;
}

/** Скачать и установить APK. В браузере — просто открыть ссылку. */
export function installApk(url = APK_URL) {
  const b = bridge();
  try {
    if (b && typeof b.downloadUpdate === 'function') {
      b.downloadUpdate(url);
      return 'android';
    }
    if (b && typeof b.openUrl === 'function') {
      b.openUrl(url);
      return 'android';
    }
  } catch (_) {}
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) window.location.href = url;
  return 'browser';
}

export function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} МБ`;
}
