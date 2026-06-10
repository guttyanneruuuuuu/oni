// ===== Map: outdoor night arena (DbD-style) =====
// Open ground + brick ruins/buildings + trees + rocks + crates.
// Deterministic procedural build (fixed seed) so host & clients see the same map.
import * as THREE from 'three';
import {
  brickTexture, stoneTexture, groundTexture, tileTexture,
  woodTexture, skyTexture,
} from './textures.js';

export const CELL = 2;
export const GRID_W = 32;
export const GRID_H = 32;
export const WORLD_W = GRID_W * CELL;   // 64
export const WORLD_H = GRID_H * CELL;   // 64

// Cell types
const FLOOR = 0, PERIM = 1, BRICK = 2, CRATE = 3, TREE = 4, ROCK = 5, LOW = 6, FENCE = 7;
const BLOCKING = new Set([PERIM, BRICK, CRATE, TREE, ROCK, LOW, FENCE]);

export function cellToWorld(cx, cz) {
  return { x: (cx - GRID_W / 2 + 0.5) * CELL, z: (cz - GRID_H / 2 + 0.5) * CELL };
}
export function worldToCell(x, z) {
  return {
    cx: Math.floor(x / CELL + GRID_W / 2),
    cz: Math.floor(z / CELL + GRID_H / 2),
  };
}

