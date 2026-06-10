// ===== Map: grid-based arena with walls, crates, jail & item spawns =====
import * as THREE from 'three';

// 1 = wall, 0 = floor, 2 = crate (low cover, blocks movement), J = jail zone center
// 25 x 25 cells, each cell = 2 world units. Not maze-like, but plenty of cover.
const MAP_LAYOUT = [
  '1111111111111111111111111',
  '1000000000000000000000001',
  '1011011000200001101101001',
  '1010000000000000000001001',
  '1010011110020011110001001',
  '1000010000000000010000001',
  '1020010011101100010002001',
  '1000010010000100010000001',
  '1011000010000100000110001',
  '1000000200000020000000001',
  '1001100000111000001100001',
  '1001000000101000000100001',
  '100100020010J010200100001',
  '1001000000101000000100001',
  '1001100000111000001100001',
  '1000000200000020000000001',
  '1011000010000100000110001',
  '1000010010000100010000001',
  '1020010011101100010002001',
  '1000010000000000010000001',
  '1010011110020011110001001',
  '1010000000000000000001001',
  '1011011000200001101101001',
  '1000000000000000000000001',
  '1111111111111111111111111',
];

export const CELL = 2;
export const GRID_W = MAP_LAYOUT[0].length;
export const GRID_H = MAP_LAYOUT.length;
export const WORLD_W = GRID_W * CELL;
export const WORLD_H = GRID_H * CELL;

export function cellToWorld(cx, cz) {
  return { x: (cx - GRID_W / 2 + 0.5) * CELL, z: (cz - GRID_H / 2 + 0.5) * CELL };
}
export function worldToCell(x, z) {
  return {
    cx: Math.floor(x / CELL + GRID_W / 2),
    cz: Math.floor(z / CELL + GRID_H / 2),
  };
}

export class GameMap {
  constructor() {
    this.grid = []; // 0 walkable, 1 blocked
    this.jail = null; // {x,z}
    this.walkableCells = [];
    for (let z = 0; z < GRID_H; z++) {
      const row = [];
      for (let x = 0; x < GRID_W; x++) {
        const c = MAP_LAYOUT[z][x];
        if (c === '1' || c === '2') row.push(1);
        else {
          row.push(0);
          this.walkableCells.push({ cx: x, cz: z });
          if (c === 'J') {
            const w = cellToWorld(x, z);
            this.jail = { x: w.x, z: w.z };
          }
        }
      }
      this.grid.push(row);
    }
  }

  isBlocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H) return true;
    return this.grid[cz][cx] === 1;
  }

  // Circle-vs-grid collision: returns corrected position
  collide(x, z, radius) {
    const { cx, cz } = worldToCell(x, z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (!this.isBlocked(gx, gz)) continue;
        // wall AABB in world coords
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
          // center inside wall — push out along smallest axis
          x += radius;
        }
      }
    }
    // World bounds
    const half = WORLD_W / 2 - radius - 0.1;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    return { x, z };
  }

  // Line of sight between two world points (for AI / detector)
  hasLOS(x1, z1, x2, z2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (CELL * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const { cx, cz } = worldToCell(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
      if (this.isBlocked(cx, cz)) return false;
    }
    return true;
  }

  randomWalkable() {
    const c = this.walkableCells[Math.floor(Math.random() * this.walkableCells.length)];
    return cellToWorld(c.cx, c.cz);
  }

  // ----- Build the 3D scene -----
  build(scene) {
    const group = new THREE.Group();

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d4a3d, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // Floor grid pattern (subtle)
    const gridHelper = new THREE.GridHelper(WORLD_W, GRID_W, 0x2a352a, 0x2e3a2e);
    gridHelper.position.y = 0.01;
    group.add(gridHelper);

    // Walls (instanced)
    const wallGeo = new THREE.BoxGeometry(CELL, 3.2, CELL);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6e, roughness: 0.85 });
    const crateGeo = new THREE.BoxGeometry(CELL * 0.92, 1.6, CELL * 0.92);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });

    let wallCount = 0, crateCount = 0;
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) {
      const c = MAP_LAYOUT[z][x];
      if (c === '1') wallCount++;
      else if (c === '2') crateCount++;
    }
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    const crates = new THREE.InstancedMesh(crateGeo, crateMat, crateCount);
    walls.castShadow = walls.receiveShadow = true;
    crates.castShadow = crates.receiveShadow = true;
    const m = new THREE.Matrix4();
    let wi = 0, ci = 0;
    for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) {
      const c = MAP_LAYOUT[z][x];
      const w = cellToWorld(x, z);
      if (c === '1') {
        m.makeTranslation(w.x, 1.6, w.z);
        walls.setMatrixAt(wi++, m);
      } else if (c === '2') {
        m.makeTranslation(w.x, 0.8, w.z);
        crates.setMatrixAt(ci++, m);
      }
    }
    group.add(walls, crates);

    // Jail: glowing cage area
    const jailGroup = new THREE.Group();
    jailGroup.position.set(this.jail.x, 0, this.jail.z);
    const ringGeo = new THREE.RingGeometry(1.0, 1.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    jailGroup.add(ring);
    // Cage bars
    const barMat = new THREE.MeshStandardMaterial({ color: 0x7799bb, emissive: 0x113355, roughness: 0.4 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), barMat);
      bar.position.set(Math.cos(a) * 1.3, 1.5, Math.sin(a) * 1.3);
      jailGroup.add(bar);
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.06, 6, 24), barMat);
    top.rotation.x = Math.PI / 2;
    top.position.y = 3;
    jailGroup.add(top);
    group.add(jailGroup);
    this.jailRing = ring;

    // Perimeter ambiance: corner lights
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffaa33, emissiveIntensity: 1.5 });
    const lampPositions = [
      [-WORLD_W / 2 + 3, WORLD_H / 2 - 3], [WORLD_W / 2 - 3, WORLD_H / 2 - 3],
      [-WORLD_W / 2 + 3, -WORLD_H / 2 + 3], [WORLD_W / 2 - 3, -WORLD_H / 2 + 3],
      [0, 0],
    ];
    for (const [lx, lz] of lampPositions) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), new THREE.MeshStandardMaterial({ color: 0x333 }));
      pole.position.set(lx, 2, lz);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lampMat);
      lamp.position.set(lx, 4.1, lz);
      group.add(lamp);
      const pl = new THREE.PointLight(0xffcc77, 25, 22, 1.8);
      pl.position.set(lx, 4, lz);
      group.add(pl);
    }

    scene.add(group);
    return group;
  }

  update(t) {
    if (this.jailRing) {
      this.jailRing.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    }
  }

  // ----- A* pathfinding on grid -----
  findPath(sx, sz, tx, tz) {
    const start = worldToCell(sx, sz), goal = worldToCell(tx, tz);
    if (this.isBlocked(goal.cx, goal.cz)) {
      // snap goal to nearest walkable
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
    while (open.length && iter++ < 2000) {
      // pop lowest f
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.z);
      if (cur.x === goal.cx && cur.z === goal.cz) {
        // reconstruct
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
        if (dx !== 0 && dz !== 0 && (this.isBlocked(cur.x + dx, cur.z) || this.isBlocked(cur.x, cur.z + dz))) continue; // no corner cutting
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
