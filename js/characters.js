// ===== Procedural animated 3D characters (v2: textured, detailed) =====
// Two character types: RUNNER (逃げ) and ONI (人狼/鬼)
// Articulated limbs with knee/elbow joints, run / idle / attack / vault anims.
// Plus first-person arm rigs for immersion.
import * as THREE from 'three';
import { furTexture, clothTexture, denimTexture } from './textures.js';

const MAT_CACHE = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(Object.keys(opts).map(k => k + ':' + String(opts[k] && opts[k].uuid ? opts[k].uuid : opts[k])));
  if (!MAT_CACHE[key]) {
    MAT_CACHE[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });
  }
  return MAT_CACHE[key];
}

let _furTex = null, _denimTex = null;
function furTex() { return _furTex || (_furTex = furTexture()); }
function denimTex() { return _denimTex || (_denimTex = denimTexture()); }
const _clothCache = {};
function clothTex(color) {
  if (!_clothCache[color]) {
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    _clothCache[color] = clothTexture([r, g, b]);
  }
  return _clothCache[color];
}

// ---------- RUNNER (逃げキャラ): hoodie survivor ----------
export function createRunnerModel(bodyColor = 0x4da6ff) {
  const g = new THREE.Group();
  const parts = {};
  const hoodieMat = new THREE.MeshStandardMaterial({ map: clothTex(bodyColor), roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ map: denimTex(), roughness: 0.9 });
  const skinMat = mat(0xffe0bd, { roughness: 0.6 });

  // Torso (hoodie)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.35, 6, 12), hoodieMat);
  torso.position.y = 0.85;
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Hoodie pocket
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hoodieMat);
  pocket.position.set(0, -0.12, 0.26);
  torso.add(pocket);
  // Zipper line
  const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.42, 0.02), mat(0xcccccc, { metalness: 0.7, roughness: 0.3 }));
  zipper.position.set(0, 0.04, 0.285);
  torso.add(zipper);
  // Hood (behind neck)
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodieMat);
  hood.position.set(0, 0.3, -0.18);
  hood.rotation.x = 0.7;
  torso.add(hood);
  // Drawstrings
  for (const sx of [-1, 1]) {
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), mat(0xeeeeee));
    str.position.set(0.07 * sx, 0.22, 0.27);
    str.rotation.x = 0.2;
    torso.add(str);
  }

  // Head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.42;
  torso.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), skinMat);
  head.position.y = 0.2;
  head.castShadow = true;
  headPivot.add(head);
  parts.head = headPivot;

  // Hair (cap-ish)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.275, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x42342a, { roughness: 0.9 }));
  hair.position.y = 0.06;
  head.add(hair);
  // Bangs
  const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.1), mat(0x42342a, { roughness: 0.9 }));
  bangs.position.set(0, 0.13, 0.2);
  bangs.rotation.x = 0.4;
  head.add(bangs);
  // Eyes (white + pupil)
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), mat(0xffffff, { roughness: 0.25 }));
    white.position.set(0.09 * sx, 0.02, 0.225);
    white.scale.z = 0.5;
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), mat(0x2a1d12, { roughness: 0.2 }));
    pupil.position.set(0.09 * sx, 0.02, 0.255);
    head.add(pupil);
  }
  // Mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.02), mat(0xa05a4a));
  mouth.position.set(0, -0.1, 0.24);
  head.add(mouth);

  // Backpack with details
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), mat(0xd9534f, { roughness: 0.8 }));
  pack.position.set(0, 0.04, -0.28);
  pack.castShadow = true;
  torso.add(pack);
  const packTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), mat(0xb74440, { roughness: 0.8 }));
  packTop.rotation.z = Math.PI / 2;
  packTop.position.set(0, 0.22, -0.28);
  torso.add(packTop);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.04), mat(0x88332f));
    strap.position.set(0.13 * sx, 0.08, 0.1);
    strap.rotation.x = -0.12;
    torso.add(strap);
  }

  // Arms with elbow joint
  function makeArm(side) {
    const pivot = new THREE.Group(); // shoulder
    pivot.position.set(0.31 * side, 0.26, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), hoodieMat);
    upper.position.y = -0.14;
    upper.castShadow = true;
    pivot.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.27;
    pivot.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.17, 4, 8), hoodieMat);
    fore.position.y = -0.11;
    fore.castShadow = true;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skinMat);
    hand.position.y = -0.23;
    elbow.add(hand);
    torso.add(pivot);
    return { pivot, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  parts.armL = armL.pivot; parts.armR = armR.pivot;
  parts.elbowL = armL.elbow; parts.elbowR = armR.elbow;

  // Legs with knee joint
  function makeLeg(side) {
    const pivot = new THREE.Group(); // hip
    pivot.position.set(0.13 * side, 0.62, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.18, 4, 8), pantsMat);
    thigh.position.y = -0.13;
    thigh.castShadow = true;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.26;
    pivot.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), pantsMat);
    shin.position.y = -0.1;
    shin.castShadow = true;
    knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), mat(0xf5f5f5, { roughness: 0.5 }));
    shoe.position.set(0, -0.22, 0.05);
    knee.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.27), mat(0x333333));
    sole.position.set(0, -0.27, 0.05);
    knee.add(sole);
    g.add(pivot);
    return { pivot, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  parts.legL = legL.pivot; parts.legR = legR.pivot;
  parts.kneeL = legL.knee; parts.kneeR = legR.knee;

  g.userData = { parts, type: 'runner', baseY: { torso: 0.85 } };
  return g;
}

