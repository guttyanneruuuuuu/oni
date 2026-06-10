// ===== Game balance configuration =====
export const CONFIG = {
  PLAYERS: 5,
  ROUND_TIME: 300,        // 5 minutes
  ONI_FREEZE_TIME: 20,    // oni cannot move at start
  RUNNER_SPEED: 5.2,
  RUNNER_DASH_SPEED: 7.4,
  ONI_SPEED: 6.0,
  ONI_DASH_SPEED: 8.2,
  DASH_STAMINA_MAX: 100,
  DASH_DRAIN: 30,         // per second
  DASH_REGEN: 16,         // per second
  CATCH_RADIUS: 1.05,     // oni touch distance (body contact)
  RESCUE_RADIUS: 1.8,     // jail rescue distance
  RESCUE_TIME: 1.2,       // seconds touching jail to rescue
  PLAYER_RADIUS: 0.42,
  ITEM_COUNT: 11,         // items on map at once
  ITEM_RESPAWN: 14,       // seconds
  ITEM_PICK_RADIUS: 1.1,
  TRAP_SLOW_TIME: 3.5,
  TRAP_SLOW_FACTOR: 0.35,
  FLASH_BLIND_TIME: 2.6,
  FLASH_RADIUS: 9,
  BOOST_TIME: 4,
  BOOST_FACTOR: 1.45,
  WALL_TIME: 6,           // temp wall lifetime
  DETECTOR_TIME: 5,       // reveal duration
  SIGNAL_COOLDOWN: 25,

  // --- Oni attack (DbD-style lunge) ---
  ATTACK_RANGE: 2.35,       // lunge reach
  ATTACK_ARC: 0.86,         // radians half-angle of swing cone
  ATTACK_COOLDOWN: 1.4,     // seconds between swings
  ATTACK_LUNGE_SPEED: 11.5, // forward burst during swing
  ATTACK_LUNGE_TIME: 0.28,  // lunge duration
  ATTACK_MISS_LAG: 0.9,     // recovery slowdown on whiff
  ATTACK_HIT_LAG: 1.4,      // recovery after successful hit (gives rescue window feel)

  // --- Terror radius (heartbeat) ---
  TERROR_RADIUS: 18,        // full heartbeat distance
  TERROR_NEAR: 8,           // max intensity distance

  // --- Vault (window) mechanic ---
  VAULT_TIME_RUNNER: 0.55,  // runner vault duration
  VAULT_TIME_ONI: 1.05,     // oni is slow at vaulting
  VAULT_RADIUS: 1.25,       // interact distance
  VAULT_COOLDOWN: 0.4,

  // --- New items ---
  SMOKE_TIME: 5.5,          // smoke cloud lifetime
  SMOKE_RADIUS: 4.2,
  DECOY_TIME: 7,            // decoy hologram lifetime
  STAMINA_DRINK_AMOUNT: 100,// full refill + temp regen boost
  STAMINA_DRINK_REGEN_T: 6,
  ONI_HASTE_TIME: 3.2,      // oni speed burst item
  ONI_HASTE_FACTOR: 1.32,

  // --- Endgame ---
  LAST_RUNNER_BOOST: 1.1,   // last survivor speed multiplier
  ENDGAME_TIME: 45,         // final N seconds: oni sees all runners pulse on minimap
  ENDGAME_PING_INTERVAL: 6, // seconds between endgame pings

  // --- Escape task (generators + gate) ---
  GEN_COUNT: 5,
  GEN_REQUIRED: 3,          // repair this many to open the escape gate
  GEN_REPAIR_RADIUS: 1.6,   // distance to repair
  GEN_REPAIR_TIME: 14,      // seconds of solo repair to finish one gen
  GEN_REGRESS: 4,           // progress lost per second when nobody works it (after partial)
  GATE_RADIUS: 2.2,         // distance to escape through gate
  ESCAPE_SCORE: 200,

  // --- Stealth (crouch) ---
  CROUCH_SPEED_FACTOR: 0.45,
  CROUCH_DETECT_FACTOR: 0.4,// reduces oni minimap reveal range while crouched

  // --- Misc ---
  CAPTURE_SCORE: 100,
  RESCUE_SCORE: 80,
  SURVIVE_SCORE: 150,
  ITEM_SCORE: 10,
  ESCAPE_CHASE_SCORE: 40,   // breaking line-of-sight chase
  CHASE_DIST: 11,           // distance defining "in chase"
  CHASE_LOSE_TIME: 4,       // seconds out of sight to escape chase
};

export const ROLES = {
  ONI: 'oni',
  TRAITOR: 'traitor',
  RUNNER: 'runner',
};

export const ROLE_INFO = {
  oni:     { name: '人狼（鬼）', icon: '👹', class: 'role-oni',
             desc: '攻撃ボタンで斬りかかれ！全員捕まえたら勝利。' },
  traitor: { name: '裏切り者', icon: '🃏', class: 'role-traitor',
             desc: '逃げのフリをして人狼を勝たせろ。📡で密告できる。' },
  runner:  { name: '逃げ', icon: '🏃', class: 'role-runner',
             desc: '時間切れまで生き残れ！窓は🪟で乗り越え。仲間は牢屋で救出。' },
};

// Items: who can pick them up & what they do
export const ITEMS = {
  boost:    { name: '加速ブーツ', icon: '👟', for: ['runner', 'traitor'], color: 0x44ff88,
              desc: '4秒間ダッシュ速度UP' },
  flash:    { name: '閃光グレネード', icon: '✨', for: ['runner', 'traitor'], color: 0xffff66,
              desc: '近くの人狼の視界を奪う' },
  wall:     { name: '一時的な壁', icon: '🧱', for: ['runner', 'traitor'], color: 0xcc8855,
              desc: '6秒間の光壁で道を塞ぐ' },
  smoke:    { name: 'スモーク弾', icon: '💨', for: ['runner', 'traitor'], color: 0xaabbcc,
              desc: '煙幕で姿を隠す' },
  decoy:    { name: 'デコイ', icon: '🎭', for: ['runner', 'traitor'], color: 0x66ddff,
              desc: '自分そっくりの分身を走らせる' },
  drink:    { name: 'スタミナドリンク', icon: '🧃', for: ['runner', 'traitor'], color: 0xff88dd,
              desc: 'スタミナ全回復+回復速度UP' },
  detector: { name: '探知機', icon: '📡', for: ['oni'], color: 0xff5555,
              desc: '5秒間 全逃げの位置を表示' },
  trap:     { name: 'トラップ', icon: '🪤', for: ['oni'], color: 0xff9933,
              desc: '踏んだ逃げを激減速' },
  haste:    { name: '狂奔', icon: '🔥', for: ['oni'], color: 0xff3300,
              desc: '3秒間 移動速度が大幅UP' },
};
export const RUNNER_ITEM_KEYS = ['boost', 'flash', 'wall', 'smoke', 'decoy', 'drink'];
export const ONI_ITEM_KEYS = ['detector', 'trap', 'haste'];

// item drop weights (runner items)
export const RUNNER_ITEM_WEIGHTS = { boost: 3, flash: 3, wall: 2.5, smoke: 2, decoy: 1.6, drink: 2 };
export const ONI_ITEM_WEIGHTS = { detector: 3, trap: 3, haste: 2.2 };

export function weightedPick(weights, rng = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}
