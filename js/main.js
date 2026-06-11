// ===== Main: screens, lobby, matchmaking, game loop =====
import { Game } from './game.js';
import { Input } from './input.js';
import { NetHost, NetClient } from './network.js';
import { CONFIG, ROLES, ROLE_INFO } from './config.js';
import { $, show, switchScreen, isTouchDevice, pick } from './utils.js';
import { botName } from './bots.js';

let input = null;
let game = null;
let net = null;          // NetHost or NetClient
let isHost = false;
let localId = 'local';
let roster = [];         // [{id, name, isBot}]
let lastRoles = null;
let rafId = 0;
let solo = false;

// ---------- helpers ----------
function myName() {
  const v = $('input-name').value.trim();
  return v || 'プレイヤー';
}
function saveName() { try { localStorage.setItem('wtag_name', $('input-name').value); } catch (e) {} }
function loadName() {
  try {
    const n = localStorage.getItem('wtag_name');
    if (n) $('input-name').value = n;
  } catch (e) {}
}

function setLoading(on, text = '接続中…') {
  $('loading-text').textContent = text;
  show($('loading-overlay'), on);
}

function fillBots() {
  while (roster.length < CONFIG.PLAYERS) {
    roster.push({ id: 'bot' + roster.length + '_' + Math.random().toString(36).slice(2, 6), name: botName(), isBot: true });
  }
}

