// ===== Game Modes System =====
// Multiple game modes with different objectives and mechanics
import { CONFIG, ROLES } from './config.js';

export const GAME_MODES = {
  CLASSIC: 'classic',
  ESCAPE: 'escape',
  SURVIVAL: 'survival',
  TEAM_DEATHMATCH: 'team_deathmatch',
  KING_OF_THE_HILL: 'king_of_the_hill',
  INFECTED: 'infected',
};

export const MODE_INFO = {
  classic: {
    name: '古典モード',
    icon: '👹',
    desc: '元祖鬼ごっこ。制限時間内に全員を捕まえるか、生き残るか。',
    duration: 300,
    players: 5,
    roles: ['oni', 'runner', 'runner', 'runner', 'traitor'],
  },
  escape: {
    name: '脱獄モード',
    icon: '🔓',
    desc: '鍵を集めて脱獄ゲートから脱出。鬼は逃げを全員捕まえるか、ゲートを封鎖する。',
    duration: 360,
    players: 5,
    roles: ['oni', 'runner', 'runner', 'runner', 'traitor'],
    features: ['keys', 'escape_gate', 'lockdown'],
  },
  survival: {
    name: 'サバイバルモード',
    icon: '⚔️',
    desc: '時間経過でエリアが狭まる。最後に生き残った者が勝利。',
    duration: 420,
    players: 6,
    roles: ['oni', 'runner', 'runner', 'runner', 'runner', 'runner'],
    features: ['shrinking_zone', 'damage_zone', 'last_man_standing'],
  },
  team_deathmatch: {
    name: 'チーム戦',
    icon: '⚔️⚔️',
    desc: 'ランナーチーム vs 鬼チーム。一定時間内に相手チームを全滅させろ。',
    duration: 300,
    players: 6,
    roles: ['oni', 'oni', 'oni', 'runner', 'runner', 'runner'],
    features: ['team_scoring', 'respawn_waves', 'team_abilities'],
  },
  king_of_the_hill: {
    name: '王様は誰だ',
    icon: '👑',
    desc: 'マップ中央の王座を占領する。最も長く座っていた者が勝利。',
    duration: 300,
    players: 5,
    roles: ['oni', 'runner', 'runner', 'runner', 'runner'],
    features: ['throne', 'control_point', 'occupancy_timer'],
  },
  infected: {
    name: 'インフェクテッド',
    icon: '🧟',
    desc: '1人の鬼から始まる。捕まると鬼に変身。最後のランナーが勝利。',
    duration: 300,
    players: 5,
    roles: ['oni', 'runner', 'runner', 'runner', 'runner'],
    features: ['infection_spread', 'last_survivor_wins', 'progressive_difficulty'],
  },
};

export class GameMode {
  constructor(modeId, game) {
    this.modeId = modeId;
    this.game = game;
    this.info = MODE_INFO[modeId];
    this.state = {};
    this._initMode();
  }

  _initMode() {
    switch (this.modeId) {
      case GAME_MODES.ESCAPE:
        this._initEscapeMode();
        break;
      case GAME_MODES.SURVIVAL:
        this._initSurvivalMode();
        break;
      case GAME_MODES.TEAM_DEATHMATCH:
        this._initTeamDeathmatchMode();
        break;
      case GAME_MODES.KING_OF_THE_HILL:
        this._initKingOfTheHillMode();
        break;
      case GAME_MODES.INFECTED:
        this._initInfectedMode();
        break;
      default:
        this._initClassicMode();
    }
  }

  // ===== CLASSIC MODE =====
  _initClassicMode() {
    this.state = {
      type: 'classic',
      objectives: ['Capture all runners', 'Survive until time runs out'],
    };
  }

  // ===== ESCAPE MODE (脱獄モード) =====
  _initEscapeMode() {
    this.state = {
      type: 'escape',
      keysRequired: 3,
      keysCollected: 0,
      keys: [],
      escapeGateOpen: false,
      escapedPlayers: [],
      lockdownActive: false,
      lockdownDuration: 0,
    };

    // Spawn keys at random locations
    for (let i = 0; i < this.state.keysRequired; i++) {
      const pos = this.game.map.randomWalkable();
      this.state.keys.push({
        id: `key_${i}`,
        x: pos.x, z: pos.z,
        collected: false,
        mesh: this._createKeyMesh(pos.x, pos.z)
      });
      this.game.scene.add(this.state.keys[i].mesh);
    }

    // Create escape gate
    this.state.escapeGate = {
      x: 30, z: 30,
      mesh: this._createEscapeGateMesh(30, 30)
    };
    this.game.scene.add(this.state.escapeGate.mesh);
  }

