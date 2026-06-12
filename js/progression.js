// ===== Progression, economy, cosmetics, perks, missions, achievements =====
// All persisted in localStorage. This is the long-term "stickiness" + monetization
// backbone that lets the game compete with 脱獄ごっこ-style live titles.

const SAVE_KEY = 'oni_save_v1';

// ---------- Level curve ----------
// XP needed to go from level L to L+1.
export function xpForLevel(level) {
  return Math.floor(100 + level * 55 + level * level * 6);
}
export function totalXpForLevel(level) {
  let t = 0;
  for (let i = 1; i < level; i++) t += xpForLevel(i);
  return t;
}

// ---------- Cosmetics catalog ----------
// Skins change the player's body color + an accent + a display title.
// rarity affects shop price & glow.
export const SKINS = {
  // --- Runner / hider skins ---
  default:   { name: 'ルーキー',       icon: '🧑', color: 0x4da6ff, accent: 0xffffff, rarity: 'common',    price: 0,    role: 'runner', desc: '最初から使える基本スキン' },
  crimson:   { name: 'クリムゾン',     icon: '🟥', color: 0xff4d4d, accent: 0xffd166, rarity: 'common',    price: 300,  role: 'runner', desc: '燃えるような赤の俊足ランナー' },
  emerald:   { name: 'エメラルド',     icon: '🟩', color: 0x39d98a, accent: 0xeaffd0, rarity: 'common',    price: 300,  role: 'runner', desc: '森に溶け込むステルスカラー' },
  violet:    { name: 'バイオレット',   icon: '🟪', color: 0xa15bff, accent: 0xffd6ff, rarity: 'rare',      price: 700,  role: 'runner', desc: '気品ある紫のトリックスター' },
  gold:      { name: 'ゴールドラッシュ', icon: '🟨', color: 0xffc833, accent: 0xfff4c2, rarity: 'epic',     price: 1500, role: 'runner', desc: '黄金に輝くVIPランナー' },
  shadow:    { name: 'シャドウ',       icon: '⬛', color: 0x2a2a3a, accent: 0x8a5bff, rarity: 'epic',     price: 1800, role: 'runner', desc: '闇に紛れる影の脱獄者' },
  aurora:    { name: 'オーロラ',       icon: '🌈', color: 0x55e0ff, accent: 0xff7bd5, rarity: 'legendary', price: 3500, role: 'runner', desc: '極光をまとう伝説のランナー' },
  // --- Oni skins ---
  oni_default: { name: '赤鬼',         icon: '👹', color: 0xcc2222, accent: 0xffaa00, rarity: 'common',    price: 0,    role: 'oni', desc: '最初から使える基本の鬼' },
  oni_blue:    { name: '蒼鬼',         icon: '👺', color: 0x2255cc, accent: 0x88ddff, rarity: 'rare',      price: 800,  role: 'oni', desc: '冷酷な蒼き追跡者' },
  oni_void:    { name: '虚無の鬼',     icon: '🕳️', color: 0x140a1f, accent: 0xb04bff, rarity: 'epic',     price: 2000, role: 'oni', desc: '空間を喰らう漆黒の鬼' },
  oni_inferno: { name: '業火の鬼神',   icon: '🔥', color: 0xff3300, accent: 0xffe066, rarity: 'legendary', price: 4000, role: 'oni', desc: '炎を統べる最強の鬼神' },
};

export const RARITY_COLORS = {
  common: '#9fb0c0', rare: '#4da6ff', epic: '#c061ff', legendary: '#ffba2b',
};
export const RARITY_LABEL = {
  common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド',
};

