// ===== Game balance configuration =====
export const CONFIG = {
  PLAYERS: 5,
  ROUND_TIME: 300,        // 5 minutes
  ONI_FREEZE_TIME: 20,    // oni cannot move at start
  RUNNER_SPEED: 5.2,
  RUNNER_DASH_SPEED: 7.4,
  ONI_SPEED: 6.1,
  ONI_DASH_SPEED: 8.4,
  DASH_STAMINA_MAX: 100,
  DASH_DRAIN: 30,         // per second
  DASH_REGEN: 16,         // per second
  CATCH_RADIUS: 1.15,     // oni touch distance
  RESCUE_RADIUS: 1.8,     // jail rescue distance
  RESCUE_TIME: 1.2,       // seconds touching jail to rescue
  PLAYER_RADIUS: 0.42,
  ITEM_COUNT: 10,         // items on map at once
  ITEM_RESPAWN: 15,       // seconds
  ITEM_PICK_RADIUS: 1.1,
  TRAP_SLOW_TIME: 3.5,
  TRAP_SLOW_FACTOR: 0.35,
  FLASH_BLIND_TIME: 2.6,
  FLASH_RADIUS: 9,
  BOOST_TIME: 4,
  BOOST_FACTOR: 1.5,
  WALL_TIME: 6,           // temp wall lifetime
  DETECTOR_TIME: 5,       // reveal duration
  SIGNAL_COOLDOWN: 25,
};

export const ROLES = {
  ONI: 'oni',
  TRAITOR: 'traitor',
  RUNNER: 'runner',
};

export const ROLE_INFO = {
  oni:     { name: '人狼（鬼）', icon: '👹', class: 'role-oni',
             desc: '逃げを全員捕まえろ！接触で捕獲。' },
  traitor: { name: '裏切り者', icon: '🃏', class: 'role-traitor',
             desc: '逃げのフリをして人狼を勝たせろ。📡で密告できる。' },
  runner:  { name: '逃げ', icon: '🏃', class: 'role-runner',
             desc: '時間切れまで生き残れ！仲間は牢屋で救出できる。' },
};

// Items: who can pick them up & what they do
export const ITEMS = {
  boost:    { name: '加速ブーツ', icon: '👟', for: ['runner', 'traitor'], color: 0x44ff88 },
  flash:    { name: '閃光グレネード', icon: '✨', for: ['runner', 'traitor'], color: 0xffff66 },
  wall:     { name: '一時的な壁', icon: '🧱', for: ['runner', 'traitor'], color: 0xcc8855 },
  detector: { name: '探知機', icon: '📡', for: ['oni'], color: 0xff5555 },
  trap:     { name: 'トラップ', icon: '🪤', for: ['oni'], color: 0xff9933 },
};
export const RUNNER_ITEM_KEYS = ['boost', 'flash', 'wall'];
export const ONI_ITEM_KEYS = ['detector', 'trap'];
