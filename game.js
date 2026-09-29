/* Monopoli Indonesia — kontroler: mode lawan bot (lokal), online (Firebase), HUD, modal, suara. */
(() => {
  'use strict';
  const E = window.MonoEngine, TL = E.TILES, money = E.money;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const BOT_NAMES = ['Pak Budi', 'Bu Sri', 'Mas Joko', 'Mbak Rina', 'Bang Ucok', 'Kang Asep', 'Daeng Rudi', 'Cak Nur', 'Ning Ayu', 'Uda Rahmat', 'Koh Ahong', 'Bli Made', 'Nona Maria', 'Teh Euis'];
  const LEVEL_NAME = ['', 'Mudah', 'Sedang', 'Sulit'];
  const PCOL = Scene3D.PCOL;
  const MANAGE = ['build', 'sell', 'mort', 'unmort'];
  const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  // pecahan uang kertas (satuan engine = Rp 10rb): [nilai, label, warna]
  const BILLS = [[500, '5JT', '#c9a227'], [100, '1JT', '#d64545'], [50, '500RB', '#2f6fb5'], [20, '200RB', '#3f9e6a'], [10, '100RB', '#8e5bb5'], [5, '50RB', '#a0703f'], [1, '10RB', '#8a8f98']];
  const BILL_IDEAL = { 1: 5, 5: 5, 10: 5, 20: 6, 50: 2, 100: 2, 500: 2 }; // susunan modal awal Monopoli klasik
  /** Pecah uang jadi lembaran: isi pecahan kecil seperti modal awal Monopoli, sisanya pecahan terbesar. */
  function billsOf(cash) {
    let rem = Math.max(0, Math.floor(cash || 0));
    const c = {};
    BILLS.slice().reverse().forEach(([d]) => { const n = Math.min(BILL_IDEAL[d], Math.floor(rem / d)); c[d] = n; rem -= n * d; });
    BILLS.forEach(([d]) => { const n = Math.floor(rem / d); c[d] += n; rem -= n * d; });
    return c;
  }

  let myId = store.get('mn_uid', '');
  if (!myId) { myId = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); store.set('mn_uid', myId); }

  let mode = null;          // 'local' | 'online'
  let g = null;             // state otoritatif (lokal / host)
  let isHost = false, myIdx = -1, tickTimer = null, hk = null;
  let pendingSeq = -1, pendingAt = 0, lastView = null, localCfg = null, watchBots = false, overShown = false, bustShown = false;
  let modal = null, shownCard = 0, pendingCard = null, cardTimer = 0, lastLog = -1;
  let wallet = { cash: null, owned: null, open: false };

  const playerName = () => (store.get('mn_name', '') || 'Pemain').slice(0, 16);
  const Net = {
    db: null, offset: 0, connected: false, code: null, ref: null, host: null, players: {},
    pub: null, subs: [], hostSubs: [], hostGoneAt: 0, hostCheck: null, playersLoaded: false, enteredAt: 0,
  };
  const now = () => Date.now() + Net.offset;

  // ---------- suara (WebAudio sintetis) ----------
  const Snd = {
    ctx: null, on: store.get('mn_snd', true),
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* tanpa suara */ } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    tone(freq, dur, type, vol, delay) {
      if (!this.on || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      gn.gain.setValueAtTime(vol || 0.12, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, delay, freq) {
      if (!this.on || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
      f.type = 'bandpass'; f.frequency.value = freq || 3000; gn.gain.value = vol || 0.3;
      src.buffer = buf; src.connect(f).connect(gn).connect(c.destination); src.start(t);
    },
    dice() { for (let k = 0; k < 7; k++) this.noise(0.05, 0.28, k * 0.09 + Math.random() * 0.04, 1800 + Math.random() * 1500); },
    step() { this.tone(520, 0.05, 'triangle', 0.05); },
    ding() { this.tone(880, 0.15, 'sine', 0.12); this.tone(1320, 0.25, 'sine', 0.1, 0.12); },
    buy() { this.tone(1200, 0.08, 'square', 0.05); this.tone(1800, 0.25, 'triangle', 0.09, 0.08); this.noise(0.15, 0.15, 0.02, 5000); },
    coin() { this.tone(1500, 0.07, 'triangle', 0.07); this.tone(2000, 0.15, 'triangle', 0.07, 0.07); },
    pay() { this.tone(500, 0.1, 'triangle', 0.08); this.tone(380, 0.18, 'triangle', 0.07, 0.08); },
    build() { this.noise(0.06, 0.3, 0, 900); this.noise(0.06, 0.3, 0.12, 900); this.tone(700, 0.1, 'square', 0.03, 0.2); },
    card() { this.noise(0.12, 0.25, 0, 2400); this.tone(990, 0.2, 'sine', 0.06, 0.1); },
    jail() { [300, 250, 200].forEach((f, k) => this.tone(f, 0.25, 'sawtooth', 0.05, k * 0.18)); },
    bust() { [520, 440, 370, 300].forEach((f, k) => this.tone(f, 0.3, 'triangle', 0.1, k * 0.16)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.35, 'triangle', 0.1, k * 0.11)); },
  };

  // ---------- util UI ----------
  let toastT = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function lobbyError(msg) { const e = $('lobbyError'); e.hidden = !msg; e.innerHTML = msg || ''; }
  function permError(err) {
    console.error(err);
    const m = err && err.message ? err.message : err;
    lobbyError(`<b>Tidak bisa mengakses database.</b><br>${esc(m)}<br>Pastikan Realtime Database aktif dan Rules mengizinkan baca/tulis node <code>monopoly</code> (lihat README).`);
    if (mode === 'online') toast('Gagal akses database: ' + m);
  }
  function readCfg(online) {
    return {
      cash: +$('optCash').value, rounds: +$('optRounds').value, auction: +$('optAuction').value,
      turn: online ? +$('optTurn').value : 0, speed: online ? 1 : +$('optSpeed').value, build: gameMode,
    };
  }
  const MODE_NAME = { classic: '🚩 Sewa Bendera', direct: '🏠 Langsung Bangun' };
  const modeOf = c => (c && c.build === 'direct' ? 'direct' : 'classic');
  let gameMode = store.get('mn_mode', 'classic') === 'direct' ? 'direct' : 'classic';
  function setMode(m) {
    gameMode = m; store.set('mn_mode', m);
    document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  }
  function showOverlay(card) {
    $('overlay').hidden = !card;
    ['menuCard', 'overCard'].forEach(id => { $(id).hidden = id !== card; });
  }
  const pname = (v, i) => (i === myIdx ? 'Kamu' : v.players[i] ? v.players[i].name : '?');
  const chip = (v, i) => `<b class="pc" style="--c:${PCOL[i]}">${esc(pname(v, i))}</b>`;
  const tileChip = t => {
    const T = TL[t];
    const col = T.t === 'prop' ? E.GROUPS[T.g].c : T.t === 'rail' ? '#555' : '#8aa';
    return `<span class="tc" data-tile="${t}"><i style="background:${col}"></i>${esc(T.n)}</span>`;
  };

  // ---------- loop host / lokal ----------
  function authoritative() { return !!g && (mode === 'local' || isHost); }
  function resetHk() { hk = { rid: g ? g.rid : 0, mid: g ? g.mid : 0, animUntil: 0, seq: -1, start: 0, delay: 0 }; }

  function hostTick() {
    if (!authoritative() || g.phase !== 'play') return;
    const t = now();
    if (!hk) resetHk();
    if (g.rid !== hk.rid || g.mid !== hk.mid) {
      hk.animUntil = t + E.animTime(g.mid !== hk.mid ? g.mv : [], g.rid !== hk.rid) + 150;
      hk.rid = g.rid; hk.mid = g.mid;
    }
    const w = E.whoActs(g);
    if (w < 0) return;
    const p = g.players[w];
    if (g.seq !== hk.seq) {
      hk.seq = g.seq; hk.start = Math.max(t, hk.animUntil);
      const fast = watchBots || (g.cfg.speed || 1) > 1;
      hk.delay = (g.step === 'auction' ? 450 + Math.random() * 500 : g.trade ? 1400 : 600 + Math.random() * 700) * (fast ? 0.35 : 1);
      let dl = 0;
      if (!p.bot && g.cfg.turn) dl = hk.start + (g.step === 'auction' ? Math.min(15, g.cfg.turn) : g.cfg.turn) * 1000;
      if ((g.deadline || 0) !== dl) { g.deadline = dl; commit(); return; }
    }
    if (t < hk.animUntil) return;
    if (p.bot) {
      if (t - hk.start < hk.delay) return;
      const d = E.botDecide(g, w);
      if (!d || E.act(g, w, d.t, d.d)) forceAct(w);
      commit();
    } else if ((p.away || p.leave) && t - hk.start > 1500) { autoAct(w); commit(); }
    else if (g.deadline && t >= g.deadline) {
      if (w === myIdx && mode === 'online') toast('Waktu habis — aksi otomatis');
      autoAct(w); commit();
    }
  }
  function autoAct(w) {
    const d = E.autoDecide(g, w);
    if (!d || E.act(g, w, d.t, d.d)) forceAct(w);
  }
  function forceAct(w) {
    for (const t of ['tradeno', 'pass', 'end', 'decline', 'pay', 'roll', 'bankrupt']) if (!E.act(g, w, t, {})) return;
  }
  function commit() {
    g.v++;
    if (mode === 'online' && isHost) publish();
    render();
  }
  function startTicker() { if (!tickTimer) tickTimer = setInterval(hostTick, 120); }
  function stopTicker() { clearInterval(tickTimer); tickTimer = null; }

  function botSeats(n) { return { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 3, 4], 5: [1, 2, 3, 4, 5] }[n]; }
  function pickBotNames(n) { return BOT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, n); }

  // ---------- mode lokal ----------
  function startLocal(cfg, nBots, level) {
    leaveCurrent(true);
    mode = 'local'; isHost = false; watchBots = false; bustShown = false; overShown = false;
    localCfg = { cfg, nBots, level };
    g = E.createGame(cfg);
    E.addPlayer(g, 0, { id: myId, name: playerName() });
    const names = pickBotNames(nBots);
    botSeats(nBots).forEach((seat, k) => E.addPlayer(g, seat, { id: 'bot' + k, name: names[k], bot: level || 1 + Math.floor(Math.random() * 3) }));
    E.startGame(g);
    resetHk();
    enterGameUI();
    commit();
    startTicker();
  }

  // ---------- online: Firebase ----------
  const R = p => Net.db.ref('monopoly/' + p);
  const SV = () => firebase.database.ServerValue.TIMESTAMP;

  function netInit() {
    if (Net.db) return true;
    if (!window.firebase || !window.MONO_FIREBASE_CONFIG) { permError('Firebase SDK gagal dimuat (cek koneksi internet).'); return false; }
    try {
      const app = firebase.apps.find(a => a.name === 'monopoly') || firebase.initializeApp(window.MONO_FIREBASE_CONFIG, 'monopoly');
      Net.db = app.database();
    } catch (e) { permError(e); return false; }
    Net.db.ref('.info/serverTimeOffset').on('value', s => { Net.offset = s.val() || 0; });
    Net.db.ref('.info/connected').on('value', s => {
      Net.connected = !!s.val();
      $('connDot').className = Net.connected ? 'on' : '';
      $('connText').textContent = Net.connected ? 'Terhubung ke server' : 'Menghubungkan…';
      if (Net.connected && Net.ref) armPresence();
    });
    return true;
  }
  function armPresence() {
    const me = Net.ref.child('players/' + myId);
    me.child('conn').onDisconnect().set(false);
    me.update({ name: playerName(), conn: true, t: SV() }).catch(permError);
  }
  function refreshRooms() {
    if (!netInit()) return;
    const el = $('roomList');
    el.innerHTML = '<div class="muted">Memuat…</div>';
    const cutoff = now() - 4 * 3600e3;
    R('rooms').orderByChild('created').startAt(cutoff).limitToLast(20).once('value').then(s => {
      const rows = [];
      s.forEach(c => { const r = c.val(); if (r && r.host && r.status !== 'ended') rows.push([c.key, r]); });
      rows.reverse();
      el.innerHTML = rows.length ? rows.map(([k, r]) => {
        const c = r.cfg || {};
        return `<button class="roomRow" data-code="${esc(k)}"><b>${esc(k)}</b><span>${esc(r.hn || '?')}<br><small>${MODE_NAME[modeOf(c)]} · Modal ${money(c.cash)}${c.rounds ? ` · ${c.rounds} putaran` : ''}</small></span>
          <small>${r.n || 0} online<br>${r.status === 'lobby' ? 'Menunggu' : 'Bermain'}</small></button>`;
      }).join('') : '<div class="muted">Belum ada room. Buat room baru!</div>';
    }).catch(permError);
    R('rooms').orderByChild('created').endAt(cutoff).limitToFirst(20).once('value')
      .then(s => s.forEach(c => { c.ref.remove(); })).catch(() => {});
  }
  function genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let k = 0; k < 5; k++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  async function createRoom() {
    if (!netInit()) return;
    lobbyError('');
    const cfg = readCfg(true);
    for (let k = 0; k < 6; k++) {
      const code = genCode();
      let res;
      try { res = await R('rooms/' + code).transaction(cur => (cur ? undefined : { created: now(), status: 'lobby', host: myId, hn: playerName(), n: 1, cfg })); } catch (e) { permError(e); return; }
      if (!res.committed) continue;
      leaveCurrent(true);
      g = E.createGame(cfg);
      E.addPlayer(g, 0, { id: myId, name: playerName() });
      enterRoom(code);
      return;
    }
    lobbyError('Gagal membuat room, coba lagi.');
  }
  async function joinRoom(code) {
    code = String(code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { lobbyError('Kode room harus 5 karakter.'); return; }
    if (!netInit()) return;
    lobbyError('');
    let s;
    try { s = await R('rooms/' + code + '/host').once('value'); } catch (e) { permError(e); return; }
    if (!s.exists()) { lobbyError(`Room <b>${esc(code)}</b> tidak ditemukan.`); return; }
    leaveCurrent(true);
    g = null;
    enterRoom(code);
  }
  function sub(list, ref, ev, fn) { ref.on(ev, fn, e => permError(e)); list.push(() => ref.off(ev, fn)); }
  function enterRoom(code) {
    mode = 'online'; isHost = false; overShown = false;
    Object.assign(Net, { code, ref: R('rooms/' + code), pub: null, players: {}, host: null, hostGoneAt: 0, playersLoaded: false, enteredAt: Date.now() });
    try { history.replaceState(null, '', location.pathname + '?room=' + code); } catch (e) { /* file:// */ }
    armPresence();
    sub(Net.subs, Net.ref.child('host'), 'value', s => onHost(s.val()));
    sub(Net.subs, Net.ref.child('players'), 'value', s => { Net.players = s.val() || {}; Net.playersLoaded = true; onPlayers(); });
    sub(Net.subs, Net.ref.child('pub'), 'value', s => {
      const d = s.val();
      if (!d) return;
      try { Net.pub = JSON.parse(d); } catch (e) { return; }
      if (!isHost) render();
    });
    $('chatList').innerHTML = '';
    sub(Net.subs, Net.ref.child('chat').limitToLast(40), 'child_added', s => addChat(s.val()));
    Net.hostCheck = setInterval(checkHost, 2000);
    enterGameUI();
    render();
  }
  function onHost(h) {
    Net.host = h; Net.hostGoneAt = 0;
    if (h === myId && !isHost) becomeHost();
    else if (h !== myId && isHost) resignHost();
  }
  async function becomeHost() {
    isHost = true;
    if (!g) {
      try { const f = await Net.ref.child('full').once('value'); if (f.val()) g = JSON.parse(f.val()); } catch (e) { console.error(e); }
      if (!g) {
        const c = await Net.ref.child('cfg').once('value').catch(() => null);
        g = E.createGame((c && c.val()) || readCfg(true));
      }
      if (Net.pub) toast('Host terputus — kamu sekarang host room ini.');
    }
    if (!isHost || !Net.ref) return;
    const ar = Net.ref.child('act');
    const fn = s => { const a = s.val(); s.ref.remove(); handleAct(a); };
    ar.on('child_added', fn);
    Net.hostSubs.push(() => ar.off('child_added', fn));
    Net.ref.update({ hn: playerName() }).catch(() => {});
    resetHk();
    syncPlayers(true);
    commit();
    startTicker();
  }
  function resignHost() {
    isHost = false; g = null;
    Net.hostSubs.forEach(f => f()); Net.hostSubs = [];
    stopTicker();
    render();
  }
  function handleAct(a) {
    if (!a || !authoritative()) return;
    const i = g.players.findIndex(p => p && p.id === a.u);
    if (i < 0) return;
    if (!MANAGE.includes(a.t) && a.q !== g.seq) return;
    if (!E.act(g, i, a.t, a.d || {})) commit();
  }
  function publish() {
    if (!Net.ref || !g) return;
    Net.ref.update({
      pub: JSON.stringify(E.publicState(g)),
      full: JSON.stringify(g),
      status: g.phase === 'lobby' ? 'lobby' : g.phase === 'over' ? 'over' : 'playing',
      n: Object.values(Net.players).filter(p => p && p.conn).length || 1,
    }).catch(permError);
  }
  function onPlayers() {
    if (isHost) syncPlayers();
    checkHost();
    render();
  }
  function freeSeat(game) {
    for (const i of [0, 3, 1, 4, 2, 5]) if (!game.players[i]) return i;
    return -1;
  }
  /** Host: cocokkan kursi dengan daftar pemain di room. */
  function syncPlayers(silent) {
    if (!authoritative() || !Net.playersLoaded) return;
    const ps = Net.players;
    let ch = false;
    g.players.forEach((s, i) => {
      if (!s || s.bot) return;
      if (s.id === myId) { if (s.away || s.leave) { s.away = false; s.leave = false; ch = true; } return; }
      const p = ps[s.id];
      if (!p || !p.name) {
        if (g.phase === 'play' && !s.out) { s.leave = true; E.removePlayer(g, i); ch = true; }
        else if (g.phase !== 'play') { g.players[i] = null; ch = true; }
        return;
      }
      const away = !p.conn;
      if (s.away !== away) { s.away = away; ch = true; }
      if (g.phase === 'lobby' && p.name !== s.name) { s.name = String(p.name).slice(0, 16); ch = true; }
    });
    if (g.phase === 'lobby') {
      Object.keys(ps).forEach(id => {
        const p = ps[id];
        if (!p || !p.conn || !p.name || g.players.some(s => s && s.id === id)) return;
        const i = freeSeat(g);
        if (i < 0) return; // penuh → penonton
        E.addPlayer(g, i, { id, name: p.name });
        ch = true;
      });
    }
    if (ch && !silent) commit();
  }
  function checkHost() {
    if (mode !== 'online' || isHost || !Net.host || !Net.connected) return;
    const hp = Net.players[Net.host];
    if (hp && hp.conn) { Net.hostGoneAt = 0; return; }
    if (!Net.hostGoneAt) { Net.hostGoneAt = Date.now(); return; }
    if (Date.now() - Net.hostGoneAt < 6000) return;
    const cands = Object.keys(Net.players).filter(id => Net.players[id] && Net.players[id].conn).sort();
    if (cands[0] !== myId) return;
    const old = Net.host;
    Net.hostGoneAt = Date.now();
    Net.ref.child('host').transaction(cur => (cur === old ? myId : undefined)).catch(console.error);
  }

  function sendAction(t, d) {
    const v = currentView();
    if (!v || myIdx < 0) return;
    if (authoritative()) {
      const err = E.act(g, myIdx, t, d);
      if (err) toast(err); else commit();
      return;
    }
    const mg = MANAGE.includes(t);
    if (!mg && pendingSeq === v.seq) return;
    try { // validasi lokal pada salinan state agar pesan error langsung muncul
      const c = JSON.parse(JSON.stringify(v));
      c.decks = { chance: [0], chest: [0] }; c.tmem = {};
      const err = E.act(c, myIdx, t, d);
      if (err) { toast(err); return; }
    } catch (e) { /* biarkan host yang memutuskan */ }
    if (!mg) { pendingSeq = v.seq; pendingAt = Date.now(); }
    Net.ref.child('act').push({ u: myId, q: v.seq, t, d: d || null }).catch(permError);
    render();
  }
  function sendChat(m) {
    m = String(m || '').trim().slice(0, 160);
    if (!m || !Net.ref) return;
    Net.ref.child('chat').push({ n: playerName(), m, t: SV() }).catch(permError);
  }
  function addChat(c) {
    if (!c || !c.m) return;
    const el = $('chatList'), d = document.createElement('div');
    d.innerHTML = `<b>${esc(c.n)}:</b> ${esc(c.m)}`;
    el.appendChild(d); el.scrollTop = el.scrollHeight;
    if ($('side').hidden && Date.now() - Net.enteredAt > 3000) toast(`💬 ${c.n}: ${c.m}`);
  }

  function leaveCurrent(silent) {
    stopTicker();
    if (mode === 'online' && Net.ref) {
      const ref = Net.ref;
      if (isHost && g) {
        const i = g.players.findIndex(p => p && p.id === myId);
        if (i >= 0) { g.players[i].leave = true; E.removePlayer(g, i); }
        g.v++; publish();
        const others = Object.keys(Net.players).filter(id => id !== myId && Net.players[id] && Net.players[id].conn).sort();
        if (others.length) ref.child('host').set(others[0]).catch(() => {});
        else ref.update({ status: 'ended' }).catch(() => {});
      }
      Net.subs.forEach(f => f()); Net.hostSubs.forEach(f => f());
      Net.subs = []; Net.hostSubs = [];
      ref.child('players/' + myId + '/conn').onDisconnect().cancel().catch(() => {});
      ref.child('players/' + myId).remove().catch(() => {});
      clearInterval(Net.hostCheck);
      Net.ref = null; Net.code = null; Net.pub = null; Net.host = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* file:// */ }
    }
    mode = null; g = null; isHost = false; myIdx = -1; lastView = null; pendingSeq = -1; modal = null; hk = null;
    pendingCard = null; lastLog = -1; wallet = { cash: null, owned: null, open: false };
    $('cardPop').hidden = true; $('modal').hidden = true;
    Scene3D.reset();
    if (!silent) exitGameUI();
  }

  // ---------- tampilan ----------
  function currentView() {
    if (authoritative()) return g;
    if (mode !== 'online') return null;
    return Net.pub;
  }
  function enterGameUI() {
    showOverlay(null);
    $('topbar').hidden = false;
    $('chatBox').hidden = mode !== 'online';
    $('infoRoom').hidden = mode !== 'online';
    if (mode === 'online') $('infoRoom').textContent = '🔗 ' + Net.code;
    $('logList').innerHTML = '';
    $('side').hidden = window.innerWidth < 1280 || !store.get('mn_side', true);
    Scene3D.resetCam();
  }
  function exitGameUI() {
    ['topbar', 'actions', 'status', 'players', 'wallet', 'side', 'lobbyPanel', 'modal', 'cardPop'].forEach(id => { $(id).hidden = true; });
    showOverlay('menuCard');
    if (activeTab === 'online') refreshRooms();
  }

  function render() {
    const v = currentView();
    if (!v) {
      if (mode === 'online') ['lobbyPanel', 'actions', 'status', 'players'].forEach(id => { $(id).hidden = true; });
      return;
    }
    myIdx = v.players.findIndex(p => p && p.id === myId);
    if (pendingSeq >= 0 && (pendingSeq !== v.seq || Date.now() - pendingAt > 3500)) pendingSeq = -1;
    Scene3D.update(v);
    renderPlayers(v);
    renderWallet(v);
    renderStatus(v);
    renderActions(v);
    renderLog(v);
    renderLobby(v);
    renderModal(v);
    checkCard(v);
    playSounds(v, lastView);
    renderOver(v);
    lastView = snap(v);
  }
  function snap(v) {
    return {
      who: E.whoActs(v), own: v.own.filter(o => o >= 0).length, hs: v.hs.reduce((a, b) => a + b, 0),
      jail: v.players.map(p => (p ? p.jail : 0)), out: v.players.filter(p => p && p.out).length,
      cash: myIdx >= 0 ? v.players[myIdx].cash : 0, phase: v.phase, trade: v.trade ? v.trade.id : 0,
    };
  }

  function renderPlayers(v) {
    const el = $('players');
    el.hidden = v.phase === 'lobby';
    if (el.hidden) return;
    const w = E.whoActs(v);
    const worths = v.players.map((p, i) => (p && !p.out ? E.worth(v, i) : -1));
    const maxW = Math.max(1, ...worths);
    const order = worths.map((x, i) => [x, i]).filter(([x]) => x >= 0).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const MEDAL = ['🥇', '🥈', '🥉'];
    const html = v.players.map((p, i) => {
      if (!p) return '';
      const rank = order.indexOf(i);
      const owned = [];
      for (let t = 0; t < 40; t++) if (v.own[t] === i) owned.push(t);
      // chip kecil per properti, berwarna sesuai grupnya
      const chips = owned.map(t => {
        const T = TL[t], col = T.t === 'prop' ? E.GROUPS[T.g].c : T.t === 'rail' ? '#3a3f4a' : '#2f6f8f';
        const full = T.t === 'prop' && E.hasMonopoly(v, i, T.g);
        return `<i class="${v.mg[t] ? 'mg' : ''}${full ? ' full' : ''}" style="background:${col}" title="${esc(T.n)}${v.mg[t] ? ' (digadaikan)' : ''}"></i>`;
      }).join('');
      const tags = [
        p.bot ? `<span class="tg bot" title="Bot ${LEVEL_NAME[p.bot]}">${LEVEL_NAME[p.bot].toUpperCase()}</span>` : '',
        mode === 'online' && p.id === Net.host ? '<span class="tg host">HOST</span>' : '',
        p.away && !p.out ? '<span class="tg off">OFFLINE</span>' : '',
        p.jail && !p.out ? `<span class="tg jail" title="Sisa giliran di penjara">🔒 PENJARA ${Math.max(1, E.JAIL_TURNS + 1 - p.jail)}×</span>` : '',
        p.jc && p.jc.length ? `<span class="tg card" title="Kartu Bebas dari Penjara">🗝 BEBAS${p.jc.length > 1 ? ' ×' + p.jc.length : ''}</span>` : '',
      ].join('');
      const ini = p.name.trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() || '?';
      const turn = i === v.turn && v.phase === 'play' && !p.out, bidding = i === w && !turn && v.phase === 'play';
      const cls = ['pCard', turn ? 'turn' : '', bidding ? 'act' : '', p.out ? 'out' : '', i === myIdx ? 'me' : ''].join(' ');
      const medal = !p.out && rank >= 0 && rank < 3 && order.length > 1 ? `<span class="medal" title="Peringkat kekayaan #${rank + 1}">${MEDAL[rank]}</span>` : '';
      const money2 = p.out ? '<div class="pCash dead">BANGKRUT</div>'
        : `<div class="pCash">${money(p.cash)}<small> · ${owned.length} aset</small></div>
           <div class="pWorth" title="Total kekayaan ${money(worths[i])}"><i style="width:${Math.round(worths[i] / maxW * 100)}%"></i></div>`;
      const ribbon = turn ? '<div class="pTurn">GILIRAN</div>' : bidding ? `<div class="pTurn act">${v.trade ? 'MENJAWAB' : 'MENAWAR'}</div>` : '';
      return `<div class="${cls}" data-p="${i}" style="--c:${PCOL[i]}">
        <div class="pAv"><span>${esc(ini)}</span>${p.bot ? '<em>🤖</em>' : ''}</div>
        <div class="pMain">
          <div class="pName"><b>${esc(p.name)}</b>${i === myIdx ? '<small>kamu</small>' : ''}${medal}</div>
          ${money2}
          ${chips || tags ? `<div class="pMeta">${chips ? `<span class="pProps">${chips}</span>` : ''}${tags}</div>` : ''}
        </div>${ribbon}
        <div class="pt" data-tp="${i}"><i></i></div></div>`;
    }).join('');
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  // ---------- dompet: tumpukan uang kertas + kartu hak milik ----------
  function renderWallet(v) {
    const el = $('wallet');
    const me = myIdx >= 0 ? v.players[myIdx] : null;
    const show = v.phase === 'play' && me && !me.out;
    el.hidden = !show;
    $('btnWallet').hidden = !show;
    if (!show) { wallet.cash = null; wallet.owned = null; return; }
    el.classList.toggle('open', wallet.open);
    el.classList.toggle('min', !!store.get('mn_wmin', false));

    // uang + animasi selisih
    $('wCash').textContent = money(me.cash);
    if (wallet.cash != null && wallet.cash !== me.cash) {
      const d = me.cash - wallet.cash, dl = $('wDelta');
      dl.textContent = (d > 0 ? '+' : '−') + money(Math.abs(d));
      dl.className = d > 0 ? 'up' : 'down';
      void dl.offsetWidth; dl.classList.add('show');
    }
    wallet.cash = me.cash;
    const bc = billsOf(me.cash);
    const bh = BILLS.map(([d, lb, col]) => {
      const n = bc[d], layers = Math.min(n, 9);
      let ls = '';
      for (let k = 0; k < layers; k++) ls += `<i class="bill" style="--i:${k};--r:${((k * 37) % 7) - 3}deg">${k === layers - 1 ? `<em>${lb}</em>` : ''}</i>`;
      return `<div class="bstack${n ? '' : ' zero'}" style="--c:${col}" title="${money(d)} × ${n} lembar">
        <div class="blayers" style="--h:${layers}">${ls || '<i class="bill ghost"></i>'}</div><b>×${n}</b></div>`;
    }).join('');
    if ($('wBills').dataset.h !== bh) { $('wBills').dataset.h = bh; $('wBills').innerHTML = bh; }

    // kartu hak milik, dikelompokkan per warna / stasiun / utilitas
    const owned = [];
    for (let t = 0; t < 40; t++) if (v.own[t] === myIdx) owned.push(t);
    const fresh = wallet.owned ? owned.filter(t => !wallet.owned.includes(t)) : [];
    wallet.owned = owned;
    $('wCount').textContent = (owned.length ? `(${owned.length})` : '') + (me.jc && me.jc.length ? ` · 🗝 ${me.jc.length} kartu` : '');
    const groups = [];
    E.GROUPS.forEach((G, k) => { const ts = owned.filter(t => TL[t].t === 'prop' && TL[t].g === k); if (ts.length) groups.push({ ts, col: G.c, full: E.hasMonopoly(v, myIdx, k) }); });
    const rs = owned.filter(t => TL[t].t === 'rail'), us = owned.filter(t => TL[t].t === 'util');
    if (rs.length) groups.push({ ts: rs, col: '#2b2f38', full: rs.length === 4 });
    if (us.length) groups.push({ ts: us, col: '#2f6f8f', full: us.length === 2 });
    const deed = t => {
      const T = TL[t], col = T.t === 'prop' ? E.GROUPS[T.g].c : T.t === 'rail' ? '#2b2f38' : '#2f6f8f';
      const icon = T.t === 'rail' ? '🚆 ' : T.t === 'util' ? (T.n === 'PLN' ? '⚡ ' : '🚰 ') : '';
      const r = T.t === 'util' ? (E.UTILS.every(u => v.own[u] === myIdx) ? '10× dadu' : '4× dadu') : money(E.rent(v, t, 7));
      const hs = v.hs[t] === 5 ? '<span class="hotel"></span>' : '<span class="house"></span>'.repeat(v.hs[t]);
      return `<div class="deed${v.mg[t] ? ' mg' : ''}${fresh.includes(t) ? ' new' : ''}" data-tile="${t}" style="--c:${col}" title="${esc(T.n)} — klik untuk kelola">
        <div class="dh"><small>HAK MILIK</small><b>${icon}${esc(T.n.replace('Stasiun ', 'St. '))}</b></div>
        <div class="db"><small>Sewa</small><b>${v.mg[t] ? '—' : r}</b><div class="dhs">${hs}</div></div>
        ${v.mg[t] ? '<div class="stamp">DIGADAI</div>' : ''}</div>`;
    };
    // kartu Bebas dari Penjara yang sedang dipegang (bisa diklik untuk dipakai saat di penjara)
    const usable = me.jail && v.turn === myIdx && v.step === 'roll' && !v.trade;
    const jcs = (me.jc || []).map(c => {
      const d = c.split(':')[0];
      return `<div class="jcard ${d}${usable ? ' use' : ''}" data-jc="1" title="${usable ? 'Klik untuk memakai kartu ini' : 'Dipakai saat kamu masuk penjara'}">
        <div class="jh">${d === 'chance' ? 'KESEMPATAN' : 'DANA UMUM'}</div><div class="jb"><span>🗝️</span><b>BEBAS DARI PENJARA</b></div>
        <div class="jf">${usable ? 'KLIK PAKAI' : 'simpan'}</div></div>`;
    }).join('');
    const dh = (jcs ? `<div class="dgrp jcs">${jcs}</div>` : '') + (groups.length ? groups.map(G => `<div class="dgrp${G.full ? ' full' : ''}">${G.ts.map(deed).join('')}</div>`).join('')
      : '<div class="muted small">Belum punya properti. Beli kota saat berhenti di petaknya!</div>');
    if ($('wDeeds').dataset.h !== dh) { $('wDeeds').dataset.h = dh; $('wDeeds').innerHTML = dh; }
  }

  function renderStatus(v) {
    const el = $('status');
    el.hidden = v.phase !== 'play';
    if (el.hidden) return;
    const busy = Scene3D.busy();
    let sub = '';
    if (v.trade) sub = `🤝 ${chip(v, v.trade.from)} menawarkan tukar ke ${chip(v, v.trade.to)}`;
    else if (v.step === 'auction' && v.auc) sub = `🔨 Lelang ${esc(TL[v.auc.t].n)} · giliran ${chip(v, v.auc.cur)}`;
    else if (busy) sub = '…';
    else if (v.step === 'buy') sub = `Memutuskan membeli ${esc(TL[v.players[v.turn].pos].n)}`;
    else if (v.step === 'debt') sub = `Kekurangan uang: harus bayar ${money(v.debt.a)}`;
    else if (v.step === 'roll') sub = v.players[v.turn].jail ? 'Di penjara' : v.again ? 'Dadu kembar, lempar lagi!' : 'Melempar dadu';
    else if (v.step === 'end') sub = 'Selesai bergerak';
    const html = `<div class="st1"><span class="dice">${DICE[v.dice[0]]}${DICE[v.dice[1]]}</span> Giliran ${chip(v, v.turn)}
      <small>· Putaran ${v.round}${v.cfg.rounds ? '/' + v.cfg.rounds : ''} · ${MODE_NAME[modeOf(v.cfg)]}</small></div><div class="st2">${sub}</div>`;
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }

  function renderActions(v) {
    const el = $('actions');
    const html = actionsHTML(v);
    el.hidden = !html;
    if (el.dataset.h === html) return;
    el.dataset.h = html; el.innerHTML = html;
    const bi = $('bidIn');
    if (bi) { bi.addEventListener('input', bidPreview); bidPreview(); }
  }
  function bidPreview() {
    const bi = $('bidIn');
    if (!bi) return;
    const m = money(+bi.value || 0);
    if ($('bidPv')) $('bidPv').textContent = m;
    if ($('bidGo')) $('bidGo').textContent = m;
  }
  function btn(a, label, cls, dis, title) {
    return `<button data-a="${a}" class="${cls || ''}"${dis ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
  }
  const ic = (e, cls) => `<i class="ic${cls ? ' ' + cls : ''}">${e}</i>`;
  const PIPS = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]],
    5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]] };
  /** Ikon dadu SVG (putih dengan titik), dipakai di tombol lempar dadu. */
  function dieSvg(n, cls) {
    const pips = PIPS[n] || PIPS[5];
    return `<svg class="die ${cls}" viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#fdfcf7" stroke="#c9c2b0" stroke-width="1"/>` +
      pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 3.2 : 2.1}" fill="${n === 1 ? '#d62828' : '#1b1b1b'}"/>`).join('') + '</svg>';
  }
  function miniDeed(t) {
    const T = TL[t], col = T.t === 'prop' ? E.GROUPS[T.g].c : T.t === 'rail' ? '#3a3f4a' : '#2f6f8f';
    const icon = T.t === 'rail' ? '🚆' : T.t === 'util' ? (T.n === 'PLN' ? '⚡' : '🚰') : '🏙️';
    return `<div class="miniDeed" data-tile="${t}" style="--c:${col}"><div class="mdH"><small>HAK MILIK</small><b>${esc(T.n.replace('Stasiun ', 'St. '))}</b></div>
      <div class="mdB"><span>${icon}</span><small>Harga</small><b>${money(T.p)}</b></div></div>`;
  }
  const TOOLS = '<div class="aTools">' + btn('assets', ic('🏠') + '<span>Aset</span><kbd>A</kbd>', 'tool') + btn('trade', ic('🤝') + '<span>Tukar</span>', 'tool') + '</div>';
  function actionsHTML(v) {
    if (v.phase !== 'play') return '';
    const me = myIdx >= 0 ? v.players[myIdx] : null;
    const wait = pendingSeq === v.seq;
    const timer = '<div class="timer"><i id="timerBar"></i></div>';
    const tr = v.trade;
    if (tr) {
      if (tr.to === myIdx) {
        const side = (ps, c) => (ps.length ? ps.map(tileChip).join(' ') : '') + (c ? ` <span class="tc money">${money(c)}</span>` : '') || '<span class="muted">—</span>';
        return `<div class="aHead">🤝 Tawaran tukar dari ${chip(v, tr.from)}</div>
          <div class="trView"><div><small>Kamu dapat</small><div>${side(tr.gp, tr.gc)}</div></div><div><small>Kamu berikan</small><div>${side(tr.tp, tr.tc)}</div></div></div>
          <div class="aBtns">${btn('tradeok', ic('✔') + 'Terima', 'go', wait)}${btn('tradeno', ic('✕') + 'Tolak', 'no', wait)}</div>${timer}`;
      }
      if (tr.from === myIdx) return `<div class="aHead">⏳ Menunggu jawaban ${chip(v, tr.to)}<span class="dots"><i></i><i></i><i></i></span></div><div class="aBtns">${btn('tradecancel', ic('↩') + 'Batalkan tawaran', 'slate', wait)}</div>`;
      return '';
    }
    if (Scene3D.busy()) return '';
    if (v.step === 'auction' && v.auc) return auctionHTML(v, me, wait, timer);
    if (!me || me.out || v.turn !== myIdx) return '';
    const ribbon = sub => `<div class="aRibbon" style="--c:${PCOL[myIdx]}"><span><i></i>GILIRANMU</span><small>${sub}</small></div>`;
    const isDirect = modeOf(v.cfg) === 'direct';
    // mode langsung bangun: upgrade kota milik sendiri tempat pion berhenti
    const upgrade = () => {
      const t = me.pos, T = TL[t];
      if (!isDirect || T.t !== 'prop' || v.own[t] !== myIdx || v.at !== t) return '';
      const h = v.hs[t], err = E.canBuild(v, myIdx, t), hc = E.houseCost(t), done = v.bt === t;
      const houses = h === 5 ? '<span class="hotel"></span>' : '<span class="house"></span>'.repeat(h) + '<span class="house ghost"></span>'.repeat(4 - h);
      const next = h >= 5 ? `Sewa maksimal <b>${money(T.r[5])}</b>`
        : done ? `Sewa sekarang <b>${money(E.rent(v, t, 7))}</b>` : `Sewa ${money(E.rent(v, t, 7))} → <b>${money(T.r[h + 1])}</b>`;
      const nextName = h === 4 ? 'hotel' : `rumah ke-${h + 1}`;
      const action = h >= 5 ? '<div class="upNote">🏨 Hotel sudah berdiri — level maksimal!</div>'
        : done ? `<div class="upNote">✅ Sudah upgrade di kunjungan ini. Mampir lagi nanti untuk membangun ${nextName}.</div>`
        : `<div class="aBtns">${btn('upgrade', `${ic(h === 4 ? '🏨' : '🏠')}<span class="bl"><b>${h === 4 ? 'Jadikan Hotel' : 'Bangun Rumah'} ${money(hc)}</b><small>${h === 4 ? '4 rumah → 1 hotel' : nextName} · 1× per kunjungan</small></span>`, 'blue', wait || !!err, err || '')}</div>`;
      return `<div class="upBox">${miniDeed(t)}<div class="buyInfo"><small>Kota milikmu</small><b>${esc(T.n)}</b>
          <div class="upHs">${houses}</div><div class="bRent">${next}</div></div></div>${action}`;
    };
    switch (v.step) {
      case 'roll':
        if (me.jail) {
          const left = E.JAIL_TURNS + 1 - me.jail;
          const pips = Array.from({ length: E.JAIL_TURNS }, (_, k) => `<i class="${k < me.jail - 1 ? 'done' : k === me.jail - 1 ? 'now' : ''}"></i>`).join('');
          return `<div class="jailBox"><div class="bars">${ic('🔒', 'big')}</div><div><b>Kamu di penjara</b>
              <small>Diam <b>${left} giliran</b> lagi — kecuali lempar dadu kembar${me.jc.length ? ' atau pakai kartu Bebas' : ''}</small>
              <div class="jailPips" title="Giliran di penjara">${pips}</div></div></div>
            <div class="aBtns">${btn('roll', `<span class="dice2 sm">${dieSvg(6, 'd1')}${dieSvg(6, 'd2')}</span><span class="bl"><b>Coba kembar</b><small>kembar = bebas & jalan</small></span>`, 'go roll', wait)}
              ${me.jc.length ? btn('jailcard', `${ic('🗝️')}<span class="bl"><b>Pakai Kartu Bebas</b><small>punya ${me.jc.length} kartu</small></span>`, 'warm', wait) : ''}</div>${TOOLS}${timer}`;
        }
        return `${ribbon(`Putaran ${v.round}${v.cfg.rounds ? '/' + v.cfg.rounds : ''}`)}${v.again ? upgrade() : ''}
          <div class="aBtns">${btn('roll', `<span class="dice2">${dieSvg(v.dice[0], 'd1')}${dieSvg(v.dice[1], 'd2')}</span>
            <span class="bl"><b>${v.again ? 'Lempar Lagi!' : 'Lempar Dadu'}</b><small>${v.again ? 'dadu kembar · main sekali lagi' : 'tekan Spasi'}</small></span>`, 'go roll big', wait)}</div>${TOOLS}${timer}`;
      case 'buy': {
        const t = me.pos, T = TL[t], can = me.cash >= T.p;
        const gt = T.t === 'prop' ? E.GROUP_TILES[T.g] : T.t === 'rail' ? E.RAILS : E.UTILS;
        const have = gt.filter(x => v.own[x] === myIdx).length;
        const kind = T.t === 'prop' ? `kota ${E.GROUPS[T.g].n}` : T.t === 'rail' ? 'stasiun' : 'utilitas';
        const hint = have === gt.length - 1 ? `<div class="bHint gold">⭐ Beli ini untuk melengkapi ${kind}!</div>`
          : have ? `<div class="bHint">Kamu sudah punya ${have}/${gt.length} ${kind}</div>` : '';
        return `<div class="buyBox">${miniDeed(t)}<div class="buyInfo"><small>Properti ini dijual</small><b>${esc(T.n)}</b>
            <div class="bRent">${rentLine(t)}</div>${hint}</div></div>
          <div class="aBtns">${btn('buy', `${ic('🪙')}<span class="bl"><b>Beli ${money(T.p)}</b><small>tekan B</small></span>`, 'go', wait || !can, can ? '' : 'Uang tidak cukup — gadaikan aset dulu')}
            ${btn('decline', v.cfg.auction ? `${ic('🔨')}<span class="bl"><b>Lelang</b><small>semua boleh menawar</small></span>` : ic('➜') + 'Lewati', 'warm', wait)}</div>
          ${isDirect && T.t === 'prop' ? (() => {
            const cost = T.p + E.houseCost(t), ok = me.cash >= cost && E.housesLeft(v) >= 1;
            return `<div class="aBtns pkgs"><button data-a="buy" data-h="1" class="blue"${wait || !ok ? ' disabled' : ''}>
              <span class="pkgH"><span class="house"></span></span><span class="bl"><b>Beli + 1 Rumah ${money(cost)}</b><small>sewa langsung ${money(T.r[1])} · rumah berikutnya saat mampir lagi</small></span></button></div>`;
          })() : ''}
          ${can ? '' : `<div class="aInfo warn">Uangmu ${money(me.cash)} — kurang ${money(T.p - me.cash)}. Gadaikan aset lewat 🏠 Aset, atau lelang.</div>`}${TOOLS}${timer}`;
      }
      case 'debt': {
        const d = v.debt, to = d.to >= 0 ? chip(v, d.to) : d.to === -2 ? 'semua pemain' : 'Bank';
        const short = Math.max(0, d.a - me.cash);
        return `<div class="debtBox">${ic('💸', 'big')}<div><small>Kamu harus membayar ke ${to}</small><div class="dAmt">${money(d.a)}</div>
            <small>Uangmu ${money(me.cash)}${short ? ` · <b class="neg">kurang ${money(short)}</b>` : ' · <b class="pos">cukup!</b>'}</small></div></div>
          <div class="aInfo">Jual rumah / gadaikan aset lewat 🏠 Aset, atau tawarkan tukar.</div>
          <div class="aBtns">${btn('pay', ic('💰') + 'Bayar ' + money(d.a), 'go', wait || me.cash < d.a)}${btn('bankrupt', ic('💥') + 'Bangkrut', 'no', wait)}</div>${TOOLS}${timer}`;
      }
      case 'end':
        return `${ribbon('selesai bergerak · bangun rumah atau tukar dulu kalau mau')}${upgrade()}
          <div class="aBtns">${btn('end', `${ic('✔')}<span class="bl"><b>Akhiri Giliran</b><small>tekan Spasi</small></span>`, 'go end big', wait)}</div>${TOOLS}${timer}`;
    }
    return '';
  }
  function auctionHTML(v, me, wait, timer) {
    const a = v.auc, T = TL[a.t], mine = a.cur === myIdx && me && !me.out;
    // peserta: 👑 tertinggi, … sedang menawar, "lewat" sudah mundur
    const people = v.players.map((p, i) => {
      if (!p || p.out) return '';
      const st = i === a.by ? 'top' : !a.act.includes(i) ? 'gone' : i === a.cur ? 'now' : '';
      const lab = { top: '👑', gone: 'lewat', now: '…' }[st] || '';
      return `<span class="ap ${st}" style="--c:${PCOL[i]}" title="${esc(p.name)}"><i></i>${esc(i === myIdx ? 'Kamu' : p.name)}${lab ? `<small>${lab}</small>` : ''}</span>`;
    }).join('');
    let h = `<div class="auc">
      <div class="aucTop"><span class="gavel">🔨</span><b>LELANG</b><small>penawar tertinggi mendapatkan properti</small></div>
      <div class="aucBody">
        ${miniDeed(a.t)}
        <div class="aucBid">
          <small>Tawaran tertinggi</small>
          <div class="aucAmt${a.by >= 0 ? '' : ' none'}">${a.by >= 0 ? money(a.bid) : 'Belum ada'}</div>
          <div class="aucBy">${a.by >= 0 ? 'oleh ' + chip(v, a.by) : 'Jadilah penawar pertama!'}</div>
          <div class="aucPeople">${people}</div>
        </div>
      </div>`;
    if (mine) {
      const min = a.bid + 1, max = me.cash, val = Math.min(a.bid + 10, max), can = max > a.bid;
      const plus = [10, 50, 100].map(x => `<button data-a="bidplus" data-v="${x}"${can ? '' : ' disabled'}>+${money(x)}</button>`).join('');
      h += `<div class="bidBox">
        <div class="bidTop"><span>Tawaranmu</span><b id="bidPv">${money(val)}</b><small>uangmu ${money(me.cash)}</small></div>
        <input id="bidIn" type="range" min="${min}" max="${Math.max(min, max)}" step="1" value="${val}"${can ? '' : ' disabled'}>
        <div class="aBtns small">${plus}<button data-a="bidset" data-v="${T.p}"${can && T.p > a.bid && T.p <= max ? '' : ' disabled'}>Harga bank</button></div>
        <div class="aBtns">${btn('bid', `🔨 Tawar <span id="bidGo">${money(val)}</span>`, 'go', wait || !can)}${btn('pass', 'Lewati', 'no', wait)}</div>
      </div>${timer}</div>`;
    } else {
      const who = a.cur >= 0 && v.players[a.cur] ? `${chip(v, a.cur)} sedang menimbang tawaran<span class="dots"><i></i><i></i><i></i></span>` : '';
      h += `<div class="aucWait">${who}</div></div>`;
    }
    return h;
  }
  function rentLine(t) {
    const T = TL[t];
    if (T.t === 'prop') return `Sewa ${money(T.r[0])} · monopoli ${money(T.r[0] * 2)} · hotel ${money(T.r[5])}`;
    if (T.t === 'rail') return `Sewa ${money(25)} / ${money(50)} / ${money(100)} / ${money(200)} (1–4 stasiun)`;
    return 'Sewa 4× dadu (10× jika punya PLN & PDAM)';
  }

  function renderLog(v) {
    if (v.lc === lastLog) return;
    lastLog = v.lc;
    $('logList').innerHTML = v.log.map(l => `<div class="${l.startsWith('—') ? 'h' : ''}">${esc(l)}</div>`).join('');
    $('logList').scrollTop = 1e9;
  }

  function renderLobby(v) {
    const show = mode === 'online' && v.phase === 'lobby';
    $('lobbyPanel').hidden = !show;
    if (!show) return;
    $('lpCode').textContent = Net.code;
    const host = authoritative();
    $('lpHost').hidden = !host; $('lpWait').hidden = host;
    const seated = v.players.filter(Boolean).length;
    $('btnStart').disabled = seated < 2;
    $('btnAddBot').disabled = seated >= 6;
    const rows = v.players.map((s, i) => {
      if (!s) return `<div class="lpSeat empty"><i class="dot" style="background:${PCOL[i]}"></i>Kursi kosong</div>`;
      const tag = s.bot ? `🤖 Bot ${LEVEL_NAME[s.bot]}` : s.id === Net.host ? '👑 Host' : s.away ? 'offline' : '👤 Pemain';
      const rm = host && s.bot ? `<button data-rm="${i}">✕</button>` : '';
      return `<div class="lpSeat"><span><i class="dot" style="background:${PCOL[i]}"></i>${esc(s.name)}${s.id === myId ? ' (kamu)' : ''}</span><span><small>${tag}</small> ${rm}</span></div>`;
    }).join('');
    const spect = Object.keys(Net.players).filter(id => Net.players[id].conn && !v.players.some(s => s && s.id === id)).length;
    const c = v.cfg;
    const html = rows + (spect ? `<div class="muted center">${spect} penonton</div>` : '') +
      `<div class="muted center small">${MODE_NAME[modeOf(c)]} · Modal ${money(c.cash)} · ${c.rounds ? c.rounds + ' putaran' : 'tanpa batas putaran'} · lelang ${c.auction ? 'aktif' : 'mati'} · ${c.turn} dtk/giliran</div>`;
    if ($('lpSeats').innerHTML !== html) $('lpSeats').innerHTML = html;
  }

  // ---------- modal ----------
  function openModal(type, arg) {
    modal = { type, arg };
    const v = currentView();
    $('modal').hidden = false;
    if (type === 'trade') { buildTrade(v, arg); return; }
    $('modalBody').dataset.h = '';
    renderModal(v);
  }
  function closeModal() { modal = null; $('modal').hidden = true; Scene3D.highlight(-1); }
  function renderModal(v) {
    if (!modal || modal.type === 'trade' || !v) return;
    let html = '';
    if (modal.type === 'tile') html = tileHTML(v, modal.arg);
    else if (modal.type === 'assets') html = assetsHTML(v, myIdx);
    else if (modal.type === 'player') html = assetsHTML(v, modal.arg);
    const b = $('modalBody');
    if (b.dataset.h !== html) { b.dataset.h = html; b.innerHTML = html; }
    Scene3D.highlight(modal.type === 'tile' ? modal.arg : -1);
  }
  function manageBtns(v, t, compact) {
    if (v.phase !== 'play' || myIdx < 0 || v.own[t] !== myIdx || v.players[myIdx].out) return '';
    const T = TL[t], out = [];
    const b = (a, label, err) => `<button data-m="${a}" data-t="${t}"${err ? ` disabled title="${esc(err)}"` : ''}>${label}</button>`;
    if (T.t === 'prop') {
      const hc = E.houseCost(t);
      out.push(b('build', v.hs[t] === 4 ? `🏨 +Hotel ${compact ? '' : money(hc)}` : `🏠 +Rumah ${compact ? '' : money(hc)}`, E.canBuild(v, myIdx, t)));
      if (v.hs[t]) out.push(b('sell', `Jual ${compact ? '' : '+' + money(Math.floor(hc / 2))}`, E.canSell(v, myIdx, t)));
    }
    if (v.mg[t]) out.push(b('unmort', `Tebus ${money(E.unmortCost(t))}`, E.canUnmort(v, myIdx, t)));
    else if (!v.hs[t]) out.push(b('mort', `Gadai +${money(E.mortValue(t))}`, E.canMort(v, myIdx, t)));
    return `<div class="mBtns">${out.join('')}</div>`;
  }
  function housesTxt(h) { return h === 5 ? '🏨' : '🏠'.repeat(h); }
  function tileHTML(v, t) {
    const T = TL[t];
    const head = T.t === 'prop' ? E.GROUPS[T.g].c : T.t === 'rail' ? '#3d4452' : T.t === 'util' ? '#2f6f8f' : T.t === 'chance' ? '#f07f13' : T.t === 'chest' ? '#2a7de1' : '#5b4b3a';
    let body = '';
    if (T.t === 'prop') {
      const o = v.own[t], mono = o >= 0 && E.hasMonopoly(v, o, T.g);
      const rows = [['Sewa', T.r[0]], ['Satu warna lengkap', T.r[0] * 2], ['1 rumah', T.r[1]], ['2 rumah', T.r[2]], ['3 rumah', T.r[3]], ['4 rumah', T.r[4]], ['Hotel', T.r[5]]];
      const curIdx = o < 0 ? -1 : v.hs[t] ? v.hs[t] + 1 : mono ? 1 : 0;
      body = `<table class="rent">${rows.map(([a, b], k) => `<tr class="${k === curIdx ? 'cur' : ''}"><td>${a}</td><td>${money(b)}</td></tr>`).join('')}</table>
        <div class="kv"><span>Harga rumah/hotel</span><b>${money(E.houseCost(t))}</b></div>`;
    } else if (T.t === 'rail') {
      body = `<table class="rent">${[1, 2, 3, 4].map(k => `<tr><td>Punya ${k} stasiun</td><td>${money(25 * Math.pow(2, k - 1))}</td></tr>`).join('')}</table>`;
    } else if (T.t === 'util') {
      body = '<p>Sewa = <b>4×</b> angka dadu jika punya satu utilitas, <b>10×</b> jika punya PLN dan PDAM.</p>';
    } else {
      const d = {
        go: `Setiap melewati atau berhenti di MULAI, terima ${money(E.GO_SALARY)}.`,
        jail: `Hanya mampir kalau berhenti di sini. Kalau dipenjara: diam ${E.JAIL_TURNS} giliran, kecuali lempar dadu kembar atau pakai kartu Bebas dari Penjara.`,
        park: 'Istirahat sejenak. Tidak terjadi apa-apa.',
        gojail: 'Langsung masuk penjara tanpa melewati MULAI.',
        chance: 'Ambil kartu Kesempatan.', chest: 'Ambil kartu Dana Umum.',
        tax: `Bayar ${money(T.a)} ke bank.`,
      }[T.t];
      body = `<p>${d}</p>`;
    }
    let own = '';
    if (E.isOwnable(t)) {
      const o = v.own[t];
      own = `<div class="kv"><span>Harga</span><b>${money(T.p)}</b></div><div class="kv"><span>Nilai gadai</span><b>${money(E.mortValue(t))}</b></div>
        <div class="kv"><span>Pemilik</span><b>${o >= 0 ? chip(v, o) : 'Bank (belum dimiliki)'}</b></div>
        ${o >= 0 && v.hs[t] ? `<div class="kv"><span>Bangunan</span><b>${housesTxt(v.hs[t])}</b></div>` : ''}
        ${o >= 0 && v.mg[t] ? '<div class="kv warn"><span>Status</span><b>Digadaikan</b></div>' : ''}
        ${o >= 0 ? `<div class="kv"><span>Sewa sekarang</span><b>${T.t === 'util' ? (v.mg[t] ? money(0) : (E.UTILS.every(u => v.own[u] === o) ? '10' : '4') + '× dadu') : money(E.rent(v, t, 7))}</b></div>` : ''}`;
    }
    return `<div class="tHead" style="background:${head}"><small>${T.t === 'prop' ? esc(E.GROUPS[T.g].n) : ''}</small><h3>${esc(T.n)}</h3></div>
      <div class="tBody">${body}${own}${manageBtns(v, t)}</div>`;
  }
  function assetsHTML(v, i) {
    const p = v.players[i];
    if (!p) return '<p>—</p>';
    const list = [];
    for (let t = 0; t < 40; t++) if (v.own[t] === i) list.push(t);
    const groups = [];
    E.GROUPS.forEach((G, k) => { const ts = list.filter(t => TL[t].t === 'prop' && TL[t].g === k); if (ts.length) groups.push([G.n, G.c, ts, E.hasMonopoly(v, i, k)]); });
    const rs = list.filter(t => TL[t].t === 'rail'), us = list.filter(t => TL[t].t === 'util');
    if (rs.length) groups.push(['Stasiun', '#3d4452', rs, false]);
    if (us.length) groups.push(['Utilitas', '#2f6f8f', us, false]);
    const mine = i === myIdx;
    const rows = groups.map(([n, c, ts, mono]) => `<div class="aGroup"><div class="aGH" style="--c:${c}">${esc(n)}${mono ? ' <small>✔ lengkap</small>' : ''}</div>
      ${ts.map(t => `<div class="aRow${v.mg[t] ? ' mg' : ''}"><span class="aName" data-tile="${t}">${esc(TL[t].n)} <small>${housesTxt(v.hs[t])}${v.mg[t] ? ' digadaikan' : ''}</small></span>${mine ? manageBtns(v, t, true) : ''}</div>`).join('')}</div>`).join('');
    return `<div class="tHead" style="background:${PCOL[i]}"><small>${mine ? 'Aset kamu' : 'Aset pemain'}</small><h3>${esc(p.name)}</h3></div>
      <div class="tBody"><div class="kv"><span>Uang</span><b>${money(p.cash)}</b></div><div class="kv"><span>Total kekayaan</span><b>${money(E.worth(v, i))}</b></div>
      ${p.jc && p.jc.length ? `<div class="kv"><span>Kartu bebas penjara</span><b>${p.jc.length}</b></div>` : ''}
      ${rows || '<p class="muted">Belum punya properti.</p>'}
      ${mine ? `<p class="muted small">${modeOf(v.cfg) === 'direct' ? 'Mode Langsung Bangun: upgrade 1 tingkat tiap kali pionmu mampir di kota milikmu.' : 'Bangun rumah harus merata dan memiliki semua kota satu warna.'} Stok bank: ${E.housesLeft(v)} rumah, ${E.hotelsLeft(v)} hotel.</p>` : ''}</div>`;
  }
  function buildTrade(v, to) {
    const others = v.players.map((p, i) => i).filter(i => i !== myIdx && v.players[i] && !v.players[i].out);
    if (!others.length) { closeModal(); return; }
    if (!others.includes(to)) to = others[0];
    const me = v.players[myIdx];
    const list = (who, id) => {
      const ts = [];
      for (let t = 0; t < 40; t++) if (v.own[t] === who) ts.push(t);
      if (!ts.length) return '<p class="muted small">Tidak ada properti.</p>';
      return ts.map(t => {
        const ok = E.tradable(v, who, t);
        return `<label class="trItem${ok ? '' : ' dis'}"><input type="checkbox" data-${id}="${t}"${ok ? '' : ' disabled'}>${tileChip(t)}${v.mg[t] ? '<small>gadai</small>' : ''}${ok ? '' : '<small>ada bangunan</small>'}</label>`;
      }).join('');
    };
    $('modalBody').dataset.h = '';
    $('modalBody').innerHTML = `<div class="tHead" style="background:#5b4b3a"><small>Tawaran tukar</small><h3>🤝 Tukar Properti</h3></div>
      <div class="tBody">
        <label class="field">Dengan pemain <select id="trTo">${others.map(i => `<option value="${i}"${i === to ? ' selected' : ''}>${esc(v.players[i].name)} — ${money(v.players[i].cash)}</option>`).join('')}</select></label>
        <div class="trCols">
          <div><b>Kamu berikan</b><div class="trList">${list(myIdx, 'g')}</div>
            <label class="field">Uang (maks ${money(me.cash)}) <input id="trGc" type="number" min="0" step="10" value="0"><small id="trGcPv">Rp 0</small></label></div>
          <div><b>Kamu minta</b><div class="trList">${list(to, 't')}</div>
            <label class="field">Uang (maks ${money(v.players[to].cash)}) <input id="trTc" type="number" min="0" step="10" value="0"><small id="trTcPv">Rp 0</small></label></div>
        </div>
        <p class="muted small">Angka uang dalam satuan Rp 10rb (100 = Rp 1jt). Hanya bisa saat giliranmu.</p>
        <button id="trSend" class="primary wide">Kirim Tawaran</button>
      </div>`;
    $('trTo').onchange = () => buildTrade(currentView(), +$('trTo').value);
    const pv = (a, b) => { $(a).oninput = () => { $(b).textContent = money(+$(a).value || 0); }; };
    pv('trGc', 'trGcPv'); pv('trTc', 'trTcPv');
    $('trSend').onclick = () => {
      const gp = [...document.querySelectorAll('[data-g]:checked')].map(x => +x.dataset.g);
      const tp = [...document.querySelectorAll('[data-t]:checked')].map(x => +x.dataset.t);
      const d = { to: +$('trTo').value, gp, tp, gc: Math.max(0, Math.round(+$('trGc').value || 0)), tc: Math.max(0, Math.round(+$('trTc').value || 0)) };
      const cv = currentView();
      if (!cv || cv.turn !== myIdx || cv.step === 'buy' || cv.step === 'auction') { toast('Tawaran tukar hanya bisa dikirim saat giliranmu.'); return; }
      closeModal();
      sendAction('trade', d);
    };
  }

  // ---------- kartu ----------
  function checkCard(v) {
    if (!v.card || v.card.id === shownCard) return;
    if (!lastView) { shownCard = v.card.id; return; }
    pendingCard = v.card;
    if (!Scene3D.busy()) showCard();
  }
  function showCard() {
    const c = pendingCard;
    if (!c) return;
    pendingCard = null; shownCard = c.id;
    const C = (c.d === 'chance' ? E.CHANCE : E.CHEST)[c.i];
    const el = $('cardPop'), v = currentView();
    const chance = c.d === 'chance', title = chance ? 'KESEMPATAN' : 'DANA UMUM';
    // ikon & efek uang per jenis kartu
    const icon = { move: C.to === 0 ? '🏁' : TL[C.to] && TL[C.to].t === 'rail' ? '🚂' : '📍', near: C.k === 'rail' ? '🚂' : '⚡', back: '⬅️', jail: '🚔',
      cash: C.a > 0 ? '💰' : '💸', repair: '🔧', each: C.a > 0 ? '🤝' : '🎂', free: '🗝️' }[C.x] || '🎴';
    const delta = C.x === 'cash' ? C.a : C.x === 'each' ? -C.a * Math.max(1, (v ? v.players.filter((p, i) => p && !p.out && i !== c.p).length : 1)) : 0;
    const amt = delta ? `<div class="cpAmt ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}</div>` : '';
    const note = C.x === 'free' ? '<div class="cpNote">Kartu disimpan di dompet 🗝️</div>' : '';
    const sym = chance ? '?' : '💰', total = (chance ? E.CHANCE : E.CHEST).length;
    el.className = c.d;
    el.innerHTML = `<div class="cpCard">
      <div class="cpFace cpBack"><div class="cpBackIn"><span>${sym}</span><b>${title}</b><small>MONOPOLI INDONESIA</small></div></div>
      <div class="cpFace cpFront">
        <i class="cpCorner tl">${sym}</i><i class="cpCorner br">${sym}</i>
        <div class="cpBand"><small>MONOPOLI INDONESIA</small>${title}</div>
        <div class="cpIcon"><span>${icon}</span></div>
        <div class="cpText">${esc(C.m)}</div>${amt}${note}
        <div class="cpFoot">${v && v.players[c.p] ? chip(v, c.p) : ''}<small>Kartu ${c.i + 1}/${total} · klik untuk tutup</small></div>
        <div class="cpTimer"><i></i></div>
      </div></div>`;
    el.hidden = false;
    Snd.card();
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => { el.hidden = true; }, 4600);
  }

  function renderOver(v) {
    if (v.phase === 'over') {
      if (overShown) return;
      overShown = true;
      closeModal();
      const w = v.winner, win = w === myIdx;
      $('overTitle').textContent = win ? '🏆 Kamu Menang!' : `🏆 ${w >= 0 ? v.players[w].name : '?'} Menang`;
      $('overText').innerHTML = (v.rank || []).map(([i, val], k) => `<div class="rk"><span>${k + 1}. ${chip(v, i)}</span><b>${money(val)}</b></div>`).join('') +
        v.players.map((p, i) => (p && p.out ? `<div class="rk out"><span>${chip(v, i)}</span><small>bangkrut</small></div>` : '')).join('');
      const btns = [];
      if (mode === 'local') btns.push(['▶ Main lagi', 'primary', () => startLocal(localCfg.cfg, localCfg.nBots, localCfg.level)]);
      else if (authoritative()) btns.push(['↺ Kembali ke lobby', 'primary', () => { E.resetGame(g); overShown = false; syncPlayers(true); commit(); showOverlay(null); }]);
      else btns.push(['Tutup (menunggu host)', '', () => showOverlay(null)]);
      btns.push(['Menu utama', '', () => leaveCurrent()]);
      setOverBtns(btns);
      if (win) Snd.win();
      showOverlay('overCard');
      return;
    }
    if (overShown) { overShown = false; if (!$('overCard').hidden) showOverlay(null); }
    const me = myIdx >= 0 ? v.players[myIdx] : null;
    if (mode === 'local' && me && me.out && !bustShown) {
      bustShown = true;
      $('overTitle').textContent = '💸 Kamu Bangkrut';
      $('overText').textContent = 'Semua asetmu habis. Mau lanjut menonton para bot?';
      setOverBtns([
        ['▶ Main lagi', 'primary', () => startLocal(localCfg.cfg, localCfg.nBots, localCfg.level)],
        ['👀 Tonton bot (cepat)', '', () => { watchBots = true; showOverlay(null); }],
        ['Menu utama', '', () => leaveCurrent()],
      ]);
      showOverlay('overCard');
    }
  }
  function setOverBtns(list) {
    const box = $('overBtns'); box.innerHTML = '';
    list.forEach(([label, cls, fn]) => {
      const b = document.createElement('button'); b.textContent = label; b.className = (cls ? cls + ' ' : '') + 'wide';
      b.onclick = fn; box.appendChild(b);
    });
  }

  function playSounds(v, p) {
    if (!p || v.phase !== 'play') return;
    const s = snap(v);
    if (s.who === myIdx && myIdx >= 0 && p.who !== myIdx) Snd.ding();
    if (s.own > p.own) Snd.buy();
    if (s.hs > p.hs) Snd.build();
    if (s.jail.some((j, i) => j === 1 && !p.jail[i])) setTimeout(() => Snd.jail(), 700);
    if (s.out > p.out) Snd.bust();
    if (myIdx >= 0 && s.own === p.own) { if (s.cash > p.cash) Snd.coin(); else if (s.cash < p.cash) Snd.pay(); }
  }

  // timer giliran (bar di panel aksi & daftar pemain)
  function uiTick() {
    const v = currentView();
    if (!v || v.phase !== 'play') return;
    const w = E.whoActs(v), dl = v.deadline, total = (v.step === 'auction' ? Math.min(15, v.cfg.turn) : v.cfg.turn) * 1000;
    const frac = dl && total ? Math.max(0, Math.min(1, (dl - now()) / total)) : 0;
    const col = frac > 0.4 ? '#2fbf71' : frac > 0.2 ? '#f0b429' : '#e5484d';
    const tb = $('timerBar');
    if (tb) { tb.style.width = (w === myIdx ? frac * 100 : 0) + '%'; tb.style.background = col; }
    document.querySelectorAll('[data-tp]').forEach(el => {
      const i = +el.dataset.tp, bar = el.firstChild;
      bar.style.width = (i === w && dl ? frac * 100 : 0) + '%'; bar.style.background = col;
    });
  }

  // ---------- event ----------
  let activeTab = store.get('mn_tab', 'bot');
  function setTab(t) {
    activeTab = t; store.set('mn_tab', t);
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('tabBot').hidden = t !== 'bot'; $('tabOnline').hidden = t !== 'online';
    $('btnPlayBot').hidden = t !== 'bot'; $('btnCreate').hidden = t !== 'online';
    document.querySelectorAll('.onlineOnly').forEach(e => { e.hidden = t !== 'online'; });
    document.querySelectorAll('.botOnly').forEach(e => { e.hidden = t !== 'bot'; });
    if (t === 'online') refreshRooms();
  }
  function primaryAction() {
    const b = document.querySelector('#actions button.go');
    if (b && !b.disabled && ['roll', 'end'].includes(b.dataset.a)) b.click();
  }

  function bind() {
    $('nameIn').value = store.get('mn_name', '');
    $('nameIn').addEventListener('input', () => store.set('mn_name', $('nameIn').value.trim().slice(0, 16)));
    const OPTS = ['optBots', 'optLevel', 'optCash', 'optRounds', 'optAuction', 'optTurn', 'optSpeed'];
    const saved = store.get('mn_opts', null);
    if (saved) Object.entries(saved).forEach(([id, val]) => { if ($(id)) $(id).value = val; });
    const saveOpts = () => store.set('mn_opts', Object.fromEntries(OPTS.map(id => [id, $(id).value])));
    document.querySelectorAll('#menuCard select').forEach(s => s.addEventListener('change', saveOpts));
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    setMode(gameMode);
    document.addEventListener('pointerdown', () => Snd.init());

    $('btnPlayBot').onclick = () => startLocal(readCfg(false), +$('optBots').value, +$('optLevel').value);
    $('btnCreate').onclick = () => createRoom();
    $('btnJoin').onclick = () => joinRoom($('joinCode').value);
    $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('joinCode').value); });
    $('btnRefresh').onclick = refreshRooms;
    $('roomList').addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (b) joinRoom(b.dataset.code); });

    $('btnLeave').onclick = () => {
      const v = currentView();
      const playing = v && v.phase === 'play' && myIdx >= 0 && !v.players[myIdx].out;
      if (playing && !confirm(mode === 'online' ? 'Keluar dari room? Kamu akan dianggap bangkrut.' : 'Keluar dari permainan?')) return;
      leaveCurrent();
    };
    $('btnLog').onclick = () => { $('side').hidden = !$('side').hidden; store.set('mn_side', !$('side').hidden); };
    $('btnSideClose').onclick = () => { $('side').hidden = true; store.set('mn_side', false); };
    $('btnCam').onclick = () => Scene3D.resetCam();
    const sndIcon = () => { $('btnSound').textContent = Snd.on ? '🔊' : '🔇'; };
    sndIcon();
    $('btnSound').onclick = () => { Snd.on = !Snd.on; store.set('mn_snd', Snd.on); sndIcon(); };
    const copyLink = () => {
      const url = location.origin + location.pathname + '?room=' + Net.code;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link undangan disalin!'), () => prompt('Salin link ini:', url));
    };
    $('infoRoom').onclick = copyLink;
    $('btnCopyLink').onclick = copyLink;

    $('actions').addEventListener('click', e => {
      const b = e.target.closest('button[data-a]');
      const tc = e.target.closest('[data-tile]');
      if (!b) { if (tc) openModal('tile', +tc.dataset.tile); return; }
      const a = b.dataset.a;
      if (a === 'assets') return openModal('assets');
      if (a === 'trade') return openModal('trade');
      if (a === 'bidplus' || a === 'bidset') {
        const v = currentView(), bi = $('bidIn');
        if (bi && v && v.auc) {
          const base = a === 'bidset' ? 0 : Math.max(+bi.value || 0, v.auc.bid);
          bi.value = Math.max(v.auc.bid + 1, Math.min(v.players[myIdx].cash, base + +b.dataset.v));
          bidPreview();
        }
        return;
      }
      if (a === 'bid') return sendAction('bid', { a: Math.round(+$('bidIn').value || 0) });
      if (a === 'buy') return sendAction('buy', { h: +b.dataset.h || 0 });
      if (a === 'upgrade') { const v = currentView(); if (v && myIdx >= 0) sendAction('build', { t: v.players[myIdx].pos }); return; }
      if (a === 'bankrupt' && !confirm('Nyatakan bangkrut? Semua asetmu akan diserahkan.')) return;
      if (a === 'decline') {
        const v = currentView();
        if (v && v.players[myIdx].cash >= TL[v.players[myIdx].pos].p && !v.cfg.auction && !confirm('Lewati tanpa membeli?')) return;
      }
      sendAction(a);
    });
    $('modal').addEventListener('click', e => {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) return closeModal();
      const m = e.target.closest('button[data-m]');
      if (m) return sendAction(m.dataset.m, { t: +m.dataset.t });
      const tc = e.target.closest('[data-tile]');
      if (tc && !e.target.closest('label')) openModal('tile', +tc.dataset.tile);
    });
    $('players').addEventListener('click', e => { const r = e.target.closest('[data-p]'); if (r) openModal('player', +r.dataset.p); });
    $('status').addEventListener('click', e => { const tc = e.target.closest('[data-tile]'); if (tc) openModal('tile', +tc.dataset.tile); });
    $('cardPop').onclick = () => { $('cardPop').hidden = true; };
    $('wDeeds').addEventListener('click', e => {
      if (e.target.closest('[data-jc]')) {
        const v = currentView(), me = v && myIdx >= 0 ? v.players[myIdx] : null;
        if (me && me.jail && v.turn === myIdx && v.step === 'roll') sendAction('jailcard');
        else toast('Kartu ini bisa dipakai saat kamu di penjara, di awal giliranmu.');
        return;
      }
      const d = e.target.closest('[data-tile]'); if (d) openModal('tile', +d.dataset.tile);
    });
    $('wToggle').onclick = () => {
      if (window.innerWidth <= 1000) wallet.open = false; else store.set('mn_wmin', !store.get('mn_wmin', false));
      render();
    };
    $('btnWallet').onclick = () => { wallet.open = !wallet.open; render(); };

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || !mode) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') closeModal();
      else if (k === ' ' || k === 'enter') { if (!modal) { e.preventDefault(); primaryAction(); } }
      else if (k === 'b') { const b = document.querySelector('#actions [data-a="buy"]'); if (b && !b.disabled) b.click(); }
      else if (k === 'a') openModal('assets');
    });

    $('chatForm').addEventListener('submit', e => { e.preventDefault(); sendChat($('chatIn').value); $('chatIn').value = ''; });

    $('btnAddBot').onclick = () => {
      if (!authoritative() || g.phase !== 'lobby') return;
      const i = freeSeat(g); if (i < 0) return;
      const used = new Set(g.players.filter(Boolean).map(s => s.name));
      const name = BOT_NAMES.slice().sort(() => Math.random() - 0.5).find(n => !used.has(n)) || 'Bot ' + (i + 1);
      E.addPlayer(g, i, { id: 'bot' + Date.now().toString(36), name, bot: +$('lpBotLevel').value });
      commit();
    };
    $('lpSeats').addEventListener('click', e => {
      const b = e.target.closest('[data-rm]');
      if (!b || !authoritative() || g.phase !== 'lobby') return;
      g.players[+b.dataset.rm] = null; commit();
    });
    $('btnStart').onclick = () => {
      if (!authoritative() || g.phase !== 'lobby') return;
      syncPlayers(true);
      if (!E.startGame(g)) { toast('Butuh minimal 2 pemain/bot.'); return; }
      resetHk();
      commit();
    };

    window.addEventListener('beforeunload', () => {
      if (mode === 'online' && isHost && Net.ref) {
        const others = Object.keys(Net.players).filter(id => id !== myId && Net.players[id] && Net.players[id].conn).sort();
        if (others.length) Net.ref.child('host').set(others[0]);
      }
    });
    setInterval(uiTick, 200);
  }

  // ---------- start ----------
  Scene3D.init($('c'), {
    plates: $('plates'),
    onTile: t => { if (mode) openModal('tile', t); },
    onCard: () => { if (pendingCard) showCard(); },
    onIdle: () => { render(); if (pendingCard) showCard(); },
    onDice: () => Snd.dice(),
    onStep: () => Snd.step(),
  });
  bind();
  setTab(activeTab);
  showOverlay('menuCard');
  const qRoom = new URLSearchParams(location.search).get('room');
  if (qRoom) { setTab('online'); $('joinCode').value = qRoom.toUpperCase(); joinRoom(qRoom); }
  window.__mono = { get g() { return g; }, get view() { return currentView(); }, sendAction, render, E };
})();
