// ===== VFX: lightweight pooled particle system + screen effects =====
// All effects are GPU-cheap (Points / additive sprites), designed for mobile.
import * as THREE from 'three';

const MAX_PARTICLES = 600;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // round soft sprite texture
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c2 = cv.getContext('2d');
    const grad = c2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = grad;
    c2.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);

    this.mat = new THREE.PointsMaterial({
      size: 0.3, map: tex, transparent: true, opacity: 0.95,
      vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // particle pool
    this.pool = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        alive: false, x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1,
        r: 1, g: 1, b: 1, size: 0.3, gravity: 0, drag: 1,
        shrink: true,
      });
    }
    this._cursor = 0;
  }

  emit(opts) {
    const n = opts.count || 8;
    for (let i = 0; i < n; i++) {
      const p = this.pool[this._cursor];
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      p.alive = true;
      const spread = opts.spread ?? 0.3;
      p.x = opts.x + (Math.random() - 0.5) * spread;
      p.y = (opts.y ?? 0.8) + (Math.random() - 0.5) * spread;
      p.z = opts.z + (Math.random() - 0.5) * spread;
      const sp = opts.speed ?? 2;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      p.vx = Math.cos(a) * Math.cos(e) * sp * (0.4 + Math.random() * 0.6) + (opts.vx || 0);
      p.vy = Math.sin(e) * sp * (0.4 + Math.random() * 0.6) + (opts.vy || 0);
      p.vz = Math.sin(a) * Math.cos(e) * sp * (0.4 + Math.random() * 0.6) + (opts.vz || 0);
      p.maxLife = p.life = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.7);
      const col = opts.color ?? 0xffffff;
      p.r = ((col >> 16) & 255) / 255;
      p.g = ((col >> 8) & 255) / 255;
      p.b = (col & 255) / 255;
      // slight hue jitter
      const j = opts.jitter ?? 0.15;
      p.r = Math.min(1, p.r * (1 - j / 2 + Math.random() * j));
      p.g = Math.min(1, p.g * (1 - j / 2 + Math.random() * j));
      p.b = Math.min(1, p.b * (1 - j / 2 + Math.random() * j));
      p.size = (opts.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      p.gravity = opts.gravity ?? 0;
      p.drag = opts.drag ?? 0.94;
      p.shrink = opts.shrink !== false;
    }
  }

  update(dt) {
    const pos = this.positions, col = this.colors, sz = this.sizes;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.alive) { pos[i * 3 + 1] = -999; sz[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; pos[i * 3 + 1] = -999; sz[i] = 0; continue; }
      p.vy += p.gravity * dt;
      const dragF = Math.pow(p.drag, dt * 60);
      p.vx *= dragF; p.vy *= dragF; p.vz *= dragF;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03 && p.gravity) { p.y = 0.03; p.vy *= -0.3; }
      const t = p.life / p.maxLife;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * t; col[i * 3 + 1] = p.g * t; col[i * 3 + 2] = p.b * t;
      sz[i] = p.shrink ? p.size * (0.3 + t * 0.7) : p.size;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  // ----- preset effects -----
  hitSpark(x, z) {
    this.emit({ x, z, y: 1.1, count: 26, color: 0xff3322, speed: 4.5, life: 0.5, size: 0.45, gravity: -7, drag: 0.9 });
    this.emit({ x, z, y: 1.1, count: 12, color: 0xffaa44, speed: 3, life: 0.35, size: 0.3, gravity: -4 });
  }
  swingTrail(x, z, yaw) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    this.emit({ x: x + dx * 1.2, z: z + dz * 1.2, y: 1.3, count: 8, color: 0xff5544, speed: 1.5, life: 0.25, size: 0.4, vx: dx * 4, vz: dz * 4, drag: 0.85 });
  }
  captureBurst(x, z) {
    this.emit({ x, z, y: 1, count: 40, color: 0xff2244, speed: 5, life: 0.9, size: 0.5, gravity: -3, drag: 0.92 });
    this.emit({ x, z, y: 1, count: 20, color: 0x8800ff, speed: 3, life: 1.1, size: 0.4, gravity: 1 });
  }
  rescueBurst(x, z) {
    this.emit({ x, z, y: 0.5, count: 36, color: 0x44ffaa, speed: 3, life: 1, size: 0.45, gravity: 2.5, drag: 0.95 });
    this.emit({ x, z, y: 0.5, count: 16, color: 0xaaffff, speed: 2, life: 1.2, size: 0.35, gravity: 3 });
  }
  pickupSparkle(x, z) {
    this.emit({ x, z, y: 0.9, count: 14, color: 0xffee88, speed: 2, life: 0.55, size: 0.32, gravity: 2 });
  }
  boostTrail(x, z) {
    this.emit({ x, z, y: 0.35, count: 2, color: 0x44ff88, speed: 0.6, life: 0.45, size: 0.35, drag: 0.9 });
  }
  hasteTrail(x, z) {
    this.emit({ x, z, y: 0.5, count: 3, color: 0xff4400, speed: 0.8, life: 0.4, size: 0.42, gravity: 1.2 });
  }
  smokeCloud(x, z, radius) {
    this.emit({ x, z, y: 1, count: 50, color: 0x99aabb, speed: 1.2, life: 4, size: 2.2, spread: radius, gravity: 0.15, drag: 0.985, shrink: false, jitter: 0.08 });
  }
  flashBurst(x, z) {
    this.emit({ x, z, y: 1.4, count: 30, color: 0xffffcc, speed: 7, life: 0.4, size: 0.6, drag: 0.88 });
  }
  trapSnap(x, z) {
    this.emit({ x, z, y: 0.3, count: 18, color: 0xff7722, speed: 3.5, life: 0.5, size: 0.35, gravity: -5 });
  }
  decoyPoof(x, z) {
    this.emit({ x, z, y: 1, count: 24, color: 0x66ddff, speed: 2.5, life: 0.7, size: 0.45, gravity: 0.6 });
  }
  dashDust(x, z, yaw) {
    this.emit({ x: x - Math.sin(yaw) * 0.4, z: z - Math.cos(yaw) * 0.4, y: 0.12, count: 1, color: 0x887755, speed: 0.5, life: 0.5, size: 0.3, gravity: 0.8, jitter: 0.05 });
  }
  vaultDust(x, z) {
    this.emit({ x, z, y: 0.6, count: 10, color: 0xbbaa88, speed: 1.5, life: 0.45, size: 0.3, gravity: -1 });
  }
  unfreezeBurst(x, z) {
    this.emit({ x, z, y: 1.2, count: 44, color: 0xff2200, speed: 6, life: 0.8, size: 0.55, gravity: -2, drag: 0.9 });
    this.emit({ x, z, y: 1.2, count: 20, color: 0xffaa00, speed: 4, life: 0.6, size: 0.4 });
  }
  endgameAura(x, z) {
    this.emit({ x, z, y: 0.2, count: 1, color: 0xff0044, speed: 0.3, life: 1.2, size: 0.5, gravity: 1.6, shrink: false });
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ===== Screen shake helper =====
export class ScreenShake {
  constructor() { this.trauma = 0; }
  add(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    return {
      x: (Math.random() - 0.5) * 0.22 * s,
      y: (Math.random() - 0.5) * 0.16 * s,
      roll: (Math.random() - 0.5) * 0.05 * s,
    };
  }
}

// ===== Damage / event vignette =====
export function pulseVignette(color = 'rgba(255,0,0,0.35)', dur = 500) {
  let el = document.getElementById('vfx-vignette');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vfx-vignette';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;transition:opacity .15s;';
    document.body.appendChild(el);
  }
  el.style.background = `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.transition = `opacity ${dur}ms`; el.style.opacity = '0'; }, 80);
  setTimeout(() => { el.style.transition = 'opacity .15s'; }, dur + 200);
}

// ===== Speed lines overlay (canvas 2D, drawn over WebGL) =====
export class SpeedLines {
  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.id = 'vfx-speedlines';
    this.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;';
    document.body.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.intensity = 0;
    this._resize();
    window.addEventListener('resize', this._resizeBound = () => this._resize());
  }
  _resize() {
    this.cv.width = window.innerWidth / 2;   // half-res for perf
    this.cv.height = window.innerHeight / 2;
  }
  set(v) { this.intensity = Math.max(0, Math.min(1, v)); }
  draw() {
    const { ctx, cv } = this;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (this.intensity < 0.05) return;
    const n = Math.floor(this.intensity * 14);
    const cx = cv.width / 2, cy = cv.height / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + this.intensity * 0.12})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = (0.55 + Math.random() * 0.3) * Math.min(cx, cy);
      const r1 = r0 + 30 + Math.random() * 80 * this.intensity;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8);
      ctx.stroke();
    }
  }
  dispose() {
    window.removeEventListener('resize', this._resizeBound);
    this.cv.remove();
  }
}
