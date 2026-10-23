// Интерфейс: главное меню, выбор бравлера, HUD, результаты, настройки.
import {
  BRAWLERS,
  BRAWLER_BY_ID,
  DEFAULT_SAVE,
  DEFAULT_SETTINGS,
  DIFFICULTY,
  MODE_LIST,
  MODES,
  RARITY,
} from './config.js';
import { getMapForMode, WALL, CRATE, BUSH, WATER } from './maps.js';
import { drawPortrait } from './render.js';
import { clamp } from './utils.js';
import {
  APK_URL,
  APP_VERSION,
  RELEASES_PAGE,
  checkForUpdate,
  formatSize,
  getCurrentVersion,
  installApk,
  isAndroidApp,
} from './updater.js';

const GADGET_ICONS = {
  dash: '💨',
  reload: '🔄',
  reveal: '👁️',
  shield: '🛡️',
  burstheal: '💚',
  speed: '👟',
  invis: '🌫️',
  cleanse: '❄️',
};

const MODE_ICONS = {
  gemgrab: '💎',
  brawlball: '⚽',
  bounty: '⭐',
};

const TIPS = [
  'Используйте кусты для засады — враг не увидит вас, пока не подойдёт вплотную.',
  'Дробовики сильны в упор, но бесполезны на дистанции. Подходите вплотную.',
  'Не стойте на месте после выстрела — снаряды летят туда, где вы были.',
  'Бомбы Бумы летят через стены. Прячьтесь и бейте из-за укрытия.',
  'Быстрый тап по экрану — выстрел с автоприцелом. Идеально для мобильных.',
  'Удерживайте кнопку выстрела на ПК, чтобы вести огонь очередью.',
  'Гаджет перезаряжается сам — используйте его каждый бой, а не копите.',
  'Супер копится от нанесённого урона. Чем больше бьёте — тем быстрее.',
];

function el(id) {
  return document.getElementById(id);
}
function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function setText(node, value) {
  if (!node) return;
  if (node._lastText !== value) {
    node.textContent = value;
    node._lastText = value;
  }
}

function rangeLabel(p) {
  if (p < 380) return 'Близкая';
  if (p < 700) return 'Средняя';
  return 'Дальняя';
}

export class UI {
  constructor(opts) {
    this.save = opts.save;
    this.settings = opts.settings;
    this.audio = opts.audio;
    this.onPlay = opts.onPlay || (() => {});
    this.onSelectBrawler = opts.onSelectBrawler || (() => {});
    this.onSelectMode = opts.onSelectMode || (() => {});
    this.onSettingsChange = opts.onSettingsChange || (() => {});
    this.onSoundToggle = opts.onSoundToggle || (() => {});
    this.onResume = opts.onResume || (() => {});
    this.onLeave = opts.onLeave || (() => {});
    this.onAgain = opts.onAgain || (() => {});
    this.onMenu = opts.onMenu || (() => {});
    this.onInstall = opts.onInstall || (() => {});
    this.onDownload = opts.onDownload || (() => {});
    this.game = null;
    this.hudCache = {};
    this.lastBanner = null;
    this.lastFeedSig = '';
    this.selectedBrawler = this.save.selectedBrawler || 'blaze';
    this.tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    this._portraitTime = 0;
    this._lastPortraitDraw = 0;
    this._init();
  }

