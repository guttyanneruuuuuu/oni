// ===== Input: keyboard/mouse + mobile touch (joystick & look swipe) =====
import { $, clamp, isTouchDevice } from './utils.js';

export class Input {
  constructor() {
    this.moveX = 0; this.moveZ = 0;      // -1..1 local move intent
    this.lookDX = 0; this.lookDY = 0;    // accumulated look delta (consumed per frame)
    this.dash = false;
    this.useItem = false;                 // edge-triggered
    this.signal = false;
    this.keys = {};
    this.touch = isTouchDevice();
    this._setupKeyboard();
    this._setupMouse();
    if (this.touch) {
      document.body.classList.add('is-touch');
      this._setupTouch();
    }
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.useItem = true;
      if (e.code === 'KeyQ') this.signal = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  _setupMouse() {
    const canvas = $('game-canvas');
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      this._mouseDownTime = performance.now();
      this._mouseMoved = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      this.lookDX += dx * 0.0042;
      this.lookDY += dy * 0.0032;
      this._mouseMoved += Math.abs(dx) + Math.abs(dy);
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      if (dragging && this._mouseMoved < 6 && performance.now() - this._mouseDownTime < 300) {
        this.useItem = true; // click = use item
      }
      dragging = false;
    });
  }

  _setupTouch() {
    // --- Joystick (left zone) ---
    const zone = $('joystick-zone');
    const base = $('joystick-base');
    const knob = $('joystick-knob');
    let joyId = null, cx = 0, cy = 0;
    const R = 55;

    zone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (joyId !== null) continue;
        joyId = t.identifier;
        cx = t.clientX; cy = t.clientY;
        base.style.left = (cx - 55) + 'px';
        base.style.top = (cy - 55) + 'px';
        base.style.bottom = 'auto';
        base.classList.add('show');
      }
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.moveX = dx / R;
        this.moveZ = dy / R;
        // auto-dash when stick pushed to edge
        this._joyDash = d > R * 0.92;
      }
      e.preventDefault();
    }, { passive: false });

    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        this.moveX = 0; this.moveZ = 0;
        this._joyDash = false;
        knob.style.transform = '';
        base.classList.remove('show');
      }
    };
    zone.addEventListener('touchend', joyEnd);
    zone.addEventListener('touchcancel', joyEnd);

    // --- Look (right side of screen, anywhere not joystick/buttons) ---
    const canvas = $('game-canvas');
    let lookId = null, llx = 0, lly = 0;
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.42) continue; // left = joystick zone
        if (lookId !== null) continue;
        lookId = t.identifier;
        llx = t.clientX; lly = t.clientY;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.lookDX += (t.clientX - llx) * 0.006;
        this.lookDY += (t.clientY - lly) * 0.004;
        llx = t.clientX; lly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    canvas.addEventListener('touchend', lookEnd);
    canvas.addEventListener('touchcancel', lookEnd);

    // --- Buttons ---
    $('btn-item').addEventListener('touchstart', (e) => { this.useItem = true; e.preventDefault(); }, { passive: false });
    const dashBtn = $('btn-dash');
    dashBtn.addEventListener('touchstart', (e) => {
      this._btnDash = !this._btnDash;
      dashBtn.classList.toggle('active', this._btnDash);
      e.preventDefault();
    }, { passive: false });
    $('btn-signal').addEventListener('touchstart', (e) => { this.signal = true; e.preventDefault(); }, { passive: false });
  }

  // Call once per frame: returns and clears edge triggers
  poll() {
    if (!this.touch) {
      this.moveX = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
      this.moveZ = (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) - (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0);
      this.dash = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    } else {
      this.dash = !!(this._joyDash || this._btnDash);
    }
    const out = {
      moveX: clamp(this.moveX, -1, 1),
      moveZ: clamp(this.moveZ, -1, 1),
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      dash: this.dash,
      useItem: this.useItem,
      signal: this.signal,
    };
    this.lookDX = 0; this.lookDY = 0;
    this.useItem = false; this.signal = false;
    return out;
  }
}
