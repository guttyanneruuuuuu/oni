// ===== Meta-game UI: profile HUD, shop, perk loadout, missions, achievements =====
// Drives the title-screen "live service" layer that makes the game sticky and
// gives it a monetization surface (cosmetics + premium currency).
import * as Prog from './progression.js';
import { SKINS, PERKS, RARITY_COLORS, RARITY_LABEL, ACHIEVEMENTS } from './progression.js';
import { $, show } from './utils.js';

let _toast = null;

export function toast(msg, kind = '') {
  const host = $('toast-host');
  if (!host) { return; }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 2600);
}

// ---------- Top profile HUD on the title screen ----------
export function refreshMetaHUD() {
  const s = Prog.getState();
  const lv = $('meta-level');
  const coins = $('meta-coins');
  const gems = $('meta-gems');
  const xpfill = $('meta-xpfill');
  if (lv) lv.textContent = 'Lv.' + s.level;
  if (coins) coins.textContent = s.coins.toLocaleString();
  if (gems) gems.textContent = s.gems;
  if (xpfill) {
    const need = Prog.xpForLevel(s.level);
    xpfill.style.width = Math.min(100, Math.round((s.xp / need) * 100)) + '%';
  }
  const streak = $('meta-streak');
  if (streak) streak.textContent = s.streak > 1 ? `🔥${s.streak}日連続` : '';
  // mission badge
  const badge = $('mission-badge');
  if (badge) {
    const m = Prog.ensureMissions();
    const claimable = m.list.filter(x => x.done && !x.claimed).length;
    badge.textContent = claimable ? claimable : '';
    show(badge, claimable > 0);
  }
}

// ---------- SHOP ----------
function rarityChip(rar) {
  return `<span class="rarity-chip" style="background:${RARITY_COLORS[rar]}22;color:${RARITY_COLORS[rar]};border:1px solid ${RARITY_COLORS[rar]}">${RARITY_LABEL[rar]}</span>`;
}
function skinSwatch(hex) {
  const c = '#' + hex.toString(16).padStart(6, '0');
  return `<span class="skin-swatch" style="background:${c}"></span>`;
}

export function renderShop(filter = 'all') {
  const s = Prog.getState();
  const grid = $('shop-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(SKINS).forEach(([id, sk]) => {
    if (filter === 'runner' && sk.role !== 'runner') return;
    if (filter === 'oni' && sk.role !== 'oni') return;
    const owned = s.skins.includes(id);
    const equipped = (sk.role === 'oni' ? s.equippedOniSkin : s.equippedSkin) === id;
    const card = document.createElement('div');
    card.className = 'shop-card rarity-' + sk.rarity + (equipped ? ' equipped' : '');
    let btn;
    if (equipped) btn = `<button class="btn btn-small btn-ghost" disabled>装備中</button>`;
    else if (owned) btn = `<button class="btn btn-small btn-green" data-equip="${id}">装備する</button>`;
    else btn = `<button class="btn btn-small btn-gold" data-buy="${id}">${sk.price}🪙</button>`;
    card.innerHTML = `
      <div class="shop-icon">${sk.icon}${skinSwatch(sk.color)}</div>
      <div class="shop-name">${sk.name} ${rarityChip(sk.rarity)}</div>
      <div class="shop-role">${sk.role === 'oni' ? '👹 鬼用' : '🏃 逃げ用'}</div>
      <div class="shop-desc">${sk.desc}</div>
      ${btn}`;
    grid.appendChild(card);
  });
  // wire buttons
  grid.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-buy');
    const r = Prog.buySkin(id);
    if (r.ok) {
      toast(`✨ 「${SKINS[id].name}」を購入しました！`, 'good');
      Prog.equipSkin(id);
      renderShop(filter); refreshMetaHUD();
    } else if (r.reason === 'coins') toast('🪙 コインが足りません', 'bad');
    else toast('既に所持しています', 'bad');
  }));
  grid.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-equip');
    Prog.equipSkin(id);
    toast(`「${SKINS[id].name}」を装備しました`, 'good');
    renderShop(filter);
  }));
}