// ---------- Perks (loadout passives) ----------
// Each player picks up to 2 perks before a match. They are mild, role-flavored.
export const PERKS = {
  // runner-leaning
  sprinter:   { name: 'スプリンター',  icon: '⚡', for: 'runner', price: 0,    desc: 'ダッシュ最高速 +6%',           unlockLevel: 1 },
  ironlungs:  { name: '鉄の肺',        icon: '🫁', for: 'runner', price: 400,  desc: 'スタミナ回復 +25%',            unlockLevel: 2 },
  lockpick:   { name: '凄腕修理',      icon: '🔧', for: 'runner', price: 600,  desc: '発電機の修理速度 +20%',        unlockLevel: 3 },
  ghoststep:  { name: '幽体歩行',      icon: '👻', for: 'runner', price: 900,  desc: 'しゃがみ時の発見されにくさ強化', unlockLevel: 5 },
  savior:     { name: '救世主',        icon: '🤝', for: 'runner', price: 700,  desc: '救出が0.4秒速い+救出ボーナス増', unlockLevel: 4 },
  scavenger:  { name: 'スカベンジャー', icon: '🎒', for: 'runner', price: 800,  desc: '開始時にアイテムを所持',        unlockLevel: 6 },
  // oni-leaning
  bloodhound: { name: '血の追跡者',    icon: '🩸', for: 'oni',    price: 0,    desc: '逃げの足跡が一瞬見える',        unlockLevel: 1 },
  brute:      { name: '剛腕',          icon: '💪', for: 'oni',    price: 500,  desc: '攻撃のクールダウン -15%',      unlockLevel: 2 },
  predator:   { name: 'プレデター',    icon: '🐾', for: 'oni',    price: 900,  desc: '攻撃のリーチ +12%',            unlockLevel: 4 },
  terror:     { name: '恐怖の化身',    icon: '😱', for: 'oni',    price: 1100, desc: '恐怖範囲が拡大しスタミナ削り',  unlockLevel: 6 },
  // universal
  lucky:      { name: '幸運',          icon: '🍀', for: 'any',    price: 600,  desc: '獲得コイン +15%',              unlockLevel: 3 },
  veteran:    { name: 'ベテラン',      icon: '🎖️', for: 'any',    price: 1000, desc: '獲得XP +20%',                  unlockLevel: 5 },
};

// ---------- Daily missions pool ----------
const MISSION_POOL = [
  { id: 'play3',     desc: '3回プレイする',           goal: 3,  reward: 150, track: 'games' },
  { id: 'win2',      desc: '2回勝利する',             goal: 2,  reward: 250, track: 'wins' },
  { id: 'capture4',  desc: '鬼で4人捕まえる',         goal: 4,  reward: 200, track: 'captures' },
  { id: 'rescue3',   desc: '仲間を3回救出する',       goal: 3,  reward: 200, track: 'rescues' },
  { id: 'gen5',      desc: '発電機を5台修理する',     goal: 5,  reward: 220, track: 'gens' },
  { id: 'escape1',   desc: 'ゲートから1回脱出する',   goal: 1,  reward: 300, track: 'escapes' },
  { id: 'survive2',  desc: '逃げで2回生き残る',       goal: 2,  reward: 250, track: 'survives' },
  { id: 'items8',    desc: 'アイテムを8個拾う',       goal: 8,  reward: 150, track: 'items' },
  { id: 'score3000', desc: '合計3000点を稼ぐ',        goal: 3000, reward: 200, track: 'score' },
];

// ---------- Achievements (one-time milestones) ----------
export const ACHIEVEMENTS = [
  { id: 'first_blood', name: '初陣',         icon: '🎮', desc: '初めてプレイした',         reward: 100, check: s => s.stats.games >= 1 },
  { id: 'win10',       name: '常勝',         icon: '🏆', desc: '通算10勝',                 reward: 300, check: s => s.stats.wins >= 10 },
  { id: 'win50',       name: '覇者',         icon: '👑', desc: '通算50勝',                 reward: 1000, check: s => s.stats.wins >= 50 },
  { id: 'hunter25',    name: 'ハンター',     icon: '🩸', desc: '通算25捕獲',               reward: 400, check: s => s.stats.captures >= 25 },
  { id: 'savior20',    name: '救世主',       icon: '🤝', desc: '通算20救出',               reward: 400, check: s => s.stats.rescues >= 20 },
  { id: 'engineer30',  name: 'エンジニア',   icon: '⚙️', desc: '通算30台修理',             reward: 400, check: s => s.stats.gens >= 30 },
  { id: 'escapist',    name: 'エスケーピスト', icon: '🚪', desc: '通算5回ゲート脱出',        reward: 500, check: s => s.stats.escapes >= 5 },
  { id: 'collector',   name: 'コレクター',   icon: '🎨', desc: 'スキンを5種類所持',        reward: 600, check: s => s.skins.length >= 5 },
  { id: 'level10',     name: '熟練者',       icon: '⭐', desc: 'レベル10到達',             reward: 500, check: s => s.level >= 10 },
  { id: 'rich',        name: '大富豪',       icon: '💰', desc: 'コインを5000枚貯める',     reward: 800, check: s => s.coins >= 5000 },
];

