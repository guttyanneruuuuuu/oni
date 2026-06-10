// ===== Core game engine (host-authoritative simulation + rendering) =====
import * as THREE from 'three';
import { CONFIG, ROLES, ROLE_INFO, ITEMS, RUNNER_ITEM_KEYS, ONI_ITEM_KEYS } from './config.js';
import { GameMap, WORLD_W, WORLD_H } from './map.js';
import { createRunnerModel, createOniModel, animateCharacter, RUNNER_COLORS } from './characters.js';
import { Bot } from './bots.js';
import { $, show, clamp, lerp, dist2, fmtTime, pick, rand } from './utils.js';

export class Game {
  /**
   * @param {Object} opts
   *  - isHost: boolean (host runs simulation; clients send input, receive state)
   *  - localId: string
   *  - roster: [{id, name, isBot}]  (length 5)
   *  - net: network adapter or null (solo)
   *  - onEnd: callback(result)
   */
  constructor(opts) {
    this.isHost = opts.isHost;
    this.localId = opts.localId;
    this.net = opts.net || null;
    this.onEnd = opts.onEnd;
    this.roster = opts.roster;
    this.running = false;
    this.over = false;
    this.time = CONFIG.ROUND_TIME;
    this.freezeT = CONFIG.ONI_FREEZE_TIME;
    this.revealT = 0;          // detector reveal
    this.signalT = 0; this.signalTarget = null; this.signalCD = 0;
    this.items = [];
    this.traps = [];
    this.tempWalls = [];
    this.bots = [];
    this.elapsed = 0;
    this._netAccum = 0;
    this._itemRespawnT = 0;

    this.initScene();
    this.map = new GameMap();
    this.map.build(this.scene);
    this.initPlayers(opts.roles); // roles: {id: role} provided by host
    if (this.isHost) this.spawnInitialItems();
    this.initHUD();
  }

