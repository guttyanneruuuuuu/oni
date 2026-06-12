// ===== Perk System (Build System) =====
// Players can customize their loadout with perks before each match
// Perks provide passive bonuses and active abilities

export const PERKS = {
  // ===== RUNNER PERKS =====
  'resilience': {
    name: '回復力',
    icon: '💪',
    role: 'runner',
    tier: 1,
    desc: '負傷時の移動速度低下が20%軽減される',
    effect: { slowResistance: 0.2 }
  },
  'adrenaline': {
    name: 'アドレナリン',
    icon: '⚡',
    role: 'runner',
    tier: 2,
    desc: '仲間が捕まると3秒間移動速度+15%',
    effect: { teamBoost: { speed: 1.15, duration: 3 } }
  },
  'spine_chill': {
    name: '背筋の寒気',
    icon: '❄️',
    role: 'runner',
    tier: 2,
    desc: '鬼が近い時、画面に警告表示。反応速度+10%',
    effect: { proximityWarning: true, reactionBoost: 1.1 }
  },
  'dead_hard': {
    name: 'デッドハード',
    icon: '🛡️',
    role: 'runner',
    tier: 3,
    desc: '攻撃を受ける直前にEを押すと1秒間無敵。CD: 60秒',
    effect: { evasionAbility: true, evasionCD: 60 }
  },
  'borrowed_time': {
    name: '借りた時間',
    icon: '⏰',
    role: 'runner',
    tier: 2,
    desc: '牢屋から救出された後、8秒間攻撃を受けない',
    effect: { rescueInvuln: 8 }
  },
  'sprint_burst': {
    name: 'スプリントバースト',
    icon: '🏃',
    role: 'runner',
    tier: 2,
    desc: '移動開始時、3秒間移動速度+25%（スタミナ消費+20%）',
    effect: { sprintBoost: { speed: 1.25, duration: 3, staminaCost: 0.2 } }
  },
  'self_care': {
    name: 'セルフケア',
    icon: '🏥',
    role: 'runner',
    tier: 1,
    desc: '負傷状態を自分で回復できる（時間がかかる）',
    effect: { selfHeal: true, healTime: 8 }
  },
  'spine_chill_advanced': {
    name: '背筋の寒気・改',
    icon: '❄️❄️',
    role: 'runner',
    tier: 3,
    desc: '鬼の位置を常に感知。反応速度+20%',
    effect: { constantTracking: true, reactionBoost: 1.2 }
  },

  // ===== ONI PERKS =====
  'bamboozle': {
    name: 'バンブーズル',
    icon: '🚪',
    role: 'oni',
    tier: 2,
    desc: '窓からの脱出を一時的に封鎖。効果時間: 12秒',
    effect: { windowBlock: { duration: 12 } }
  },
  'monitor_abuse': {
    name: 'モニター・アビューズ',
    icon: '👁️',
    role: 'oni',
    tier: 2,
    desc: 'テラーラディウス範囲+20%。ただし視界は-15%',
    effect: { terrorRadius: 1.2, visionRange: 0.85 }
  },
  'hex_ruin': {
    name: 'ヘックス：破滅',
    icon: '🔮',
    role: 'oni',
    tier: 3,
    desc: 'ジェネレータ修理速度-25%。ジェネレータ位置を常に表示',
    effect: { genRepairSlow: 0.75, genTracking: true }
  },
  'nurses_calling': {
    name: 'ナースの呼び声',
    icon: '📞',
    role: 'oni',
    tier: 2,
    desc: '負傷した逃げの位置を感知。範囲: 20m',
    effect: { injuredTracking: { range: 20 } }
  },
  'bloodhound': {
    name: 'ブラッドハウンド',
    icon: '🐕',
    role: 'oni',
    tier: 1,
    desc: '血痕を3秒間追跡可能。移動速度+5%',
    effect: { bloodTrail: { duration: 3 }, speedBoost: 1.05 }
  },
  'stridor': {
    name: 'ストライダー',
    icon: '👂',
    role: 'oni',
    tier: 1,
    desc: '逃げの息遣いが聞こえやすくなる。範囲: 24m',
    effect: { breathTracking: { range: 24 } }
  },
  'infectious_fright': {
    name: '感染する恐怖',
    icon: '😱',
    role: 'oni',
    tier: 2,
    desc: '逃げを攻撃すると、その周囲の逃げも一時的に位置が表示される',
    effect: { cascadingReveal: { range: 12, duration: 4 } }
  },
  'play_with_your_food': {
    name: 'おもちゃで遊ぶ',
    icon: '🎮',
    role: 'oni',
    tier: 2,
    desc: 'チェイス中、攻撃速度+10%。チェイス終了時リセット',
    effect: { chaseAttackBoost: 1.1 }
  },

  // ===== TRAITOR PERKS =====
  'deception': {
    name: '詐欺',
    icon: '🎭',
    role: 'traitor',
    tier: 2,
    desc: '密告時に虚偽の位置を送信可能。確率: 40%',
    effect: { falseReport: { chance: 0.4 } }
  },
  'sabotage_expert': {
    name: 'サボタージュの達人',
    icon: '💣',
    role: 'traitor',
    tier: 2,
    desc: 'ジェネレータ破壊速度+30%。爆発範囲+20%',
    effect: { sabotageSpeed: 1.3, explosionRange: 1.2 }
  },
  'insider': {
    name: 'インサイダー',
    icon: '🕵️',
    role: 'traitor',
    tier: 3,
    desc: '逃げの位置を常に把握。鬼への密告が自動化される',
    effect: { constantTracking: true, autoReport: true }
  },
  'smoke_screen': {
    name: 'スモークスクリーン',
    icon: '💨',
    role: 'traitor',
    tier: 2,
    desc: '密告時にスモーク展開。逃げの視界を一時的に奪う',
    effect: { reportSmoke: { duration: 3, range: 8 } }
  },
};

