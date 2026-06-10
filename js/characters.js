// ===== Procedural animated 3D characters =====
// Two character types: RUNNER (逃げ) and ONI (人狼/鬼)
// Each has articulated limbs with run / idle / catch animations.
import * as THREE from 'three';

const MAT_CACHE = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MAT_CACHE[key]) {
    MAT_CACHE[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });
  }
  return MAT_CACHE[key];
}

// ---------- RUNNER (逃げキャラ): cute rounded humanoid ----------
export function createRunnerModel(bodyColor = 0x4da6ff) {
  const g = new THREE.Group();
  const parts = {};

  // Torso (rounded capsule-ish)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.35, 6, 12), mat(bodyColor));
  torso.position.y = 0.85;
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Belly accent
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xfff3e0));
  belly.scale.set(1, 1.1, 0.55);
  belly.position.set(0, -0.02, 0.16);
  torso.add(belly);

  // Head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.42;
  torso.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), mat(0xffe0bd));
  head.position.y = 0.2;
  head.castShadow = true;
  headPivot.add(head);
  parts.head = headPivot;

  // Hair (cap)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x42342a));
  hair.position.y = 0.06;
  head.add(hair);
  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, mat(0x222222));
  eyeL.position.set(-0.09, 0.02, 0.23);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  head.add(eyeR);

  // Backpack (cute detail)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), mat(0xd9534f));
  pack.position.set(0, 0.04, -0.26);
  torso.add(pack);

  // Arms (pivot at shoulder)
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.32 * side, 0.25, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), mat(bodyColor));
    arm.position.y = -0.22;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), mat(0xffe0bd));
    hand.position.y = -0.44;
    pivot.add(hand);
    torso.add(pivot);
    return pivot;
  }
  parts.armL = makeArm(-1);
  parts.armR = makeArm(1);

  // Legs (pivot at hip, attached to group so torso bob doesn't move hips)
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.13 * side, 0.62, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), mat(0x32465f));
    leg.position.y = -0.24;
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.26), mat(0xffffff));
    shoe.position.set(0, -0.45, 0.04);
    pivot.add(shoe);
    g.add(pivot);
    return pivot;
  }
  parts.legL = makeLeg(-1);
  parts.legR = makeLeg(1);

  g.userData = { parts, type: 'runner', baseY: { torso: 0.85 } };
  return g;
}

// ---------- ONI (人狼/鬼キャラ): hulking werewolf ----------
export function createOniModel() {
  const g = new THREE.Group();
  const parts = {};
  const furDark = 0x3a2230, furMid = 0x57303f;

  // Torso: big, hunched
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 12), mat(furMid));
  torso.position.y = 1.05;
  torso.rotation.x = 0.25; // hunched forward
  torso.castShadow = true;
  g.add(torso);
  parts.torso = torso;

  // Chest fur
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(0x8a6a5a));
  chest.scale.set(1.1, 1.2, 0.6);
  chest.position.set(0, 0.05, 0.25);
  torso.add(chest);

  // Head: wolf with snout & ears
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.52, 0.12);
  torso.add(headPivot);
  parts.head = headPivot;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), mat(furDark));
  head.scale.set(0.95, 1, 1.05);
  head.position.y = 0.16;
  head.castShadow = true;
  headPivot.add(head);
  // Snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), mat(furDark));
  snout.position.set(0, -0.06, 0.3);
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x111111));
  nose.position.set(0, 0.02, 0.16);
  snout.add(nose);
  // Jaw with teeth
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.26), mat(0x2a1822));
  jaw.position.set(0, -0.13, 0.28);
  head.add(jaw);
  const teethMat = mat(0xf5f5f0);
  for (let i = -1; i <= 1; i += 2) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), teethMat);
    tooth.position.set(0.07 * i, 0.05, 0.38);
    tooth.rotation.x = Math.PI;
    head.add(tooth);
  }
  // Glowing red eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
  eyeL.position.set(-0.12, 0.06, 0.25);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  head.add(eyeR);
  // Ears
  for (let i = -1; i <= 1; i += 2) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 6), mat(furDark));
    ear.position.set(0.17 * i, 0.3, -0.02);
    ear.rotation.z = -0.25 * i;
    head.add(ear);
  }

  // Spiky back fur
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), mat(furDark));
    spike.position.set(0, 0.35 - i * 0.18, -0.36);
    spike.rotation.x = -0.9;
    torso.add(spike);
  }

  // Arms: long with claws
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.48 * side, 0.3, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), mat(furMid));
    arm.position.y = -0.32;
    arm.castShadow = true;
    pivot.add(arm);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat(furDark));
    paw.position.y = -0.62;
    pivot.add(paw);
    // Claws
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), teethMat);
      claw.position.set(c * 0.07, -0.74, 0.04);
      claw.rotation.x = Math.PI;
      pivot.add(claw);
    }
    torso.add(pivot);
    return pivot;
  }
  parts.armL = makeArm(-1);
  parts.armR = makeArm(1);

  // Legs: digitigrade-ish
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.2 * side, 0.78, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 4, 8), mat(furMid));
    leg.position.y = -0.3;
    leg.castShadow = true;
    pivot.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), mat(furDark));
    foot.position.set(0, -0.58, 0.06);
    pivot.add(foot);
    g.add(pivot);
    return pivot;
  }
  parts.legL = makeLeg(-1);
  parts.legR = makeLeg(1);

  // Tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), mat(furDark));
  tail.position.set(0, -0.25, -0.4);
  tail.rotation.x = 1.2;
  torso.add(tail);
  parts.tail = tail;

  g.userData = { parts, type: 'oni', baseY: { torso: 1.05 } };
  return g;
}