// ---------- ONI (人狼/鬼キャラ): hulking werewolf, fur-textured ----------
export function createOniModel() {
  const g = new THREE.Group();
  const parts = {};
  const furMat = new THREE.MeshStandardMaterial({ map: furTex(), roughness: 0.95 });
  const furDarkMat = mat(0x2c1a24, { roughness: 0.95 });
  const teethMat = mat(0xf5f0e0, { roughness: 0.35 });
  const clawMat = mat(0xe8ddc8, { roughness: 0.3 });

  // Torso: big, hunched
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 8, 14), furMat);
  torso.position.y = 1.05;
  torso.rotation.x = 0.25;
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Chest plate (lighter fur)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(0x8a6a5a, { roughness: 0.9 }));
  chest.scale.set(1.1, 1.25, 0.55);
  chest.position.set(0, 0.05, 0.26);
  torso.add(chest);
  // Scars on chest
  for (let i = 0; i < 3; i++) {
    const scar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), mat(0x5a2a30));
    scar.position.set(-0.08 + i * 0.08, 0.1, 0.45);
    scar.rotation.z = 0.4;
    torso.add(scar);
  }
  // Shoulder fur tufts
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), furDarkMat);
      tuft.position.set((0.42 + i * 0.04) * sx, 0.4 - i * 0.05, (i - 1) * 0.08);
      tuft.rotation.z = -0.8 * sx - i * 0.15 * sx;
      torso.add(tuft);
    }
  }

  // Head: wolf with snout & ears
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.52, 0.12);
  torso.add(headPivot);
  parts.head = headPivot;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), furMat);
  head.scale.set(0.95, 1, 1.05);
  head.position.y = 0.16;
  head.castShadow = true;
  headPivot.add(head);
  // Snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.32), furMat);
  snout.position.set(0, -0.06, 0.3);
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x0a0a0a, { roughness: 0.3 }));
  nose.position.set(0, 0.03, 0.17);
  snout.add(nose);
  // Jaw with teeth
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.28), furDarkMat);
  jaw.position.set(0, -0.14, 0.27);
  parts.jaw = jaw;
  head.add(jaw);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 4), teethMat);
    tooth.position.set(0.045 * i, 0.05, 0.36);
    tooth.rotation.x = Math.PI;
    head.add(tooth);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), teethMat);
    lower.position.set(0.05 * i, 0.05, 0.1);
    jaw.add(lower);
  }
  // Glowing red eyes + brow ridges
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2.4 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(0.12 * sx, 0.06, 0.25);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), furDarkMat);
    brow.position.set(0.12 * sx, 0.13, 0.26);
    brow.rotation.z = -0.3 * sx;
    head.add(brow);
  }
  // Ears (torn left ear for character)
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, sx < 0 ? 0.18 : 0.26, 6), furMat);
    ear.position.set(0.17 * sx, 0.3, -0.02);
    ear.rotation.z = -0.25 * sx;
    head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), mat(0x6a3a48));
    inner.position.set(0.17 * sx, 0.29, 0.015);
    inner.rotation.z = -0.25 * sx;
    head.add(inner);
  }

  // Spiky back fur ridge
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08 - i * 0.008, 0.24 - i * 0.02, 5), furDarkMat);
    spike.position.set((i % 2 ? 0.04 : -0.04), 0.4 - i * 0.16, -0.37);
    spike.rotation.x = -0.95;
    torso.add(spike);
  }

  // Arms: long with claws, elbow joints
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.48 * side, 0.3, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.26, 4, 8), furMat);
    upper.position.y = -0.18;
    upper.castShadow = true;
    pivot.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    pivot.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 4, 8), furMat);
    fore.position.y = -0.15;
    fore.castShadow = true;
    elbow.add(fore);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), furDarkMat);
    paw.position.y = -0.32;
    elbow.add(paw);
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 4), clawMat);
      claw.position.set(c * 0.07, -0.43, 0.05);
      claw.rotation.x = Math.PI - 0.3;
      elbow.add(claw);
    }
    torso.add(pivot);
    return { pivot, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  parts.armL = armL.pivot; parts.armR = armR.pivot;
  parts.elbowL = armL.elbow; parts.elbowR = armR.elbow;

  // Legs: digitigrade with knee
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.2 * side, 0.78, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), furMat);
    thigh.position.y = -0.16;
    thigh.castShadow = true;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.32;
    pivot.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 8), furMat);
    shin.position.y = -0.11;
    shin.castShadow = true;
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), furDarkMat);
    foot.position.set(0, -0.26, 0.07);
    knee.add(foot);
    // toe claws
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), clawMat);
      claw.position.set(c * 0.06, -0.27, 0.27);
      claw.rotation.x = Math.PI / 2 + 0.3;
      knee.add(claw);
    }
    g.add(pivot);
    return { pivot, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  parts.legL = legL.pivot; parts.legR = legR.pivot;
  parts.kneeL = legL.knee; parts.kneeR = legR.knee;

  // Tail (bushy: cone + tip)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.25, -0.4);
  tailGroup.rotation.x = 1.2;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), furMat);
  tail.position.y = 0.2;
  tailGroup.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), furDarkMat);
  tailTip.position.y = 0.46;
  tailGroup.add(tailTip);
  torso.add(tailGroup);
  parts.tail = tailGroup;

  // Subtle red rim light attached to oni (menacing presence)
  const aura = new THREE.PointLight(0xff2222, 2.5, 5, 2);
  aura.position.y = 1.4;
  g.add(aura);

  g.userData = { parts, type: 'oni', baseY: { torso: 1.05 } };
  return g;
}