  _init() {
    // Режимы
    const modeList = el('mode-list');
    modeList.innerHTML = '';
    for (const mode of MODE_LIST) {
      const card = h('button', 'mode-card');
      card.dataset.mode = mode.id;
      card.innerHTML = `
        <span class="mode-icon">${MODE_ICONS[mode.id]}</span>
        <span class="mode-text">
          <span class="mode-name">${mode.name}</span>
          <span class="mode-rules">${mode.rules}</span>
        </span>
        <span class="mode-check">✓</span>`;
      card.addEventListener('click', () => {
        this.audio.play('select');
        this.onSelectMode(mode.id);
      });
      modeList.appendChild(card);
    }

    // Сложность
    const diffRow = el('difficulty-row');
    diffRow.innerHTML = '';
    for (const diff of Object.values(DIFFICULTY)) {
      const b = h('button', 'diff-btn', diff.name);
      b.dataset.diff = diff.id;
      b.addEventListener('click', () => {
        this.audio.play('select');
        this.save.settings.difficulty = diff.id;
        this.updateHome();
        this.onSettingsChange();
      });
      diffRow.appendChild(b);
    }

    // Кнопки
    el('btn-play').addEventListener('click', () => {
      this.audio.resume();
      this.audio.play('click');
      this.onPlay();
    });
    el('btn-brawlers').addEventListener('click', () => {
      this.audio.play('click');
      this.openBrawlers();
    });
    el('btn-change-brawler').addEventListener('click', () => {
      this.audio.play('click');
      this.openBrawlers();
    });
    el('btn-help').addEventListener('click', () => {
      this.audio.play('click');
      el('screen-help').classList.remove('hidden');
    });
    el('btn-hero-help').addEventListener('click', () => {
      this.audio.play('click');
      el('screen-help').classList.remove('hidden');
    });
    el('btn-settings').addEventListener('click', () => {
      this.audio.play('click');
      el('screen-settings').classList.remove('hidden');
    });
    el('btn-sound').addEventListener('click', () => {
      this.onSoundToggle();
      this.updateHome();
    });
    for (const id of ['btn-download', 'btn-download-2']) {
      const btn = el(id);
      if (btn) {
        btn.addEventListener('click', () => {
          this.audio.play('click');
          this.openDownload();
        });
      }
    }

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.play('click');
        const name = btn.dataset.close;
        el(`screen-${name}`).classList.add('hidden');
      });
    });

    // Настройки
    const s = this.settings;
    const setSfx = el('set-sfx');
    const setMusic = el('set-music');
    setSfx.value = Math.round(s.sfx * 100);
    setMusic.value = Math.round(s.music * 100);
    el('val-sfx').textContent = `${Math.round(s.sfx * 100)}%`;
    el('val-music').textContent = `${Math.round(s.music * 100)}%`;
    setSfx.addEventListener('input', () => {
      const v = Number(setSfx.value) / 100;
      this.settings.sfx = v;
      this.save.settings.sfx = v;
      el('val-sfx').textContent = `${Math.round(v * 100)}%`;
      this.audio.setSfxVolume(v);
      this.onSettingsChange();
    });
    setMusic.addEventListener('input', () => {
      const v = Number(setMusic.value) / 100;
      this.settings.music = v;
      this.save.settings.music = v;
      el('val-music').textContent = `${Math.round(v * 100)}%`;
      this.audio.setMusicVolume(v);
      this.onSettingsChange();
    });
    const toggles = [
      ['set-assist', 'aimAssist'],
      ['set-autoaim', 'autoAim'],
      ['set-shake', 'shake'],
      ['set-fps', 'showFps'],
    ];
    for (const [id, key] of toggles) {
      const input = el(id);
      input.checked = !!this.settings[key];
      input.addEventListener('change', () => {
        this.settings[key] = input.checked;
        this.save.settings[key] = input.checked;
        if (key === 'showFps') el('fps').classList.toggle('hidden', !input.checked);
        this.onSettingsChange();
      });
    }

    // Пауза
    el('btn-pause').addEventListener('click', () => {
      this.audio.play('click');
      if (this.onPauseClick) this.onPauseClick();
    });
    el('btn-resume').addEventListener('click', () => {
      this.audio.play('click');
      this.onResume();
    });
    el('btn-pause-settings').addEventListener('click', () => {
      this.audio.play('click');
      el('screen-settings').classList.remove('hidden');
    });
    el('btn-leave').addEventListener('click', () => {
      this.audio.play('click');
      this.onLeave();
    });

    // Результат
    el('btn-again').addEventListener('click', () => {
      this.audio.play('click');
      this.onAgain();
    });
    el('btn-menu').addEventListener('click', () => {
      this.audio.play('click');
      this.onMenu();
    });

    // Способности
    el('btn-super').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.resume();
      if (this.input) this.input.queueSuper();
    });
    el('btn-gadget').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.resume();
      if (this.input) this.input.queueGadget();
    });

    const rotateHint = el('rotate-hint');
    if (rotateHint) {
      rotateHint.addEventListener('click', () => {
        rotateHint.style.display = 'none';
      });
    }

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      document.body.classList.add('touch');
    }
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

    el('tip-text').textContent = this.tip;
    el('fps').classList.toggle('hidden', !this.settings.showFps);
    this.updateHome();
  }

  setInput(input) {
    this.input = input;
  }

  // ---------- Дом ----------
  updateHome() {
    const s = this.save;
    setText(el('home-trophies'), String(s.trophies));
    const winrate = s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0;
    setText(el('home-winrate'), `${winrate}%`);
    setText(el('home-streak'), String(s.streak || 0));
    setText(el('home-matches'), String(s.matches || 0));
    setText(el('home-wins'), String(s.wins || 0));
    setText(el('home-best'), String(s.bestStreak || 0));
    el('btn-sound').textContent = this.settings.sfx > 0 || this.settings.music > 0 ? '🔊' : '🔇';

    const mode = MODES[s.selectedMode] || MODES.gemgrab;
    document.querySelectorAll('.mode-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.mode === mode.id);
    });
    setText(el('play-mode-name'), mode.name);
    setText(el('play-mode-rules'), mode.rules);
    setText(el('play-mode-desc'), mode.desc);

    document.querySelectorAll('.diff-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.diff === (this.settings.difficulty || 'normal'));
    });

    const b = BRAWLER_BY_ID[this.selectedBrawler] || BRAWLERS[0];
    setText(el('hero-name'), b.name);
    setText(el('hero-role'), b.role);
    setText(el('hero-desc'), b.desc);
    setText(el('hero-rarity'), RARITY[b.rarity].name);
    setText(el('stat-hp'), String(b.hp));
    const dmg = b.attack.damage * (b.attack.pellets || 1);
    setText(el('stat-dmg'), b.attack.kind === 'healbolt' ? `${b.attack.heal} 💚` : String(dmg));
    setText(el('stat-range'), rangeLabel(b.attack.range));
    el('hero-rarity').style.color = RARITY[b.rarity].color;
    el('hero-rarity').style.borderColor = RARITY[b.rarity].color + '88';

    // Карта в превью
    const map = getMapForMode(mode.id);
    const preview = el('map-preview');
    if (map) {
      preview.style.backgroundImage = `url(${this._mapPreview(map)})`;
      preview.dataset.name = `${map.name} · ${map.width}×${map.height}`;
    }
    el('play-mode-rules').style.color = mode.color;
  }

  _mapPreview(map) {
    if (!this._previewCache) this._previewCache = new Map();
    if (this._previewCache.has(map.id)) return this._previewCache.get(map.id);
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const g = c.getContext('2d');
    const theme = map.theme;
    g.fillStyle = theme.sky;
    g.fillRect(0, 0, 320, 180);
    const sx = 320 / map.width;
    const sy = 180 / map.height;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.grid[y][x];
        let col = theme.floor;
        if (t === WALL) col = theme.wall;
        else if (t === CRATE) col = '#8a5a30';
        else if (t === WATER) col = theme.water;
        else if (t === BUSH) col = theme.bush;
        g.fillStyle = col;
        g.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
      }
    }
    // центр
    g.fillStyle = 'rgba(255,204,77,0.85)';
    g.beginPath();
    g.arc(160, 90, 4, 0, Math.PI * 2);
    g.fill();
    const url = c.toDataURL();
    this._previewCache.set(map.id, url);
    return url;
  }

  openDownload() {
    el('screen-download').classList.remove('hidden');
    if (this.onDownloadReady) this.onDownloadReady();
  }

  // ---------- Обновления ----------
  initUpdater() {
    this.currentVersion = getCurrentVersion();
    this.latestApkUrl = APK_URL;
    const chip = el('app-version');
    if (chip) {
      const v = this.currentVersion;
      chip.textContent = v.platform === 'android' ? `v${v.name} · ${v.code}` : `v${APP_VERSION} · веб`;
      chip.title = v.platform === 'android' ? `Сборка ${v.code}` : 'Игра открыта в браузере — APK доступен в окне скачивания';
      chip.addEventListener('click', () => {
        this.audio.play('click');
        this.openDownload();
        this.runUpdateCheck(true);
      });
    }
    const dl = el('apk-download');
    if (dl) {
      dl.addEventListener('click', (e) => {
        e.preventDefault();
        this.audio.play('click');
        installApk(this.latestApkUrl || APK_URL);
        this.toast(isAndroidApp() ? 'Загрузка APK — подтвердите установку' : 'Скачивание APK…');
      });
    }
    const check = el('check-update');
    if (check) {
      check.addEventListener('click', () => {
        this.audio.play('click');
        if (this.updateAvailable) {
          this.toast('Загрузка обновления…');
          installApk(this.latestApkUrl || APK_URL);
          return;
        }
        this.runUpdateCheck(true);
      });
    }
    if (isAndroidApp()) {
      setTimeout(() => this.runUpdateCheck(false), 2600);
    }
  }

  setApkStatus(text, kind = '') {
    const status = el('apk-status');
    if (!status) return;
    status.className = `dl-note ${kind}`.trim();
    status.textContent = text;
  }

  async runUpdateCheck(force = false) {
    const btn = el('check-update');
    if (btn && btn.dataset.busy !== '1') {
      btn.dataset.busy = '1';
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Проверяю…';
      this.setApkStatus('Соединяюсь с GitHub…');
      try {
        const res = await checkForUpdate(force);
        this.applyUpdateResult(res);
      } catch (e) {
        this.setApkStatus('Не удалось проверить обновления', 'err');
      } finally {
        btn.disabled = false;
        btn.dataset.busy = '0';
        if (!this.updateAvailable && btn.textContent === 'Проверяю…') btn.textContent = prev;
      }
    }
  }

  applyUpdateResult(res) {
    const btn = el('check-update');
    const chip = el('app-version');
    const cur = res.current || this.currentVersion;
    const latest = res.latest;
    if (latest && latest.apkUrl) this.latestApkUrl = latest.apkUrl;
    this.updateAvailable = !!res.available;

    if (!res.ok) {
      this.setApkStatus('Не удалось проверить обновления — нет связи', 'err');
      if (btn) btn.textContent = 'Повторить проверку';
      return;
    }

    const build = latest ? `v${latest.versionName || '?'} (${latest.versionCode})` : '';

    if (cur.platform !== 'android') {
      if (latest) {
        this.setApkStatus(`В релизе: ${build}${latest.size ? ' · ' + formatSize(latest.size) : ''}`);
        if (btn) btn.textContent = 'Скачать APK';
      } else {
        this.setApkStatus('Последняя сборка · Android 6.0+');
      }
      return;
    }

    if (res.available) {
      if (btn) btn.textContent = `Обновить до v${latest?.versionName || ''}`;
      this.setApkStatus(
        `Доступно обновление: ${build} · у вас v${cur.name} (${cur.code})`,
        'warn'
      );
      if (chip) chip.classList.add('update');
      this.toast(`Вышло обновление ${build} — откройте 💾 → «Обновить»`);
    } else {
      this.setApkStatus(`У вас последняя версия · v${cur.name} (${cur.code})`, 'ok');
      if (btn) btn.textContent = 'Проверить обновления';
      if (chip) chip.classList.remove('update');
    }
  }

  // ---------- Бравлеры ----------
  openBrawlers() {
    el('screen-brawlers').classList.remove('hidden');
    this._buildBrawlerGrid();
    this._showBrawlerDetail(this.selectedBrawler);
    this._drawBrawlerCards(true);
  }

  _buildBrawlerGrid() {
    const grid = el('brawler-grid');
    if (grid.childElementCount === BRAWLERS.length) return;
    grid.innerHTML = '';
    for (const b of BRAWLERS) {
      const card = h('button', 'brawler-card');
      card.dataset.id = b.id;
      const rarity = RARITY[b.rarity];
      card.innerHTML = `
        <span class="bcard-rarity" style="color:${rarity.color}">${rarity.name}</span>
        <span class="bcard-check hidden">✓</span>
        <canvas width="150" height="120"></canvas>
        <span class="bcard-name">${b.name}</span>
        <span class="bcard-role">${b.role}</span>`;
      card.addEventListener('click', () => {
        this.audio.play('select');
        this.selectBrawler(b.id);
      });
      grid.appendChild(card);
    }
  }

  _drawBrawlerCards(force = false) {
    const now = performance.now();
    if (!force && now - this._lastPortraitDraw < 90) return;
    this._lastPortraitDraw = now;
    const t = this._portraitTime;
    document.querySelectorAll('#brawler-grid .brawler-card').forEach((card) => {
      const canvas = card.querySelector('canvas');
      if (!canvas || (canvas.dataset.drawn === '1' && !force)) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPortrait(ctx, card.dataset.id, t, canvas.width, canvas.height);
      canvas.dataset.drawn = '1';
    });
  }

  _showBrawlerDetail(id) {
    const b = BRAWLER_BY_ID[id];
    if (!b) return;
    const detail = el('brawler-detail');
    const dmg = b.attack.kind === 'healbolt'
      ? `Лечение ${b.attack.heal} / Урон ${b.attack.damage}`
      : `${b.attack.damage * (b.attack.pellets || 1)} за выстрел`;
    detail.innerHTML = `
      <div class="bd-left">
        <h3>${b.name} <span class="muted">· ${b.role}</span></h3>
        <p>${b.desc}</p>
        <p class="bd-tip">💡 ${b.tip}</p>
        ${(() => {
          const rec = (this.save.records || {})[id];
          if (!rec || !rec.matches) return '<p class="bd-record">Ещё не играли этим бравлером</p>';
          const wr = Math.round((rec.wins / rec.matches) * 100);
          return `<p class="bd-record">Матчей: ${rec.matches} · Побед: ${rec.wins} (${wr}%) · Убийств: ${rec.kills} · Урона: ${Math.round(rec.damage)}</p>`;
        })()}
        <div class="bd-chips">
          <span class="chip">HP <b>${b.hp}</b></span>
          <span class="chip">Урон <b>${dmg}</b></span>
          <span class="chip">Дальность <b>${rangeLabel(b.attack.range)}</b></span>
          <span class="chip">Супер <b>${b.super.name}</b></span>
          <span class="chip">Гаджет <b>${b.gadget.name}</b></span>
        </div>
      </div>
      <button class="btn primary bd-select" id="bd-select">${id === this.selectedBrawler ? 'ВЫБРАНО' : 'ВЫБРАТЬ'}</button>`;
    const btn = el('bd-select');
    if (btn) {
      btn.disabled = id === this.selectedBrawler;
      btn.style.opacity = id === this.selectedBrawler ? '0.6' : '1';
      btn.addEventListener('click', () => {
        this.audio.play('click');
        this.selectBrawler(id);
      });
    }
    document.querySelectorAll('.brawler-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.id === this.selectedBrawler);
      const check = c.querySelector('.bcard-check');
      if (check) check.classList.toggle('hidden', c.dataset.id !== this.selectedBrawler);
    });
  }

  selectBrawler(id) {
    this.selectedBrawler = id;
    this.save.selectedBrawler = id;
    this.updateHome();
    this._showBrawlerDetail(id);
    this._drawBrawlerCards(true);
    this.onSelectBrawler(id);
  }

  // ---------- HUD ----------
  startGameUI(game, input) {
    this.game = game;
    this.input = input;
    el('screen-home').classList.add('hidden');
    el('screen-result').classList.add('hidden');
    el('screen-pause').classList.add('hidden');
    el('screen-brawlers').classList.add('hidden');
    el('screen-help').classList.add('hidden');
    el('screen-settings').classList.add('hidden');
    el('screen-download').classList.add('hidden');
    el('hud').classList.remove('hidden');
    el('scoreboard').classList.add('hidden');
    this.hudCache = {};
    this.lastBanner = null;
    this.lastFeedSig = '';
    const b = BRAWLER_BY_ID[game.player.brawlerId];
    const avatar = el('hud-avatar');
    avatar.textContent = b.name[0];
    avatar.style.background = `linear-gradient(160deg, ${b.color}55, ${b.color2}33)`;
    avatar.style.borderColor = b.color + 'aa';
    setText(el('hud-brawler-name'), `${b.name} · ${b.role}`);
    setText(el('hud-mode'), MODES[game.mode].name);
    el('gadget-icon').textContent = GADGET_ICONS[b.gadget.kind] || '⚡';
    el('btn-super').classList.remove('ready');
    el('respawn').classList.add('hidden');
    // патроны
    const pips = el('ammo-pips');
    pips.innerHTML = '';
    for (let i = 0; i < b.attack.ammo; i++) {
      pips.appendChild(h('i', 'full', '<span></span>'));
    }
    // точки счёта
    this._buildDots();
    el('banner-text').textContent = '';
    el('banner-sub').textContent = '';
    el('hud-banner').classList.remove('show');
    this.updateHud(game, true);
  }

  _buildDots() {
    const mode = this.game ? this.game.mode : 'gemgrab';
    const total = mode === 'gemgrab' ? 10 : mode === 'brawlball' ? 2 : 0;
    for (const team of [0, 1]) {
      const box = el(`dots-${team}`);
      if (!box) continue;
      box.innerHTML = '';
      for (let i = 0; i < total; i++) box.appendChild(h('i'));
      box.style.display = total ? 'flex' : 'none';
    }
  }

  updateHud(game, force = false) {
    if (!game || !game.player) return;
    const p = game.player;
    const c = this.hudCache;
    const set = (key, node, value) => {
      if (force || c[key] !== value) {
        c[key] = value;
        setText(node, value);
      }
    };

    // Таймер
    const t = Math.max(0, Math.ceil(game.timeLeft));
    const mm = Math.floor(t / 60);
    const ss = String(t % 60).padStart(2, '0');
    set('timer', el('hud-timer'), `${mm}:${ss}`);
    el('hud-timer').classList.toggle('low', game.timeLeft <= 30);

    // Счёт
    if (game.mode === 'gemgrab') {
      set('s0', el('score-0'), String(game.gems[0]));
      set('s1', el('score-1'), String(game.gems[1]));
      set('sub', el('hud-sub'), '10 кристаллов · удержите 15 секунд');
      const hold = game.hold;
      const bar = el('hold-bar');
      const showHold = game.gems[0] >= 10 || game.gems[1] >= 10 || hold.timer > 0;
      if (c.showHold !== showHold) {
        c.showHold = showHold;
        bar.classList.toggle('hidden', !showHold);
      }
      if (showHold) {
        const pct = clamp(hold.timer / 15, 0, 1) * 100;
        el('hold-fill').style.width = `${pct}%`;
        const who = hold.team === 0 ? 'СИНИЕ' : hold.team === 1 ? 'КРАСНЫЕ' : '';
        set('holdLabel', el('hold-label'), `${who} ${Math.max(0, 15 - Math.ceil(hold.timer))} c`);
        el('hold-fill').style.background =
          hold.team === 0 ? 'linear-gradient(90deg,#38a3ff,#8fd4ff)' : 'linear-gradient(90deg,#ff4d6d,#ffa3b4)';
      }
      this._updateDots(Math.min(10, game.gems[0]), Math.min(10, game.gems[1]));
    } else if (game.mode === 'brawlball') {
      set('s0', el('score-0'), String(game.goals[0]));
      set('s1', el('score-1'), String(game.goals[1]));
      set('sub', el('hud-sub'), 'до 2 голов');
      el('hold-bar').classList.add('hidden');
      this._updateDots(game.goals[0], game.goals[1]);
    } else {
      set('s0', el('score-0'), String(game.teamScore[0]));
      set('s1', el('score-1'), String(game.teamScore[1]));
      set('sub', el('hud-sub'), 'до 20 ★');
      el('hold-bar').classList.add('hidden');
      this._updateDots(0, 0);
    }

    // HP
    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    el('hp-fill').style.width = `${hpPct}%`;
    const fill = el('hp-fill');
    fill.classList.toggle('mid', hpPct <= 60 && hpPct > 30);
    fill.classList.toggle('low', hpPct <= 30);
    set('hp', el('hp-text'), String(Math.max(0, Math.ceil(p.hp))));
    const shieldPct = clamp(p.shieldHp / p.maxHp, 0, 1) * 100;
    el('shield-fill').style.width = `${shieldPct}%`;

    // Патроны
    const pips = el('ammo-pips').children;
    for (let i = 0; i < pips.length; i++) {
      const pip = pips[i];
      const span = pip.firstElementChild;
      const filled = i < p.ammo;
      pip.classList.toggle('full', filled);
      if (!filled && i === p.ammo) {
        const reload = BRAWLER_BY_ID[p.brawlerId].attack.reload;
        span.style.width = `${clamp(p.ammoTimer / reload, 0, 1) * 100}%`;
      } else {
        span.style.width = filled ? '100%' : '0%';
      }
    }

    // Супер
    const pct = Math.round(p.superCharge);
    set('sup', el('super-pct'), `${pct}%`);
    const ring = el('super-ring');
    if (c.superRing !== pct) {
      c.superRing = pct;
      ring.style.background = `conic-gradient(from -90deg, #ffd54a ${pct * 3.6}deg, #ff9f1c ${
        pct * 3.6
      }deg, rgba(255,255,255,0.09) ${pct * 3.6}deg)`;
    }
    el('btn-super').classList.toggle('ready', p.superCharge >= 100);

    // Гаджет
    const gcd = Math.ceil(p.gadgetCooldown);
    const cdEl = el('gadget-cd');
    if (c.gcd !== gcd) {
      c.gcd = gcd;
      cdEl.textContent = String(gcd);
    }
    cdEl.classList.toggle('hidden', gcd <= 0);
    el('btn-gadget').classList.toggle('ready', gcd <= 0);

    // Респавн
    const dead = !p.alive;
    if (c.dead !== dead) {
      c.dead = dead;
      el('respawn').classList.toggle('hidden', !dead);
    }
    if (dead) {
      set('resp', el('respawn-timer'), String(Math.ceil(p.respawnTimer)));
    }

    // Баннер
    if (game.banner && game.banner !== this.lastBanner) {
      this.lastBanner = game.banner;
      el('banner-text').textContent = game.banner.text;
      el('banner-sub').textContent = game.banner.sub || '';
      const color = game.banner.color || '#ffffff';
      el('banner-text').style.color = color;
      el('banner-text').style.textShadow = `0 4px 0 rgba(0,0,0,0.35), 0 0 46px ${color}88`;
      const bannerEl = el('hud-banner');
      bannerEl.classList.remove('show');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('show');
    } else if (!game.banner && this.lastBanner) {
      this.lastBanner = null;
    }

    // Лента убийств
    const sig = game.feed.map((f) => `${f.killer}>${f.victim}${Math.ceil(f.life)}`).join('|');
    if (sig !== this.lastFeedSig) {
      this.lastFeedSig = sig;
      const box = el('hud-feed');
      box.innerHTML = '';
      for (const f of game.feed.slice(0, 3)) {
        const item = h('div', 'feed-item');
        const kCol = f.killerTeam === 0 ? '#8fd4ff' : f.killerTeam === 1 ? '#ffa3b4' : '#ffd54a';
        const vCol = f.victimTeam === 0 ? '#8fd4ff' : '#ffa3b4';
        item.innerHTML = `<span class="k" style="color:${kCol}">${f.killer}</span><span class="x">⚔</span><span class="v" style="color:${vCol}">${f.victim}</span>`;
        box.appendChild(item);
      }
    }
  }

  _updateDots(a, b) {
    const mode = this.game ? this.game.mode : 'gemgrab';
    if (mode === 'bounty') return;
    const total = mode === 'gemgrab' ? 10 : 2;
    const sets = [
      [el('dots-0'), Math.min(total, a)],
      [el('dots-1'), Math.min(total, b)],
    ];
    for (const [box, n] of sets) {
      if (!box) continue;
      const key = `${box.id}-${n}`;
      if (box._key === key) continue;
      box._key = key;
      for (let i = 0; i < box.children.length; i++) {
        box.children[i].classList.toggle('on', i < n);
      }
    }
  }

  toggleScoreboard(show) {
    const box = el('scoreboard');
    const visible = typeof show === 'boolean' ? show : box.classList.contains('hidden');
    box.classList.toggle('hidden', !visible);
    if (!visible) return;
    const game = this.game;
    if (!game) return;
    const wrap = el('sb-teams');
    wrap.innerHTML = '';
    for (const team of [0, 1]) {
      const col = h('div', `sb-team ${team === 0 ? 'blue' : 'red'}`);
      col.appendChild(h('div', 'sb-team-title', team === 0 ? 'СИНИЕ' : 'КРАСНЫЕ'));
      const list = [...game.players].filter((p) => p.team === team).sort((a, b) => b.kills - a.kills);
      for (const p of list) {
        const b = BRAWLER_BY_ID[p.brawlerId];
        const row = h('div', 'sb-row');
        row.classList.toggle('me', p.isPlayer);
        row.classList.toggle('dead', !p.alive);
        const good = game.mode === 'gemgrab' ? `💎${p.gems}` : game.mode === 'brawlball' ? `⚽${game.ball?.lastTouchId === p.id ? 1 : 0}` : `★${p.stars || 0}`;
        row.innerHTML = `<span class="sb-name">${p.isPlayer ? '★ ' : ''}${p.name} <span style="opacity:.6">${b.name}</span></span>
          <span class="sb-kd">${p.kills}/${p.deaths}</span>
          <span class="sb-good">${good}</span>`;
        col.appendChild(row);
      }
      wrap.appendChild(col);
    }
  }

  // ---------- Пауза / результат ----------
  showPause(show) {
    el('screen-pause').classList.toggle('hidden', !show);
  }

  showResult(result, delta) {
    const card = el('result-card');
    card.classList.remove('win', 'lose', 'draw');
    card.classList.add(result.draw ? 'draw' : result.win ? 'win' : 'lose');
    setText(el('result-badge'), result.draw ? '🤝' : result.win ? '🏆' : '💀');
    setText(el('result-title'), result.draw ? 'НИЧЬЯ' : result.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ');
    const sc = result.scores || {};
    if (result.mode === 'brawlball') {
      setText(el('result-score'), `${sc[0] || 0} : ${sc[1] || 0}`);
    } else {
      setText(el('result-score'), `${sc[0] || 0} : ${sc[1] || 0}`);
    }
    setText(el('result-meta'), `${result.mapName} · ${result.modeName}`);
    const stats = result.stats || {};
    const third = result.mode === 'gemgrab' ? '💎' : result.mode === 'brawlball' ? '⚽' : '⭐';
    const thirdVal = result.mode === 'gemgrab' ? (stats.gems || 0) : result.mode === 'brawlball' ? (stats.goals || 0) : (stats.stars || 0);
    el('result-stats').innerHTML = `
      <div class="rstat"><b>${stats.kills || 0}</b><span>убийств</span></div>
      <div class="rstat"><b>${stats.deaths || 0}</b><span>смертей</span></div>
      <div class="rstat"><b>${Math.round(stats.damage || 0)}</b><span>урона</span></div>
      <div class="rstat"><b>${third} ${thirdVal}</b><span>${result.mode === 'gemgrab' ? 'кристаллы' : result.mode === 'brawlball' ? 'голы' : 'звёзды'}</span></div>`;
    const trophyEl = el('result-trophy');
    trophyEl.classList.toggle('negative', delta < 0);
    setText(trophyEl, `${delta >= 0 ? '+' : ''}${delta} 🏆`);
    const mvpEl = el('result-mvp');
    if (result.mvp) {
      const b = BRAWLER_BY_ID[result.mvp.brawlerId];
      const who = result.mvp.isPlayer ? 'ВЫ' : result.mvp.name;
      mvpEl.innerHTML = `⭐ Лучший игрок: <b>${who}</b> · ${b.name} · ${result.mvp.kills} убийств`;
      mvpEl.classList.add('show');
    } else {
      mvpEl.classList.remove('show');
    }
    const note = result.win
      ? `Серия побед: ${this.save.streak} · Всего кубков: ${this.save.trophies}`
      : result.draw
      ? `Ничья. Всего кубков: ${this.save.trophies}`
      : `Не сдавайся! Всего кубков: ${this.save.trophies}`;
    setText(el('result-note'), note);
    el('screen-result').classList.remove('hidden');
  }

  hideResult() {
    el('screen-result').classList.add('hidden');
  }

  showHome() {
    el('hud').classList.add('hidden');
    el('screen-result').classList.add('hidden');
    el('screen-pause').classList.add('hidden');
    el('screen-brawlers').classList.add('hidden');
    el('screen-settings').classList.add('hidden');
    el('screen-help').classList.add('hidden');
    el('screen-download').classList.add('hidden');
    el('screen-home').classList.remove('hidden');
    this.tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    el('tip-text').textContent = this.tip;
    this.updateHome();
  }

  toast(message) {
    const t = el('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  setFps(v) {
    if (!this.settings.showFps) return;
    setText(el('fps'), `${v} FPS`);
  }

  // ---------- Анимация меню ----------
  tick(t) {
    this._portraitTime = t;
    if (!el('screen-home').classList.contains('hidden')) {
      const canvas = el('hero-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPortrait(ctx, this.selectedBrawler, t, canvas.width, canvas.height);
      }
    }
    if (!el('screen-brawlers').classList.contains('hidden')) {
      this._drawBrawlerCards(false);
    }
  }

  refreshSettingsUI() {
    const s = this.settings;
    el('set-sfx').value = Math.round(s.sfx * 100);
    el('set-music').value = Math.round(s.music * 100);
    el('val-sfx').textContent = `${Math.round(s.sfx * 100)}%`;
    el('val-music').textContent = `${Math.round(s.music * 100)}%`;
    el('set-assist').checked = !!s.aimAssist;
    el('set-autoaim').checked = !!s.autoAim;
    el('set-shake').checked = !!s.shake;
    el('set-fps').checked = !!s.showFps;
    el('fps').classList.toggle('hidden', !s.showFps);
  }

  syncBrawler() {
    this.selectedBrawler = this.save.selectedBrawler || 'blaze';
    this.updateHome();
    if (!el('screen-brawlers').classList.contains('hidden')) {
      this._showBrawlerDetail(this.selectedBrawler);
      this._drawBrawlerCards(true);
    }
  }
}

export { DEFAULT_SAVE, DEFAULT_SETTINGS };
