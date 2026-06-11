// ===== AI Bots: A* pathfinding + finite state machine =====
import { CONFIG, ROLES } from './config.js';
import { dist2, rand, pick, lerp } from './utils.js';

const BOT_NAMES = ['アカリ', 'ユウタ', 'ミナト', 'サクラ', 'レン', 'ヒナ', 'ソラ', 'カイ'];
let nameIdx = 0;
export function botName() { return BOT_NAMES[(nameIdx++) % BOT_NAMES.length] + '🤖'; }

export class Bot {
  constructor(player, game) {
    this.p = player;       // player entity (pos, role, etc.)
    this.game = game;      // game engine ref
    this.state = 'wander';
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.thinkT = 0;
    this.stuckT = 0;
    this.lastPos = { x: player.x, z: player.z };
    this.targetId = null;
    this.lookYaw = player.yaw || 0;
  }

  update(dt) {
    const p = this.p;
    if (p.captured) { p.vx = 0; p.vz = 0; return; }
    if (p.frozen) { p.vx = 0; p.vz = 0; return; }

    this.thinkT -= dt;
    this.repathT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.8 + Math.random() * 0.6; // further slowed down thinking (0.8-1.4s)
      this.think();
    }

    // stuck detection
    const moved = dist2(p.x, p.z, this.lastPos.x, this.lastPos.z);
    if (moved < 0.005 && (Math.abs(p.vx) > 0.1 || Math.abs(p.vz) > 0.1)) {
      this.stuckT += dt;
      if (this.stuckT > 0.6) { // more aggressive stuck recovery
        this.path = null; this.repathT = 0; this.stuckT = 0;
        // small nudge to get unstuck
        p.x += (Math.random() - 0.5) * 0.5;
        p.z += (Math.random() - 0.5) * 0.5;
      }
    } else this.stuckT = 0;
    this.lastPos.x = p.x; this.lastPos.z = p.z;