// ---------- Default save ----------
function defaultSave() {
  return {
    name: '',
    level: 1,
    xp: 0,
    coins: 200,
    gems: 5,                       // premium currency (earned slowly / IAP placeholder)
    skins: ['default', 'oni_default'],
    perks: ['sprinter', 'bloodhound'],   // owned perks
    equippedSkin: 'default',
    equippedOniSkin: 'oni_default',
    loadout: ['sprinter', 'bloodhound'], // selected perks for next match (max 2)
    achievements: [],              // earned achievement ids
    stats: { games: 0, wins: 0, captures: 0, rescues: 0, gens: 0, escapes: 0, survives: 0, items: 0, score: 0 },
    missions: null,                // {date, list:[{id,desc,goal,reward,track,prog,done,claimed}]}
    streak: 0,
    lastPlayedDate: '',
    settings: { sfx: true },
  };
}

let _save = null;

export function loadSave() {
  if (_save) return _save;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      _save = Object.assign(defaultSave(), JSON.parse(raw));
      // backfill nested objects
      _save.stats = Object.assign(defaultSave().stats, _save.stats || {});
    } else {
      _save = defaultSave();
    }
  } catch (e) {
    _save = defaultSave();
  }
  ensureMissions();
  return _save;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(_save)); } catch (e) {}
}

// ---------- Daily missions ----------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function ensureMissions() {
  const s = loadSave();
  const today = todayStr();
  if (!s.missions || s.missions.date !== today) {
    // pick 3 distinct missions
    const pool = [...MISSION_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    s.missions = {
      date: today,
      list: pool.map(m => ({ ...m, prog: 0, done: false, claimed: false })),
    };
    // login streak
    if (s.lastPlayedDate) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yStr = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
      s.streak = (s.lastPlayedDate === yStr) ? (s.streak + 1) : 1;
    } else {
      s.streak = 1;
    }
    s.lastPlayedDate = today;
    persist();
  }
  return s.missions;
}

// ---------- Mutations ----------
export function addCoins(n) { const s = loadSave(); s.coins += Math.max(0, Math.round(n)); persist(); return s.coins; }
export function spendCoins(n) {
  const s = loadSave();
  if (s.coins < n) return false;
  s.coins -= n; persist(); return true;
}
export function addGems(n) { const s = loadSave(); s.gems += n; persist(); return s.gems; }

// Award XP, returns {leveledUp, newLevels, level}
export function addXp(n) {
  const s = loadSave();
  s.xp += Math.max(0, Math.round(n));
  let leveled = 0;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level);
    s.level++;
    leveled++;
    // level-up reward
    s.coins += 100 + s.level * 10;
    if (s.level % 5 === 0) s.gems += 1;
  }
  persist();
  return { leveledUp: leveled > 0, newLevels: leveled, level: s.level };
}

export function ownsSkin(id) { return loadSave().skins.includes(id); }
export function buySkin(id) {
  const s = loadSave();
  const sk = SKINS[id];
  if (!sk || s.skins.includes(id)) return { ok: false, reason: 'owned' };
  if (s.coins < sk.price) return { ok: false, reason: 'coins' };
  s.coins -= sk.price;
  s.skins.push(id);
  persist();
  return { ok: true };
}
export function equipSkin(id) {
  const s = loadSave();
  if (!s.skins.includes(id)) return false;
  const sk = SKINS[id];
  if (sk.role === 'oni') s.equippedOniSkin = id;
  else s.equippedSkin = id;
  persist();
  return true;
}