// ---------- First-person arm rigs (visible in FP view) ----------
export function createFPArms(role, bodyColor = 0x4da6ff) {
  const g = new THREE.Group();
  const parts = {};
  if (role === 'oni') {
    const furMat = new THREE.MeshStandardMaterial({ map: furTex(), roughness: 0.95 });
    const clawMat = mat(0xe8ddc8, { roughness: 0.3 });
    const pawMat = mat(0x2c1a24, { roughness: 0.95 });
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.34 * sx, -0.34, -0.45);
      arm.rotation.x = -0.5;
      arm.rotation.z = 0.12 * sx;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.34, 4, 8), furMat);
      fore.rotation.x = Math.PI / 2;
      arm.add(fore);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 8), pawMat);
      paw.position.z = -0.26;
      arm.add(paw);
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 4), clawMat);
        claw.position.set(c * 0.06, 0.02, -0.38);
        claw.rotation.x = -Math.PI / 2 + 0.15;
        arm.add(claw);
      }
      g.add(arm);
      parts[sx < 0 ? 'left' : 'right'] = arm;
    }
  } else {
    const hoodieMat = new THREE.MeshStandardMaterial({ map: clothTex(bodyColor), roughness: 0.85 });
    const skinMat = mat(0xffe0bd, { roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.3 * sx, -0.38, -0.42);
      arm.rotation.x = -0.55;
      arm.rotation.z = 0.1 * sx;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), hoodieMat);
      fore.rotation.x = Math.PI / 2;
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
      hand.position.z = -0.23;
      arm.add(hand);
      g.add(arm);
      parts[sx < 0 ? 'left' : 'right'] = arm;
    }
  }
  g.userData = { parts, role, baseL: null, baseR: null };
  // capture base transforms
  g.userData.base = {
    left: { px: parts.left.position.x, py: parts.left.position.y, pz: parts.left.position.z, rx: parts.left.rotation.x },
    right: { px: parts.right.position.x, py: parts.right.position.y, pz: parts.right.position.z, rx: parts.right.rotation.x },
  };
  return g;
}