function renderLobby() {
  const el = $('lobby-players');
  el.innerHTML = '';
  const view = [...roster];
  fillBotsView(view);
  view.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row' + (p.isBot ? ' is-bot' : '');
    row.innerHTML = `<span class="p-icon">${p.isBot ? '🤖' : '🧑'}</span>
      <span class="p-name">${escapeHtml(p.name)}</span>
      <span class="p-tag">${p.id === localId ? 'あなた' : p.isBot ? 'AI' : 'プレイヤー'}</span>`;
    el.appendChild(row);
  });
}
function fillBotsView(view) {
  let n = 0;
  while (view.length < CONFIG.PLAYERS) view.push({ id: 'v' + n++, name: 'AIボット（空き枠）', isBot: true });
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function assignRoles() {
  const ids = roster.map(r => r.id);
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  const roles = {};
  roles[shuffled[0]] = ROLES.ONI;
  roles[shuffled[1]] = ROLES.TRAITOR;
  for (let i = 2; i < shuffled.length; i++) roles[shuffled[i]] = ROLES.RUNNER;
  return roles;
}

// ---------- game lifecycle ----------
function startGame(roles) {
  lastRoles = roles;
  switchScreen('game');
  if (game) { game.dispose(); game = null; }
  game = new Game({
    isHost,
    localId,
    roster,
    net,
    roles,
    onEnd: (winner, stats) => showResult(winner, roles, stats),
  });
  if (!input) input = new Input();
  let last = performance.now();
  cancelAnimationFrame(rafId);
  const loop = (now) => {
    if (!game) return;
    const dt = (now - last) / 1000;
    last = now;
    game.frame(dt, input.poll());
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function showResult(winner, roles, stats) {
  cancelAnimationFrame(rafId);
  const myRole = roles[localId];
  const iWon = (winner === 'oni') === (myRole === ROLES.ONI || myRole === ROLES.TRAITOR);
  const title = $('result-title');
  title.textContent = iWon ? '🎉 勝利！' : '😢 敗北…';
  title.className = iWon ? 'win' : 'lose';
  $('result-desc').textContent = winner === 'oni'
    ? '👹 人狼チームが全ての逃げを捕まえた！'
    : '🏃 逃げチームが時間まで生き延びた！';
  // role reveal + stats
  const el = $('result-players');
  el.innerHTML = '';
  roster.forEach(r => {
    const info = ROLE_INFO[roles[r.id]];
    const s = stats ? stats.find(p => p.id === r.id) : null;
    const score = s ? s.score : 0;
    const detail = s ? (roles[r.id] === ROLES.ONI ? `捕獲: ${s.captures}` : `救出: ${s.rescues}${s.escaped ? ' (脱出)' : ''}`) : '';
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<span class="p-icon">${info.icon}</span>
      <span class="p-name">${escapeHtml(r.name)}</span>
      <span class="p-tag">${info.name}</span>
      <span class="p-score" style="margin-left:auto; color:#ffd166; font-weight:bold;">${score}pts</span>
      <span class="p-detail" style="font-size:11px; color:#888; margin-left:8px;">${detail}</span>`;
    el.appendChild(row);
  });
  show($('btn-again'), isHost || solo);
  switchScreen('result');
  if (game) { game.dispose(); game = null; }
}

function backToTitle() {
  cancelAnimationFrame(rafId);
  if (game) { game.dispose(); game = null; }
  if (net) { net.destroy(); net = null; }
  roster = [];
  solo = false;
  isHost = false;
  localId = 'local';
  switchScreen('title');
}

// ---------- solo ----------
function startSolo() {
  saveName();
  solo = true;
  isHost = true;
  localId = 'local';
  net = null;
  roster = [{ id: localId, name: myName(), isBot: false }];
  fillBots();
  startGame(assignRoles());
}

// ---------- host flow ----------
function createRoom() {
  saveName();
  setLoading(true, 'ルーム作成中…');
  isHost = true;
  solo = false;
  localId = 'host';
  roster = [{ id: localId, name: myName(), isBot: false }];
  net = new NetHost(myName(), {
    onReady: (code) => {
      setLoading(false);
      $('lobby-code').textContent = code;
      $('lobby-status').textContent = '';
      show($('btn-start'), true);
      renderLobby();
      switchScreen('lobby');
    },
    onJoin: (peerId, name) => {
      if (roster.length >= CONFIG.PLAYERS) {
        net.sendTo(peerId, { t: 'room_full' });
        return;
      }
      roster.push({ id: peerId, name, isBot: false });
      renderLobby();
      net.broadcast({ t: 'lobby', roster: roster.map(r => ({ id: r.id, name: r.name, isBot: r.isBot })) });
      $('lobby-status').textContent = `${name} が参加しました！`;
    },
    onLeave: (peerId) => {
      const left = roster.find(r => r.id === peerId);
      roster = roster.filter(r => r.id !== peerId);
      renderLobby();
      net.broadcast({ t: 'lobby', roster });
      if (left) $('lobby-status').textContent = `${left.name} が退出しました`;
      // in-game: replace with bot behavior (player just stops moving; simple approach)
    },
    onData: (peerId, d) => {
      if (game) game.handleNetEvent(d);
    },
    onError: (e) => {
      setLoading(false);
      alert('接続エラー: ' + (e.type || e.message || e));
    },
  });
}

function hostStartGame() {
  fillBots();
  const roles = assignRoles();
  net.broadcast({
    t: 'start',
    roster: roster.map(r => ({ id: r.id, name: r.name, isBot: r.isBot })),
    roles,
  });
  startGame(roles);
}

// ---------- client flow ----------
function joinRoom(code) {
  if (!code || code.length < 4) { alert('ルームコードを入力してね'); return; }
  saveName();
  setLoading(true, 'ルームに接続中…');
  isHost = false;
  solo = false;
  net = new NetClient(code, myName(), {
    onConnected: (peerId) => {
      localId = peerId;
      setLoading(false);
      $('lobby-code').textContent = code.toUpperCase();
      show($('btn-start'), false);
      $('lobby-status').textContent = 'ホストの開始を待っています…';
      switchScreen('lobby');
    },
    onData: (d) => {
      if (d.t === 'lobby') {
        roster = d.roster;
        renderLobby();
      } else if (d.t === 'start') {
        roster = d.roster;
        startGame(d.roles);
      } else if (d.t === 'room_full') {
        alert('ルームが満員です');
        backToTitle();
      } else if (game) {
        game.handleNetEvent(d);
      }
    },
    onClose: () => {
      alert('ホストとの接続が切れました');
      backToTitle();
    },
    onError: (e) => {
      setLoading(false);
      if (e.type === 'peer-unavailable') alert('ルームが見つかりません。コードを確認してね。');
      else if (e.type === 'timeout') alert('接続がタイムアウトしました');
      else alert('接続エラー: ' + (e.type || e.message || e));
      backToTitle();
    },
  });
}

// ---------- UI wiring ----------
loadName();

$('btn-solo').addEventListener('click', startSolo);
$('btn-create').addEventListener('click', createRoom);
$('btn-join').addEventListener('click', () => joinRoom($('input-room').value.trim()));
$('btn-howto').addEventListener('click', () => switchScreen('howto'));
$('btn-howto-back').addEventListener('click', () => switchScreen('title'));
$('btn-leave').addEventListener('click', backToTitle);
$('btn-to-title').addEventListener('click', backToTitle);

$('btn-start').addEventListener('click', () => { if (isHost && net) hostStartGame(); });

$('btn-again').addEventListener('click', () => {
  if (solo) {
    roster = [{ id: localId, name: myName(), isBot: false }];
    fillBots();
    startGame(assignRoles());
  } else if (isHost && net) {
    hostStartGame();
  }
});

$('btn-copy-link').addEventListener('click', async () => {
  const code = $('lobby-code').textContent;
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = `人狼鬼ごっこで遊ぼう！🐺\nルームコード: ${code}\n${url}`;
  try {
    if (navigator.share && isTouchDevice()) {
      await navigator.share({ title: '人狼鬼ごっこ', text, url });
    } else {
      await navigator.clipboard.writeText(text);
      $('lobby-status').textContent = '招待リンクをコピーしました！';
    }
  } catch (e) {
    // fallback
    prompt('この内容を友達に送ってね:', text);
  }
});

// Auto-join from invite link (?room=XXXX)
const params = new URLSearchParams(location.search);
if (params.get('solo') === '1') setTimeout(() => startSolo(), 200); // debug/test quick start
const roomParam = params.get('room');
if (roomParam) {
  $('input-room').value = roomParam.toUpperCase();
  // wait for name input — show a hint
  setTimeout(() => {
    if (confirm(`ルーム ${roomParam.toUpperCase()} に参加しますか？`)) {
      joinRoom(roomParam);
    }
  }, 300);
}

// prevent zoom gestures on mobile
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