// ---------- Animation driver ----------
// state: { speed (0..1 normalized), dt, time, frozen, captured }
export function animateCharacter(model, anim, dt) {
  const { parts, type, baseY } = model.userData;
  anim.phase = (anim.phase || 0) + dt * (6 + anim.speed * 8) * (anim.speed > 0.02 ? 1 : 0);
  anim.idleT = (anim.idleT || 0) + dt;
  const s = anim.speed; // 0 = idle, 1 = full run
  const p = anim.phase;

  const runAmp = type === 'oni' ? 0.95 : 0.85;
  const armAmp = type === 'oni' ? 0.7 : 0.75;

  if (s > 0.02) {
    // Run cycle
    const swing = Math.sin(p) * runAmp * s;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * armAmp;
    parts.armR.rotation.x = swing * armAmp;
    parts.armL.rotation.z = 0.12;
    parts.armR.rotation.z = -0.12;
    // Body bob & lean
    parts.torso.position.y = baseY.torso + Math.abs(Math.sin(p)) * 0.07 * s;
    parts.torso.rotation.x = (type === 'oni' ? 0.25 : 0) + 0.18 * s;
    if (parts.head) parts.head.rotation.x = -0.12 * s;
    if (parts.tail) parts.tail.rotation.x = 1.2 + Math.sin(p * 2) * 0.18;
  } else {
    // Idle: gentle breathing + arm sway
    const b = Math.sin(anim.idleT * 2.2);
    parts.torso.position.y = baseY.torso + b * 0.015;
    parts.torso.rotation.x = (type === 'oni' ? 0.25 : 0);
    parts.legL.rotation.x *= 0.85;
    parts.legR.rotation.x *= 0.85;
    parts.armL.rotation.x = b * 0.05;
    parts.armR.rotation.x = -b * 0.05;
    parts.armL.rotation.z = 0.1 + b * 0.02;
    parts.armR.rotation.z = -0.1 - b * 0.02;
    if (parts.head) parts.head.rotation.x = b * 0.03;
    if (parts.tail) parts.tail.rotation.x = 1.2 + b * 0.1;
  }

  if (anim.frozen) {
    // Frozen pose: arms crossed-ish, shiver
    const sh = Math.sin(anim.idleT * 30) * 0.02;
    parts.torso.rotation.z = sh;
  } else {
    parts.torso.rotation.z = 0;
  }
}

// Runner body colors per player slot
export const RUNNER_COLORS = [0x4da6ff, 0xffb84d, 0x6fdd6f, 0xff6fa8, 0xb98aff];