export function ownsPerk(id) { return loadSave().perks.includes(id); }
export function buyPerk(id) {
  const s = loadSave();
  const p = PERKS[id];
  if (!p || s.perks.includes(id)) return { ok: false, reason: 'owned' };
  if (s.level < p.unlockLevel) return { ok: false, reason: 'level' };
  if (s.coins < p.price) return { ok: false, reason: 'coins' };
  s.coins -= p.price;
  s.perks.push(id);
  persist();
  return { ok: true };
}
export function toggleLoadout(id) {
  const s = loadSave();
  if (!s.perks.includes(id)) return false;
  const i = s.loadout.indexOf(id);
  if (i >= 0) { s.loadout.splice(i, 1); }
  else {
    if (s.loadout.length >= 2) s.loadout.shift();
    s.loadout.push(id);
  }
  persist();
  return true;
}
export function getLoadout() { return [...loadSave().loadout]; }
export function hasPerk(id) { return loadSave().loadout.includes(id); }

// ---------- Post-match recording ----------
// matchResult: {won, role, captures, rescues, gens, escaped, survived, items, score}
// returns a summary object for the result screen reward animation.
export function recordMatch(r) {
  const s = loadSave();
  const st = s.stats;
  st.games += 1;
  if (r.won) st.wins += 1;
  st.captures += r.captures || 0;
  st.rescues += r.rescues || 0;
  st.gens += r.gens || 0;
  if (r.escaped) st.escapes += 1;
  if (r.survived) st.survives += 1;
  st.items += r.items || 0;
  st.score += r.score || 0;

  // ----- rewards -----
  let xpGain = 40 + Math.round((r.score || 0) * 0.12);
  if (r.won) xpGain += 60;
  let coinGain = 30 + Math.round((r.score || 0) * 0.06);
  if (r.won) coinGain += 50;
  // perk multipliers
  if (hasPerk('veteran')) xpGain = Math.round(xpGain * 1.2);
  if (hasPerk('lucky')) coinGain = Math.round(coinGain * 1.15);

  addCoins(coinGain);
  const lvl = addXp(xpGain);

  // ----- mission progress -----
  const missionUpdates = updateMissions({
    games: 1,
    wins: r.won ? 1 : 0,
    captures: r.captures || 0,
    rescues: r.rescues || 0,
    gens: r.gens || 0,
    escapes: r.escaped ? 1 : 0,
    survives: r.survived ? 1 : 0,
    items: r.items || 0,
    score: r.score || 0,
  });

  // ----- achievement check -----
  const newAch = checkAchievements();

  persist();
  return { xpGain, coinGain, level: lvl, missionUpdates, newAch };
}

function updateMissions(delta) {
  const m = ensureMissions();
  const completed = [];
  m.list.forEach(mi => {
    if (mi.done) return;
    if (delta[mi.track]) {
      mi.prog = Math.min(mi.goal, mi.prog + delta[mi.track]);
      if (mi.prog >= mi.goal) { mi.done = true; completed.push(mi); }
    }
  });
  persist();
  return completed;
}

export function claimMission(id) {
  const m = ensureMissions();
  const mi = m.list.find(x => x.id === id);
  if (!mi || !mi.done || mi.claimed) return false;
  mi.claimed = true;
  addCoins(mi.reward);
  persist();
  return mi.reward;
}

function checkAchievements() {
  const s = loadSave();
  const newly = [];
  ACHIEVEMENTS.forEach(a => {
    if (!s.achievements.includes(a.id) && a.check(s)) {
      s.achievements.push(a.id);
      s.coins += a.reward;
      newly.push(a);
    }
  });
  if (newly.length) persist();
  return newly;
}

export function getState() { return loadSave(); }