    this.followPath(dt);
    this.combat(dt);
  }

  // --- Oni bot combat: steer directly onto the target at close range and
  //     actually swing the attack (bots previously never attacked = never caught anyone) ---
  combat(dt) {
    const p = this.p, g = this.game;
    if (p.role !== ROLES.ONI || this.state !== 'chase' || p.frozen) return;
    const t = g.players.find(q => q.id === this.targetId);
    if (!t || t.captured || t.escaped) { this.targetId = null; return; }
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    // close-range direct pursuit: grid A* waypoints are too coarse for the
    // final approach, so steer straight at the runner when we can see them
    if (d < 6 && g.map.hasLOS(p.x, p.z, t.x, t.z)) {
      p.vx = dx / d;
      p.vz = dz / d;
      p.yaw = lerp(p.yaw, Math.atan2(dx, dz), dt * 3); // slower turn speed
      // Bots dash much less often
      p.wantDash = d > 4.5 && p.stamina > 40 && Math.random() < 0.3;
    }
    // swing when in lunge reach (further nerfed bot attack)
    if (d < CONFIG.ATTACK_RANGE + 0.4 && p.attackCD <= 0 && p.attackT <= 0) {
      if (Math.random() < 0.2) { // 20% chance to swing (increased delay)
        p.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.4; // increased aim error
        g.tryAttack(p);
        p._attackPending = true;
      }
    }
  }

  think() {
    const p = this.p, g = this.game;
    if (p.role === ROLES.ONI) this.thinkOni();
    else if (p.role === ROLES.TRAITOR) this.thinkTraitor();
    else this.thinkRunner();

    // item usage
    if (p.item) {
      if (p.role === ROLES.ONI) {
        if (p.item === 'detector' && Math.random() < 0.3) g.useItem(p);
        if (p.item === 'trap' && this.state === 'chase' && Math.random() < 0.2) g.useItem(p);
      } else if (p.role === ROLES.RUNNER) {
        const oni = g.getOni();
        if (oni && dist2(p.x, p.z, oni.x, oni.z) < 64) {
          if (Math.random() < 0.5) g.useItem(p);
        }
      }
    }
  }

  thinkOni() {
    const g = this.game, p = this.p;
    // find nearest visible runner (true runners only — bots cheat slightly via detector reveals)
    let best = null, bd = Infinity;
    for (const t of g.players) {
      if (t.id === p.id || t.captured) continue;
      if (t.role === ROLES.ONI) continue;
      if (t.role === ROLES.TRAITOR && !t.revealed) continue; // can't catch traitor anyway
      const d = dist2(p.x, p.z, t.x, t.z);
      // reduced vision range for oni bots
      const visible = d < 12 * 12 && g.map.hasLOS(p.x, p.z, t.x, t.z);
      const known = g.revealT > 0 || visible || (g.signalTarget === t.id && g.signalT > 0);
      if (known && d < bd) { bd = d; best = t; }
    }
    if (best) {
      this.state = 'chase';
      this.targetId = best.id;
      if (this.repathT <= 0) {
        this.path = g.map.findPath(p.x, p.z, best.x, best.z);
        this.pathIdx = 0;
        this.repathT = 0.6; // repath slower (from 0.35)
      }
      p.wantDash = bd > 12; // only dash if quite far
    } else {
      // patrol: go to random runner last-known or random spot
      this.state = 'patrol';
      p.wantDash = false;
      if (!this.path || this.pathIdx >= (this.path?.length || 0)) {
        const spot = g.map.randomWalkable();
        this.path = g.map.findPath(p.x, p.z, spot.x, spot.z);
        this.pathIdx = 0;
      }
    }
  }

  thinkRunner() {
    const g = this.game, p = this.p;
    const oni = g.getOni();
    const dOni = oni ? dist2(p.x, p.z, oni.x, oni.z) : Infinity;

    // rescue captured teammates if oni is far
    const jailed = g.players.find(t => t.captured && t.role === ROLES.RUNNER);
    if (jailed && dOni > 20 * 20 && Math.random() < 0.7) {
      this.state = 'rescue';
      if (this.repathT <= 0) {
        this.path = g.map.findPath(p.x, p.z, g.map.jail.x, g.map.jail.z);
        this.pathIdx = 0; this.repathT = 1.2;
      }
      p.wantDash = false;
      return;
    }

    if (oni && dOni < 18 * 18 && (g.map.hasLOS(p.x, p.z, oni.x, oni.z) || dOni < 8 * 8)) {
      // FLEE: move away from oni (increased awareness for runner bots)
      this.state = 'flee';
      p.wantDash = dOni < 12 * 12;
      if (this.repathT <= 0) {
        let best = null, bScore = -Infinity;
        for (let i = 0; i < 12; i++) {
          const s = g.map.randomWalkable();
          const score = dist2(s.x, s.z, oni.x, oni.z) - dist2(s.x, s.z, p.x, p.z) * 0.3;
          if (score > bScore) { bScore = score; best = s; }
        }
        this.path = g.map.findPath(p.x, p.z, best.x, best.z);
        this.pathIdx = 0; this.repathT = 0.5;
      }
    } else {
      // prefer working on generators
      this.state = 'objective';
      p.wantDash = false;
      if (!this.path || this.pathIdx >= (this.path?.length || 0)) {
         let target = null, bd = Infinity;
         for (const gen of g.map.generators) {
           if (gen.done) continue;
           const d = dist2(p.x, p.z, gen.x, gen.z);
           if (d < bd) { bd = d; target = gen; }
         }
         if (!target) {
            for (const it of g.items) {
              if (!it.alive || !it.forRunner) continue;
              const d = dist2(p.x, p.z, it.x, it.z);
              if (d < 18 * 18 && d < bd) { bd = d; target = it; }
            }
         }
         const spot = target || g.map.randomWalkable();
         this.path = g.map.findPath(p.x, p.z, spot.x, spot.z);
         this.pathIdx = 0;
      }
    }
  }

  thinkTraitor() {
    const g = this.game, p = this.p;
    // Acts like a runner but: occasionally signals nearest runner's position to oni
    this.thinkRunnerLite();
    if (g.signalCD <= 0 && Math.random() < 0.25) {
      let best = null, bd = Infinity;
      for (const t of g.players) {
        if (t.role !== ROLES.RUNNER || t.captured) continue;
        const d = dist2(p.x, p.z, t.x, t.z);
        if (d < 20 * 20 && d < bd) { bd = d; best = t; }
      }
      if (best) g.traitorSignal(p, best);
    }
  }

  thinkRunnerLite() {
    const g = this.game, p = this.p;
    const oni = g.getOni();
    // shadow runners loosely (stay near them to gather intel)
    if (!this.path || this.pathIdx >= (this.path?.length || 0)) {
      const runners = g.players.filter(t => t.role === ROLES.RUNNER && !t.captured);
      const target = runners.length && Math.random() < 0.6 ? pick(runners) : null;
      const spot = target ? { x: target.x + rand(-4, 4), z: target.z + rand(-4, 4) } : g.map.randomWalkable();
      this.path = g.map.findPath(p.x, p.z, spot.x, spot.z);
      this.pathIdx = 0;
    }
    // don't look suspicious: keep modest distance from oni
    if (oni && dist2(p.x, p.z, oni.x, oni.z) < 36) {
      p.wantDash = false;
    }
  }

  followPath(dt) {
    const p = this.p;
    if (!this.path || this.pathIdx >= this.path.length) { p.vx = 0; p.vz = 0; return; }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { this.pathIdx++; return; }
    const sp = 1;
    // apply movement with slight smoothing/lag
    p.vx = lerp(p.vx, (dx / d) * sp, dt * 6);
    p.vz = lerp(p.vz, (dz / d) * sp, dt * 6);
    p.yaw = lerp(p.yaw, Math.atan2(dx, dz), dt * 5);
  }
}