// FP arms animation: bob with movement, attack swing for oni
export function animateFPArms(rig, state, dt) {
  const { parts, base } = rig.userData;
  state.phase = (state.phase || 0) + dt * (5 + state.speed * 9) * (state.speed > 0.03 ? 1 : 0);
  state.idleT = (state.idleT || 0) + dt;
  const s = state.speed || 0;
  const p = state.phase;

  // attack swing overrides
  if (state.attackT > 0) {
    const t = 1 - state.attackT / state.attackDur; // 0→1 over swing
    const swing = Math.sin(t * Math.PI);
    parts.right.position.y = base.right.py + swing * 0.18;
    parts.right.position.z = base.right.pz - swing * 0.32;
    parts.right.rotation.x = base.right.rx - swing * 1.7;
    parts.right.rotation.z = -swing * 0.55;
    parts.left.position.y = base.left.py - swing * 0.04;
    return;
  }

  const bobL = Math.sin(p) * 0.045 * s;
  const bobR = Math.sin(p + Math.PI) * 0.045 * s;
  const breathe = Math.sin(state.idleT * 1.8) * 0.012;
  parts.left.position.y = base.left.py + bobL + breathe;
  parts.right.position.y = base.right.py + bobR + breathe;
  parts.left.position.z = base.left.pz + Math.abs(Math.sin(p * 0.5)) * 0.03 * s;
  parts.right.position.z = base.right.pz + Math.abs(Math.cos(p * 0.5)) * 0.03 * s;
  parts.left.rotation.x = base.left.rx + bobL * 2;
  parts.right.rotation.x = base.right.rx + bobR * 2;
  parts.right.rotation.z = 0;
}

