// ===== Enhanced Map System with Dynamic Elements =====
// Adds: hiding spots, interactive objects, elevation changes, destructible elements
import * as THREE from 'three';
import { CELL, GRID_W, GRID_H, WORLD_W, WORLD_H, cellToWorld, worldToCell } from './map.js';

export class MapEnhancements {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.hidingSpots = [];      // bushes, tall grass areas
    this.gimmicks = [];          // interactive objects (levers, switches)
    this.destructibles = [];     // breakable crates, walls
    this.elevationMap = [];      // height variations
    this._buildEnhancements();
  }

  _buildEnhancements() {
    this._createHidingSpots();
    this._createGimmicks();
    this._createDestructibles();
    this._createElevationVariations();
  }

  // ===== Hiding Spots =====
  // Dense grass/bush areas that reduce visibility and provide stealth advantage
  _createHidingSpots() {
    const spots = [
      { x: -20, z: -15, w: 8, h: 6, density: 0.8 },   // NW corner
      { x: 15, z: -18, w: 7, h: 5, density: 0.75 },   // NE corner
      { x: -18, z: 18, w: 6, h: 8, density: 0.8 },    // SW corner
      { x: 18, z: 20, w: 8, h: 6, density: 0.75 },    // SE corner
      { x: -5, z: 0, w: 4, h: 4, density: 0.6 },      // Center-left
      { x: 8, z: 5, w: 5, h: 3, density: 0.65 },      // Center-right
    ];

    spots.forEach(spot => {
      const grassGroup = new THREE.Group();
      grassGroup.position.set(spot.x, 0, spot.z);

      // Create multiple grass tufts
      for (let i = 0; i < Math.floor(spot.w * spot.h * spot.density); i++) {
        const grass = this._createGrassTuft();
        grass.position.set(
          Math.random() * spot.w - spot.w / 2,
          0,
          Math.random() * spot.h - spot.h / 2
        );
        grassGroup.add(grass);
      }

      this.scene.add(grassGroup);
      this.hidingSpots.push({
        x: spot.x, z: spot.z, w: spot.w, h: spot.h,
        density: spot.density, mesh: grassGroup
      });
    });
  }

  _createGrassTuft() {
    const group = new THREE.Group();
    const blades = 6;
    for (let i = 0; i < blades; i++) {
      const angle = (i / blades) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.6),
        new THREE.MeshStandardMaterial({
          color: 0x2d5016,
          emissive: 0x1a2d0a,
          roughness: 0.8,
          side: THREE.DoubleSide
        })
      );
      blade.rotation.z = angle;
      blade.position.y = 0.3;
      blade.castShadow = true;
      group.add(blade);
    }
    return group;
  }

  // ===== Gimmicks (Interactive Objects) =====
  // Levers, switches, pressure plates that affect gameplay
  _createGimmicks() {
    const gimmickPositions = [
      { x: -12, z: -12, type: 'lever' },      // NW building
      { x: 12, z: -10, type: 'switch' },      // NE building
      { x: -10, z: 12, type: 'pressure' },    // SW building
      { x: 14, z: 14, type: 'lever' },        // SE building
      { x: 0, z: 0, type: 'switch' },         // Center
    ];

    gimmickPositions.forEach(pos => {
      const gimmick = this._createGimmickObject(pos.type);
      gimmick.position.set(pos.x, 0, pos.z);
      this.scene.add(gimmick);
      this.gimmicks.push({
        x: pos.x, z: pos.z, type: pos.type,
        active: false, mesh: gimmick
      });
    });
  }

  _createGimmickObject(type) {
    const group = new THREE.Group();

    if (type === 'lever') {
      // Base
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 })
      );
      base.position.y = 0.05;
      group.add(base);

      // Lever arm
      const lever = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.5, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 })
      );
      lever.position.y = 0.35;
      lever.rotation.z = -0.3;
      lever.castShadow = true;
      group.add(lever);
      group.userData.lever = lever;
    } else if (type === 'switch') {
      // Base
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.6, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
      );
      base.position.y = 0.3;
      group.add(base);

      // Button
      const button = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x990000 })
      );
      button.position.set(0, 0.65, 0);
      button.castShadow = true;
      group.add(button);
      group.userData.button = button;
    } else if (type === 'pressure') {
      // Pressure plate
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.05, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6 })
      );
      plate.position.y = 0.02;
      plate.castShadow = true;
      group.add(plate);

      // Indicator lights
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const light = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00aa00 })
          );
          light.position.set(sx * 0.25, 0.08, sz * 0.25);
          group.add(light);
        }
      }
    }

    return group;
  }

  // ===== Destructible Objects =====
  // Breakable crates, walls that can be destroyed for shortcuts
  _createDestructibles() {
    const destructiblePositions = [
      { x: -8, z: 8, type: 'crate' },
      { x: 8, z: -8, type: 'crate' },
      { x: 12, z: 12, type: 'wall' },
      { x: -15, z: 5, type: 'crate' },
      { x: 5, z: -15, type: 'wall' },
    ];

    destructiblePositions.forEach(pos => {
      const destructible = this._createDestructibleObject(pos.type);
      destructible.position.set(pos.x, 0, pos.z);
      this.scene.add(destructible);
      this.destructibles.push({
        x: pos.x, z: pos.z, type: pos.type,
        hp: 100, maxHp: 100, mesh: destructible
      });
    });
  }

  _createDestructibleObject(type) {
    const group = new THREE.Group();

    if (type === 'crate') {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0x8b6f47,
          roughness: 0.9,
          map: this._createWoodTexture()
        })
      );
      crate.position.y = 0.4;
      crate.castShadow = true;
      group.add(crate);

      // Cracks (visual damage indicator)
      const cracks = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.82, 0.82),
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0,
          wireframe: false
        })
      );
      cracks.position.y = 0.4;
      group.add(cracks);
      group.userData.cracks = cracks;
    } else if (type === 'wall') {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.2, 0.3),
        new THREE.MeshStandardMaterial({
          color: 0x696969,
          roughness: 0.8
        })
      );
      wall.position.y = 0.6;
      wall.castShadow = true;
      group.add(wall);
    }

    return group;
  }

  _createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8b6f47';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = '#6b4f27';
      ctx.lineWidth = Math.random() * 2 + 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 128, 0);
      ctx.lineTo(Math.random() * 128, 128);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }

  // ===== Elevation Variations =====
  // Hills, valleys, platforms for dynamic movement
  _createElevationVariations() {
    const elevations = [
      { x: -15, z: -15, r: 6, h: 1.2 },   // NW hill
      { x: 15, z: -15, r: 5, h: 0.8 },    // NE hill
      { x: -15, z: 15, r: 5, h: 0.9 },    // SW hill
      { x: 15, z: 15, r: 6, h: 1.1 },     // SE hill
    ];

    elevations.forEach(elev => {
      const hill = this._createTerrainMound(elev.x, elev.z, elev.r, elev.h);
      this.scene.add(hill);
      this.elevationMap.push(elev);
    });
  }

  _createTerrainMound(x, z, radius, height) {
    const geometry = new THREE.IcosahedronGeometry(radius, 4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a6741,
      roughness: 0.8
    });
    const mound = new THREE.Mesh(geometry, material);
    mound.position.set(x, height * 0.5, z);
    mound.scale.y = height / radius;
    mound.castShadow = true;
    mound.receiveShadow = true;
    return mound;
  }

  // ===== Helper Methods =====
  isInHidingSpot(x, z) {
    return this.hidingSpots.some(spot => {
      const dx = x - spot.x;
      const dz = z - spot.z;
      return Math.abs(dx) <= spot.w / 2 && Math.abs(dz) <= spot.h / 2;
    });
  }

  getElevationAt(x, z) {
    for (const elev of this.elevationMap) {
      const dist = Math.hypot(x - elev.x, z - elev.z);
      if (dist < elev.r) {
        const factor = 1 - (dist / elev.r);
        return elev.h * factor * factor;
      }
    }
    return 0;
  }

  damageDestructible(index, damage) {
    if (index >= 0 && index < this.destructibles.length) {
      const destructible = this.destructibles[index];
      destructible.hp = Math.max(0, destructible.hp - damage);
      
      // Update visual damage
      if (destructible.type === 'crate' && destructible.mesh.userData.cracks) {
        const damageRatio = 1 - (destructible.hp / destructible.maxHp);
        destructible.mesh.userData.cracks.material.opacity = damageRatio * 0.5;
      }

      return destructible.hp <= 0;
    }
    return false;
  }

  activateGimmick(index) {
    if (index >= 0 && index < this.gimmicks.length) {
      const gimmick = this.gimmicks[index];
      gimmick.active = !gimmick.active;

      // Animate gimmick
      if (gimmick.type === 'lever' && gimmick.mesh.userData.lever) {
        gimmick.mesh.userData.lever.rotation.z = gimmick.active ? 0.3 : -0.3;
      } else if (gimmick.type === 'switch' && gimmick.mesh.userData.button) {
        gimmick.mesh.userData.button.material.color.setHex(gimmick.active ? 0x33ff33 : 0xff3333);
      }

      return gimmick.active;
    }
    return false;
  }
}