  _createKeyMesh(x, z) {
    const group = new THREE.Group();
    const keyGeom = new THREE.BoxGeometry(0.3, 0.6, 0.1);
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5
    });
    const key = new THREE.Mesh(keyGeom, keyMat);
    key.position.y = 0.8;
    key.castShadow = true;
    group.add(key);

    // Rotating effect
    group.userData.spin = 0;
    group.position.set(x, 0, z);
    return group;
  }

  _createEscapeGateMesh(x, z) {
    const group = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.5, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        metalness: 0.3
      })
    );
    frame.position.y = 1.25;
    frame.castShadow = true;
    group.add(frame);

    // Gate bars
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2.5, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0x666666,
          metalness: 0.6
        })
      );
      bar.position.set(-1.2 + i * 0.6, 1.25, 0);
      bar.castShadow = true;
      group.add(bar);
    }

    // Portal effect
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.3),
      new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: 0x00aa44,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      })
    );
    portal.position.set(0, 1.25, 0.15);
    group.add(portal);
    group.userData.portal = portal;

    group.position.set(x, 0, z);
    return group;
  }

  updateEscapeMode(dt) {
    // Update key rotation
    this.state.keys.forEach(key => {
      if (!key.collected && key.mesh) {
        key.mesh.userData.spin += dt * 2;
        key.mesh.rotation.y = key.mesh.userData.spin;
      }
    });

    // Check key collection
    this.game.players.forEach(p => {
      this.state.keys.forEach(key => {
        if (!key.collected && Math.hypot(p.x - key.x, p.z - key.z) < 1.5) {
          key.collected = true;
          this.state.keysCollected++;
          if (key.mesh) this.game.scene.remove(key.mesh);
          this.game.announce(p, '🔑 鍵を獲得！');
          
          if (this.state.keysCollected >= this.state.keysRequired) {
            this.state.escapeGateOpen = true;
            this.game.announce(null, '🔓 脱獄ゲートが開きました！');
          }
        }
      });
    });

    // Check escape
    if (this.state.escapeGateOpen) {
      this.game.players.forEach(p => {
        if (!p.captured && !p.escaped &&
            Math.hypot(p.x - this.state.escapeGate.x, p.z - this.state.escapeGate.z) < 3) {
          p.escaped = true;
          this.state.escapedPlayers.push(p.id);
          this.game.announce(p, '✈️ 脱獄成功！');
        }
      });
    }
  }

  // ===== SURVIVAL MODE (サバイバルモード) =====
  _initSurvivalMode() {
    this.state = {
      type: 'survival',
      zoneRadius: 35,
      zoneCenter: { x: 0, z: 0 },
      shrinkSpeed: 0.5,  // radius per second
      damagePerSecond: 5,
      lastManStanding: null,
    };
  }

  updateSurvivalMode(dt) {
    // Shrink zone
    this.state.zoneRadius = Math.max(5, this.state.zoneRadius - this.state.shrinkSpeed * dt);

    // Damage players outside zone
    this.game.players.forEach(p => {
      const dist = Math.hypot(p.x - this.state.zoneCenter.x, p.z - this.state.zoneCenter.z);
      if (dist > this.state.zoneRadius && !p.captured) {
        p.health = Math.max(0, p.health - this.state.damagePerSecond * dt);
        if (p.health <= 0) {
          p.captured = true;
          this.game.announce(p, '💀 ゾーン外で消滅！');
        }
      }
    });

    // Check last man standing
    const alive = this.game.players.filter(p => !p.captured && !p.escaped);
    if (alive.length === 1) {
      this.state.lastManStanding = alive[0].id;
    }
  }

  // ===== TEAM DEATHMATCH MODE =====
  _initTeamDeathmatchMode() {
    this.state = {
      type: 'team_deathmatch',
      oniTeamScore: 0,
      runnerTeamScore: 0,
      killsRequired: 10,
      respawnWaves: true,
      waveInterval: 15,
      waveTimer: 0,
    };
  }

  updateTeamDeathmatchMode(dt) {
    this.state.waveTimer += dt;

    if (this.state.respawnWaves && this.state.waveTimer >= this.state.waveInterval) {
      // Respawn dead players
      this.game.players.forEach(p => {
        if (p.captured) {
          p.captured = false;
          const spawn = this.game.map.randomWalkable();
          p.x = spawn.x;
          p.z = spawn.z;
          this.game.announce(p, '🔄 復活！');
        }
      });
      this.state.waveTimer = 0;
    }
  }

  // ===== KING OF THE HILL MODE =====
  _initKingOfTheHillMode() {
    this.state = {
      type: 'king_of_the_hill',
      throne: { x: 0, z: 0, radius: 3 },
      currentKing: null,
      kingTime: 0,
      occupancyScores: {},
    };

    // Create throne mesh
    this.state.throneMesh = this._createThroneMesh();
    this.game.scene.add(this.state.throneMesh);
  }

  _createThroneMesh() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.8 })
    );
    base.position.y = 0.25;
    group.add(base);

    const throne = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2.5, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.6, roughness: 0.3 })
    );
    throne.position.y = 1.5;
    throne.castShadow = true;
    group.add(throne);

    group.position.set(0, 0, 0);
    return group;
  }

  updateKingOfTheHillMode(dt) {
    // Check who's on the throne
    let onThrone = null;
    this.game.players.forEach(p => {
      const dist = Math.hypot(p.x - this.state.throne.x, p.z - this.state.throne.z);
      if (dist < this.state.throne.radius && !p.captured) {
        onThrone = p.id;
      }
    });

    if (onThrone) {
      this.state.currentKing = onThrone;
      this.state.kingTime += dt;
      if (!this.state.occupancyScores[onThrone]) {
        this.state.occupancyScores[onThrone] = 0;
      }
      this.state.occupancyScores[onThrone] += dt * 10;  // Points per second
    }
  }

  // ===== INFECTED MODE =====
  _initInfectedMode() {
    this.state = {
      type: 'infected',
      infectedCount: 1,
      spreadRadius: 2,
      lastSurvivor: null,
    };
  }

  updateInfectedMode(dt) {
    // Check for new infections
    const oni = this.game.getOni();
    if (oni && !oni.captured) {
      this.game.players.forEach(p => {
        if (p.role !== ROLES.ONI && !p.captured &&
            Math.hypot(p.x - oni.x, p.z - oni.z) < this.state.spreadRadius) {
          // Infect this player
          p.role = ROLES.ONI;
          this.state.infectedCount++;
          this.game.announce(p, '🧟 感染した！');
        }
      });
    }

    // Check last survivor
    const survivors = this.game.players.filter(p => p.role !== ROLES.ONI && !p.captured);
    if (survivors.length === 1) {
      this.state.lastSurvivor = survivors[0].id;
    }
  }

  // ===== Generic Update =====
  update(dt) {
    switch (this.modeId) {
      case GAME_MODES.ESCAPE:
        this.updateEscapeMode(dt);
        break;
      case GAME_MODES.SURVIVAL:
        this.updateSurvivalMode(dt);
        break;
      case GAME_MODES.TEAM_DEATHMATCH:
        this.updateTeamDeathmatchMode(dt);
        break;
      case GAME_MODES.KING_OF_THE_HILL:
        this.updateKingOfTheHillMode(dt);
        break;
      case GAME_MODES.INFECTED:
        this.updateInfectedMode(dt);
        break;
    }
  }

  // ===== Mode-specific Win Conditions =====
  checkWinConditions() {
    switch (this.modeId) {
      case GAME_MODES.ESCAPE:
        return this._checkEscapeWin();
      case GAME_MODES.SURVIVAL:
        return this._checkSurvivalWin();
      case GAME_MODES.TEAM_DEATHMATCH:
        return this._checkTeamDeathmatchWin();
      case GAME_MODES.KING_OF_THE_HILL:
        return this._checkKingWin();
      case GAME_MODES.INFECTED:
        return this._checkInfectedWin();
      default:
        return null;
    }
  }

  _checkEscapeWin() {
    const allCaptured = this.game.players.every(p => p.captured || p.escaped);
    if (allCaptured) {
      return this.state.escapedPlayers.length > 0 ? 'runners' : 'oni';
    }
    return null;
  }

  _checkSurvivalWin() {
    if (this.state.lastManStanding) {
      return { winner: this.state.lastManStanding, type: 'last_survivor' };
    }
    return null;
  }

  _checkTeamDeathmatchWin() {
    if (this.state.oniTeamScore >= this.state.killsRequired) return 'oni';
    if (this.state.runnerTeamScore >= this.state.killsRequired) return 'runners';
    return null;
  }

  _checkKingWin() {
    if (this.state.kingTime > 60) {  // 60 seconds on throne
      return { winner: this.state.currentKing, type: 'king_of_the_hill' };
    }
    return null;
  }

  _checkInfectedWin() {
    const survivors = this.game.players.filter(p => p.role !== ROLES.ONI && !p.captured);
    if (survivors.length === 0) return 'infected';
    if (this.state.lastSurvivor) return { winner: this.state.lastSurvivor, type: 'last_survivor' };
    return null;
  }
}

// Import THREE for mesh creation
import * as THREE from 'three';
