// ===== Core game engine (host-authoritative simulation + rendering) =====
// v3: DbD-style combat (lunge attack), vault windows, generators/escape gate,
//     full item roster, terror-radius heartbeat, chase music, particle VFX,
//     screen shake, crouch-stealth, scoring, endgame aura.
import * as THREE from 'three';
import {
  CONFIG, ROLES, ROLE_INFO, ITEMS, RUNNER_ITEM_KEYS, ONI_ITEM_KEYS,
  RUNNER_ITEM_WEIGHTS, ONI_ITEM_WEIGHTS, weightedPick,
} from './config.js';
import { GameMap, WORLD_W, WORLD_H } from './map.js';
import {
  createRunnerModel, createOniModel, createFPArms, animateCharacter,
  animateFPArms, makeDecoyMaterialOverride, RUNNER_COLORS,
} from './characters.js';
import { Bot } from './bots.js';
import { ParticleSystem, ScreenShake, SpeedLines, pulseVignette } from './vfx.js';
import * as Audio from './audio.js';
import { $, show, clamp, lerp, dist2, fmtTime, pick, rand } from './utils.js';

export class Game {
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
    this.revealT = 0;
    this.signalT = 0; this.signalTarget = null; this.signalCD = 0;
    this.items = [];
    this.traps = [];
    this.tempWalls = [];
    this.smokes = [];
    this.decoys = [];
    this.bots = [];
    this.elapsed = 0;
    this._netAccum = 0;
    this._itemRespawnT = 0;
    this._vfx = [];
    this.gensDone = 0;
    this.gateOpenAmt = 0;
    this.escaped = [];           // ids that escaped through gate
    this._endgame = false;
    this._endgamePingT = 0;
    this._stepT = 0;
    this._chaseLevel = 0;
    this._terror = 0;

    this.initScene();
    this.map = new GameMap();
    this.mapGroup = this.map.build(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.shake = new ScreenShake();
    this.speedLines = new SpeedLines();
    this.initPlayers(opts.roles);
    if (this.isHost) this.spawnInitialItems();
    this.initHUD();
    this.startAudioAmbience();
  }

  startAudioAmbience() {
    try {
      Audio.initAudio();
      Audio.loadMutePref();
      Audio.startAmbient();
      Audio.startHeartbeat();
      Audio.startChaseLayer();
      Audio.sfxGameStart();
    } catch (e) { /* audio optional */ }
  }