  // ---------- Scene ----------
  initScene() {
    const canvas = $('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1020);
    this.scene.fog = new THREE.Fog(0x0d1020, 25, 60);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
    this.camYaw = 0;
    this.camPitch = 0;
    this._bobT = 0;

    // Lighting: moonlit night
    const amb = new THREE.AmbientLight(0x445577, 0.7);
    this.scene.add(amb);
    const moon = new THREE.DirectionalLight(0x8899ff, 0.9);
    moon.position.set(20, 35, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -36; moon.shadow.camera.right = 36;
    moon.shadow.camera.top = 36; moon.shadow.camera.bottom = -36;
    moon.shadow.camera.far = 90;
    this.scene.add(moon);
    const hemi = new THREE.HemisphereLight(0x334466, 0x1a2210, 0.5);
    this.scene.add(hemi);

    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  // ---------- Players ----------
  initPlayers(roles) {
    this.players = [];
    // spawn points: oni center-ish, runners corners
    const spawns = [
      { x: 0, z: -8 },                                   // oni
      { x: -WORLD_W / 2 + 5, z: -WORLD_H / 2 + 5 },
      { x: WORLD_W / 2 - 5, z: -WORLD_H / 2 + 5 },
      { x: -WORLD_W / 2 + 5, z: WORLD_H / 2 - 5 },
      { x: WORLD_W / 2 - 5, z: WORLD_H / 2 - 5 },
    ];
    let runnerSlot = 0, spawnIdx = 1;
    this.roster.forEach((r, i) => {
      const role = roles[r.id];
      const isOni = role === ROLES.ONI;
      const sp = isOni ? spawns[0] : spawns[spawnIdx++];
      const model = isOni ? createOniModel() : createRunnerModel(RUNNER_COLORS[runnerSlot++ % RUNNER_COLORS.length]);
      model.position.set(sp.x, 0, sp.z);
      this.scene.add(model);

      // name tag sprite
      const tag = this.makeNameTag(r.name, isOni ? '#ff5a5a' : '#ffffff');
      tag.position.y = isOni ? 2.6 : 2.1;
      model.add(tag);

      const p = {
        id: r.id, name: r.name, isBot: r.isBot, role,
        x: sp.x, z: sp.z, yaw: Math.atan2(-sp.x, -sp.z),
        vx: 0, vz: 0, speed: 0,
        stamina: CONFIG.DASH_STAMINA_MAX,
        wantDash: false,
        item: null,
        captured: false, frozen: isOni,
        slowT: 0, blindT: 0, boostT: 0,
        revealed: false,
        model, anim: { speed: 0, phase: Math.random() * 6 },
        input: { moveX: 0, moveZ: 0, dash: false },
        rescueT: 0,
      };
      this.players.push(p);
      if (r.isBot && this.isHost) this.bots.push(new Bot(p, this));
    });
    this.local = this.players.find(p => p.id === this.localId);
    // camera initial yaw = facing direction (first-person)
    this.camYaw = this.local.yaw;
  }

  makeNameTag(name, color) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(2.2, 0.55, 1);
    return sprite;
  }

  getOni() { return this.players.find(p => p.role === ROLES.ONI); }
  aliveRunners() { return this.players.filter(p => p.role === ROLES.RUNNER && !p.captured); }

  // ---------- Items ----------
  spawnInitialItems() {
    for (let i = 0; i < CONFIG.ITEM_COUNT; i++) this.spawnItem();
  }

  spawnItem(typeOverride) {
    // weighted: more runner items than oni items
    const type = typeOverride || (Math.random() < 0.72 ? pick(RUNNER_ITEM_KEYS) : pick(ONI_ITEM_KEYS));
    const pos = this.map.randomWalkable();
    // avoid jail
    if (dist2(pos.x, pos.z, this.map.jail.x, this.map.jail.z) < 16) return this.spawnItem(typeOverride);
    const item = { id: Math.random().toString(36).slice(2, 8), type, x: pos.x, z: pos.z, alive: true,
                   forRunner: ITEMS[type].for.includes('runner') };
    this.addItemMesh(item);
    this.items.push(item);
    if (this.net) this.net.broadcast({ t: 'item+', item: { id: item.id, type, x: item.x, z: item.z } });
    return item;
  }

  addItemMesh(item) {
    const def = ITEMS[item.type];
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.6, roughness: 0.4 })
    );
    box.position.y = 0.8;
    group.add(box);
    const glow = new THREE.PointLight(def.color, 3, 4, 2);
    glow.position.y = 1;
    group.add(glow);
    group.position.set(item.x, 0, item.z);
    this.scene.add(group);
    item.mesh = group;
    item.spin = box;
  }

  removeItem(item) {
    item.alive = false;
    if (item.mesh) { this.scene.remove(item.mesh); item.mesh = null; }
  }

  useItem(p) {
    if (!p.item || p.captured || p.frozen) return;
    const type = p.item;
    p.item = null;
    if (this.net && this.isHost) this.net.broadcast({ t: 'fx', kind: 'use', type, x: p.x, z: p.z, pid: p.id });
    this.applyItemEffect(p, type);
    if (p === this.local) this.updateItemHUD();
  }

  applyItemEffect(p, type) {
    switch (type) {
      case 'boost':
        p.boostT = CONFIG.BOOST_TIME;
        this.announce(p, '👟 加速！');
        break;
      case 'flash': {
        // blind oni if nearby
        const oni = this.getOni();
        if (oni && dist2(p.x, p.z, oni.x, oni.z) < CONFIG.FLASH_RADIUS ** 2) {
          oni.blindT = CONFIG.FLASH_BLIND_TIME;
          if (this.net) this.net.broadcast({ t: 'blind', pid: oni.id, dur: CONFIG.FLASH_BLIND_TIME });
          if (oni.id === this.localId) this.doFlashEffect();
        }
        this.spawnFlashVFX(p.x, p.z);
        this.announce(p, '✨ 閃光！');
        break;
      }
      case 'wall': {
        // place wall behind player (between player and oni if possible)
        const oni = this.getOni();
        let dirX = Math.sin(p.yaw + Math.PI), dirZ = Math.cos(p.yaw + Math.PI);
        if (oni) {
          const dx = oni.x - p.x, dz = oni.z - p.z, d = Math.hypot(dx, dz) || 1;
          dirX = dx / d; dirZ = dz / d;
        }
        this.placeTempWall(p.x + dirX * 1.6, p.z + dirZ * 1.6, Math.atan2(dirX, dirZ));
        this.announce(p, '🧱 壁を設置！');
        break;
      }
      case 'detector':
        this.revealT = CONFIG.DETECTOR_TIME;
        if (this.net) this.net.broadcast({ t: 'reveal', dur: CONFIG.DETECTOR_TIME });
        this.announce(p, '📡 探知機起動！');
        break;
      case 'trap': {
        const trap = { x: p.x, z: p.z, alive: true };
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.08, 6, 16),
          new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0x882200, roughness: 0.5 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, 0.06, p.z);
        this.scene.add(mesh);
        trap.mesh = mesh;
        this.traps.push(trap);
        if (this.net) this.net.broadcast({ t: 'trap+', x: p.x, z: p.z });
        this.announce(p, '🪤 トラップ設置！');
        break;
      }
    }
  }

  placeTempWall(x, z, rotY) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x77ccee, transparent: true, opacity: 0.75, emissive: 0x2266aa, roughness: 0.3 })
    );
    mesh.position.set(x, 1.1, z);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    this.tempWalls.push({ x, z, rotY, t: CONFIG.WALL_TIME, mesh });
    if (this.net && this.isHost) this.net.broadcast({ t: 'wall+', x, z, rotY });
  }

  spawnFlashVFX(x, z) {
    const flash = new THREE.PointLight(0xffffff, 80, 18, 1.5);
    flash.position.set(x, 1.5, z);
    this.scene.add(flash);
    let life = 0.5;
    const fade = (dt) => {
      life -= dt;
      flash.intensity = Math.max(0, life / 0.5) * 80;
      if (life <= 0) { this.scene.remove(flash); this._vfx = this._vfx.filter(f => f !== fade); }
    };
    this._vfx = this._vfx || [];
    this._vfx.push(fade);
  }

  doFlashEffect() {
    const ov = $('flash-overlay');
    ov.style.opacity = '1';
    setTimeout(() => { ov.style.transition = `opacity ${CONFIG.FLASH_BLIND_TIME}s`; ov.style.opacity = '0'; }, 120);
    setTimeout(() => { ov.style.transition = 'opacity .2s'; }, CONFIG.FLASH_BLIND_TIME * 1000 + 300);
  }

  announce(p, msg) {
    if (p === this.local) this.showMessage(msg);
  }

  // ---------- Traitor signal ----------
  traitorSignal(traitor, target) {
    if (this.signalCD > 0) return;
    this.signalCD = CONFIG.SIGNAL_COOLDOWN;
    this.signalT = 6;
    this.signalTarget = target ? target.id : null;
    if (!target) {
      // local player traitor: signal nearest runner
      let bd = Infinity;
      for (const t of this.players) {
        if (t.role !== ROLES.RUNNER || t.captured) continue;
        const d = dist2(traitor.x, traitor.z, t.x, t.z);
        if (d < bd) { bd = d; this.signalTarget = t.id; }
      }
    }
    if (this.net && this.isHost) this.net.broadcast({ t: 'signal', target: this.signalTarget, dur: 6 });
    if (traitor === this.local) this.showMessage('📡 人狼に位置を密告した！');
    const oni = this.getOni();
    if (oni === this.local) this.showMessage('📡 裏切り者からシグナル受信！');
  }

  // ---------- Host simulation ----------
  hostUpdate(dt) {
    if (this.over) return;
    this.time -= dt;
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      if (this.freezeT <= 0) {
        const oni = this.getOni();
        if (oni) oni.frozen = false;
        if (this.net) this.net.broadcast({ t: 'unfreeze' });
      }
    }
    this.revealT = Math.max(0, this.revealT - dt);
    this.signalT = Math.max(0, this.signalT - dt);
    this.signalCD = Math.max(0, this.signalCD - dt);

    // bots think
    for (const b of this.bots) b.update(dt);

    // move all players
    for (const p of this.players) this.movePlayer(p, dt);

    // item pickup
    for (const it of this.items) {
      if (!it.alive) continue;
      for (const p of this.players) {
        if (p.captured || p.item) continue;
        if (!ITEMS[it.type].for.includes(p.role === ROLES.TRAITOR ? 'traitor' : p.role)) continue;
        if (dist2(p.x, p.z, it.x, it.z) < CONFIG.ITEM_PICK_RADIUS ** 2) {
          p.item = it.type;
          this.removeItem(it);
          if (this.net) this.net.broadcast({ t: 'item-', id: it.id, pid: p.id, type: it.type });
          if (p === this.local) { this.updateItemHUD(); this.showMessage(`${ITEMS[it.type].icon} ${ITEMS[it.type].name} を入手！`); }
          break;
        }
      }
    }
    // item respawn
    this._itemRespawnT -= dt;
    if (this._itemRespawnT <= 0) {
      this._itemRespawnT = CONFIG.ITEM_RESPAWN;
      const aliveCount = this.items.filter(i => i.alive).length;
      if (aliveCount < CONFIG.ITEM_COUNT) this.spawnItem();
    }

    // traps trigger (runners only)
    for (const tr of this.traps) {
      if (!tr.alive) continue;
      for (const p of this.players) {
        if (p.role !== ROLES.RUNNER || p.captured) continue;
        if (dist2(p.x, p.z, tr.x, tr.z) < 0.6 * 0.6) {
          tr.alive = false;
          if (tr.mesh) { this.scene.remove(tr.mesh); tr.mesh = null; }
          p.slowT = CONFIG.TRAP_SLOW_TIME;
          if (this.net) this.net.broadcast({ t: 'trap!', x: tr.x, z: tr.z, pid: p.id, dur: CONFIG.TRAP_SLOW_TIME });
          if (p === this.local) this.showMessage('🪤 トラップにかかった！');
        }
      }
    }

    // temp walls expire
    for (const w of this.tempWalls) {
      w.t -= dt;
      if (w.t <= 0 && w.mesh) {
        this.scene.remove(w.mesh); w.mesh = null;
      } else if (w.mesh) {
        w.mesh.material.opacity = Math.min(0.75, w.t / 1.5 * 0.75);
      }
    }
    this.tempWalls = this.tempWalls.filter(w => w.t > 0);

    // oni catches runners
    const oni = this.getOni();
    if (oni && !oni.frozen) {
      for (const p of this.players) {
        if (p.role !== ROLES.RUNNER || p.captured) continue;
        if (dist2(oni.x, oni.z, p.x, p.z) < CONFIG.CATCH_RADIUS ** 2) {
          this.capture(p);
        }
      }
    }

    // jail rescue
    const jail = this.map.jail;
    for (const p of this.players) {
      if (p.captured || p.role === ROLES.ONI) continue;
      if (dist2(p.x, p.z, jail.x, jail.z) < CONFIG.RESCUE_RADIUS ** 2) {
        const jailed = this.players.filter(t => t.captured);
        if (jailed.length) {
          p.rescueT += dt;
          if (p === this.local) this.showMessage(`🔓 救出中… ${Math.ceil((CONFIG.RESCUE_TIME - p.rescueT) * 10) / 10}s`);
          if (p.rescueT >= CONFIG.RESCUE_TIME) {
            p.rescueT = 0;
            for (const j of jailed) this.rescue(j);
          }
        }
      } else p.rescueT = 0;
    }

    // win conditions
    if (this.aliveRunners().length === 0) this.endGame('oni');
    else if (this.time <= 0) this.endGame('runner');

    // network state broadcast (10Hz)
    if (this.net) {
      this._netAccum += dt;
      if (this._netAccum >= 0.1) {
        this._netAccum = 0;
        this.net.broadcast(this.serializeState());
      }
    }
  }

  movePlayer(p, dt) {
    if (p.captured || p.frozen) { p.speed = 0; p.anim.speed = lerp(p.anim.speed, 0, dt * 8); return; }
    const isOni = p.role === ROLES.ONI;
    let base = isOni ? CONFIG.ONI_SPEED : CONFIG.RUNNER_SPEED;
    let dashSpeed = isOni ? CONFIG.ONI_DASH_SPEED : CONFIG.RUNNER_DASH_SPEED;

    let mx, mz, dashing;
    if (p.isBot) {
      mx = p.vx; mz = p.vz;
      dashing = p.wantDash && p.stamina > 5;
    } else {
      mx = p.input.moveX; mz = p.input.moveZ;
      dashing = p.input.dash && p.stamina > 5 && (mx || mz);
    }
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }

    let speed = dashing ? dashSpeed : base;
    if (p.slowT > 0) { speed *= CONFIG.TRAP_SLOW_FACTOR; p.slowT -= dt; }
    if (p.boostT > 0) { speed *= CONFIG.BOOST_FACTOR; p.boostT -= dt; }
    if (p.blindT > 0) { p.blindT -= dt; if (isOni) speed *= 0.55; }

    // stamina
    if (dashing && mag > 0.05) p.stamina = Math.max(0, p.stamina - CONFIG.DASH_DRAIN * dt);
    else p.stamina = Math.min(CONFIG.DASH_STAMINA_MAX, p.stamina + CONFIG.DASH_REGEN * dt);

    let nx = p.x + mx * speed * dt;
    let nz = p.z + mz * speed * dt;
    // temp wall collision
    for (const w of this.tempWalls) {
      const d2w = dist2(nx, nz, w.x, w.z);
      if (d2w < 1.6 * 1.6) {
        const d = Math.sqrt(d2w) || 0.01;
        nx = w.x + (nx - w.x) / d * 1.6;
        nz = w.z + (nz - w.z) / d * 1.6;
      }
    }
    const c = this.map.collide(nx, nz, CONFIG.PLAYER_RADIUS);
    p.x = c.x; p.z = c.z;
    p.speed = mag * speed;
    // humans: yaw = look direction (set from camera / net input). bots: face movement.
    if (p.isBot && mag > 0.05) p.yaw = Math.atan2(mx, mz);
  }

  capture(p) {
    p.captured = true;
    p.x = this.map.jail.x + rand(-0.5, 0.5);
    p.z = this.map.jail.z + rand(-0.5, 0.5);
    if (this.net) this.net.broadcast({ t: 'capture', pid: p.id, x: p.x, z: p.z });
    this.onCaptureFX(p);
  }

  onCaptureFX(p) {
    this.showAnnounce(`${p.name} が捕まった！`);
    if (p === this.local) show($('captured-overlay'), true);
  }

  rescue(p) {
    p.captured = false;
    if (this.net) this.net.broadcast({ t: 'rescue', pid: p.id });
    this.onRescueFX(p);
  }

  onRescueFX(p) {
    this.showAnnounce(`${p.name} が救出された！`);
    if (p === this.local) show($('captured-overlay'), false);
  }

  endGame(winner) {
    if (this.over) return;
    this.over = true;
    if (this.net && this.isHost) this.net.broadcast({ t: 'end', winner });
    setTimeout(() => this.onEnd(winner), 1200);
    this.showAnnounce(winner === 'oni' ? '👹 人狼チームの勝利！' : '🏃 逃げチームの勝利！', 3);
  }

  // ---------- Network state sync ----------
  serializeState() {
    return {
      t: 's',
      time: this.time,
      freeze: this.freezeT,
      ps: this.players.map(p => ({
        id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2),
        sp: +(p.anim ? Math.min(1, p.speed / CONFIG.ONI_DASH_SPEED) : 0).toFixed(2),
        cap: p.captured ? 1 : 0, item: p.item || '',
      })),
    };
  }

  applyState(s) {
    this.time = s.time;
    this.freezeT = s.freeze;
    for (const ps of s.ps) {
      const p = this.players.find(q => q.id === ps.id);
      if (!p) continue;
      if (p.id === this.localId) {
        // soft-correct local position if drifted
        const d = dist2(p.x, p.z, ps.x, ps.z);
        if (d > 4) { p.x = ps.x; p.z = ps.z; }
        else if (d > 0.5) { p.x = lerp(p.x, ps.x, 0.15); p.z = lerp(p.z, ps.z, 0.15); }
        if (ps.cap && !p.captured) { p.captured = true; show($('captured-overlay'), true); }
        if (!ps.cap && p.captured) { p.captured = false; show($('captured-overlay'), false); }
        if (ps.cap) { p.x = ps.x; p.z = ps.z; }
        p.item = ps.item || null;
        this.updateItemHUD();
      } else {
        p.netX = ps.x; p.netZ = ps.z; p.netYaw = ps.yaw;
        p.netSpeed = ps.sp;
        p.captured = !!ps.cap;
      }
      p.frozen = (p.role === ROLES.ONI) && s.freeze > 0;
    }
  }

  // Client-side: handle host events
  handleNetEvent(msg) {
    switch (msg.t) {
      case 's': this.applyState(msg); break;
      case 'item+': {
        const item = { id: msg.item.id, type: msg.item.type, x: msg.item.x, z: msg.item.z, alive: true,
                       forRunner: ITEMS[msg.item.type].for.includes('runner') };
        this.addItemMesh(item);
        this.items.push(item);
        break;
      }
      case 'item-': {
        const it = this.items.find(i => i.id === msg.id);
        if (it) this.removeItem(it);
        if (msg.pid === this.localId) {
          const p = this.local;
          p.item = msg.type;
          this.updateItemHUD();
          this.showMessage(`${ITEMS[msg.type].icon} ${ITEMS[msg.type].name} を入手！`);
        }
        break;
      }
      case 'fx':
        if (msg.kind === 'use' && msg.type === 'flash') this.spawnFlashVFX(msg.x, msg.z);
        break;
      case 'blind':
        if (msg.pid === this.localId) { this.local.blindT = msg.dur; this.doFlashEffect(); }
        break;
      case 'reveal': this.revealT = msg.dur; break;
      case 'signal':
        this.signalT = msg.dur; this.signalTarget = msg.target;
        if (this.local.role === ROLES.ONI) this.showMessage('📡 裏切り者からシグナル受信！');
        break;
      case 'trap+': {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.08, 6, 16),
          new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0x882200 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(msg.x, 0.06, msg.z);
        this.scene.add(mesh);
        this.traps.push({ x: msg.x, z: msg.z, alive: true, mesh });
        break;
      }
      case 'trap!': {
        const tr = this.traps.find(t => Math.abs(t.x - msg.x) < 0.1 && Math.abs(t.z - msg.z) < 0.1);
        if (tr) { tr.alive = false; if (tr.mesh) { this.scene.remove(tr.mesh); tr.mesh = null; } }
        if (msg.pid === this.localId) { this.local.slowT = msg.dur; this.showMessage('🪤 トラップにかかった！'); }
        break;
      }
      case 'wall+': {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 2.2, 0.35),
          new THREE.MeshStandardMaterial({ color: 0x77ccee, transparent: true, opacity: 0.75, emissive: 0x2266aa })
        );
        mesh.position.set(msg.x, 1.1, msg.z);
        mesh.rotation.y = msg.rotY;
        this.scene.add(mesh);
        this.tempWalls.push({ x: msg.x, z: msg.z, rotY: msg.rotY, t: CONFIG.WALL_TIME, mesh });
        break;
      }
      case 'capture': {
        const p = this.players.find(q => q.id === msg.pid);
        if (p) { p.captured = true; p.x = msg.x; p.z = msg.z; this.onCaptureFX(p); }
        break;
      }
      case 'rescue': {
        const p = this.players.find(q => q.id === msg.pid);
        if (p) { p.captured = false; this.onRescueFX(p); }
        break;
      }
      case 'unfreeze':
        this.freezeT = 0;
        for (const p of this.players) p.frozen = false;
        break;
      case 'end': this.endGame(msg.winner); break;
      case 'useItem': // host receives client item use request
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p) this.useItem(p);
        }
        break;
      case 'doSignal':
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p && p.role === ROLES.TRAITOR) this.traitorSignal(p, null);
        }
        break;
      case 'i': // client input received by host
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p) { p.input.moveX = msg.mx; p.input.moveZ = msg.mz; p.input.dash = !!msg.d; p.yaw = msg.yaw; }
        }
        break;
    }
  }

  // ---------- HUD ----------
  initHUD() {
    const info = ROLE_INFO[this.local.role];
    const roleEl = $('hud-role');
    roleEl.textContent = `${info.icon} ${info.name}`;
    roleEl.className = 'hud-box ' + info.class;
    this.showAnnounce(`あなたは ${info.icon}${info.name}`, 3.5);
    this.showMessage(info.desc, 5);
    show($('btn-signal'), this.local.role === ROLES.TRAITOR);
    show($('captured-overlay'), false);
    this.minimapCtx = $('minimap').getContext('2d');
    this.updateItemHUD();
  }

  updateItemHUD() {
    const it = this.local.item;
    $('item-icon').textContent = it ? ITEMS[it].icon : '—';
    $('item-name').textContent = it ? ITEMS[it].name + '（E/クリック/🎁で使用）' : 'アイテムなし';
  }

  showMessage(msg, dur = 2.5) {
    const el = $('hud-message');
    el.textContent = msg;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { el.textContent = ''; }, dur * 1000);
  }

  showAnnounce(msg, dur = 2) {
    const el = $('hud-announce');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._annT);
    this._annT = setTimeout(() => { el.style.opacity = '0'; }, dur * 1000);
  }

  updateHUD() {
    $('hud-timer').textContent = fmtTime(this.time);
    const alive = this.aliveRunners().length;
    const total = this.players.filter(p => p.role === ROLES.RUNNER).length;
    $('hud-runners').textContent = `🏃 ${alive}/${total}`;
    // freeze overlay
    const isOniLocal = this.local.role === ROLES.ONI;
    const showFreeze = isOniLocal && this.freezeT > 0;
    show($('freeze-overlay'), showFreeze);
    if (showFreeze) $('freeze-count').textContent = Math.ceil(this.freezeT);
    this.drawMinimap();
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const size = 160;
    ctx.clearRect(0, 0, size, size);
    const sx = size / WORLD_W, sz = size / WORLD_H;
    const toMap = (x, z) => [(x + WORLD_W / 2) * sx, (z + WORLD_H / 2) * sz];
    // walls
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    const g = this.map.grid;
    const cw = size / g[0].length, ch = size / g.length;
    for (let z = 0; z < g.length; z++) for (let x = 0; x < g[0].length; x++) {
      if (g[z][x]) ctx.fillRect(x * cw, z * ch, cw + 0.5, ch + 0.5);
    }
    // jail
    const [jx, jz] = toMap(this.map.jail.x, this.map.jail.z);
    ctx.strokeStyle = '#44ddff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(jx, jz, 5, 0, Math.PI * 2); ctx.stroke();
    // items (own role's items only)
    const myRoleKey = this.local.role === ROLES.TRAITOR ? 'traitor' : this.local.role;
    ctx.fillStyle = '#ffd166';
    for (const it of this.items) {
      if (!it.alive) continue;
      if (!ITEMS[it.type].for.includes(myRoleKey)) continue;
      const [ix, iz] = toMap(it.x, it.z);
      ctx.fillRect(ix - 1.5, iz - 1.5, 3, 3);
    }
    // players
    for (const p of this.players) {
      const isMe = p.id === this.localId;
      const isOni = p.role === ROLES.ONI;
      let visible = isMe;
      if (!visible) {
        if (this.local.role === ROLES.ONI) {
          // oni sees: revealed runners, signal target, captured
          visible = this.revealT > 0 || p.captured ||
            (this.signalT > 0 && this.signalTarget === p.id) ||
            dist2(this.local.x, this.local.z, p.x, p.z) < 144;
        } else if (this.local.role === ROLES.TRAITOR) {
          visible = true; // traitor sees everyone (spy advantage)
        } else {
          visible = !isOni ? true : dist2(this.local.x, this.local.z, p.x, p.z) < 225; // runners see each other; oni only when near
        }
      }
      if (!visible) continue;
      const [px, pz] = toMap(p.x, p.z);
      ctx.fillStyle = isMe ? '#ffffff' : isOni ? '#ff4444' : p.captured ? '#557' : '#44bbff';
      ctx.beginPath(); ctx.arc(px, pz, isMe ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      if (isMe) {
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(px + Math.sin(this.camYaw) * 8, pz + Math.cos(this.camYaw) * 8);
        ctx.stroke();
      }
    }
  }

  // ---------- Per-frame ----------
  /**
   * @param input  polled input snapshot
   */
  frame(dt, input) {
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;

    // ----- local input → movement intent -----
    const lp = this.local;
    this.camYaw -= input.lookDX;
    this.camPitch = clamp(this.camPitch + input.lookDY, -0.95, 0.95);

    if (!lp.captured && !lp.frozen) {
      // camera-relative movement (first-person):
      // look dir F = (sin(camYaw), cos(camYaw)); screen-right R = (-cos, sin).
      // world = R*moveX + F*(-moveZ)  → fixes the previous L/R inversion.
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wx = -input.moveX * cos - input.moveZ * sin;
      const wz = input.moveX * sin - input.moveZ * cos;
      lp.input.moveX = wx;
      lp.input.moveZ = wz;
      lp.input.dash = input.dash;
      // character faces where the camera looks (FP)
      lp.yaw = this.camYaw;
      if (input.useItem) {
        if (this.isHost) this.useItem(lp);
        else this.net.send({ t: 'useItem', pid: this.localId });
      }
      if (input.signal && lp.role === ROLES.TRAITOR) {
        if (this.isHost) this.traitorSignal(lp, null);
        else this.net.send({ t: 'doSignal', pid: this.localId });
      }
    } else {
      lp.input.moveX = 0; lp.input.moveZ = 0;
    }

    if (this.isHost) {
      this.hostUpdate(dt);
    } else {
      // client: simulate own movement locally (prediction), send input to host
      this.movePlayer(lp, dt);
      this._netAccum += dt;
      if (this._netAccum >= 0.05) {
        this._netAccum = 0;
        this.net.send({ t: 'i', pid: this.localId, mx: lp.input.moveX, mz: lp.input.moveZ, d: lp.input.dash ? 1 : 0, yaw: lp.yaw });
      }
      // interpolate remote players
      for (const p of this.players) {
        if (p.id === this.localId) continue;
        if (p.netX !== undefined) {
          p.x = lerp(p.x, p.netX, Math.min(1, dt * 12));
          p.z = lerp(p.z, p.netZ, Math.min(1, dt * 12));
          let dy = p.netYaw - p.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          p.yaw += dy * Math.min(1, dt * 10);
          p.speed = (p.netSpeed || 0) * CONFIG.ONI_DASH_SPEED;
        }
      }
      this.time -= dt; // local countdown between syncs
    }

    // ----- update visuals -----
    for (const p of this.players) {
      p.model.position.set(p.x, 0, p.z);
      p.model.rotation.y = p.yaw;
      // first-person: hide own body so it never blocks the view
      if (p === lp) p.model.visible = false;
      else p.model.visible = !p.captured || dist2(p.x, p.z, this.map.jail.x, this.map.jail.z) < 25;
      const normSpeed = Math.min(1, p.speed / CONFIG.ONI_DASH_SPEED);
      p.anim.speed = lerp(p.anim.speed, normSpeed, Math.min(1, dt * 10));
      p.anim.frozen = p.frozen;
      animateCharacter(p.model, p.anim, dt);
      // traitor/runner: name tags visible to all; oni glow
    }

    // spin items
    for (const it of this.items) {
      if (it.alive && it.spin) {
        it.spin.rotation.y += dt * 2;
        it.spin.position.y = 0.8 + Math.sin(this.elapsed * 2.5 + it.x) * 0.12;
      }
    }
    // VFX
    if (this._vfx) for (const f of [...this._vfx]) f(dt);
    this.map.update(this.elapsed);

    // ----- camera: first-person (DbD killer-style immersion) -----
    const isOniLocal2 = lp.role === ROLES.ONI;
    const eyeH = isOniLocal2 ? 1.78 : 1.55;
    // head-bob synced to movement speed
    const spNorm = Math.min(1, lp.speed / CONFIG.ONI_DASH_SPEED);
    this._bobT += dt * (5 + spNorm * 9) * (spNorm > 0.03 ? 1 : 0);
    const bobY = Math.abs(Math.sin(this._bobT)) * 0.055 * spNorm;
    const bobX = Math.sin(this._bobT * 0.5) * 0.03 * spNorm;
    const fSin = Math.sin(this.camYaw), fCos = Math.cos(this.camYaw);
    // strafe-bob applied along screen-right vector (-cos, sin)
    this.camera.position.set(
      lp.x + (-fCos) * bobX,
      eyeH + bobY,
      lp.z + (fSin) * bobX
    );
    const cp = Math.cos(this.camPitch);
    this.camera.lookAt(
      lp.x + fSin * cp,
      eyeH + bobY - Math.sin(this.camPitch),
      lp.z + fCos * cp
    );
    // dash FOV kick for speed sensation
    const targetFov = 75 + spNorm * (lp.input.dash ? 8 : 4);
    this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 6));
    this.camera.updateProjectionMatrix();

    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
