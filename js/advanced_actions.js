// ===== Advanced Action System =====
// Sliding, wall kicks, parkour mechanics for stylish movement
import { CONFIG, ROLES } from './config.js';
import { dist2 } from './utils.js';

export class AdvancedActions {
  constructor(game) {
    this.game = game;
  }

  // ===== Sliding Mechanic =====
  // Quickly crouch and slide forward for evasion
  initiateSlide(player) {
    if (player.role === ROLES.ONI) return false;  // Runners only
    if (player.slideT && player.slideT > 0) return false;  // Already sliding
    if (player.stamina < CONFIG.SLIDE_STAMINA_COST) return false;

    player.slideT = CONFIG.SLIDE_DURATION;
    player.stamina -= CONFIG.SLIDE_STAMINA_COST;
    player.slideVelMult = CONFIG.SLIDE_SPEED_MULT;
    player.crouch = true;

    // Particle effect
    this.game.particles.emit({
      x: player.x, z: player.z, y: 0.3,
      count: 12, color: 0x88ccff, speed: 2, life: 0.4, size: 0.25
    });

    this.game.sfx('Slide');
    return true;
  }

  // ===== Wall Kick Mechanic =====
  // Jump off walls to reach high areas or change direction
  attemptWallKick(player, map) {
    if (player.role === ROLES.ONI) return false;
    if (player.wallKickCD > 0) return false;
    if (Math.abs(player.vx) < 2 && Math.abs(player.vz) < 2) return false;  // Must be moving

    // Check for nearby walls
    const checkRadius = 1.2;
    const nearby = this._findNearbyWalls(player.x, player.z, checkRadius, map);
    if (nearby.length === 0) return false;

    const wall = nearby[0];
    const normalX = Math.cos(wall.angle);
    const normalZ = Math.sin(wall.angle);

    // Boost player away from wall
    player.vx = normalX * CONFIG.WALL_KICK_SPEED;
    player.vz = normalZ * CONFIG.WALL_KICK_SPEED;
    player.wallKickCD = CONFIG.WALL_KICK_COOLDOWN;

    // Particle effect
    this.game.particles.emit({
      x: player.x + normalX * 0.8, z: player.z + normalZ * 0.8, y: 0.5,
      count: 16, color: 0xff9900, speed: 3, life: 0.5, size: 0.3
    });

    this.game.sfx('WallKick');
    return true;
  }

  _findNearbyWalls(x, z, radius, map) {
    const walls = [];
    // Check map boundaries and structures
    if (x - radius < -32) walls.push({ angle: 0, x: -32, z });
    if (x + radius > 32) walls.push({ angle: Math.PI, x: 32, z });
    if (z - radius < -32) walls.push({ angle: -Math.PI / 2, x, z: -32 });
    if (z + radius > 32) walls.push({ angle: Math.PI / 2, x, z: 32 });
    return walls;
  }

  // ===== Ledge Grab Mechanic =====
  // Grab ledges to pull up to higher platforms
  attemptLedgeGrab(player, map) {
    if (player.role === ROLES.ONI) return false;
    if (player.ledgeGrabT > 0) return false;

    // Check for ledges above
    const checkHeight = 1.5;
    const checkRadius = 0.8;
    
    // Simplified ledge detection
    const ledges = this._findNearbyLedges(player.x, player.z, checkHeight, checkRadius, map);
    if (ledges.length === 0) return false;

    const ledge = ledges[0];
    player.ledgeGrabT = CONFIG.LEDGE_GRAB_DURATION;
    player.y = ledge.y - 0.3;  // Hang from ledge
    player.vx = 0;
    player.vz = 0;

    this.game.particles.emit({
      x: player.x, z: player.z, y: player.y + 0.5,
      count: 8, color: 0xcccccc, speed: 1, life: 0.3, size: 0.2
    });

    this.game.sfx('LedgeGrab');
    return true;
  }

  _findNearbyLedges(x, z, height, radius, map) {
    // Placeholder: return empty for now
    // In full implementation, would check map geometry
    return [];
  }

  // ===== Vault Boost Mechanic =====
  // Enhanced vault with momentum preservation
  enhancedVault(player, vaultData) {
    if (!vaultData) return;

    const vaultDir = vaultData.dir;
    const boostFactor = player.role === ROLES.ONI ? 0.8 : 1.3;

    player.vx = Math.sin(vaultDir) * CONFIG.VAULT_BOOST_SPEED * boostFactor;
    player.vz = Math.cos(vaultDir) * CONFIG.VAULT_BOOST_SPEED * boostFactor;

    // Particle trail
    this.game.particles.emit({
      x: player.x, z: player.z, y: 0.8,
      count: 14, color: 0x44ff88, speed: 2.5, life: 0.5, size: 0.28
    });
  }

  // ===== Dodge Roll Mechanic =====
  // Quick evasive maneuver to avoid attacks
  attemptDodgeRoll(player, direction) {
    if (player.role === ROLES.ONI) return false;
    if (player.dodgeRollCD > 0) return false;
    if (player.stamina < CONFIG.DODGE_ROLL_STAMINA) return false;

    player.dodgeRollT = CONFIG.DODGE_ROLL_DURATION;
    player.dodgeRollDir = direction;
    player.stamina -= CONFIG.DODGE_ROLL_STAMINA;
    player.dodgeRollCD = CONFIG.DODGE_ROLL_COOLDOWN;

    // Invulnerability frames
    player.invulnT = CONFIG.DODGE_ROLL_INVULN;

    // Particle effect
    this.game.particles.emit({
      x: player.x, z: player.z, y: 0.4,
      count: 20, color: 0x00ffff, speed: 3, life: 0.6, size: 0.32
    });

    this.game.sfx('DodgeRoll');
    return true;
  }

  // ===== Update Loop =====
  update(player, dt) {
    // Update cooldowns
    if (player.wallKickCD > 0) player.wallKickCD -= dt;
    if (player.ledgeGrabT > 0) player.ledgeGrabT -= dt;
    if (player.dodgeRollCD > 0) player.dodgeRollCD -= dt;
    if (player.dodgeRollT > 0) player.dodgeRollT -= dt;
    if (player.slideT > 0) player.slideT -= dt;
    if (player.invulnT > 0) player.invulnT -= dt;

    // Apply slide velocity multiplier
    if (player.slideT > 0) {
      player.slideVelMult = Math.max(0.5, player.slideVelMult - dt * 2);
    }

    // Apply dodge roll movement
    if (player.dodgeRollT > 0) {
      const rollSpeed = CONFIG.DODGE_ROLL_SPEED;
      player.vx = Math.sin(player.dodgeRollDir) * rollSpeed;
      player.vz = Math.cos(player.dodgeRollDir) * rollSpeed;
    }
  }
}

// Configuration constants
export const ADVANCED_ACTION_CONFIG = {
  // Sliding
  SLIDE_DURATION: 0.6,
  SLIDE_STAMINA_COST: 20,
  SLIDE_SPEED_MULT: 1.8,

  // Wall Kick
  WALL_KICK_SPEED: 8.5,
  WALL_KICK_COOLDOWN: 1.5,

  // Ledge Grab
  LEDGE_GRAB_DURATION: 1.0,

  // Vault Boost
  VAULT_BOOST_SPEED: 6.5,

  // Dodge Roll
  DODGE_ROLL_DURATION: 0.5,
  DODGE_ROLL_SPEED: 9.0,
  DODGE_ROLL_STAMINA: 25,
  DODGE_ROLL_COOLDOWN: 2.0,
  DODGE_ROLL_INVULN: 0.4,
};