// ---------- PERK loadout ----------
export function renderPerks() {
  const s = Prog.getState();
  const grid = $('perk-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(PERKS).forEach(([id, p]) => {
    const owned = s.perks.includes(id);
    const equipped = s.loadout.includes(id);
    const locked = !owned && s.level < p.unlockLevel;
    const card = document.createElement('div');
    card.className = 'perk-card for-' + p.for + (equipped ? ' equipped' : '') + (locked ? ' locked' : '');
    let btn;
    if (owned) btn = `<button class="btn btn-small ${equipped ? 'btn-red' : 'btn-green'}" data-equip="${id}">${equipped ? '外す' : '装備'}</button>`;
    else if (locked) btn = `<button class="btn btn-small btn-ghost" disabled>Lv.${p.unlockLevel}で解放</button>`;
    else btn = `<button class="btn btn-small btn-gold" data-buy="${id}">${p.price}🪙</button>`;
    const forLabel = p.for === 'oni' ? '👹鬼' : p.for === 'runner' ? '🏃逃げ' : '🌐共通';
    card.innerHTML = `
      <div class="perk-top"><span class="perk-icon">${p.icon}</span>
        <span class="perk-for">${forLabel}</span></div>
      <div class="perk-name">${p.name}</div>
      <div class="perk-desc">${p.desc}</div>
      ${btn}`;
    grid.appendChild(card);
  });
  const slots = $('loadout-slots');
  if (slots) {
    slots.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const id = s.loadout[i];
      const slot = document.createElement('div');
      slot.className = 'loadout-slot' + (id ? ' filled' : '');
      slot.innerHTML = id ? `<span class="ls-icon">${PERKS[id].icon}</span><span class="ls-name">${PERKS[id].name}</span>` : '<span class="ls-empty">空きスロット</span>';
      slots.appendChild(slot);
    }
  }
  grid.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-buy');
    const r = Prog.buyPerk(id);
    if (r.ok) { toast(`🔓 パーク「${PERKS[id].name}」を解放！`, 'good'); renderPerks(); refreshMetaHUD(); }
    else if (r.reason === 'coins') toast('🪙 コインが足りません', 'bad');
    else if (r.reason === 'level') toast('レベルが足りません', 'bad');
  }));
  grid.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => {
    Prog.toggleLoadout(b.getAttribute('data-equip'));
    renderPerks();
  }));
}

