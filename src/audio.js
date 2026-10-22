// Процедурное аудио на WebAudio: звуки боя, интерфейс и фоновая музыка.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.sfxVolume = 0.7;
    this.musicVolume = 0.35;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicNextTime = 0;
    this.musicOn = false;
    this._lastPlay = new Map();
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus && this.musicOn) {
      this.musicBus.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
    }
  }

  // Ограничитель частоты одинаковых звуков
  _throttle(name, ms) {
    const now = performance.now();
    const last = this._lastPlay.get(name) || 0;
    if (now - last < ms) return false;
    this._lastPlay.set(name, now);
    return true;
  }

  _env(node, attack, decay, peak, time = 0) {
    const t = this.ctx.currentTime + time;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone({ freq = 440, freq2 = null, type = 'sine', attack = 0.005, decay = 0.2, gain = 0.2, time = 0, pan = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + time;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + attack + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g);
    if (p) {
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.connect(this.sfxBus);
    }
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  noise({ dur = 0.2, gain = 0.2, filter = 1200, q = 1, type = 'lowpass', time = 0, sweep = null, pan = 0 }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + time;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    src.connect(f);
    f.connect(g);
    if (p) {
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.connect(this.sfxBus);
    }
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || this.sfxVolume <= 0.001) return;
    const pan = opts.pan || 0;
    switch (name) {
      case 'shoot':
        if (!this._throttle('shoot', 35)) return;
        this.noise({ dur: 0.1, gain: 0.1, filter: 2400, sweep: 700, pan });
        this.tone({ freq: 520, freq2: 160, type: 'square', decay: 0.08, gain: 0.05, pan });
        break;
      case 'shootHeavy':
        this.noise({ dur: 0.18, gain: 0.16, filter: 1500, sweep: 300, pan });
        this.tone({ freq: 180, freq2: 60, type: 'sawtooth', decay: 0.14, gain: 0.1, pan });
        break;
      case 'snipe':
        this.noise({ dur: 0.16, gain: 0.16, filter: 4200, sweep: 900, pan });
        this.tone({ freq: 1200, freq2: 300, type: 'square', decay: 0.1, gain: 0.06, pan });
        break;
      case 'hit':
        if (!this._throttle('hit', 45)) return;
        this.tone({ freq: 340, freq2: 180, type: 'triangle', decay: 0.08, gain: 0.12, pan });
        break;
      case 'hurt':
        this.tone({ freq: 260, freq2: 120, type: 'sawtooth', decay: 0.12, gain: 0.1, pan });
        this.noise({ dur: 0.1, gain: 0.08, filter: 900, pan });
        break;
      case 'explode':
        this.noise({ dur: 0.45, gain: 0.32, filter: 900, sweep: 100, pan });
        this.tone({ freq: 110, freq2: 40, type: 'sine', decay: 0.35, gain: 0.3, pan });
        break;
      case 'pickup':
        this.tone({ freq: 880, freq2: 1320, type: 'triangle', decay: 0.12, gain: 0.11, pan });
        break;
      case 'gem':
        this.tone({ freq: 1046, type: 'sine', decay: 0.1, gain: 0.1, pan });
        this.tone({ freq: 1568, type: 'sine', decay: 0.14, gain: 0.06, time: 0.04, pan });
        break;
      case 'superReady':
        this.tone({ freq: 660, type: 'triangle', decay: 0.12, gain: 0.12 });
        this.tone({ freq: 990, type: 'triangle', decay: 0.18, gain: 0.1, time: 0.08 });
        this.tone({ freq: 1320, type: 'triangle', decay: 0.22, gain: 0.07, time: 0.16 });
        break;
      case 'super':
        this.noise({ dur: 0.5, gain: 0.28, filter: 600, sweep: 2500, type: 'bandpass', pan });
        this.tone({ freq: 140, freq2: 420, type: 'sawtooth', decay: 0.4, gain: 0.16, pan });
        break;
      case 'death':
        this.tone({ freq: 300, freq2: 70, type: 'sawtooth', decay: 0.4, gain: 0.16, pan });
        this.noise({ dur: 0.35, gain: 0.14, filter: 800, sweep: 200, pan });
        break;
      case 'heal':
        this.tone({ freq: 520, freq2: 880, type: 'sine', decay: 0.18, gain: 0.1, pan });
        break;
      case 'goal':
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone({ freq: f, type: 'square', decay: 0.2, gain: 0.08, time: i * 0.09 })
        );
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) =>
          this.tone({ freq: f, type: 'triangle', decay: 0.35, gain: 0.12, time: i * 0.12 })
        );
        break;
      case 'lose':
        [440, 392, 330, 262].forEach((f, i) =>
          this.tone({ freq: f, type: 'triangle', decay: 0.35, gain: 0.1, time: i * 0.14 })
        );
        break;
      case 'countdown':
        this.tone({ freq: 660, type: 'square', decay: 0.12, gain: 0.1 });
        break;
      case 'go':
        this.tone({ freq: 990, type: 'square', decay: 0.25, gain: 0.12 });
        this.tone({ freq: 1320, type: 'square', decay: 0.3, gain: 0.08, time: 0.1 });
        break;
      case 'click':
        this.tone({ freq: 720, freq2: 980, type: 'triangle', decay: 0.06, gain: 0.08 });
        break;
      case 'select':
        this.tone({ freq: 520, type: 'triangle', decay: 0.08, gain: 0.09 });
        this.tone({ freq: 780, type: 'triangle', decay: 0.1, gain: 0.06, time: 0.05 });
        break;
      case 'error':
        this.tone({ freq: 220, freq2: 160, type: 'square', decay: 0.14, gain: 0.09 });
        break;
      case 'gadget':
        this.tone({ freq: 880, freq2: 1760, type: 'square', decay: 0.18, gain: 0.09 });
        break;
      case 'bounce':
        if (!this._throttle('bounce', 60)) return;
        this.tone({ freq: 900, freq2: 500, type: 'triangle', decay: 0.05, gain: 0.05, pan });
        break;
      case 'ball':
        this.tone({ freq: 200, freq2: 90, type: 'sine', decay: 0.12, gain: 0.12, pan });
        break;
      case 'reload':
        this.tone({ freq: 420, type: 'square', decay: 0.05, gain: 0.04 });
        break;
    }
  }

  // ---------- Музыка ----------
  startMusic() {
    this.init();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, this.ctx.currentTime, 0.6);
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    const scheduler = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.musicNextTime < this.ctx.currentTime + 0.5) {
        this._musicStep(this.musicStep, this.musicNextTime);
        this.musicStep = (this.musicStep + 1) % 32;
        this.musicNextTime += 0.19;
      }
      this.musicTimer = setTimeout(scheduler, 120);
    };
    scheduler();
  }

  stopMusic(fade = 0.6) {
    if (!this.ctx) return;
    this.musicOn = false;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 2);
    clearTimeout(this.musicTimer);
  }

  _musicStep(step, t) {
    const ctx = this.ctx;
    const bassNotes = [110, 110, 82.4, 98];
    const chordNotes = [220, 261.6, 329.6, 392];
    const bar = Math.floor(step / 8) % 4;
    const local = step % 8;

    const voice = (freq, type, dur, gain, when, detune = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      o.start(when);
      o.stop(when + dur + 0.02);
    };

    if (local % 2 === 0) voice(bassNotes[bar] / 2, 'triangle', 0.28, 0.22, t);
    if (local === 0 || local === 4) voice(bassNotes[bar], 'sawtooth', 0.2, 0.07, t);

    const arp = [0, 2, 1, 3, 2, 1, 3, 2];
    const arpFreq = chordNotes[arp[local]] * (bar === 2 ? 1.122 : 1);
    voice(arpFreq, 'triangle', 0.16, 0.045, t + 0.005, local === 3 ? 6 : 0);
    if (local === 7) voice(arpFreq * 2, 'sine', 0.3, 0.03, t + 0.09);

    if (local % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.musicBus);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}

export const audio = new AudioEngine();