export class PerkSystem {
  constructor() {
    this.selectedPerks = [];
    this.maxPerks = 3;  // Maximum perks per loadout
    this.perkPoints = 0;
  }

  // ===== Perk Selection =====
  selectPerk(perkId, role) {
    if (!PERKS[perkId]) return false;
    if (PERKS[perkId].role !== role) return false;
    if (this.selectedPerks.length >= this.maxPerks) return false;
    if (this.selectedPerks.includes(perkId)) return false;

    this.selectedPerks.push(perkId);
    return true;
  }

  deselectPerk(perkId) {
    const idx = this.selectedPerks.indexOf(perkId);
    if (idx >= 0) {
      this.selectedPerks.splice(idx, 1);
      return true;
    }
    return false;
  }

  clearLoadout() {
    this.selectedPerks = [];
  }

  // ===== Perk Application =====
  applyPerksToPlayer(player) {
    const appliedEffects = {};
    
    this.selectedPerks.forEach(perkId => {
      const perk = PERKS[perkId];
      if (perk && perk.effect) {
        Object.assign(appliedEffects, perk.effect);
      }
    });

    player.perkEffects = appliedEffects;
    return appliedEffects;
  }

  // ===== Perk Filtering =====
  getPerksByRole(role) {
    return Object.entries(PERKS)
      .filter(([_, perk]) => perk.role === role)
      .map(([id, perk]) => ({ id, ...perk }));
  }

  getPerksByTier(tier) {
    return Object.entries(PERKS)
      .filter(([_, perk]) => perk.tier === tier)
      .map(([id, perk]) => ({ id, ...perk }));
  }

  // ===== Loadout Persistence =====
  saveLoadout(name) {
    const loadout = {
      name,
      perks: [...this.selectedPerks],
      timestamp: Date.now()
    };
    const saved = JSON.parse(localStorage.getItem('perkLoadouts') || '[]');
    saved.push(loadout);
    localStorage.setItem('perkLoadouts', JSON.stringify(saved));
    return loadout;
  }

  loadLoadout(name) {
    const saved = JSON.parse(localStorage.getItem('perkLoadouts') || '[]');
    const loadout = saved.find(l => l.name === name);
    if (loadout) {
      this.selectedPerks = [...loadout.perks];
      return true;
    }
    return false;
  }

  getSavedLoadouts() {
    return JSON.parse(localStorage.getItem('perkLoadouts') || '[]');
  }

  // ===== Perk Synergy =====
  // Check if selected perks have good synergy
  calculateSynergy() {
    let synergy = 0;
    
    // Example synergies
    if (this.selectedPerks.includes('dead_hard') && this.selectedPerks.includes('resilience')) {
      synergy += 0.15;  // Good defensive combo
    }
    if (this.selectedPerks.includes('sprint_burst') && this.selectedPerks.includes('adrenaline')) {
      synergy += 0.2;   // Offensive combo
    }
    if (this.selectedPerks.includes('hex_ruin') && this.selectedPerks.includes('monitor_abuse')) {
      synergy += 0.15;  // Control combo
    }

    return Math.min(1.0, synergy);
  }

  // ===== Perk Statistics =====
  getPerkStats() {
    const stats = {
      totalPerks: Object.keys(PERKS).length,
      runnerPerks: this.getPerksByRole('runner').length,
      oniPerks: this.getPerksByRole('oni').length,
      traitorPerks: this.getPerksByRole('traitor').length,
      selectedCount: this.selectedPerks.length,
      synergy: this.calculateSynergy()
    };
    return stats;
  }
}

// Export singleton instance
export const perkSystem = new PerkSystem();