  // ---------- Scene ----------
  initScene() {
    const canvas = $('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2c4070);
    this.scene.fog = new THREE.Fog(0x33476f, 30, 80);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.06, 220);
    this.camYaw = 0;
    this.camPitch = 0;
    this._bobT = 0;
    this._fovBase = 75;

    const amb = new THREE.AmbientLight(0x7788bb, 1.1);
    this.scene.add(amb);
    const moon = new THREE.DirectionalLight(0xaabbff, 1.5);
    moon.position.set(20, 35, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -36; moon.shadow.camera.right = 36;
    moon.shadow.camera.top = 36; moon.shadow.camera.bottom = -36;
    moon.shadow.camera.far = 90;
    moon.shadow.bias = -0.0004;
    this.scene.add(moon);
    const hemi = new THREE.HemisphereLight(0x6688bb, 0x3a4a28, 0.85);
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
    const spawns = [
      { x: 0, z: -8 },
      { x: -WORLD_W / 2 + 5, z: -WORLD_H / 2 + 5 },
      { x: WORLD_W / 2 - 5, z: -WORLD_H / 2 + 5 },
      { x: -WORLD_W / 2 + 5, z: WORLD_H / 2 - 5 },
      { x: WORLD_W / 2 - 5, z: WORLD_H / 2 - 5 },
    ];
    let runnerSlot = 0, spawnIdx = 1;
    this.roster.forEach((r) => {
      const role = roles[r.id];
      const isOni = role === ROLES.ONI;
      const sp = isOni ? spawns[0] : spawns[spawnIdx++];
      const colorIdx = runnerSlot;
      const bodyColor = RUNNER_COLORS[runnerSlot++ % RUNNER_COLORS.length];
      const model = isOni ? createOniModel() : createRunnerModel(bodyColor);
      model.position.set(sp.x, 0, sp.z);
      this.scene.add(model);

      const tag = this.makeNameTag(r.name, isOni ? '#ff5a5a' : '#ffffff');
      tag.position.y = isOni ? 2.6 : 2.1;
      model.add(tag);

      const p = {
        id: r.id, name: r.name, isBot: r.isBot, role, bodyColor, colorIdx,
        x: sp.x, z: sp.z, yaw: Math.atan2(-sp.x, -sp.z),
        vx: 0, vz: 0, speed: 0,
        stamina: CONFIG.DASH_STAMINA_MAX,
        wantDash: false,
        item: null,
        captured: false, frozen: isOni, escaped: false,
        slowT: 0, blindT: 0, boostT: 0, hasteT: 0, drinkT: 0,
        crouch: false,
        revealed: false,
        attackCD: 0, attackT: 0, lungeT: 0, lungeVX: 0, lungeVZ: 0, missLagT: 0,
        vaultT: 0, vaultCD: 0, vaultData: null,
        repairing: null,
        score: 0, captures: 0, rescues: 0,
        model, anim: { speed: 0, phase: Math.random() * 6 },
        input: { moveX: 0, moveZ: 0, dash: false, crouch: false },
        rescueT: 0,
        nameTag: tag,
      };
      this.players.push(p);
      if (r.isBot && this.isHost) this.bots.push(new Bot(p, this));
    });
    this.local = this.players.find(p => p.id === this.localId);
    this.camYaw = this.local.yaw;

    // First-person arm rig for the local player
    this.fpArms = createFPArms(this.local.role, this.local.bodyColor);
    this.fpArms.userData.anim = { phase: 0, speed: 0, idleT: 0, attackT: 0, attackDur: 0.4 };
    this.camera.add(this.fpArms);
    this.scene.add(this.camera);
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
  aliveRunners() { return this.players.filter(p => p.role === ROLES.RUNNER && !p.captured && !p.escaped); }
  isHider(p) { return p.role === ROLES.RUNNER || p.role === ROLES.TRAITOR; }

  // ---------- Items ----------
  spawnInitialItems() {
    for (let i = 0; i < CONFIG.ITEM_COUNT; i++) this.spawnItem();
  }

  spawnItem(typeOverride) {
    let type = typeOverride;
    if (!type) {
      // 70% runner items, 30% oni items, weighted within each group
      type = (Math.random() < 0.70)
        ? weightedPick(RUNNER_ITEM_WEIGHTS)
        : weightedPick(ONI_ITEM_WEIGHTS);
    }
    const pos = this.map.randomWalkable();
    if (dist2(pos.x, pos.z, this.map.jail.x, this.map.jail.z) < 16) return this.spawnItem(typeOverride);
    const item = {
      id: Math.random().toString(36).slice(2, 8), type, x: pos.x, z: pos.z, alive: true,
      forRunner: ITEMS[type].for.includes('runner'),
    };
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
      new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2 })
    );
    box.position.y = 0.85;
    box.castShadow = true;
    group.add(box);
    // floating ring beneath
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.55, 20),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    const glow = new THREE.PointLight(def.color, 3, 4.5, 2);
    glow.position.y = 0.95;
    group.add(glow);
    group.position.set(item.x, 0, item.z);
    this.scene.add(group);
    item.mesh = group;
    item.spin = box;
    item.ring = ring;
  }

  removeItem(item) {
    item.alive = false;
    if (item.mesh) { this.scene.remove(item.mesh); item.mesh = null; }
  }

  useItem(p) {
    if (!p.item || p.captured || p.frozen) return;
    const type = p.item;
    p.item = null;
    if (this.net && this.isHost) this.net.broadcast({ t: 'fx', kind: 'use', type, x: p.x, z: p.z, pid: p.id, yaw: p.yaw });
    this.applyItemEffect(p, type);
    if (p === this.local) this.updateItemHUD();
  }

  applyItemEffect(p, type) {
    switch (type) {
      case 'boost':
        p.boostT = CONFIG.BOOST_TIME;
        this.particles.emit({ x: p.x, z: p.z, y: 0.4, count: 16, color: 0x44ff88, speed: 2.5, life: 0.6, size: 0.35, gravity: 1 });
        this.sfx('Boost');
        this.announce(p, '👟 加速ブースト！');
        break;
      case 'flash': {
        const oni = this.getOni();
        if (oni && dist2(p.x, p.z, oni.x, oni.z) < CONFIG.FLASH_RADIUS ** 2 &&
            this.map.hasLOS(p.x, p.z, oni.x, oni.z)) {
          oni.blindT = CONFIG.FLASH_BLIND_TIME;
          if (this.net) this.net.broadcast({ t: 'blind', pid: oni.id, dur: CONFIG.FLASH_BLIND_TIME });
          if (oni.id === this.localId) this.doFlashEffect();
        }
        this.spawnFlashVFX(p.x, p.z);
        this.particles.flashBurst(p.x, p.z);
        this.sfx('Flash');
        this.announce(p, '✨ 閃光！');
        break;
      }
      case 'wall': {
        const oni = this.getOni();
        let dirX = Math.sin(p.yaw + Math.PI), dirZ = Math.cos(p.yaw + Math.PI);
        if (oni) {
          const dx = oni.x - p.x, dz = oni.z - p.z, d = Math.hypot(dx, dz) || 1;
          dirX = dx / d; dirZ = dz / d;
        }
        this.placeTempWall(p.x + dirX * 1.6, p.z + dirZ * 1.6, Math.atan2(dirX, dirZ));
        this.sfx('WallPlace');
        this.announce(p, '🧱 壁を設置！');
        break;
      }
      case 'smoke': {
        this.spawnSmoke(p.x, p.z);
        this.particles.smokeCloud(p.x, p.z, CONFIG.SMOKE_RADIUS);
        this.sfx('Smoke');
        this.announce(p, '💨 スモーク展開！');
        break;
      }
      case 'decoy': {
        this.spawnDecoy(p);
        this.particles.decoyPoof(p.x, p.z);
        this.sfx('Decoy');
        this.announce(p, '🎭 デコイ出現！');
        break;
      }
      case 'drink': {
        p.stamina = CONFIG.DASH_STAMINA_MAX;
        p.drinkT = CONFIG.STAMINA_DRINK_REGEN_T;
        this.particles.emit({ x: p.x, z: p.z, y: 0.9, count: 14, color: 0xff88dd, speed: 1.5, life: 0.6, size: 0.32, gravity: 2 });
        this.sfx('Drink');
        this.announce(p, '🧃 スタミナ全回復！');
        break;
      }
      case 'detector':
        this.revealT = CONFIG.DETECTOR_TIME;
        if (this.net) this.net.broadcast({ t: 'reveal', dur: CONFIG.DETECTOR_TIME });
        this.sfx('Detector');
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
        this.sfx('TrapPlace');
        this.announce(p, '🪤 トラップ設置！');
        break;
      }
      case 'haste':
        p.hasteT = CONFIG.ONI_HASTE_TIME;
        this.particles.emit({ x: p.x, z: p.z, y: 0.5, count: 18, color: 0xff4400, speed: 3, life: 0.5, size: 0.4, gravity: 0.6 });
        this.sfx('Haste');
        this.shake.add(0.25);
        this.announce(p, '🔥 狂奔！');
        break;
    }
  }

  sfx(name, ...args) {
    const fn = Audio['sfx' + name];
    if (typeof fn === 'function') { try { fn(...args); } catch (e) {} }
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

  spawnSmoke(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.SMOKE_RADIUS, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x99aabb, transparent: true, opacity: 0.0, depthWrite: false })
    );
    mesh.position.set(x, 1.2, z);
    this.scene.add(mesh);
    this.smokes.push({ x, z, t: CONFIG.SMOKE_TIME, mesh });
    if (this.net && this.isHost) this.net.broadcast({ t: 'smoke+', x, z });
  }

  spawnDecoy(p) {
    const model = createRunnerModel(p.bodyColor);
    makeDecoyMaterialOverride(model);
    model.position.set(p.x, 0, p.z);
    model.rotation.y = p.yaw;
    this.scene.add(model);
    // decoy runs forward in player facing direction
    const dirX = Math.sin(p.yaw), dirZ = Math.cos(p.yaw);
    this.decoys.push({
      x: p.x, z: p.z, dirX, dirZ, t: CONFIG.DECOY_TIME, model,
      anim: { speed: 1, phase: 0 }, ownerId: p.id,
    });
    if (this.net && this.isHost) this.net.broadcast({ t: 'decoy+', x: p.x, z: p.z, yaw: p.yaw, color: p.bodyColor, pid: p.id });
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
    this._vfx.push(fade);
  }

  doFlashEffect() {
    const ov = $('flash-overlay');
    ov.style.transition = 'opacity .05s';
    ov.style.opacity = '1';
    setTimeout(() => { ov.style.transition = `opacity ${CONFIG.FLASH_BLIND_TIME}s`; ov.style.opacity = '0'; }, 120);
    setTimeout(() => { ov.style.transition = 'opacity .2s'; }, CONFIG.FLASH_BLIND_TIME * 1000 + 300);
  }

  announce(p, msg) {
    if (p === this.local) this.showMessage(msg);
  }

  // ---------- Oni attack (DbD-style lunge swing) ----------
  tryAttack(p) {
    if (p.role !== ROLES.ONI || p.frozen || p.captured) return;
    if (p.attackCD > 0 || p.attackT > 0) return;
    p.attackT = CONFIG.ATTACK_LUNGE_TIME + 0.18;       // swing window
    p.attackCD = CONFIG.ATTACK_COOLDOWN;
    p.lungeT = CONFIG.ATTACK_LUNGE_TIME;
    p.lungeVX = Math.sin(p.yaw);
    p.lungeVZ = Math.cos(p.yaw);
    p._attackHit = false;
    // trigger FP arm + 3p model swing animations
    p.anim.attackT = 0.42; p.anim.attackDur = 0.42;
    if (p === this.local && this.fpArms) {
      this.fpArms.userData.anim.attackT = 0.4;
      this.fpArms.userData.anim.attackDur = 0.4;
    }
    this.sfx('Swing');
    this.particles.swingTrail(p.x, p.z, p.yaw);
    if (this.net && this.isHost) this.net.broadcast({ t: 'attack', pid: p.id, x: p.x, z: p.z, yaw: p.yaw });
  }

  // resolve attack hit against runners within arc+range (host authority)
  resolveAttack(p, dt) {
    if (p._attackHit) return;
    // hit detection during the active swing portion
    const fwdX = Math.sin(p.yaw), fwdZ = Math.cos(p.yaw);
    for (const t of this.players) {
      if (t.role !== ROLES.RUNNER || t.captured || t.escaped) continue;
      const dx = t.x - p.x, dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) continue;

      // check 1: body contact (very close range, ignore arc)
      const contact = d < CONFIG.CATCH_RADIUS;
      // check 2: swing arc (lunge range)
      const dot = (dx / d) * fwdX + (dz / d) * fwdZ;
      const ang = Math.acos(clamp(dot, -1, 1));
      const inArc = (d <= CONFIG.ATTACK_RANGE && ang <= CONFIG.ATTACK_ARC);

      if (contact || inArc) {
        // hit!
        p._attackHit = true;
        p.attackCD = CONFIG.ATTACK_HIT_LAG;
        this.capture(t, p);
        this.particles.hitSpark(t.x, t.z);
        this.sfx('Hit');
        return;
      }
    }
  }

  // ---------- Vault (window) ----------
  tryVault(p) {
    if (p.captured || p.frozen || p.vaultT > 0 || p.vaultCD > 0) return false;
    const isOni = p.role === ROLES.ONI;
    const near = this.map.nearestVault(p.x, p.z, CONFIG.VAULT_RADIUS);
    if (!near) return false;
    const v = near.vault;
    // must be roughly facing/moving toward the window
    p.vaultT = isOni ? CONFIG.VAULT_TIME_ONI : CONFIG.VAULT_TIME_RUNNER;
    p.vaultDur = p.vaultT;
    p.vaultCD = CONFIG.VAULT_COOLDOWN + p.vaultT;
    // compute target on the far side of the window
    const through = v.axis === 'h' ? { x: 0, z: (p.z < v.z ? 1 : -1) } : { x: (p.x < v.x ? 1 : -1), z: 0 };
    p.vaultData = {
      sx: p.x, sz: p.z,
      ex: v.x + through.x * 1.4, ez: v.z + through.z * 1.4,
    };
    p.anim.vaultT = p.vaultDur; p.anim.vaultDur = p.vaultDur;
    this.sfx('Vault');
    this.particles.vaultDust(v.x, v.z);
    if (this.net && this.isHost) this.net.broadcast({ t: 'vault', pid: p.id, ex: p.vaultData.ex, ez: p.vaultData.ez, dur: p.vaultDur });
    return true;
  }

  // ---------- Generators / escape ----------
  updateGenerators(dt) {
    let done = 0;
    for (const gen of this.map.generators) {
      if (gen.done) { done++; continue; }
      // who is repairing? runners (not traitor — traitor only sabotages) within radius, not in chase contact
      let workers = 0;
      for (const t of this.players) {
        if (t.role !== ROLES.RUNNER || t.captured || t.escaped) continue;
        if (t.crouch) continue; // can't repair while crouched
        const inRange = dist2(t.x, t.z, gen.x, gen.z) < CONFIG.GEN_REPAIR_RADIUS ** 2;
        const moving = Math.hypot(t.input.moveX, t.input.moveZ) > 0.15;
        if (inRange && !moving) { workers++; t.repairing = gen.id; }
        else if (t.repairing === gen.id) t.repairing = null;
      }
      if (workers > 0) {
        gen.progress = Math.min(CONFIG.GEN_REPAIR_TIME, gen.progress + workers * dt);
        if (gen._lastWork === undefined || this.elapsed - gen._lastWork > 0.5) {
          this.particles.emit({ x: gen.x, z: gen.z, y: 1.0, count: 4, color: 0xffdd66, speed: 2, life: 0.4, size: 0.22, gravity: -3, spread: 0.6 });
          gen._lastWork = this.elapsed;
        }
        if (gen.progress >= CONFIG.GEN_REPAIR_TIME && !gen.done) {
          gen.done = true;
          this.particles.emit({ x: gen.x, z: gen.z, y: 1.0, count: 30, color: 0x66ff99, speed: 4, life: 0.9, size: 0.4, gravity: 1 });
          if (this.net && this.isHost) this.net.broadcast({ t: 'gendone', id: gen.id });
          this.showAnnounce(`⚙️ 発電機 修理完了！ (${this.countGensDone()}/${CONFIG.GEN_REQUIRED})`, 2.5);
          this.sfx('Unfreeze');
        }
      } else if (gen.progress > 0 && !gen.done) {
        gen.progress = Math.max(0, gen.progress - CONFIG.GEN_REGRESS * dt);
      }
      if (gen.done) done++;
    }
    this.gensDone = done;
    // open gate when enough generators done
    const need = CONFIG.GEN_REQUIRED;
    const want = Math.min(1, done >= need ? 1 : 0);
    this.gateOpenAmt = lerp(this.gateOpenAmt, want, Math.min(1, dt * 1.5));
    this.map.gate.open = done >= need;
    this.map.setGateOpen(this.gateOpenAmt);

    // escape through gate
    if (this.map.gate.open) {
      for (const t of this.players) {
        if (t.role !== ROLES.RUNNER || t.captured || t.escaped) continue;
        if (dist2(t.x, t.z, this.map.gate.x, this.map.gate.z) < CONFIG.GATE_RADIUS ** 2) {
          t.escaped = true;
          t.score += CONFIG.ESCAPE_SCORE;
          this.escaped.push(t.id);
          this.particles.rescueBurst(t.x, t.z);
          if (this.net && this.isHost) this.net.broadcast({ t: 'escape', pid: t.id });
          this.showAnnounce(`🚪 ${t.name} が脱出した！`, 2.5);
          this.sfx('Rescue');
        }
      }
    }
  }

  countGensDone() { return this.map.generators.filter(g => g.done).length; }

  // ---------- Traitor signal ----------
  traitorSignal(traitor, target) {
    if (this.signalCD > 0) return;
    this.signalCD = CONFIG.SIGNAL_COOLDOWN;
    this.signalT = 6;
    this.signalTarget = target ? target.id : null;
    if (!target) {
      let bd = Infinity;
      for (const t of this.players) {
        if (t.role !== ROLES.RUNNER || t.captured || t.escaped) continue;
        const d = dist2(traitor.x, traitor.z, t.x, t.z);
        if (d < bd) { bd = d; this.signalTarget = t.id; }
      }
    }
    if (this.net && this.isHost) this.net.broadcast({ t: 'signal', target: this.signalTarget, dur: 6 });
    if (traitor === this.local) this.showMessage('📡 人狼に位置を密告した！');
    this.sfx('Signal');
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
        const o = this.getOni();
        if (o) { this.particles.unfreezeBurst(o.x, o.z); this.sfx('Unfreeze'); this.shake.add(0.4); }
        this.showAnnounce('👹 人狼が解き放たれた！', 2.5);
      }
    }
    this.revealT = Math.max(0, this.revealT - dt);
    this.signalT = Math.max(0, this.signalT - dt);
    this.signalCD = Math.max(0, this.signalCD - dt);

    for (const b of this.bots) b.update(dt);
    for (const p of this.players) this.movePlayer(p, dt);

    // resolve oni attack hits during active swings
    const oni = this.getOni();
    if (oni && oni.attackT > 0 && oni.lungeT >= 0) this.resolveAttack(oni, dt);

    this.updateItems(dt);
    this.updateTraps(dt);
    this.updateTempWalls(dt);
    this.updateGenerators(dt);

    // jail rescue
    const jail = this.map.jail;
    for (const p of this.players) {
      if (p.captured || p.role === ROLES.ONI || p.escaped) continue;
      if (dist2(p.x, p.z, jail.x, jail.z) < CONFIG.RESCUE_RADIUS ** 2) {
        const jailed = this.players.filter(t => t.captured);
        if (jailed.length) {
          p.rescueT += dt;
          if (p === this.local) this.showMessage(`🔓 救出中… ${Math.ceil((CONFIG.RESCUE_TIME - p.rescueT) * 10) / 10}s`);
          if (p.rescueT >= CONFIG.RESCUE_TIME) {
            p.rescueT = 0;
            p.score += CONFIG.RESCUE_SCORE; p.rescues++;
            for (const j of jailed) this.rescue(j);
          }
        }
      } else p.rescueT = 0;
    }

    // endgame trigger
    if (!this._endgame && this.time <= CONFIG.ENDGAME_TIME) {
      this._endgame = true;
      this.showAnnounce('⏰ エンドゲーム！逃げの位置が露見する', 3);
    }
    if (this._endgame) {
      this._endgamePingT -= dt;
      if (this._endgamePingT <= 0) {
        this._endgamePingT = CONFIG.ENDGAME_PING_INTERVAL;
        for (const r of this.aliveRunners()) this.particles.endgameAura(r.x, r.z);
      }
    }

    // win conditions
    const alive = this.aliveRunners().length;
    if (alive === 0) {
      // oni wins only if nobody escaped & none alive; if some escaped, runners win
      if (this.escaped.length > 0) this.endGame('runner');
      else this.endGame('oni');
    } else if (this.time <= 0) {
      this.endGame('runner');
    }

    // network state broadcast (10Hz)
    if (this.net) {
      this._netAccum += dt;
      if (this._netAccum >= 0.1) {
        this._netAccum = 0;
        this.net.broadcast(this.serializeState());
      }
    }
  }

  updateItems(dt) {
    for (const it of this.items) {
      if (!it.alive) continue;
      for (const p of this.players) {
        if (p.captured || p.item || p.escaped) continue;
        const roleKey = p.role === ROLES.TRAITOR ? 'traitor' : p.role;
        if (!ITEMS[it.type].for.includes(roleKey)) continue;
        if (dist2(p.x, p.z, it.x, it.z) < CONFIG.ITEM_PICK_RADIUS ** 2) {
          p.item = it.type;
          this.removeItem(it);
          this.particles.pickupSparkle(it.x, it.z);
          if (this.net) this.net.broadcast({ t: 'item-', id: it.id, pid: p.id, type: it.type });
          if (p === this.local) { this.updateItemHUD(); this.showMessage(`${ITEMS[it.type].icon} ${ITEMS[it.type].name} を入手！`); this.sfx('Pickup'); }
          break;
        }
      }
    }
    this._itemRespawnT -= dt;
    if (this._itemRespawnT <= 0) {
      this._itemRespawnT = CONFIG.ITEM_RESPAWN;
      const aliveCount = this.items.filter(i => i.alive).length;
      if (aliveCount < CONFIG.ITEM_COUNT) this.spawnItem();
    }
  }

  updateTraps(dt) {
    for (const tr of this.traps) {
      if (!tr.alive) continue;
      for (const p of this.players) {
        if (p.role !== ROLES.RUNNER || p.captured || p.escaped) continue;
        if (dist2(p.x, p.z, tr.x, tr.z) < 0.6 * 0.6) {
          tr.alive = false;
          if (tr.mesh) { this.scene.remove(tr.mesh); tr.mesh = null; }
          p.slowT = CONFIG.TRAP_SLOW_TIME;
          this.particles.trapSnap(tr.x, tr.z);
          if (this.net) this.net.broadcast({ t: 'trap!', x: tr.x, z: tr.z, pid: p.id, dur: CONFIG.TRAP_SLOW_TIME });
          if (p === this.local) { this.showMessage('🪤 トラップにかかった！'); this.sfx('TrapSnap'); pulseVignette('rgba(255,120,0,0.3)', 400); }
        }
      }
    }
  }

  updateTempWalls(dt) {
    for (const w of this.tempWalls) {
      w.t -= dt;
      if (w.t <= 0 && w.mesh) { this.scene.remove(w.mesh); w.mesh = null; }
      else if (w.mesh) w.mesh.material.opacity = Math.min(0.75, w.t / 1.5 * 0.75);
    }
    this.tempWalls = this.tempWalls.filter(w => w.t > 0);
  }

  movePlayer(p, dt) {
    // tick down cooldowns/timers that always run
    p.attackCD = Math.max(0, p.attackCD - dt);
    p.attackT = Math.max(0, p.attackT - dt);
    p.lungeT = Math.max(0, p.lungeT - dt);
    p.vaultCD = Math.max(0, p.vaultCD - dt);
    p.missLagT = Math.max(0, p.missLagT - dt);

    // whiff lag: if attack window ended without hit, apply recovery
    if (p.role === ROLES.ONI && p.attackT <= 0 && p._attackPending) {
      p._attackPending = false;
      if (!p._attackHit) { p.attackCD = Math.max(p.attackCD, CONFIG.ATTACK_MISS_LAG); this.sfx('Whiff'); }
    }

    if (p.captured || p.frozen || p.escaped) { p.speed = 0; p.anim.speed = lerp(p.anim.speed, 0, dt * 8); return; }

    // ----- Vault movement: interpolate across window -----
    if (p.vaultT > 0 && p.vaultData) {
      p.vaultT -= dt;
      const t = 1 - Math.max(0, p.vaultT) / p.vaultDur;
      p.x = lerp(p.vaultData.sx, p.vaultData.ex, t);
      p.z = lerp(p.vaultData.sz, p.vaultData.ez, t);
      p.speed = 4;
      if (p.vaultT <= 0) { p.vaultData = null; }
      return;
    }

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

    // crouch (runners only) — slow but stealthy, can't dash
    p.crouch = !isOni && !!(p.isBot ? p.wantCrouch : p.input.crouch) && !dashing;

    let speed = dashing ? dashSpeed : base;
    if (p.crouch) speed *= CONFIG.CROUCH_SPEED_FACTOR;
    if (p.slowT > 0) { speed *= CONFIG.TRAP_SLOW_FACTOR; p.slowT -= dt; }
    if (p.boostT > 0) { speed *= CONFIG.BOOST_FACTOR; p.boostT -= dt; }
    if (p.hasteT > 0) { speed *= CONFIG.ONI_HASTE_FACTOR; p.hasteT -= dt; }
    if (p.blindT > 0) { p.blindT -= dt; if (isOni) speed *= 0.55; }
    if (p.missLagT > 0) speed *= 0.55;
    // attack recovery slows oni
    if (isOni && p.attackCD > 0 && p.attackT <= 0) speed *= 0.78;
    // last-survivor adrenaline
    if (!isOni && this.aliveRunners().length === 1 && !p.captured) speed *= CONFIG.LAST_RUNNER_BOOST;

    // ----- Lunge burst during attack -----
    let lungeX = 0, lungeZ = 0;
    if (isOni && p.lungeT > 0) {
      lungeX = p.lungeVX * CONFIG.ATTACK_LUNGE_SPEED;
      lungeZ = p.lungeVZ * CONFIG.ATTACK_LUNGE_SPEED;
    }

    // stamina
    if (dashing && mag > 0.05) p.stamina = Math.max(0, p.stamina - CONFIG.DASH_DRAIN * dt);
    else {
      const regen = CONFIG.DASH_REGEN * (p.drinkT > 0 ? 2.2 : 1);
      p.stamina = Math.min(CONFIG.DASH_STAMINA_MAX, p.stamina + regen * dt);
    }
    if (p.drinkT > 0) p.drinkT -= dt;

    let nx = p.x + (mx * speed + lungeX) * dt;
    let nz = p.z + (mz * speed + lungeZ) * dt;
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
    p.speed = mag * speed + (p.lungeT > 0 ? CONFIG.ATTACK_LUNGE_SPEED * 0.5 : 0);
    if (p.isBot && mag > 0.05 && p.lungeT <= 0) p.yaw = Math.atan2(mx, mz);
  }

  capture(p, by) {
    if (p.captured) return;
    p.captured = true;
    p.x = this.map.jail.x + rand(-0.5, 0.5);
    p.z = this.map.jail.z + rand(-0.5, 0.5);
    if (by) { by.score += CONFIG.CAPTURE_SCORE; by.captures++; }
    if (this.net) this.net.broadcast({ t: 'capture', pid: p.id, x: p.x, z: p.z });
    this.onCaptureFX(p);
  }

  onCaptureFX(p) {
    this.showAnnounce(`${p.name} が捕まった！`);
    this.particles.captureBurst(p.x, p.z);
    this.shake.add(0.6);
    this.sfx('Captured');
    if (p === this.local) { show($('captured-overlay'), true); pulseVignette('rgba(120,0,30,0.55)', 800); }
    else if (this.local.role === ROLES.ONI) pulseVignette('rgba(120,0,30,0.3)', 500);
  }

  rescue(p) {
    p.captured = false;
    // place near jail edge so they don't get instantly re-caught
    if (this.net) this.net.broadcast({ t: 'rescue', pid: p.id });
    this.onRescueFX(p);
  }

  onRescueFX(p) {
    this.showAnnounce(`${p.name} が救出された！`);
    this.particles.rescueBurst(this.map.jail.x, this.map.jail.z);
    this.sfx('Rescue');
    if (p === this.local) { show($('captured-overlay'), false); pulseVignette('rgba(0,200,120,0.35)', 600); }
  }

  endGame(winner) {
    if (this.over) return;
    this.over = true;
    Audio.stopGameAudio();
    if (winner === 'oni') {
      const iWon = this.local.role === ROLES.ONI || this.local.role === ROLES.TRAITOR;
      this.sfx(iWon ? 'Win' : 'Lose');
    } else {
      const iWon = this.isHider(this.local) && this.local.role !== ROLES.TRAITOR;
      this.sfx(iWon ? 'Win' : 'Lose');
    }
    if (this.net && this.isHost) this.net.broadcast({ t: 'end', winner, scores: this.players.map(p => ({ id: p.id, score: p.score })) });
    setTimeout(() => this.onEnd(winner, this.players.map(p => ({ id: p.id, score: p.score, captures: p.captures, rescues: p.rescues, escaped: p.escaped }))), 1400);
    this.showAnnounce(winner === 'oni' ? '👹 人狼チームの勝利！' : '🏃 逃げチームの勝利！', 3);
  }

  // ---------- Network state sync ----------
  serializeState() {
    return {
      t: 's',
      time: this.time,
      freeze: this.freezeT,
      gens: this.map.generators.map(g => +g.progress.toFixed(1)),
      gd: this.map.generators.map(g => g.done ? 1 : 0),
      ps: this.players.map(p => ({
        id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2),
        sp: +(Math.min(1, p.speed / CONFIG.ONI_DASH_SPEED)).toFixed(2),
        cap: p.captured ? 1 : 0, esc: p.escaped ? 1 : 0, item: p.item || '',
        cr: p.crouch ? 1 : 0, at: p.attackT > 0 ? 1 : 0, vt: p.vaultT > 0 ? 1 : 0,
      })),
    };
  }

  applyState(s) {
    this.time = s.time;
    this.freezeT = s.freeze;
    if (s.gens) s.gens.forEach((v, i) => { if (this.map.generators[i]) { this.map.generators[i].progress = v; this.map.generators[i].done = !!s.gd[i]; } });
    this.gensDone = this.countGensDone();
    for (const ps of s.ps) {
      const p = this.players.find(q => q.id === ps.id);
      if (!p) continue;
      if (p.id === this.localId) {
        const d = dist2(p.x, p.z, ps.x, ps.z);
        if (d > 4) { p.x = ps.x; p.z = ps.z; }
        else if (d > 0.5) { p.x = lerp(p.x, ps.x, 0.15); p.z = lerp(p.z, ps.z, 0.15); }
        if (ps.cap && !p.captured) { p.captured = true; show($('captured-overlay'), true); }
        if (!ps.cap && p.captured) { p.captured = false; show($('captured-overlay'), false); }
        if (ps.cap) { p.x = ps.x; p.z = ps.z; }
        p.escaped = !!ps.esc;
        p.item = ps.item || null;
        this.updateItemHUD();
      } else {
        p.netX = ps.x; p.netZ = ps.z; p.netYaw = ps.yaw;
        p.netSpeed = ps.sp;
        p.captured = !!ps.cap;
        p.escaped = !!ps.esc;
        p.crouch = !!ps.cr;
        if (ps.at && !p._wasAttacking) { p.anim.attackT = 0.42; p.anim.attackDur = 0.42; }
        p._wasAttacking = !!ps.at;
        if (ps.vt && !p._wasVaulting) { p.anim.vaultT = 0.6; p.anim.vaultDur = 0.6; }
        p._wasVaulting = !!ps.vt;
      }
      p.frozen = (p.role === ROLES.ONI) && s.freeze > 0;
    }
  }

  handleNetEvent(msg) {
    switch (msg.t) {
      case 's': this.applyState(msg); break;
      case 'item+': {
        if (this.items.find(i => i.id === msg.item.id)) break;
        const item = { id: msg.item.id, type: msg.item.type, x: msg.item.x, z: msg.item.z, alive: true,
                       forRunner: ITEMS[msg.item.type].for.includes('runner') };
        this.addItemMesh(item);
        this.items.push(item);
        break;
      }
      case 'item-': {
        const it = this.items.find(i => i.id === msg.id);
        if (it) { this.particles.pickupSparkle(it.x, it.z); this.removeItem(it); }
        if (msg.pid === this.localId) {
          this.local.item = msg.type;
          this.updateItemHUD();
          this.showMessage(`${ITEMS[msg.type].icon} ${ITEMS[msg.type].name} を入手！`);
          this.sfx('Pickup');
        }
        break;
      }
      case 'fx':
        if (msg.kind === 'use') {
          const t = msg.type;
          if (t === 'flash') { this.spawnFlashVFX(msg.x, msg.z); this.particles.flashBurst(msg.x, msg.z); this.sfx('Flash'); }
          else if (t === 'smoke') { this.particles.smokeCloud(msg.x, msg.z, CONFIG.SMOKE_RADIUS); this.sfx('Smoke'); }
          else if (t === 'boost') { this.sfx('Boost'); }
          else if (t === 'haste') { this.sfx('Haste'); }
          else if (t === 'drink') { this.sfx('Drink'); }
          else if (t === 'detector') { this.sfx('Detector'); }
        }
        break;
      case 'blind':
        if (msg.pid === this.localId) { this.local.blindT = msg.dur; this.doFlashEffect(); }
        break;
      case 'reveal': this.revealT = msg.dur; break;
      case 'signal':
        this.signalT = msg.dur; this.signalTarget = msg.target;
        this.sfx('Signal');
        if (this.local.role === ROLES.ONI) this.showMessage('📡 裏切り者からシグナル受信！');
        break;
      case 'attack': {
        const p = this.players.find(q => q.id === msg.pid);
        if (p && p.id !== this.localId) { p.anim.attackT = 0.42; p.anim.attackDur = 0.42; this.particles.swingTrail(msg.x, msg.z, msg.yaw); this.sfx('Swing'); }
        break;
      }
      case 'vault': {
        const p = this.players.find(q => q.id === msg.pid);
        if (p && p.id !== this.localId) { this.sfx('Vault'); this.particles.vaultDust(p.x, p.z); }
        break;
      }
      case 'smoke+': this.spawnSmoke(msg.x, msg.z); break;
      case 'decoy+': {
        if (msg.pid === this.localId) break;
        const fake = { x: msg.x, z: msg.z };
        const model = createRunnerModel(msg.color);
        makeDecoyMaterialOverride(model);
        model.position.set(msg.x, 0, msg.z);
        model.rotation.y = msg.yaw;
        this.scene.add(model);
        this.decoys.push({ x: msg.x, z: msg.z, dirX: Math.sin(msg.yaw), dirZ: Math.cos(msg.yaw), t: CONFIG.DECOY_TIME, model, anim: { speed: 1, phase: 0 }, ownerId: msg.pid });
        this.particles.decoyPoof(msg.x, msg.z);
        this.sfx('Decoy');
        break;
      }
      case 'gendone': {
        const gen = this.map.generators.find(g => g.id === msg.id);
        if (gen) { gen.done = true; gen.progress = CONFIG.GEN_REPAIR_TIME; this.particles.emit({ x: gen.x, z: gen.z, y: 1, count: 30, color: 0x66ff99, speed: 4, life: 0.9, size: 0.4 }); this.sfx('Unfreeze'); this.showAnnounce(`⚙️ 発電機 修理完了！ (${this.countGensDone()}/${CONFIG.GEN_REQUIRED})`, 2.5); }
        break;
      }
      case 'escape': {
        const p = this.players.find(q => q.id === msg.pid);
        if (p) { p.escaped = true; this.particles.rescueBurst(p.x, p.z); this.showAnnounce(`🚪 ${p.name} が脱出した！`, 2.5); this.sfx('Rescue'); }
        break;
      }
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
        if (tr) { tr.alive = false; if (tr.mesh) { this.scene.remove(tr.mesh); tr.mesh = null; } this.particles.trapSnap(msg.x, msg.z); }
        if (msg.pid === this.localId) { this.local.slowT = msg.dur; this.showMessage('🪤 トラップにかかった！'); this.sfx('TrapSnap'); pulseVignette('rgba(255,120,0,0.3)', 400); }
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
        this.sfx('WallPlace');
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
        { const o = this.getOni(); if (o) { this.particles.unfreezeBurst(o.x, o.z); this.sfx('Unfreeze'); } }
        break;
      case 'end': this.endGame(msg.winner); break;
      case 'useItem':
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
      case 'doAttack':
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p && p.role === ROLES.ONI) { p.yaw = msg.yaw; this.tryAttack(p); p._attackPending = true; }
        }
        break;
      case 'doVault':
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p) this.tryVault(p);
        }
        break;
      case 'i':
        if (this.isHost) {
          const p = this.players.find(q => q.id === msg.pid);
          if (p) { p.input.moveX = msg.mx; p.input.moveZ = msg.mz; p.input.dash = !!msg.d; p.input.crouch = !!msg.cr; p.yaw = msg.yaw; }
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
    show($('btn-attack'), this.local.role === ROLES.ONI);
    show($('btn-vault'), this.isHider(this.local));
    show($('btn-crouch'), this.isHider(this.local));
    show($('captured-overlay'), false);
    this.minimapCtx = $('minimap').getContext('2d');
    this.updateItemHUD();
  }

  updateItemHUD() {
    const it = this.local.item;
    $('item-icon').textContent = it ? ITEMS[it].icon : '—';
    $('item-name').textContent = it ? ITEMS[it].name : 'アイテムなし';
    const btn = $('btn-item');
    if (btn) btn.textContent = it ? ITEMS[it].icon : '🎁';
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
    $('hud-timer').textContent = fmtTime(Math.max(0, this.time));
    const alive = this.aliveRunners().length;
    const total = this.players.filter(p => p.role === ROLES.RUNNER).length;
    $('hud-runners').textContent = `🏃 ${alive}/${total}`;
    // objective: generators
    const genEl = $('hud-objective');
    if (genEl) {
      const done = this.countGensDone();
      genEl.textContent = this.map.gate.open ? '🚪 脱出ゲート開放！' : `⚙️ ${done}/${CONFIG.GEN_REQUIRED}`;
      genEl.classList.toggle('gate-open', this.map.gate.open);
    }
    // stamina bar
    const sb = $('stamina-fill');
    if (sb) {
      sb.style.width = (this.local.stamina / CONFIG.DASH_STAMINA_MAX * 100) + '%';
      sb.classList.toggle('low', this.local.stamina < 25);
    }
    // attack cooldown ring on attack button
    if (this.local.role === ROLES.ONI) {
      const btn = $('btn-attack');
      if (btn) {
        const cd = this.local.attackCD;
        btn.classList.toggle('cooldown', cd > 0);
      }
    }
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
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    const g = this.map.grid;
    const cw = size / g[0].length, ch = size / g.length;
    for (let z = 0; z < g.length; z++) for (let x = 0; x < g[0].length; x++) {
      if (g[z][x]) ctx.fillRect(x * cw, z * ch, cw + 0.5, ch + 0.5);
    }
    // generators
    for (const gen of this.map.generators) {
      const [gx, gz] = toMap(gen.x, gen.z);
      ctx.fillStyle = gen.done ? '#44ff77' : '#ffcc44';
      ctx.beginPath(); ctx.arc(gx, gz, 3, 0, Math.PI * 2); ctx.fill();
      if (!gen.done && gen.progress > 0) {
        ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gz, 5, -Math.PI / 2, -Math.PI / 2 + gen.progress / CONFIG.GEN_REPAIR_TIME * Math.PI * 2); ctx.stroke();
      }
    }
    // gate
    if (this.map.gate) {
      const [gx, gz] = toMap(this.map.gate.x, this.map.gate.z);
      ctx.fillStyle = this.map.gate.open ? '#66ffaa' : '#557';
      ctx.fillRect(gx - 4, gz - 2, 8, 4);
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
      if (p.escaped) continue;
      const isMe = p.id === this.localId;
      const isOni = p.role === ROLES.ONI;
      let visible = isMe;
      if (!visible) {
        if (this.local.role === ROLES.ONI) {
          let revealRange = 144;
          if (p.crouch) revealRange *= CONFIG.CROUCH_DETECT_FACTOR;
          visible = this.revealT > 0 || p.captured || this._endgame ||
            (this.signalT > 0 && this.signalTarget === p.id) ||
            dist2(this.local.x, this.local.z, p.x, p.z) < revealRange;
        } else if (this.local.role === ROLES.TRAITOR) {
          visible = true;
        } else {
          visible = !isOni ? true : dist2(this.local.x, this.local.z, p.x, p.z) < 225;
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
  frame(dt, input) {
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    const lp = this.local;

    // ----- look -----
    this.camYaw -= input.lookDX;
    this.camPitch = clamp(this.camPitch + input.lookDY, -0.95, 0.95);

    // ----- movement intent + actions -----
    const canAct = !lp.captured && !lp.frozen && !lp.escaped && lp.vaultT <= 0;
    if (canAct) {
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wx = -input.moveX * cos - input.moveZ * sin;
      const wz = input.moveX * sin - input.moveZ * cos;
      lp.input.moveX = wx;
      lp.input.moveZ = wz;
      lp.input.dash = input.dash;
      lp.input.crouch = !!input.crouch && this.isHider(lp);
      lp.yaw = this.camYaw;

      if (input.useItem) {
        if (this.isHost) this.useItem(lp);
        else this.net.send({ t: 'useItem', pid: this.localId });
      }
      if (input.signal && lp.role === ROLES.TRAITOR) {
        if (this.isHost) this.traitorSignal(lp, null);
        else this.net.send({ t: 'doSignal', pid: this.localId });
      }
      if (input.attack && lp.role === ROLES.ONI) {
        if (this.isHost) { this.tryAttack(lp); lp._attackPending = true; }
        else this.net.send({ t: 'doAttack', pid: this.localId, yaw: lp.yaw });
      }
      if (input.vault) {
        // try local vault (host) or request
        const near = this.map.nearestVault(lp.x, lp.z, CONFIG.VAULT_RADIUS);
        if (near) {
          if (this.isHost) this.tryVault(lp);
          else this.net.send({ t: 'doVault', pid: this.localId });
        }
      }
    } else {
      lp.input.moveX = 0; lp.input.moveZ = 0; lp.input.dash = false; lp.input.crouch = false;
    }

    // ----- simulate -----
    if (this.isHost) {
      this.hostUpdate(dt);
    } else {
      this.movePlayer(lp, dt);
      this._netAccum += dt;
      if (this._netAccum >= 0.05) {
        this._netAccum = 0;
        this.net.send({ t: 'i', pid: this.localId, mx: lp.input.moveX, mz: lp.input.moveZ, d: lp.input.dash ? 1 : 0, cr: lp.input.crouch ? 1 : 0, yaw: lp.yaw });
      }
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
      this.time -= dt;
    }

    // ----- decoys -----
    for (const d of this.decoys) {
      d.t -= dt;
      if (d.t <= 0) { if (d.model) this.scene.remove(d.model); continue; }
      const nx = d.x + d.dirX * 4.5 * dt, nz = d.z + d.dirZ * 4.5 * dt;
      const c = this.map.collide(nx, nz, CONFIG.PLAYER_RADIUS);
      if (Math.abs(c.x - nx) > 0.01 || Math.abs(c.z - nz) > 0.01) {
        // bounce off walls: pick a new random direction
        const a = Math.random() * Math.PI * 2; d.dirX = Math.sin(a); d.dirZ = Math.cos(a);
      }
      d.x = c.x; d.z = c.z;
      d.model.position.set(d.x, 0, d.z);
      d.model.rotation.y = Math.atan2(d.dirX, d.dirZ);
      d.anim.speed = 1;
      animateCharacter(d.model, d.anim, dt);
      d.model.traverse(o => { if (o.material && o.material.opacity !== undefined) o.material.opacity = Math.min(0.55, d.t / 1.2 * 0.55); });
    }
    this.decoys = this.decoys.filter(d => d.t > 0);

    // ----- smokes (block oni vision: handled via fog sphere + dampen reveal) -----
    let inSmoke = false;
    for (const sm of this.smokes) {
      sm.t -= dt;
      if (sm.mesh) {
        const o = clamp(Math.min(sm.t, CONFIG.SMOKE_TIME - sm.t + 0.5) / 1.5, 0, 1) * 0.7;
        sm.mesh.material.opacity = o;
      }
      if (dist2(lp.x, lp.z, sm.x, sm.z) < CONFIG.SMOKE_RADIUS ** 2) inSmoke = true;
      if (sm.t <= 0 && sm.mesh) { this.scene.remove(sm.mesh); sm.mesh = null; }
    }
    this.smokes = this.smokes.filter(s => s.t > 0);

    // ----- update visuals -----
    for (const p of this.players) {
      p.model.position.set(p.x, p.crouch ? -0.35 : 0, p.z);
      p.model.rotation.y = p.yaw;
      if (p === lp) p.model.visible = false;
      else p.model.visible = (!p.captured && !p.escaped) || dist2(p.x, p.z, this.map.jail.x, this.map.jail.z) < 25;
      const normSpeed = Math.min(1, p.speed / CONFIG.ONI_DASH_SPEED);
      p.anim.speed = lerp(p.anim.speed, normSpeed, Math.min(1, dt * 10));
      p.anim.frozen = p.frozen;
      animateCharacter(p.model, p.anim, dt);
    }

    // spin items
    for (const it of this.items) {
      if (it.alive && it.spin) {
        it.spin.rotation.y += dt * 2;
        it.spin.position.y = 0.85 + Math.sin(this.elapsed * 2.5 + it.x) * 0.12;
        if (it.ring) it.ring.rotation.z += dt * 1.2;
      }
    }

    // ----- vault proximity prompt -----
    const nearVault = canAct ? this.map.nearestVault(lp.x, lp.z, CONFIG.VAULT_RADIUS) : null;
    for (const v of this.map.vaults) v._near = nearVault && nearVault.vault === v;
    const nearGen = canAct && this.isHider(lp) ? this.map.nearestGenerator(lp.x, lp.z, CONFIG.GEN_REPAIR_RADIUS) : null;
    this.updatePrompts(nearVault, nearGen);

    // VFX + map
    this.particles.update(dt);
    if (this._vfx.length) for (const f of [...this._vfx]) f(dt);
    this.map.update(this.elapsed);

    // ----- audio: terror radius heartbeat + chase music -----
    this.updateAudio(dt, lp);

    // ----- camera: first-person with head-bob, crouch, shake -----
    this.renderCamera(dt, lp, inSmoke);

    this.updateHUD();
    // speed lines on dash
    const spNorm = Math.min(1, lp.speed / CONFIG.ONI_DASH_SPEED);
    this.speedLines.set(lp.input.dash && spNorm > 0.6 ? (spNorm - 0.6) / 0.4 : 0);
    this.speedLines.draw();

    this.renderer.render(this.scene, this.camera);
  }

  updatePrompts(nearVault, nearGen) {
    const vp = $('vault-prompt');
    if (vp) show(vp, !!nearVault && !this.local.captured);
    const gp = $('gen-prompt');
    if (gp) {
      if (nearGen && !nearGen.gen.done) {
        show(gp, true);
        const pct = Math.floor(nearGen.gen.progress / CONFIG.GEN_REPAIR_TIME * 100);
        gp.textContent = `⚙️ 修理中… ${pct}%（止まって修理）`;
      } else show(gp, false);
    }
  }

  updateAudio(dt, lp) {
    const oni = this.getOni();
    // terror radius: based on distance to oni (for hiders) or chase proximity (for oni)
    let terror = 0, chase = 0;
    if (oni && !oni.frozen) {
      if (this.isHider(lp) && !lp.captured && !lp.escaped) {
        const d = Math.hypot(oni.x - lp.x, oni.z - lp.z);
        if (d < CONFIG.TERROR_RADIUS) {
          terror = 1 - clamp((d - CONFIG.TERROR_NEAR) / (CONFIG.TERROR_RADIUS - CONFIG.TERROR_NEAR), 0, 1);
        }
        if (d < CONFIG.CHASE_DIST && this.map.hasLOS(lp.x, lp.z, oni.x, oni.z)) chase = clamp(1 - d / CONFIG.CHASE_DIST, 0, 1);
      } else if (lp.role === ROLES.ONI) {
        // oni hears heartbeat when near any runner
        let nearest = Infinity;
        for (const r of this.aliveRunners()) nearest = Math.min(nearest, Math.hypot(r.x - lp.x, r.z - lp.z));
        if (nearest < CONFIG.TERROR_RADIUS) {
          terror = 1 - clamp((nearest - CONFIG.TERROR_NEAR) / (CONFIG.TERROR_RADIUS - CONFIG.TERROR_NEAR), 0, 1);
          if (nearest < CONFIG.CHASE_DIST) chase = clamp(1 - nearest / CONFIG.CHASE_DIST, 0, 1);
        }
      }
    }
    if (this._endgame) terror = Math.max(terror, 0.3);
    this._terror = lerp(this._terror, terror, Math.min(1, dt * 4));
    this._chaseLevel = lerp(this._chaseLevel, chase, Math.min(1, dt * 3));
    try { Audio.setHeartbeat(this._terror); Audio.setChaseLevel(this._chaseLevel); } catch (e) {}

    // footsteps synced to gait
    const spNorm = Math.min(1, lp.speed / CONFIG.ONI_DASH_SPEED);
    if (spNorm > 0.08 && !lp.captured && !lp.frozen && lp.vaultT <= 0) {
      this._stepT -= dt;
      const interval = lerp(0.5, 0.22, spNorm) * (lp.crouch ? 1.8 : 1);
      if (this._stepT <= 0) {
        this._stepT = interval;
        this.sfx('Footstep', spNorm, lp.role === ROLES.ONI);
        if (lp.input.dash) this.particles.dashDust(lp.x, lp.z, lp.yaw);
      }
    }
  }

  renderCamera(dt, lp, inSmoke) {
    const isOniLocal = lp.role === ROLES.ONI;
    let eyeH = isOniLocal ? 1.78 : 1.55;
    if (lp.crouch) eyeH -= 0.55;
    const spNorm = Math.min(1, lp.speed / CONFIG.ONI_DASH_SPEED);
    this._bobT += dt * (5 + spNorm * 9) * (spNorm > 0.03 ? 1 : 0);
    const bobY = Math.abs(Math.sin(this._bobT)) * 0.055 * spNorm;
    const bobX = Math.sin(this._bobT * 0.5) * 0.03 * spNorm;
    const fSin = Math.sin(this.camYaw), fCos = Math.cos(this.camYaw);

    // screen shake
    const sh = this.shake.update(dt);

    this.camera.position.set(
      lp.x + (-fCos) * bobX + sh.x,
      eyeH + bobY + sh.y,
      lp.z + (fSin) * bobX
    );
    const cp = Math.cos(this.camPitch);
    this.camera.up.set(Math.sin(sh.roll), Math.cos(sh.roll), 0);
    this.camera.lookAt(
      lp.x + fSin * cp,
      eyeH + bobY - Math.sin(this.camPitch),
      lp.z + fCos * cp
    );
    // dash FOV kick
    const targetFov = 75 + spNorm * (lp.input.dash ? 9 : 4) + (lp.lungeT > 0 ? 6 : 0);
    this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 6));
    this.camera.updateProjectionMatrix();

    // fog thickens in smoke
    const targetFogNear = inSmoke ? 2 : 30;
    this.scene.fog.near = lerp(this.scene.fog.near, targetFogNear, Math.min(1, dt * 4));

    // animate FP arms
    if (this.fpArms) {
      const a = this.fpArms.userData.anim;
      a.speed = spNorm;
      animateFPArms(this.fpArms, a, dt);
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    try { Audio.stopGameAudio(); } catch (e) {}
    if (this.particles) this.particles.dispose();
    if (this.speedLines) this.speedLines.dispose();
    if (this.fpArms && this.camera) this.camera.remove(this.fpArms);
    this.renderer.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
