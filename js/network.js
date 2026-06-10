// ===== PeerJS networking: host = room owner, star topology =====
// Room code = suffix of peer id: "wtag-<CODE>"
import { genRoomCode } from './utils.js';

const PREFIX = 'wtag3d-';

export class NetHost {
  constructor(name, callbacks) {
    this.name = name;
    this.cb = callbacks; // {onReady, onJoin, onLeave, onData, onError}
    this.conns = new Map(); // peerId -> conn
    this.code = genRoomCode();
    this.peer = new Peer(PREFIX + this.code, { debug: 1 });
    this.peer.on('open', () => this.cb.onReady(this.code));
    this.peer.on('error', (e) => {
      if (e.type === 'unavailable-id') {
        // regenerate code
        this.code = genRoomCode();
        this.peer = new Peer(PREFIX + this.code, { debug: 1 });
        this.peer.on('open', () => this.cb.onReady(this.code));
        this.peer.on('connection', (c) => this._onConn(c));
        this.peer.on('error', (e2) => this.cb.onError(e2));
      } else this.cb.onError(e);
    });
    this.peer.on('connection', (c) => this._onConn(c));
  }

  _onConn(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      conn.on('data', (d) => {
        if (d.t === 'hello') {
          conn.metadata2 = { name: d.name };
          this.cb.onJoin(conn.peer, d.name);
        } else this.cb.onData(conn.peer, d);
      });
      conn.on('close', () => {
        this.conns.delete(conn.peer);
        this.cb.onLeave(conn.peer);
      });
    });
  }

  broadcast(msg) {
    for (const c of this.conns.values()) {
      if (c.open) c.send(msg);
    }
  }

  sendTo(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c && c.open) c.send(msg);
  }

  // adapter for Game: host broadcasts, doesn't "send"
  send(msg) { this.broadcast(msg); }

  destroy() { try { this.peer.destroy(); } catch (e) {} }
}

export class NetClient {
  constructor(code, name, callbacks) {
    this.cb = callbacks; // {onConnected, onData, onClose, onError}
    this.peer = new Peer({ debug: 1 });
    this.conn = null;
    this.peer.on('open', () => {
      this.conn = this.peer.connect(PREFIX + code.toUpperCase(), { reliable: false, serialization: 'json' });
      const timeout = setTimeout(() => {
        if (!this.conn || !this.conn.open) this.cb.onError({ type: 'timeout' });
      }, 8000);
      this.conn.on('open', () => {
        clearTimeout(timeout);
        this.conn.send({ t: 'hello', name });
        this.cb.onConnected(this.peer.id);
      });
      this.conn.on('data', (d) => this.cb.onData(d));
      this.conn.on('close', () => this.cb.onClose());
      this.conn.on('error', (e) => this.cb.onError(e));
    });
    this.peer.on('error', (e) => this.cb.onError(e));
  }

  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  broadcast(msg) { this.send(msg); } // adapter symmetry
  destroy() { try { this.peer.destroy(); } catch (e) {} }
}