// ---------- Third-person animation driver ----------
// anim: { speed (0..1), phase, frozen, attackT, attackDur, vaultT, vaultDur }
export function animateCharacter(model, anim, dt) {
  const { parts, type, baseY } = model.userData;
  anim.phase = (anim.phase || 0) + dt * (6 + anim.speed * 8) * (anim.speed > 0.02 ? 1 : 0);
  anim.idleT = (anim.idleT || 0) + dt;
  const s = anim.speed;
  const p = anim.phase;

  const runAmp = type === 'oni' ? 0.95 : 0.85;
  const armAmp = type === 'oni' ? 0.7 : 0.75;

  // ----- attack animation (oni): big overhead claw swipe -----
  if (anim.attackT > 0 && type === 'oni') {
    anim.attackT -= dt;
    const t = 1 - Math.max(0, anim.attackT) / (anim.attackDur || 0.4);
    const wind = t < 0.3 ? t / 0.3 : 1;            // windup
    const swing = t < 0.3 ? 0 : Math.sin((t - 0.3) / 0.7 * Math.PI);
    parts.armR.rotation.x = -2.2 * wind + swing * 3.1;
    parts.armR.rotation.z = -0.5 * wind + swing * 0.4;
    parts.elbowR.rotation.x = -0.5 * wind + swing * 0.8;
    parts.armL.rotation.x = 0.4 * swing;
    parts.torso.rotation.x = 0.25 + swing * 0.32;
    if (parts.jaw) parts.jaw.position.y = -0.14 - swing * 0.05; // mouth opens
    if (parts.head) parts.head.rotation.x = -swing * 0.25;
    // legs continue running cycle lightly
    const swingL = Math.sin(p) * runAmp * s * 0.6;
    parts.legL.rotation.x = swingL;
    parts.legR.rotation.x = -swingL;
    return;
  }
  if (parts.jaw) parts.jaw.position.y = -0.14;

  // ----- vault animation: both arms forward, legs tucked -----
  if (anim.vaultT > 0) {
    anim.vaultT -= dt;
    const t = 1 - Math.max(0, anim.vaultT) / (anim.vaultDur || 0.5);
    const arc = Math.sin(t * Math.PI);
    parts.armL.rotation.x = -1.6 * arc;
    parts.armR.rotation.x = -1.6 * arc;
    parts.legL.rotation.x = arc * 1.2;
    parts.legR.rotation.x = arc * 0.9;
    if (parts.kneeL) parts.kneeL.rotation.x = arc * 1.4;
    if (parts.kneeR) parts.kneeR.rotation.x = arc * 1.2;
    parts.torso.rotation.x = (type === 'oni' ? 0.25 : 0) + arc * 0.5;
    model.position.y = arc * 0.55;       // hop over
    return;
  }
  if (model.position.y > 0.001 && !anim.jumpY) model.position.y = 0;

  if (s > 0.02) {
    // ----- run cycle with knee/elbow follow-through -----
    const swing = Math.sin(p) * runAmp * s;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    if (parts.kneeL) parts.kneeL.rotation.x = Math.max(0, Math.sin(p + 0.9)) * 1.1 * s;
    if (parts.kneeR) parts.kneeR.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.9)) * 1.1 * s;
    parts.armL.rotation.x = -swing * armAmp;
    parts.armR.rotation.x = swing * armAmp;
    if (parts.elbowL) parts.elbowL.rotation.x = -Math.max(0, -Math.sin(p)) * 0.8 * s;
    if (parts.elbowR) parts.elbowR.rotation.x = -Math.max(0, Math.sin(p)) * 0.8 * s;
    parts.armL.rotation.z = 0.12;
    parts.armR.rotation.z = -0.12;
    parts.torso.position.y = baseY.torso + Math.abs(Math.sin(p)) * 0.07 * s;
    parts.torso.rotation.x = (type === 'oni' ? 0.25 : 0) + 0.18 * s;
    if (parts.head) parts.head.rotation.x = -0.12 * s;
    if (parts.tail) parts.tail.rotation.x = 1.2 + Math.sin(p * 2) * 0.18;
  } else {
    // ----- idle: breathing + sway -----
    const b = Math.sin(anim.idleT * 2.2);
    parts.torso.position.y = baseY.torso + b * 0.015;
    parts.torso.rotation.x = (type === 'oni' ? 0.25 : 0);
    parts.legL.rotation.x *= 0.85;
    parts.legR.rotation.x *= 0.85;
    if (parts.kneeL) parts.kneeL.rotation.x *= 0.85;
    if (parts.kneeR) parts.kneeR.rotation.x *= 0.85;
    parts.armL.rotation.x = b * 0.05;
    parts.armR.rotation.x = -b * 0.05;
    if (parts.elbowL) parts.elbowL.rotation.x = -0.15 + b * 0.03;
    if (parts.elbowR) parts.elbowR.rotation.x = -0.15 - b * 0.03;
    parts.armL.rotation.z = 0.1 + b * 0.02;
    parts.armR.rotation.z = -0.1 - b * 0.02;
    if (parts.head) {
      parts.head.rotation.x = b * 0.03;
      parts.head.rotation.y = Math.sin(anim.idleT * 0.6) * 0.25; // look around
    }
    if (parts.tail) parts.tail.rotation.x = 1.2 + b * 0.1;
  }

  if (anim.frozen) {
    const sh = Math.sin(anim.idleT * 30) * 0.02;
    parts.torso.rotation.z = sh;
  } else {
    parts.torso.rotation.z = 0;
  }
}

// ---------- Ghost/decoy version of runner (translucent hologram) ----------
export function makeDecoyMaterialOverride(model) {
  model.traverse(o => {
    if (o.isMesh) {
      o.material = new THREE.MeshStandardMaterial({
        color: 0x66ddff, transparent: true, opacity: 0.55,
        emissive: 0x2288cc, emissiveIntensity: 0.8, roughness: 0.4,
      });
      o.castShadow = false;
    }
    if (o.isPointLight) o.intensity = 0;
  });
  return model;
}

// Runner body colors per player slot
export const RUNNER_COLORS = [0x4da6ff, 0xffb84d, 0x6fdd6f, 0xff6fa8, 0xb98aff];