// Tiny deterministic PRNG (mulberry32)
function seededRand(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameMap {
  constructor() {
    this.cells = [];        // typed layout
    this.grid = [];         // 0 walkable / 1 blocked (for minimap & A*)
    this.walkableCells = [];
    this.jail = null;
    this._buildLayout();
  }

  // ---------- Layout generation (deterministic) ----------
  _buildLayout() {
    const rnd = seededRand(20260610);
    const g = [];
    for (let z = 0; z < GRID_H; z++) {
      const row = [];
      for (let x = 0; x < GRID_W; x++) {
        row.push((x === 0 || z === 0 || x === GRID_W - 1 || z === GRID_H - 1) ? PERIM : FLOOR);
      }
      g.push(row);
    }

    const setRect = (x0, z0, w, h, v) => {
      for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
        if (x > 0 && z > 0 && x < GRID_W - 1 && z < GRID_H - 1) g[z][x] = v;
      }
    };
    // Building shell: brick walls with door gaps. doors = list of [x,z] cells to clear
    const building = (x0, z0, w, h, doors) => {
      for (let x = x0; x < x0 + w; x++) { g[z0][x] = BRICK; g[z0 + h - 1][x] = BRICK; }
      for (let z = z0; z < z0 + h; z++) { g[z][x0] = BRICK; g[z][x0 + w - 1] = BRICK; }
      for (const [dx, dz] of doors) g[dz][dx] = FLOOR;
      return { x0, z0, w, h };
    };

    this.buildings = [];
    // NW barn 7x6, doors south + east
    this.buildings.push(building(4, 4, 7, 6, [[7, 9], [8, 9], [10, 6]]));
    // NE house 6x6, doors south + west
    this.buildings.push(building(21, 5, 7, 6, [[24, 10], [21, 7], [21, 8]]));
    // SW house 6x6, doors north + east
    this.buildings.push(building(5, 21, 6, 6, [[7, 21], [8, 21], [10, 23]]));
    // SE barn 7x6, doors north + west
    this.buildings.push(building(20, 20, 8, 7, [[23, 20], [24, 20], [20, 23]]));

    // Central ruin: broken L-walls around jail (plaza) — mix of full & low
    g[13][13] = BRICK; g[13][14] = LOW;  g[13][17] = LOW;  g[13][18] = BRICK;
    g[18][13] = BRICK; g[18][14] = LOW;  g[18][17] = LOW;  g[18][18] = BRICK;
    g[14][13] = LOW;  g[17][13] = BRICK; g[14][18] = BRICK; g[17][18] = LOW;

    // Mid-field cover: LOW walls you can see over (less maze, more cover)
    setRect(13, 7, 6, 1, LOW);    // north low wall
    setRect(13, 24, 6, 1, LOW);   // south low wall
    setRect(7, 13, 1, 6, LOW);    // west
    setRect(24, 13, 1, 6, LOW);   // east

    // Broken fences for atmosphere (blocking but see-through)
    setRect(3, 15, 3, 1, FENCE);  // west fence stub
    setRect(26, 15, 3, 1, FENCE); // east fence stub
    setRect(15, 3, 1, 2, FENCE);  // north stub
    setRect(15, 27, 1, 2, FENCE); // south stub

    // Jail at exact center
    const jc = cellToWorld(15, 15); // will offset to true center below
    this.jail = { x: (15.5 - GRID_W / 2 + 0.5) * CELL - CELL / 2, z: (15.5 - GRID_H / 2 + 0.5) * CELL - CELL / 2 };
    // simpler: center of the 4 cells 15,16 x 15,16
    this.jail = { x: 0, z: 0 };

    // Trees / rocks / crates scattered deterministically on open ground
    const tryPlace = (v, count, minDistCenter = 6) => {
      let placed = 0, guard = 0;
      while (placed < count && guard++ < 500) {
        const x = 2 + Math.floor(rnd() * (GRID_W - 4));
        const z = 2 + Math.floor(rnd() * (GRID_H - 4));
        if (g[z][x] !== FLOOR) continue;
        // keep away from jail center & building doorways area
        const wx = (x - GRID_W / 2 + 0.5) * CELL, wz = (z - GRID_H / 2 + 0.5) * CELL;
        if (wx * wx + wz * wz < minDistCenter * minDistCenter) continue;
        // don't block: ensure at least 5 of 8 neighbors are floor (keeps paths open)
        let open = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          if (g[z + dz] && g[z + dz][x + dx] === FLOOR) open++;
        }
        if (open < 6) continue;
        g[z][x] = v;
        placed++;
      }
    };
    tryPlace(TREE, 16, 9);
    tryPlace(ROCK, 9, 8);
    tryPlace(CRATE, 12, 7);

    this.cells = g;
    this.grid = [];
    for (let z = 0; z < GRID_H; z++) {
      const row = [];
      for (let x = 0; x < GRID_W; x++) {
        const blocked = BLOCKING.has(g[z][x]) ? 1 : 0;
        row.push(blocked);
        if (!blocked) this.walkableCells.push({ cx: x, cz: z });
      }
      this.grid.push(row);
    }
  }

  isBlocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) return true;
    return this.grid[cz][cx] === 1;
  }

  // tall obstacles only (LOW walls & fences can be seen over at eye height)
  blocksSight(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) return true;
    const c = this.cells[cz][cx];
    return c === PERIM || c === BRICK || c === TREE;
  }

  // Circle-vs-grid collision: returns corrected position
  collide(x, z, radius) {
    const { cx, cz } = worldToCell(x, z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (!this.isBlocked(gx, gz)) continue;
        const wx = (gx - GRID_W / 2) * CELL, wz = (gz - GRID_H / 2) * CELL;
        const nearX = Math.max(wx, Math.min(x, wx + CELL));
        const nearZ = Math.max(wz, Math.min(z, wz + CELL));
        let ddx = x - nearX, ddz = z - nearZ;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < radius * radius && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = nearX + (ddx / d) * radius;
          z = nearZ + (ddz / d) * radius;
        } else if (d2 <= 1e-9) {
          x += radius;
        }
      }
    }
    const half = WORLD_W / 2 - radius - 0.1;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    return { x, z };
  }

  hasLOS(x1, z1, x2, z2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (CELL * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const { cx, cz } = worldToCell(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
      if (this.blocksSight(cx, cz)) return false;
    }
    return true;
  }

  randomWalkable() {
    const c = this.walkableCells[Math.floor(Math.random() * this.walkableCells.length)];
    return cellToWorld(c.cx, c.cz);
  }

  // ---------- Build the 3D scene ----------
  build(scene) {
    const group = new THREE.Group();
    const rnd = seededRand(777);

    // --- Sky dome + stars + moon ---
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(140, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
    );
    group.add(sky);
    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI * 2, e = rnd() * Math.PI * 0.46 + 0.06;
      const r = 132;
      starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcdd8ff, size: 0.55, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85,
    }));
    group.add(stars);
    // moon (emissive disc, no fog)
    const moonMesh = new THREE.Mesh(
      new THREE.CircleGeometry(7, 32),
      new THREE.MeshBasicMaterial({ color: 0xf4f0dc, fog: false })
    );
    moonMesh.position.set(55, 80, 30);
    moonMesh.lookAt(0, 0, 0);
    group.add(moonMesh);
    const moonGlow = new THREE.Mesh(
      new THREE.CircleGeometry(11, 32),
      new THREE.MeshBasicMaterial({ color: 0xaab4d8, transparent: true, opacity: 0.22, fog: false })
    );
    moonGlow.position.copy(moonMesh.position).multiplyScalar(1.002);
    moonGlow.lookAt(0, 0, 0);
    group.add(moonGlow);

    // --- Ground ---
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 40, WORLD_H + 40), groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // Plaza: circular stone tiles around jail
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 36),
      new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    group.add(plaza);

    // --- Shared materials ---
    const brickMat = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.92 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2228, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3c2e20, roughness: 0.95 });
    const leafMatA = new THREE.MeshStandardMaterial({ color: 0x1d3a22, roughness: 0.95 });
    const leafMatB = new THREE.MeshStandardMaterial({ color: 0x27482a, roughness: 0.95 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x55585f, roughness: 0.98, flatShading: true });

    // --- Instanced walls (perimeter & bricks) and crates ---
    let perimCount = 0, brickCount = 0, crateCount = 0, lowCount = 0;
    const treeCells = [], rockCells = [], fenceCells = [];
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) {
      const c = this.cells[z][x];
      if (c === PERIM) perimCount++;
      else if (c === BRICK) brickCount++;
      else if (c === CRATE) crateCount++;
      else if (c === LOW) lowCount++;
      else if (c === TREE) treeCells.push({ x, z });
      else if (c === ROCK) rockCells.push({ x, z });
      else if (c === FENCE) fenceCells.push({ x, z });
    }

    const perimGeo = new THREE.BoxGeometry(CELL, 4.6, CELL);
    const brickGeo = new THREE.BoxGeometry(CELL, 3.4, CELL);
    const lowGeo = new THREE.BoxGeometry(CELL, 1.15, CELL);
    const crateGeo = new THREE.BoxGeometry(CELL * 0.88, 1.5, CELL * 0.88);
    const perimMesh = new THREE.InstancedMesh(perimGeo, stoneMat, perimCount);
    const brickMesh = new THREE.InstancedMesh(brickGeo, brickMat, brickCount);
    const lowMesh = new THREE.InstancedMesh(lowGeo, brickMat, lowCount);
    const crateMesh = new THREE.InstancedMesh(crateGeo, woodMat, crateCount);
    perimMesh.castShadow = perimMesh.receiveShadow = true;
    brickMesh.castShadow = brickMesh.receiveShadow = true;
    lowMesh.castShadow = lowMesh.receiveShadow = true;
    crateMesh.castShadow = crateMesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const vs = new THREE.Vector3();
    let pi = 0, bi = 0, ci = 0, li = 0;
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) {
      const c = this.cells[z][x];
      const w = cellToWorld(x, z);
      if (c === PERIM) {
        m.makeTranslation(w.x, 2.3, w.z);
        perimMesh.setMatrixAt(pi++, m);
      } else if (c === BRICK) {
        // slightly varied heights for ruined-wall feel
        const hs = 0.82 + rnd() * 0.26;
        q.identity();
        vs.set(1, hs, 1);
        m.compose(new THREE.Vector3(w.x, 1.7 * hs, w.z), q, vs);
        brickMesh.setMatrixAt(bi++, m);
      } else if (c === LOW) {
        const hs = 0.85 + rnd() * 0.3;
        q.identity();
        vs.set(1, hs, 1);
        m.compose(new THREE.Vector3(w.x, 0.575 * hs, w.z), q, vs);
        lowMesh.setMatrixAt(li++, m);
      } else if (c === CRATE) {
        e.set(0, (rnd() - 0.5) * 0.5, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(w.x, 0.75, w.z), q, new THREE.Vector3(1, 1, 1));
        crateMesh.setMatrixAt(ci++, m);
      }
    }
    group.add(perimMesh, brickMesh, lowMesh, crateMesh);

    // --- Broken wooden fences ---
    const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95 });
    for (const f of fenceCells) {
      const w = cellToWorld(f.x, f.z);
      const fence = new THREE.Group();
      // horizontal? check neighbor cells in row
      const horiz = (this.cells[f.z][f.x - 1] === FENCE || this.cells[f.z][f.x + 1] === FENCE);
      for (let k = -1; k <= 1; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0 + rnd() * 0.25, 0.12), fencePostMat);
        if (horiz) post.position.set(k * 0.8, 0.5, 0);
        else post.position.set(0, 0.5, k * 0.8);
        post.rotation.z = (rnd() - 0.5) * 0.12;
        post.castShadow = true;
        fence.add(post);
      }
      for (let r = 0; r < 2; r++) {
        if (rnd() < 0.25) continue; // missing planks = broken look
        const rail = new THREE.Mesh(new THREE.BoxGeometry(horiz ? CELL : 0.09, 0.13, horiz ? 0.09 : CELL), fencePostMat);
        rail.position.y = 0.42 + r * 0.4;
        rail.rotation[horiz ? 'z' : 'x'] = (rnd() - 0.5) * 0.08;
        rail.castShadow = true;
        fence.add(rail);
      }
      fence.position.set(w.x, 0, w.z);
      group.add(fence);
    }

    // --- Building roofs ---
    for (const b of this.buildings) {
      const wx0 = (b.x0 - GRID_W / 2) * CELL, wz0 = (b.z0 - GRID_H / 2) * CELL;
      const bw = b.w * CELL, bh = b.h * CELL;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, 0.28, bh + 0.6), roofMat);
      roof.position.set(wx0 + bw / 2, 3.4 + 0.14, wz0 + bh / 2);
      roof.castShadow = roof.receiveShadow = true;
      group.add(roof);
      // gable ridge for visual interest
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 0.5, 1.4), roofMat);
      ridge.position.set(wx0 + bw / 2, 3.85, wz0 + bh / 2);
      ridge.castShadow = true;
      group.add(ridge);
      // warm interior light leaking out (cheap ambience): small point light at door height
      const il = new THREE.PointLight(0xff9a3d, 6, 10, 2);
      il.position.set(wx0 + bw / 2, 2.0, wz0 + bh / 2);
      group.add(il);
    }

    // --- Trees ---
    for (const t of treeCells) {
      const w = cellToWorld(t.x, t.z);
      const tree = new THREE.Group();
      const s = 0.85 + rnd() * 0.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 2.4 * s, 7), trunkMat);
      trunk.position.y = 1.2 * s;
      trunk.castShadow = true;
      tree.add(trunk);
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const r = (1.5 - i * 0.38) * s;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.6 * s, 8), i % 2 ? leafMatA : leafMatB);
        cone.position.y = (2.1 + i * 1.0) * s;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.position.set(w.x + (rnd() - 0.5) * 0.5, 0, w.z + (rnd() - 0.5) * 0.5);
      tree.rotation.y = rnd() * Math.PI * 2;
      group.add(tree);
    }

    // --- Rocks ---
    for (const r of rockCells) {
      const w = cellToWorld(r.x, r.z);
      const s = 0.7 + rnd() * 0.55;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95 * s, 0), rockMat);
      rock.position.set(w.x, 0.55 * s, w.z);
      rock.scale.set(1, 0.72, 1);
      rock.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
      rock.castShadow = rock.receiveShadow = true;
      group.add(rock);
    }

    // --- Grass tufts (visual only, cheap crossed planes) ---
    const tuftMat = new THREE.MeshStandardMaterial({
      color: 0x37502c, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });
    const tuftGeo = new THREE.PlaneGeometry(0.7, 0.5);
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 160);
    let ti = 0;
    let guard = 0;
    while (ti < 160 && guard++ < 800) {
      const x = (rnd() - 0.5) * (WORLD_W - 6);
      const z = (rnd() - 0.5) * (WORLD_H - 6);
      const { cx, cz } = worldToCell(x, z);
      if (this.isBlocked(cx, cz)) continue;
      if (x * x + z * z < 60) continue;
      e.set(0, rnd() * Math.PI, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0.24, z), q, new THREE.Vector3(1, 1, 1));
      tufts.setMatrixAt(ti++, m);
    }
    tufts.count = ti;
    group.add(tufts);

    // --- Jail: rusty cage on the plaza ---
    const jailGroup = new THREE.Group();
    jailGroup.position.set(this.jail.x, 0, this.jail.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.7, 28),
      new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    jailGroup.add(ring);
    this.jailRing = ring;
    const barMat = new THREE.MeshStandardMaterial({ color: 0x4d5563, roughness: 0.5, metalness: 0.7 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.4, 6), barMat);
      bar.position.set(Math.cos(a) * 1.45, 1.7, Math.sin(a) * 1.45);
      bar.castShadow = true;
      jailGroup.add(bar);
    }
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 6, 24), barMat);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 3.4;
    jailGroup.add(topRing);
    const midRing = topRing.clone();
    midRing.position.y = 1.0;
    jailGroup.add(midRing);
    const jailLight = new THREE.PointLight(0x55ccff, 12, 14, 2);
    jailLight.position.y = 3.0;
    jailGroup.add(jailLight);
    group.add(jailGroup);

    // --- Street lamps (warm pools of light) ---
    const lampPosts = [
      [-22, -22], [22, -22], [-22, 22], [22, 22], [0, -11], [0, 11],
    ];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6, metalness: 0.5 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffaa44, emissiveIntensity: 2.2 });
    for (const [lx, lz] of lampPosts) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 7), poleMat);
      pole.position.set(lx, 2.3, lz);
      pole.castShadow = true;
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), poleMat);
      arm.position.set(lx + 0.4, 4.5, lz);
      group.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lampMat);
      lamp.position.set(lx + 0.8, 4.4, lz);
      group.add(lamp);
      const pl = new THREE.PointLight(0xffbb66, 16, 17, 1.9);
      pl.position.set(lx + 0.8, 4.2, lz);
      group.add(pl);
      // volumetric-ish light cone (additive, fades to nothing at ground)
      const coneGeo = new THREE.ConeGeometry(2.4, 4.2, 20, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffcf8a, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        depthWrite: false, fog: false,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(lx + 0.8, 2.2, lz);
      group.add(cone);
      // light pool decal on ground
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(2.6, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffb35e, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(lx + 0.8, 0.03, lz);
      group.add(pool);
    }

    // --- Ground mist patches (DbD-style low fog planes) ---
    const mistMat = new THREE.MeshBasicMaterial({
      color: 0x8a9bc0, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mists = [];
    for (let i = 0; i < 12; i++) {
      const mp = new THREE.Mesh(new THREE.CircleGeometry(4 + rnd() * 5, 16), mistMat);
      mp.rotation.x = -Math.PI / 2;
      mp.position.set((rnd() - 0.5) * WORLD_W * 0.85, 0.35 + rnd() * 0.5, (rnd() - 0.5) * WORLD_H * 0.85);
      group.add(mp);
      this.mists.push({ mesh: mp, baseX: mp.position.x, baseZ: mp.position.z, sp: 0.2 + rnd() * 0.4, ph: rnd() * 6 });
    }

    // --- Scattered ground debris: planks, barrels ---
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4f3a22, roughness: 0.9 });
    const barrelBandMat = new THREE.MeshStandardMaterial({ color: 0x35353c, roughness: 0.55, metalness: 0.6 });
    let bGuard = 0, bPlaced = 0;
    while (bPlaced < 7 && bGuard++ < 200) {
      const x = (rnd() - 0.5) * (WORLD_W - 10);
      const z = (rnd() - 0.5) * (WORLD_H - 10);
      const { cx, cz } = worldToCell(x, z);
      if (this.isBlocked(cx, cz)) continue;
      if (x * x + z * z < 80) continue;
      const barrel = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.85, 12), barrelMat);
      body.position.y = 0.42;
      body.castShadow = true;
      barrel.add(body);
      for (const by of [0.18, 0.66]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.025, 6, 16), barrelBandMat);
        band.rotation.x = Math.PI / 2;
        band.position.y = by;
        barrel.add(band);
      }
      if (rnd() < 0.3) { barrel.rotation.z = Math.PI / 2; barrel.position.y = 0.34; barrel.rotation.y = rnd() * Math.PI; }
      barrel.position.x = x; barrel.position.z = z;
      group.add(barrel);
      bPlaced++;
    }

    // --- Fireflies (ambient particles) ---
    const ffGeo = new THREE.BufferGeometry();
    const ffPos = [];
    for (let i = 0; i < 60; i++) {
      ffPos.push((rnd() - 0.5) * WORLD_W * 0.9, 0.5 + rnd() * 2.2, (rnd() - 0.5) * WORLD_H * 0.9);
    }
    ffGeo.setAttribute('position', new THREE.Float32BufferAttribute(ffPos, 3));
    this.fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
      color: 0xaaffcc, size: 0.12, transparent: true, opacity: 0.8,
    }));
    group.add(this.fireflies);
    this._ffBase = ffPos.slice();

    scene.add(group);
    return group;
  }

  update(t) {
    if (this.jailRing) {
      this.jailRing.material.opacity = 0.32 + Math.sin(t * 3) * 0.14;
    }
    if (this.mists) {
      for (const ms of this.mists) {
        ms.mesh.position.x = ms.baseX + Math.sin(t * ms.sp + ms.ph) * 2.2;
        ms.mesh.position.z = ms.baseZ + Math.cos(t * ms.sp * 0.7 + ms.ph) * 1.8;
        ms.mesh.material.opacity = 0.035 + Math.sin(t * 0.5 + ms.ph) * 0.02 + 0.02;
      }
    }
    if (this.fireflies) {
      const pos = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = this._ffBase[i * 3], by = this._ffBase[i * 3 + 1], bz = this._ffBase[i * 3 + 2];
        pos.setY(i, by + Math.sin(t * 1.2 + i * 1.7) * 0.35);
        pos.setX(i, bx + Math.sin(t * 0.7 + i * 2.3) * 0.5);
        pos.setZ(i, bz + Math.cos(t * 0.6 + i * 1.1) * 0.5);
      }
      pos.needsUpdate = true;
      this.fireflies.material.opacity = 0.55 + Math.sin(t * 2.2) * 0.25;
    }
  }

  // ----- A* pathfinding on grid -----
  findPath(sx, sz, tx, tz) {
    const start = worldToCell(sx, sz), goal = worldToCell(tx, tz);
    if (this.isBlocked(goal.cx, goal.cz)) {
      let best = null, bd = Infinity;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const gx = goal.cx + dx, gz = goal.cz + dz;
        if (!this.isBlocked(gx, gz)) {
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = { cx: gx, cz: gz }; }
        }
      }
      if (!best) return null;
      goal.cx = best.cx; goal.cz = best.cz;
    }
    const key = (x, z) => z * GRID_W + x;
    const open = [{ x: start.cx, z: start.cz, g: 0, f: 0 }];
    const came = new Map(), gScore = new Map();
    gScore.set(key(start.cx, start.cz), 0);
    const h = (x, z) => Math.abs(x - goal.cx) + Math.abs(z - goal.cz);
    const closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 2500) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.z);
      if (cur.x === goal.cx && cur.z === goal.cz) {
        const path = [];
        let k = ck, node = cur;
        while (came.has(k)) {
          path.push(cellToWorld(node.x, node.z));
          node = came.get(k);
          k = key(node.x, node.z);
        }
        path.reverse();
        return path;
      }
      if (closed.has(ck)) continue;
      closed.add(ck);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dx, dz] of dirs) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (this.isBlocked(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (this.isBlocked(cur.x + dx, cur.z) || this.isBlocked(cur.x, cur.z + dz))) continue;
        const nk = key(nx, nz);
        const ng = (gScore.get(ck) ?? Infinity) + (dx && dz ? 1.414 : 1);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          came.set(nk, cur);
          open.push({ x: nx, z: nz, g: ng, f: ng + h(nx, nz) });
        }
      }
    }
    return null;
  }
}