// ---------- MISSIONS + ACHIEVEMENTS ----------
export function renderMissions() {
  const m = Prog.ensureMissions();
  const list = $('mission-list');
  if (list) {
    list.innerHTML = '';
    m.list.forEach(mi => {
      const pct = Math.min(100, Math.round((mi.prog / mi.goal) * 100));
      const row = document.createElement('div');
      row.className = 'mission-row' + (mi.done ? ' done' : '');
      let action;
      if (mi.claimed) action = `<span class="m-claimed">受取済</span>`;
      else if (mi.done) action = `<button class="btn btn-small btn-gold" data-claim="${mi.id}">受取 ${mi.reward}🪙</button>`;
      else action = `<span class="m-reward">${mi.reward}🪙</span>`;
      row.innerHTML = `
        <div class="m-info">
          <div class="m-desc">${mi.desc}</div>
          <div class="m-bar"><div class="m-fill" style="width:${pct}%"></div></div>
          <div class="m-prog">${Math.min(mi.prog, mi.goal)}/${mi.goal}</div>
        </div>
        <div class="m-action">${action}</div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => {
      const id = b.getAttribute('data-claim');
      const rw = Prog.claimMission(id);
      if (rw) { toast(`🪙 ${rw} コインを獲得！`, 'good'); renderMissions(); refreshMetaHUD(); }
    }));
  }
  // achievements
  const s = Prog.getState();
  const ach = $('achievement-list');
  if (ach) {
    ach.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const got = s.achievements.includes(a.id);
      const row = document.createElement('div');
      row.className = 'ach-row' + (got ? ' got' : '');
      row.innerHTML = `<span class="ach-icon">${a.icon}</span>
        <div class="ach-info"><div class="ach-name">${a.name}${got ? ' ✅' : ''}</div>
        <div class="ach-desc">${a.desc}</div></div>
        <span class="ach-reward">${a.reward}🪙</span>`;
      ach.appendChild(row);
    });
  }
}

// ---------- Profile / stats ----------
export function renderProfile() {
  const s = Prog.getState();
  const el = $('profile-stats');
  if (!el) return;
  const st = s.stats;
  const winrate = st.games ? Math.round((st.wins / st.games) * 100) : 0;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="sc-num">${s.level}</div><div class="sc-lab">レベル</div></div>
      <div class="stat-cell"><div class="sc-num">${st.games}</div><div class="sc-lab">プレイ数</div></div>
      <div class="stat-cell"><div class="sc-num">${st.wins}</div><div class="sc-lab">勝利</div></div>
      <div class="stat-cell"><div class="sc-num">${winrate}%</div><div class="sc-lab">勝率</div></div>
      <div class="stat-cell"><div class="sc-num">${st.captures}</div><div class="sc-lab">捕獲</div></div>
      <div class="stat-cell"><div class="sc-num">${st.rescues}</div><div class="sc-lab">救出</div></div>
      <div class="stat-cell"><div class="sc-num">${st.gens}</div><div class="sc-lab">修理</div></div>
      <div class="stat-cell"><div class="sc-num">${st.escapes}</div><div class="sc-lab">脱出</div></div>
      <div class="stat-cell"><div class="sc-num">${s.skins.length}</div><div class="sc-lab">スキン</div></div>
      <div class="stat-cell"><div class="sc-num">${s.achievements.length}/${ACHIEVEMENTS.length}</div><div class="sc-lab">実績</div></div>
    </div>`;
}

// ---------- Init / wiring ----------
export function initMeta() {
  Prog.loadSave();
  Prog.ensureMissions();
  refreshMetaHUD();

  // tab open buttons
  const open = (panel, render) => {
    document.querySelectorAll('.meta-panel').forEach(p => p.classList.remove('open'));
    const el = $(panel);
    if (el) { el.classList.add('open'); }
    if (render) render();
  };
  const wire = (btnId, panelId, render) => {
    const b = $(btnId);
    if (b) b.addEventListener('click', () => open(panelId, render));
  };
  wire('btn-shop', 'panel-shop', () => renderShop(_shopFilter));
  wire('btn-perks', 'panel-perks', renderPerks);
  wire('btn-missions', 'panel-missions', renderMissions);
  wire('btn-profile', 'panel-profile', renderProfile);

  // close buttons
  document.querySelectorAll('[data-close-meta]').forEach(b =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.meta-panel').forEach(p => p.classList.remove('open'));
      refreshMetaHUD();
    }));

  // shop filter tabs
  document.querySelectorAll('[data-shop-filter]').forEach(b =>
    b.addEventListener('click', () => {
      _shopFilter = b.getAttribute('data-shop-filter');
      document.querySelectorAll('[data-shop-filter]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderShop(_shopFilter);
    }));

  // free daily-bonus button (gives coins, light "monetization funnel" hook)
  const fb = $('btn-freebie');
  if (fb) fb.addEventListener('click', () => claimDailyBonus());
}

let _shopFilter = 'all';

// Daily free bonus — claimable once per day, scales with login streak.
export function claimDailyBonus() {
  const s = Prog.getState();
  const today = new Date();
  const key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  if (s._bonusDate === key) { toast('本日のボーナスは受取済みです', 'bad'); return; }
  s._bonusDate = key;
  const amount = 100 + Math.min(s.streak, 7) * 25;
  Prog.addCoins(amount);
  if (s.streak % 7 === 0) Prog.addGems(1);
  Prog.persist();
  toast(`🎁 デイリーボーナス +${amount}🪙 (${s.streak}日連続)`, 'good');
  refreshMetaHUD();
}
