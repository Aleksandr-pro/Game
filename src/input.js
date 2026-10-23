// Управление: клавиатура + мышь (ПК) и два виртуальных стика (мобильные).
import { normalize, TAU } from './utils.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false, inside: false, type: 'mouse' };
    this.mouseDownAt = 0;
    this.mouseHold = 0;
    this.moveVec = { x: 0, y: 0 };
    this.aimVec = { x: 1, y: 0 };
    this.aiming = false;
    this.aimSource = 'none'; // mouse | stick | none
    this.shots = [];
    this.superQueued = false;
    this.gadgetQueued = false;
    this.pauseQueued = false;
    this.statsQueued = false;
    this.moveStick = null; // { id, ox, oy, x, y }
    this.aimStick = null;
    this.isTouch = false;
    this.enabled = true;
    this.autoAimRequested = false;
    this._bind();
  }

  _bind() {
    const c = this.canvas;

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (!this.enabled) {
        if (k === 'escape') this.pauseQueued = true;
        return;
      }
      if (k === ' ' || k === 'shift') this.superQueued = true;
      if (k === 'q' || k === 'e') this.gadgetQueued = true;
      if (k === 'escape' || k === 'p') this.pauseQueued = true;
      if (k === 'tab') this.statsQueued = true;
      if (k === 'f') {
        // быстрая стрельба по курсору
        const p = this.worldPointer();
        this.shots.push({ sx: p.x, sy: p.y, auto: false });
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const p = this._local(e);
      this.pointer.type = e.pointerType;
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.down = true;
      this.pointer.inside = true;
      this.mouseDownAt = performance.now();
      this.mouseHold = 0;

      if (e.pointerType === 'touch') {
        this.isTouch = true;
        const w = window.innerWidth;
        if (p.x < w * 0.46) {
          if (!this.moveStick) {
            this.moveStick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
          }
        } else if (!this.aimStick) {
          this.aimStick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
          this.aimSource = 'stick';
          this.aiming = true;
          this.aimVec = { x: 0, y: 0 };
        }
      } else {
        this.aiming = true;
        this.aimSource = 'mouse';
      }
      if (c.setPointerCapture) {
        try {
          c.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    this._onPointerMove = (e) => {
      const p = this._local(e);
      this.pointer.type = e.pointerType || this.pointer.type;
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.inside = true;
      if (e.pointerType === 'touch') {
        this.isTouch = true;
        if (this.moveStick && this.moveStick.id === e.pointerId) {
          this.moveStick.x = p.x;
          this.moveStick.y = p.y;
        }
        if (this.aimStick && this.aimStick.id === e.pointerId) {
          this.aimStick.x = p.x;
          this.aimStick.y = p.y;
        }
      }
    };

    this._onPointerUp = (e) => {
      const p = this._local(e);
      const wasDown = this.pointer.down;
      this.pointer.down = false;
      if (e.pointerType === 'touch') {
        if (this.moveStick && this.moveStick.id === e.pointerId) {
          this.moveStick = null;
        }
        if (this.aimStick && this.aimStick.id === e.pointerId) {
          const dx = p.x - this.aimStick.ox;
          const dy = p.y - this.aimStick.oy;
          const len = Math.hypot(dx, dy);
          if (len < 22) {
            this.shots.push({ auto: true, angle: null });
          } else {
            this.shots.push({ angle: Math.atan2(dy, dx), power: Math.min(1, len / 110), auto: false });
          }
          this.aimStick = null;
          this.aiming = false;
          this.aimSource = 'none';
        }
      } else if (wasDown) {
        const held = performance.now() - this.mouseDownAt;
        this.aiming = false;
        this.aimSource = 'none';
        // Короткий клик или отпускание после прицеливания — выстрел
        if (held < 2500) {
          this.shots.push({ sx: p.x, sy: p.y, auto: false });
        }
      }
      if (c.releasePointerCapture) {
        try {
          c.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    this._onContext = (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const p = this._local(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.superQueued = true;
    };
    c.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('contextmenu', this._onContext);

    this._onBlur = () => {
      this.keys.clear();
      this.moveStick = null;
      this.aimStick = null;
      this.pointer.down = false;
      this.aiming = false;
    };
    window.addEventListener('blur', this._onBlur);
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  worldPointer() {
    return { x: this.pointer.x, y: this.pointer.y };
  }

  queueSuper() {
    this.superQueued = true;
  }
  queueGadget() {
    this.gadgetQueued = true;
  }

  takeShots() {
    const s = this.shots;
    this.shots = [];
    return s;
  }
  takeSuper() {
    const v = this.superQueued;
    this.superQueued = false;
    return v;
  }
  takeGadget() {
    const v = this.gadgetQueued;
    this.gadgetQueued = false;
    return v;
  }
  takePause() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }
  takeStats() {
    const v = this.statsQueued;
    this.statsQueued = false;
    return v;
  }

  reset() {
    this.keys.clear();
    this.shots = [];
    this.superQueued = false;
    this.gadgetQueued = false;
    this.pauseQueued = false;
    this.statsQueued = false;
    this.moveStick = null;
    this.aimStick = null;
    this.aiming = false;
    this.aimSource = 'none';
    this.pointer.down = false;
  }

  update(dt) {
    // Движение с клавиатуры
    let kx = 0;
    let ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft') || this.keys.has('ф')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright') || this.keys.has('в')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup') || this.keys.has('ц')) ky -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown') || this.keys.has('ы')) ky += 1;

    let mx = kx;
    let my = ky;
    if (this.moveStick) {
      const dx = this.moveStick.x - this.moveStick.ox;
      const dy = this.moveStick.y - this.moveStick.oy;
      const n = normalize(dx, dy);
      const power = Math.min(1, n.len / 46);
      if (n.len > 6) {
        mx = n.x * power;
        my = n.y * power;
      }
    }
    const n = normalize(mx, my);
    this.moveVec.x = n.x;
    this.moveVec.y = n.y;

    // Прицел со стика
    if (this.aimStick) {
      const dx = this.aimStick.x - this.aimStick.ox;
      const dy = this.aimStick.y - this.aimStick.oy;
      if (Math.hypot(dx, dy) > 8) {
        const a = Math.atan2(dy, dx);
        this.aimVec.x = Math.cos(a);
        this.aimVec.y = Math.sin(a);
        this.aiming = true;
        this.aimSource = 'stick';
      }
    }

    // Удержание мыши = очередь выстрелов
    if (this.pointer.down && this.pointer.type !== 'touch') {
      this.mouseHold += dt;
      this.holdTick = (this.holdTick || 0) + dt;
      if (this.mouseHold > 0.4 && this.holdTick > 0.09) {
        this.holdTick = 0;
        this.shots.push({ sx: this.pointer.x, sy: this.pointer.y, auto: false });
      }
    } else {
      this.mouseHold = 0;
      this.holdTick = 0;
    }
  }

  stickVector(which) {
    const s = which === 'move' ? this.moveStick : this.aimStick;
    if (!s) return null;
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const len = Math.hypot(dx, dy);
    const max = 46;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    return { ox: s.ox, oy: s.oy, dx, dy, len: Math.min(len, max), angle: Math.atan2(dy, dx) };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

export { TAU };
