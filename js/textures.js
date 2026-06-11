// ===== Procedural canvas textures: bricks, stone, ground, wood, fur =====
// Generates detailed, gritty textures at runtime so the game stays a
// zero-asset static site but looks far richer than flat colors.
import * as THREE from 'three';

function makeCanvas(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return [cv, cv.getContext('2d')];
}

function grain(ctx, size, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function toTex(cv, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Old brick wall (interior structures) ----
export function brickTexture() {
  const S = 256;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = '#4a4440';   // mortar
  ctx.fillRect(0, 0, S, S);
  const bh = 32, bw = 64;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off;
      const shade = 0.75 + Math.random() * 0.45;
      const r = (92 * shade) | 0, g = (66 * shade) | 0, b = (56 * shade) | 0;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      // chipped edges / stains
      if (Math.random() < 0.4) {
        ctx.fillStyle = 'rgba(20,16,14,0.35)';
        ctx.fillRect(x + 2 + Math.random() * (bw - 14), row * bh + 2 + Math.random() * (bh - 10), 8, 5);
      }
    }
  }
  // moss / dirt streaks
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${30 + Math.random() * 30 | 0},${50 + Math.random() * 30 | 0},30,${0.05 + Math.random() * 0.1})`;
    const x = Math.random() * S;
    ctx.fillRect(x, Math.random() * S, 3 + Math.random() * 8, 20 + Math.random() * 60);
  }
  grain(ctx, S, 900, 0.06);
  return toTex(cv);
}

// ---- Big stone blocks (perimeter wall) ----
export function stoneTexture() {
  const S = 256;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = '#2e3138';
  ctx.fillRect(0, 0, S, S);
  const bh = 64, bw = 86;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off;
      const shade = 0.8 + Math.random() * 0.4;
      const v = (74 * shade) | 0;
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      ctx.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      // highlight top edge
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 3, row * bh + 3, bw - 6, 4);
      // cracks
      if (Math.random() < 0.5) {
        ctx.strokeStyle = 'rgba(10,10,14,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let cx = x + 10 + Math.random() * (bw - 20), cy = row * bh + 6;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) { cx += (Math.random() - 0.5) * 18; cy += 12; ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    }
  }
  grain(ctx, S, 1200, 0.05);
  return toTex(cv);
}

// ---- Ground: dark grass / dirt patches ----
export function groundTexture() {
  const S = 512;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = '#3a4a2e';
  ctx.fillRect(0, 0, S, S);
  // dirt patches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 14 + Math.random() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${56 + Math.random() * 22 | 0},${44 + Math.random() * 14 | 0},30,0.55)`);
    g.addColorStop(1, 'rgba(60,48,32,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // grass blades speckle (brighter)
  for (let i = 0; i < 4200; i++) {
    const gr = 85 + Math.random() * 70 | 0;
    ctx.fillStyle = `rgba(${gr * 0.45 | 0},${gr},${gr * 0.34 | 0},${0.18 + Math.random() * 0.25})`;
    const x = Math.random() * S, y = Math.random() * S;
    ctx.fillRect(x, y, 1.4, 2 + Math.random() * 3.5);
  }
  // subtle dark veins
  ctx.strokeStyle = 'rgba(8,12,6,0.25)';
  for (let i = 0; i < 24; i++) {
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  grain(ctx, S, 2400, 0.05);
  return toTex(cv, 14, 14);
}

// ---- Stone tile (plaza floor) ----
export function tileTexture() {
  const S = 256;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = '#22242b';
  ctx.fillRect(0, 0, S, S);
  const t = 64;
  for (let row = 0; row < S / t; row++) {
    for (let col = 0; col < S / t; col++) {
      const shade = 0.8 + Math.random() * 0.35;
      const v = (58 * shade) | 0;
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
      ctx.fillRect(col * t + 2, row * t + 2, t - 4, t - 4);
      if (Math.random() < 0.45) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(col * t + 4, row * t + 4, t - 8, 6);
      }
    }
  }
  grain(ctx, S, 800, 0.05);
  return toTex(cv, 6, 6);
}

// ---- Weathered wood planks (crates) ----
export function woodTexture() {
  const S = 256;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = '#5a4326';
  ctx.fillRect(0, 0, S, S);
  const pw = 42;
  for (let col = 0; col < S / pw; col++) {
    const shade = 0.75 + Math.random() * 0.5;
    ctx.fillStyle = `rgb(${108 * shade | 0},${78 * shade | 0},${44 * shade | 0})`;
    ctx.fillRect(col * pw + 1, 0, pw - 2, S);
    // wood grain lines
    ctx.strokeStyle = `rgba(40,26,12,${0.25 + Math.random() * 0.2})`;
    for (let l = 0; l < 5; l++) {
      ctx.lineWidth = 0.8 + Math.random();
      ctx.beginPath();
      let x = col * pw + 4 + Math.random() * (pw - 8), y = 0;
      ctx.moveTo(x, y);
      while (y < S) { y += 18; x += (Math.random() - 0.5) * 5; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // knots
    if (Math.random() < 0.6) {
      ctx.fillStyle = 'rgba(38,24,10,0.7)';
      ctx.beginPath();
      ctx.ellipse(col * pw + pw / 2, Math.random() * S, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // metal band
  ctx.fillStyle = '#3b3b40';
  ctx.fillRect(0, 28, S, 12);
  ctx.fillRect(0, S - 40, S, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, 28, S, 2);
  ctx.fillRect(0, S - 40, S, 2);
  grain(ctx, S, 700, 0.06);
  return toTex(cv);
}

// ---- Fur (oni body) ----
export function furTexture(base = [60, 36, 46]) {
  const S = 256;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const sh = 0.55 + Math.random() * 0.9;
    ctx.strokeStyle = `rgba(${base[0] * sh | 0},${base[1] * sh | 0},${base[2] * sh | 0},0.5)`;
    ctx.lineWidth = 1;
    const x = Math.random() * S, y = Math.random() * S;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.9;
    const len = 4 + Math.random() * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return toTex(cv, 2, 2);
}

// ---- Cloth (runner hoodie) ----
export function clothTexture(rgb) {
  const S = 128;
  const [cv, ctx] = makeCanvas(S);
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(0, 0, S, S);
  // knit pattern
  for (let y = 0; y < S; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${y % 6 ? 0.06 : 0.1})`;
    ctx.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, 0, 1, S);
  }
  grain(ctx, S, 250, 0.05);
  return toTex(cv, 2, 2);
}

// ---- Denim (runner pants) ----
export function denimTexture() {
  return clothTexture([44, 58, 84]);
}

// ---- Night sky dome (brightened: moonlit twilight blue) ----
export function skyTexture() {
  const S = 512;
  const [cv, ctx] = makeCanvas(S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#1b2c55');
  g.addColorStop(0.55, '#2c4070');
  g.addColorStop(0.8, '#3e548c');
  g.addColorStop(1, '#4d639c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // clouds (wispy, brighter moonlit)
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = S * 0.25 + Math.random() * S * 0.45;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 70);
    grad.addColorStop(0, 'rgba(140,158,200,0.18)');
    grad.addColorStop(1, 'rgba(140,158,200,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
