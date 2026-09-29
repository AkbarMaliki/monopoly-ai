/* Monopoli Indonesia — logika permainan murni (tanpa DOM): papan, kartu, aturan, lelang, tukar, bot.
   Dipakai browser (window.MonoEngine) dan test Node. Uang disimpan dalam satuan Rp 10.000 (1500 = Rp 15jt). */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.MonoEngine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const api = { rng: Math.random };
  const rnd = () => api.rng();

  // ---------- papan ----------
  const GROUPS = [
    { n: 'Coklat', c: '#8a5a2b', hc: 50 },
    { n: 'Biru Muda', c: '#6cc4ee', hc: 50 },
    { n: 'Merah Muda', c: '#d6399a', hc: 100 },
    { n: 'Oranye', c: '#f39021', hc: 100 },
    { n: 'Merah', c: '#e0262f', hc: 150 },
    { n: 'Kuning', c: '#f2cd13', hc: 150 },
    { n: 'Hijau', c: '#1f9d55', hc: 200 },
    { n: 'Biru Tua', c: '#1d4fb8', hc: 200 },
  ];
  const P = (n, g, p, r) => ({ n, t: 'prop', g, p, r });
  const TILES = [
    { n: 'MULAI', t: 'go' },
    P('Jayapura', 0, 60, [2, 10, 30, 90, 160, 250]),
    { n: 'Dana Umum', t: 'chest' },
    P('Ambon', 0, 60, [4, 20, 60, 180, 320, 450]),
    { n: 'Pajak Penghasilan', t: 'tax', a: 200 },
    { n: 'Stasiun Gambir', t: 'rail', p: 200 },
    P('Kupang', 1, 100, [6, 30, 90, 270, 400, 550]),
    { n: 'Kesempatan', t: 'chance' },
    P('Mataram', 1, 100, [6, 30, 90, 270, 400, 550]),
    P('Palu', 1, 120, [8, 40, 100, 300, 450, 600]),
    { n: 'Penjara', t: 'jail' },
    P('Pontianak', 2, 140, [10, 50, 150, 450, 625, 750]),
    { n: 'PLN', t: 'util', p: 150 },
    P('Banjarmasin', 2, 140, [10, 50, 150, 450, 625, 750]),
    P('Samarinda', 2, 160, [12, 60, 180, 500, 700, 900]),
    { n: 'Stasiun Tugu', t: 'rail', p: 200 },
    P('Pekanbaru', 3, 180, [14, 70, 200, 550, 750, 950]),
    { n: 'Dana Umum', t: 'chest' },
    P('Padang', 3, 180, [14, 70, 200, 550, 750, 950]),
    P('Palembang', 3, 200, [16, 80, 220, 600, 800, 1000]),
    { n: 'Bebas Parkir', t: 'park' },
    P('Manado', 4, 220, [18, 90, 250, 700, 875, 1050]),
    { n: 'Kesempatan', t: 'chance' },
    P('Balikpapan', 4, 220, [18, 90, 250, 700, 875, 1050]),
    P('Makassar', 4, 240, [20, 100, 300, 750, 925, 1100]),
    { n: 'Stasiun Tawang', t: 'rail', p: 200 },
    P('Malang', 5, 260, [22, 110, 330, 800, 975, 1150]),
    P('Solo', 5, 260, [22, 110, 330, 800, 975, 1150]),
    { n: 'PDAM', t: 'util', p: 150 },
    P('Yogyakarta', 5, 280, [24, 120, 360, 850, 1025, 1200]),
    { n: 'Masuk Penjara', t: 'gojail' },
    P('Semarang', 6, 300, [26, 130, 390, 900, 1100, 1275]),
    P('Bandung', 6, 300, [26, 130, 390, 900, 1100, 1275]),
    { n: 'Dana Umum', t: 'chest' },
    P('Surabaya', 6, 320, [28, 150, 450, 1000, 1200, 1400]),
    { n: 'Stasiun Pasar Turi', t: 'rail', p: 200 },
    { n: 'Kesempatan', t: 'chance' },
    P('Denpasar', 7, 350, [35, 175, 500, 1100, 1300, 1500]),
    { n: 'Pajak Barang Mewah', t: 'tax', a: 100 },
    P('Jakarta', 7, 400, [50, 200, 600, 1400, 1700, 2000]),
  ];
  const GROUP_TILES = GROUPS.map((_, k) => TILES.map((t, i) => (t.t === 'prop' && t.g === k ? i : -1)).filter(i => i >= 0));
  const RAILS = [5, 15, 25, 35], UTILS = [12, 28];
  const GO_SALARY = 200, JAIL_FINE = 50, HOUSES = 32, HOTELS = 12;
  const isOwnable = t => TILES[t] && (TILES[t].t === 'prop' || TILES[t].t === 'rail' || TILES[t].t === 'util');

  // ---------- kartu ----------
  const CHANCE = [
    { m: 'Maju ke MULAI. Terima Rp 2jt.', x: 'move', to: 0 },
    { m: 'Liburan ke ibu kota! Maju ke Jakarta.', x: 'move', to: 39 },
    { m: 'Dinas ke Makassar. Jika melewati MULAI, terima Rp 2jt.', x: 'move', to: 24 },
    { m: 'Kunjungi Pontianak. Jika melewati MULAI, terima Rp 2jt.', x: 'move', to: 11 },
    { m: 'Naik kereta dari Stasiun Gambir. Jika melewati MULAI, terima Rp 2jt.', x: 'move', to: 5 },
    { m: 'Maju ke stasiun terdekat. Jika sudah dimiliki, bayar 2× sewa.', x: 'near', k: 'rail' },
    { m: 'Maju ke stasiun terdekat. Jika sudah dimiliki, bayar 2× sewa.', x: 'near', k: 'rail' },
    { m: 'Maju ke PLN/PDAM terdekat. Jika sudah dimiliki, bayar 10× angka dadu.', x: 'near', k: 'util' },
    { m: 'Bank membagikan dividen. Terima Rp 500rb.', x: 'cash', a: 50 },
    { m: 'Bebas dari Penjara. Simpan kartu ini sampai dipakai.', x: 'free' },
    { m: 'Ban bocor, mundur 3 langkah.', x: 'back', n: 3 },
    { m: 'Terjaring razia! Langsung masuk penjara tanpa melewati MULAI.', x: 'jail' },
    { m: 'Renovasi properti: bayar Rp 250rb per rumah dan Rp 1jt per hotel.', x: 'repair', h: 25, o: 100 },
    { m: 'Kena tilang. Bayar Rp 150rb.', x: 'cash', a: -15 },
    { m: 'Terpilih jadi Ketua RT. Bayar Rp 500rb ke setiap pemain.', x: 'each', a: 50 },
    { m: 'Usaha kuliner laris manis! Terima Rp 1,5jt.', x: 'cash', a: 150 },
  ];
  const CHEST = [
    { m: 'Maju ke MULAI. Terima Rp 2jt.', x: 'move', to: 0 },
    { m: 'Bank salah hitung, untung buat kamu. Terima Rp 2jt.', x: 'cash', a: 200 },
    { m: 'Periksa ke dokter. Bayar Rp 500rb.', x: 'cash', a: -50 },
    { m: 'Jual saham. Terima Rp 500rb.', x: 'cash', a: 50 },
    { m: 'Bebas dari Penjara. Simpan kartu ini sampai dipakai.', x: 'free' },
    { m: 'Ketahuan main curang! Langsung masuk penjara.', x: 'jail' },
    { m: 'THR cair! Terima Rp 1jt.', x: 'cash', a: 100 },
    { m: 'Restitusi pajak. Terima Rp 200rb.', x: 'cash', a: 20 },
    { m: 'Hari ulang tahunmu! Terima Rp 100rb dari setiap pemain.', x: 'each', a: -10 },
    { m: 'Asuransi jatuh tempo. Terima Rp 1jt.', x: 'cash', a: 100 },
    { m: 'Biaya rumah sakit. Bayar Rp 1jt.', x: 'cash', a: -100 },
    { m: 'Bayar uang sekolah Rp 500rb.', x: 'cash', a: -50 },
    { m: 'Honor jadi konsultan. Terima Rp 250rb.', x: 'cash', a: 25 },
    { m: 'Perbaikan jalan kampung: bayar Rp 400rb per rumah dan Rp 1,15jt per hotel.', x: 'repair', h: 40, o: 115 },
    { m: 'Juara 2 lomba panjat pinang 17-an. Terima Rp 100rb.', x: 'cash', a: 10 },
    { m: 'Dapat warisan. Terima Rp 1jt.', x: 'cash', a: 100 },
  ];
  const DECK_NAME = { chance: 'Kesempatan', chest: 'Dana Umum' };

  // durasi animasi (ms) — dipakai scene dan host agar sinkron
  const ANIM = { dice: 1100, step: 170, seg: 250, jump: 750, card: 1700 };

  // ---------- util ----------
  function money(n) {
    n = Math.round(n) || 0;
    const v = Math.abs(n) * 10; // ribu rupiah
    const s = v === 0 ? '0' : v >= 1000 ? (v / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + 'jt' : v + 'rb';
    return (n < 0 ? '-' : '') + 'Rp ' + s;
  }
  function shuffle(a) {
    for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
    return a;
  }
  const range = n => Array.from({ length: n }, (_, k) => k);
  const alive = (g, i) => !!(g.players[i] && !g.players[i].out);
  const aliveList = g => range(6).filter(i => alive(g, i));
  function nextAlive(g, i) {
    for (let k = 1; k <= 6; k++) { const j = (i + k) % 6; if (alive(g, j)) return j; }
    return -1;
  }
  function log(g, m) {
    g.log.push(m); g.lc = (g.lc || 0) + 1;
    if (g.log.length > 80) g.log.splice(0, g.log.length - 80);
  }
  const nm = (g, i) => (g.players[i] ? g.players[i].name : '?');

  // ---------- state ----------
  function createGame(cfg) {
    return {
      v: 0, seq: 0, phase: 'lobby',
      cfg: Object.assign({ cash: 1500, rounds: 0, turn: 0, auction: 1 }, cfg || {}),
      players: [null, null, null, null, null, null],
      own: new Array(40).fill(-1), hs: new Array(40).fill(0), mg: new Array(40).fill(0),
      turn: 0, step: 'roll', round: 0, dice: [3, 4], rid: 0, dbl: 0, again: false,
      mv: [], mid: 0, mvq: -1, card: null, cid: 0,
      auc: null, debt: null, trade: null, tid: 0, tt: 0, tmem: {},
      decks: { chance: [], chest: [] }, log: [], lc: 0, winner: -1, rank: null,
    };
  }
  function addPlayer(g, i, p) {
    g.players[i] = {
      id: p.id, name: String(p.name || 'Pemain').slice(0, 16), bot: p.bot | 0,
      pos: 0, cash: g.cfg.cash, jail: 0, jc: [], out: false, away: false, leave: false,
    };
    return g.players[i];
  }
  function clearBoard(g) {
    g.own = new Array(40).fill(-1); g.hs = new Array(40).fill(0); g.mg = new Array(40).fill(0);
    Object.assign(g, { step: 'roll', round: 0, dbl: 0, again: false, mv: [], mvq: -1, card: null, auc: null, debt: null, trade: null, tt: 0, tmem: {}, winner: -1, rank: null });
    g.players.forEach(p => { if (p) Object.assign(p, { pos: 0, cash: g.cfg.cash, jail: 0, jc: [], out: false }); });
  }
  function startGame(g) {
    const ids = range(6).filter(i => g.players[i]);
    if (ids.length < 2) return false;
    clearBoard(g);
    g.decks = { chance: shuffle(range(CHANCE.length)), chest: shuffle(range(CHEST.length)) };
    g.phase = 'play'; g.round = 1;
    g.turn = ids[Math.floor(rnd() * ids.length)];
    g.log = [];
    log(g, `Permainan dimulai! Modal awal ${money(g.cfg.cash)} per pemain.`);
    logTurn(g);
    return true;
  }
  function resetGame(g) {
    clearBoard(g);
    g.phase = 'lobby'; g.log = [];
    g.players.forEach((p, i) => { if (p && p.leave) g.players[i] = null; });
  }

  // ---------- nilai & sewa ----------
  function hasMonopoly(g, i, k, own) {
    own = own || g.own;
    return GROUP_TILES[k].every(t => own[t] === i);
  }
  function rent(g, t, sum) {
    const T = TILES[t], o = g.own[t];
    if (o < 0 || g.mg[t]) return 0;
    if (T.t === 'prop') return g.hs[t] ? T.r[g.hs[t]] : T.r[0] * (hasMonopoly(g, o, T.g) ? 2 : 1);
    if (T.t === 'rail') return 25 * Math.pow(2, RAILS.filter(r => g.own[r] === o).length - 1);
    if (T.t === 'util') return (sum || 7) * (UTILS.every(u => g.own[u] === o) ? 10 : 4);
    return 0;
  }
  const houseCost = t => (TILES[t].t === 'prop' ? GROUPS[TILES[t].g].hc : 0);
  const mortValue = t => Math.floor(TILES[t].p / 2);
  const unmortCost = t => Math.ceil(TILES[t].p / 2 * 1.1);
  function housesLeft(g) { return HOUSES - g.hs.reduce((s, h) => s + (h < 5 ? h : 0), 0); }
  function hotelsLeft(g) { return HOTELS - g.hs.filter(h => h === 5).length; }
  function worth(g, i) {
    const p = g.players[i];
    if (!p) return 0;
    let w = p.cash;
    for (let t = 0; t < 40; t++) if (g.own[t] === i) w += (g.mg[t] ? mortValue(t) : TILES[t].p) + g.hs[t] * houseCost(t);
    return w;
  }
  /** Uang maksimum yang bisa dikumpulkan (jual semua rumah + gadai semua). */
  function liquidity(g, i) {
    let w = g.players[i].cash;
    for (let t = 0; t < 40; t++) if (g.own[t] === i) w += Math.floor(g.hs[t] * houseCost(t) / 2) + (g.mg[t] ? 0 : mortValue(t));
    return w;
  }

  // ---------- manajemen properti ----------
  function canBuild(g, i, t) {
    const T = TILES[t];
    if (!T || T.t !== 'prop') return 'Hanya kota yang bisa dibangun';
    if (g.own[t] !== i) return 'Bukan milikmu';
    const gt = GROUP_TILES[T.g];
    if (!hasMonopoly(g, i, T.g)) return 'Harus memiliki semua kota warna ini';
    if (gt.some(x => g.mg[x])) return 'Tebus dulu kota yang digadaikan';
    const h = g.hs[t];
    if (h >= 5) return 'Sudah ada hotel';
    if (gt.some(x => g.hs[x] < h)) return 'Bangun merata: kota lain dulu';
    if (g.players[i].cash < houseCost(t)) return 'Uang tidak cukup';
    if (h === 4 ? hotelsLeft(g) < 1 : housesLeft(g) < 1) return h === 4 ? 'Stok hotel bank habis' : 'Stok rumah bank habis';
    return null;
  }
  function canSell(g, i, t) {
    const T = TILES[t];
    if (!T || T.t !== 'prop' || g.own[t] !== i) return 'Bukan milikmu';
    const h = g.hs[t];
    if (!h) return 'Tidak ada bangunan';
    if (GROUP_TILES[T.g].some(x => g.hs[x] > h)) return 'Jual merata: kota lain dulu';
    return null;
  }
  function canMort(g, i, t) {
    if (!isOwnable(t) || g.own[t] !== i) return 'Bukan milikmu';
    if (g.mg[t]) return 'Sudah digadaikan';
    if (TILES[t].t === 'prop' && GROUP_TILES[TILES[t].g].some(x => g.hs[x] > 0)) return 'Jual dulu bangunan di warna ini';
    return null;
  }
  function canUnmort(g, i, t) {
    if (!isOwnable(t) || g.own[t] !== i) return 'Bukan milikmu';
    if (!g.mg[t]) return 'Tidak digadaikan';
    if (g.players[i].cash < unmortCost(t)) return 'Uang tidak cukup';
    return null;
  }
  function manage(g, i, type, t) {
    t = t | 0;
    const p = g.players[i], T = TILES[t];
    let err;
    if (type === 'build') {
      if ((err = canBuild(g, i, t))) return err;
      p.cash -= houseCost(t); g.hs[t]++;
      log(g, `${p.name} membangun ${g.hs[t] === 5 ? 'hotel' : 'rumah'} di ${T.n}`);
    } else if (type === 'sell') {
      if ((err = canSell(g, i, t))) return err;
      // hotel kembali jadi 4 rumah; kalau stok rumah bank kurang, sisanya ikut dijual
      const nh = g.hs[t] === 5 ? Math.min(4, housesLeft(g)) : g.hs[t] - 1;
      p.cash += Math.floor(houseCost(t) / 2) * (g.hs[t] - nh);
      g.hs[t] = nh;
      log(g, `${p.name} menjual bangunan di ${T.n}`);
    } else if (type === 'mort') {
      if ((err = canMort(g, i, t))) return err;
      g.mg[t] = 1; p.cash += mortValue(t);
      log(g, `${p.name} menggadaikan ${T.n} (+${money(mortValue(t))})`);
    } else if (type === 'unmort') {
      if ((err = canUnmort(g, i, t))) return err;
      g.mg[t] = 0; p.cash -= unmortCost(t);
      log(g, `${p.name} menebus ${T.n} (-${money(unmortCost(t))})`);
    }
    return null;
  }

  // ---------- alur giliran ----------
  function logTurn(g) { log(g, `— Giliran ${nm(g, g.turn)} · putaran ${g.round} —`); }
  function addMv(g, m) {
    if (g.mvq !== g.seq) { g.mv = []; g.mid++; g.mvq = g.seq; }
    g.mv.push(m);
  }
  function finish(g) { g.step = g.again ? 'roll' : 'end'; }
  function cont(g, then) {
    if (then === 'jailmove') return move(g, g.turn, g.dice[0] + g.dice[1]);
    return finish(g);
  }
  function others(g, i) { return aliveList(g).filter(j => j !== i); }
  function transfer(g, i, amt, to) {
    g.players[i].cash -= amt;
    if (to >= 0 && alive(g, to)) g.players[to].cash += amt;
    else if (to === -2) {
      const o = others(g, i);
      if (o.length) { const each = Math.floor(amt / o.length); o.forEach(j => { g.players[j].cash += each; }); }
    }
  }
  /** Tagih pemain giliran; kalau uangnya kurang → fase utang. */
  function pay(g, i, amt, to, then) {
    const p = g.players[i];
    if (amt <= 0) return cont(g, then);
    if (p.cash >= amt) { transfer(g, i, amt, to); return cont(g, then); }
    g.debt = { p: i, a: amt, to, nx: then || 'land' };
    g.step = 'debt';
    log(g, `${p.name} kekurangan uang! Harus membayar ${money(amt)}.`);
  }
  function goJail(g, i) {
    const p = g.players[i];
    addMv(g, { p: i, f: p.pos, j: 1 });
    p.pos = 10; p.jail = 1;
    g.again = false; g.dbl = 0;
    log(g, `${p.name} masuk penjara! 🚔`);
    g.step = 'end';
  }
  function move(g, i, n, o) {
    const p = g.players[i], from = p.pos, to = (from + n) % 40;
    if (n > 0) addMv(g, { p: i, f: from, n, d: 1 });
    p.pos = to;
    if (n > 0 && to < from) { p.cash += GO_SALARY; log(g, `${p.name} melewati MULAI, terima ${money(GO_SALARY)}`); }
    land(g, i, o);
  }
  function moveTo(g, i, to, o) { move(g, i, (to - g.players[i].pos + 40) % 40, o); }
  function land(g, i, o) {
    o = o || {};
    const p = g.players[i], t = p.pos, T = TILES[t];
    switch (T.t) {
      case 'prop': case 'rail': case 'util': {
        const ow = g.own[t];
        if (ow < 0) { g.step = 'buy'; return; }
        if (ow === i) return finish(g);
        if (g.mg[t]) { log(g, `${T.n} sedang digadaikan — ${p.name} tidak bayar sewa`); return finish(g); }
        const sum = g.dice[0] + g.dice[1];
        let r = o.u10 ? sum * 10 : rent(g, t, sum);
        if (o.x2) r *= 2;
        log(g, `${p.name} membayar sewa ${T.n} ${money(r)} ke ${nm(g, ow)}`);
        return pay(g, i, r, ow);
      }
      case 'tax':
        log(g, `${p.name} membayar ${T.n} ${money(T.a)}`);
        return pay(g, i, T.a, -1);
      case 'chance': case 'chest': return drawCard(g, i, T.t);
      case 'gojail': return goJail(g, i);
      default: return finish(g);
    }
  }
  function drawCard(g, i, deck) {
    const p = g.players[i], d = g.decks[deck];
    if (!d.length) g.decks[deck] = shuffle(range((deck === 'chance' ? CHANCE : CHEST).length).filter(k => !g.players.some(q => q && q.jc.includes(deck + ':' + k))));
    const ci = g.decks[deck].shift();
    const C = (deck === 'chance' ? CHANCE : CHEST)[ci];
    if (C.x !== 'free') g.decks[deck].push(ci);
    g.card = { d: deck, i: ci, p: i, id: ++g.cid };
    addMv(g, { p: i, w: 1 });
    log(g, `${p.name} — ${DECK_NAME[deck]}: ${C.m}`);
    switch (C.x) {
      case 'move': return moveTo(g, i, C.to);
      case 'near': {
        let t = p.pos;
        do t = (t + 1) % 40; while (TILES[t].t !== C.k);
        return moveTo(g, i, t, C.k === 'rail' ? { x2: 1 } : { u10: 1 });
      }
      case 'back':
        addMv(g, { p: i, f: p.pos, n: C.n, d: -1 });
        p.pos = (p.pos + 40 - C.n) % 40;
        return land(g, i);
      case 'jail': return goJail(g, i);
      case 'cash':
        if (C.a > 0) { p.cash += C.a; return finish(g); }
        return pay(g, i, -C.a, -1);
      case 'repair': {
        let amt = 0;
        for (let t = 0; t < 40; t++) if (g.own[t] === i && g.hs[t]) amt += g.hs[t] === 5 ? C.o : g.hs[t] * C.h;
        if (amt) log(g, `${p.name} membayar ${money(amt)} untuk perbaikan`);
        return pay(g, i, amt, -1);
      }
      case 'each': {
        const o = others(g, i);
        if (C.a > 0) return pay(g, i, C.a * o.length, -2);
        o.forEach(j => { const q = g.players[j], x = Math.min(q.cash, -C.a); q.cash -= x; p.cash += x; });
        return finish(g);
      }
      case 'free': p.jc.push(deck + ':' + ci); return finish(g);
    }
    return finish(g);
  }
  function roll(g) {
    const i = g.turn, p = g.players[i];
    const a = 1 + Math.floor(rnd() * 6), b = 1 + Math.floor(rnd() * 6);
    g.dice = [a, b]; g.rid++;
    const dbl = a === b, sum = a + b;
    if (p.jail) {
      if (dbl) {
        p.jail = 0; g.again = false;
        log(g, `${p.name} melempar ${a} + ${b} — kembar! Bebas dari penjara.`);
        return move(g, i, sum);
      }
      p.jail++;
      if (p.jail > 3) {
        p.jail = 0; g.again = false;
        log(g, `${p.name} gagal 3 kali, wajib bayar denda ${money(JAIL_FINE)}`);
        return pay(g, i, JAIL_FINE, -1, 'jailmove');
      }
      log(g, `${p.name} melempar ${a} + ${b} — belum kembar, tetap di penjara.`);
      g.step = 'end';
      return;
    }
    if (dbl) {
      g.dbl++;
      if (g.dbl >= 3) { log(g, `${p.name} dapat kembar 3 kali berturut-turut!`); return goJail(g, i); }
    }
    g.again = dbl;
    log(g, `${p.name} melempar ${a} + ${b} = ${sum}${dbl ? ' (kembar, main lagi!)' : ''}`);
    move(g, i, sum);
  }
  function nextTurn(g) {
    const n = nextAlive(g, g.turn);
    if (n < 0) return;
    if (n <= g.turn) g.round++;
    g.turn = n; g.step = 'roll'; g.dbl = 0; g.again = false; g.tt = 0;
    if (aliveList(g).length > 1 && !(g.cfg.rounds && g.round > g.cfg.rounds)) logTurn(g);
  }

  // ---------- lelang ----------
  function startAuction(g, t) {
    const act = aliveList(g);
    g.auc = { t, bid: 0, by: -1, act, cur: -1 };
    g.step = 'auction';
    log(g, `${TILES[t].n} dilelang!`);
    aucNext(g, g.turn);
  }
  function aucNext(g, from) {
    const a = g.auc;
    const cands = a.act.filter(j => j !== a.by);
    if (!cands.length) return aucEnd(g);
    for (let k = 1; k <= 6; k++) { const j = (from + k) % 6; if (cands.includes(j)) { a.cur = j; return; } }
  }
  function aucEnd(g) {
    const a = g.auc;
    g.auc = null;
    if (a.by >= 0 && alive(g, a.by) && g.players[a.by].cash >= a.bid) {
      g.players[a.by].cash -= a.bid; g.own[a.t] = a.by;
      log(g, `${nm(g, a.by)} memenangkan lelang ${TILES[a.t].n} seharga ${money(a.bid)}`);
    } else log(g, `Tidak ada penawar untuk ${TILES[a.t].n}`);
    finish(g);
  }

  // ---------- tukar ----------
  function tradable(g, i, t) {
    if (!isOwnable(t) || g.own[t] !== i) return false;
    return TILES[t].t !== 'prop' || !GROUP_TILES[TILES[t].g].some(x => g.hs[x] > 0);
  }
  function validTrade(g, tr) {
    if (!tr || !alive(g, tr.from) || !alive(g, tr.to) || tr.from === tr.to) return 'Pemain tidak valid';
    const ok = (arr, who) => Array.isArray(arr) && new Set(arr).size === arr.length && arr.every(t => tradable(g, who, t));
    if (!ok(tr.gp, tr.from) || !ok(tr.tp, tr.to)) return 'Properti tidak bisa ditukar (cek bangunan)';
    if (!(tr.gc >= 0 && tr.tc >= 0)) return 'Jumlah uang tidak valid';
    if (tr.gc > g.players[tr.from].cash || tr.tc > g.players[tr.to].cash) return 'Uang tidak cukup';
    if (!tr.gp.length && !tr.tp.length && !(tr.gc || tr.tc)) return 'Tawaran kosong';
    if (!tr.gp.length && !tr.tp.length) return 'Harus ada properti yang ditukar';
    return null;
  }
  function proposeTrade(g, i, d) {
    const cleanList = a => (Array.isArray(a) ? a.map(x => x | 0).slice(0, 28) : []);
    const tr = { from: i, to: d.to | 0, gp: cleanList(d.gp), gc: Math.max(0, Math.round(+d.gc || 0)), tp: cleanList(d.tp), tc: Math.max(0, Math.round(+d.tc || 0)), id: ++g.tid };
    const err = validTrade(g, tr);
    if (err) return err;
    g.trade = tr; g.tt++;
    log(g, `${nm(g, i)} menawarkan tukar ke ${nm(g, tr.to)}`);
    return null;
  }
  function doTrade(g) {
    const tr = g.trade;
    g.trade = null;
    if (validTrade(g, tr)) { log(g, 'Tawaran tukar batal (sudah tidak valid)'); return; }
    tr.gp.forEach(t => { g.own[t] = tr.to; });
    tr.tp.forEach(t => { g.own[t] = tr.from; });
    g.players[tr.from].cash += tr.tc - tr.gc;
    g.players[tr.to].cash += tr.gc - tr.tc;
    log(g, `🤝 ${nm(g, tr.to)} menerima tawaran tukar dari ${nm(g, tr.from)}`);
  }

  // ---------- bangkrut ----------
  function bankrupt(g, i, to) {
    const p = g.players[i];
    if (!p || p.out) return;
    for (let t = 0; t < 40; t++) if (g.own[t] === i && g.hs[t]) { p.cash += Math.floor(g.hs[t] * houseCost(t) / 2); g.hs[t] = 0; }
    const cred = to >= 0 && to !== i && alive(g, to) ? g.players[to] : null;
    for (let t = 0; t < 40; t++) {
      if (g.own[t] !== i) continue;
      if (cred) g.own[t] = to; else { g.own[t] = -1; g.mg[t] = 0; }
    }
    if (cred) { cred.cash += Math.max(0, p.cash); cred.jc.push(...p.jc); }
    else p.jc.forEach(c => { const [d, k] = c.split(':'); g.decks[d].push(+k); });
    p.cash = 0; p.jc = []; p.jail = 0; p.out = true;
    log(g, `💥 ${p.name} BANGKRUT!${cred ? ` Semua aset diambil ${cred.name}.` : ''}`);
    if (g.debt && g.debt.p === i) g.debt = null;
    if (g.trade && (g.trade.from === i || g.trade.to === i)) g.trade = null;
    if (g.auc) {
      const a = g.auc;
      a.act = a.act.filter(j => j !== i);
      if (a.by === i) { a.by = -1; a.bid = 0; }
      if (a.cur === i || !a.act.includes(a.cur)) aucNext(g, i);
    }
    if (g.turn === i && g.step !== 'auction') { g.again = false; g.step = 'end'; }
  }
  function post(g) {
    if (g.phase !== 'play') return;
    if (g.step !== 'auction' && !alive(g, g.turn)) nextTurn(g);
    const al = aliveList(g);
    const limit = g.cfg.rounds && g.round > g.cfg.rounds && g.step === 'roll' && !g.trade;
    if (al.length <= 1 || limit) {
      g.phase = 'over';
      g.rank = al.map(i => [i, worth(g, i)]).sort((a, b) => b[1] - a[1]);
      g.winner = g.rank.length ? g.rank[0][0] : -1;
      g.trade = null; g.auc = null; g.debt = null;
      log(g, limit ? `Batas ${g.cfg.rounds} putaran tercapai.` : 'Hanya tersisa satu pemain.');
      if (g.winner >= 0) log(g, `🏆 ${nm(g, g.winner)} menang dengan kekayaan ${money(worth(g, g.winner))}!`);
    }
  }
  /** Pemain keluar dari room: dianggap bangkrut ke bank (atau ke penagih utangnya). */
  function removePlayer(g, i) {
    if (!g.players[i]) return;
    if (g.phase !== 'play') { g.players[i] = null; return; }
    if (!g.players[i].out) {
      bankrupt(g, i, g.debt && g.debt.p === i ? g.debt.to : -1);
      post(g);
      g.seq++;
    }
  }

  // ---------- aksi ----------
  const MANAGE = ['build', 'sell', 'mort', 'unmort'];
  function act0(g, i, t, d) {
    if (g.phase !== 'play') return 'Permainan belum berjalan';
    const p = g.players[i];
    if (!p || p.out) return 'Kamu tidak sedang bermain';
    if (MANAGE.includes(t)) return manage(g, i, t, d.t);
    if (t === 'resign') { bankrupt(g, i, g.debt && g.debt.p === i ? g.debt.to : -1); return null; }
    if (g.trade) {
      const tr = g.trade;
      if (t === 'tradeok' && i === tr.to) { doTrade(g); return null; }
      if (t === 'tradeno' && i === tr.to) {
        g.tmem[tr.from + '>' + tr.to + ':' + tr.tp.slice().sort((a, b) => a - b).join(',')] = g.round;
        g.trade = null; log(g, `${p.name} menolak tawaran tukar`); return null;
      }
      if (t === 'tradecancel' && i === tr.from) { g.trade = null; log(g, `${p.name} membatalkan tawaran tukar`); return null; }
      return 'Menunggu jawaban tawaran tukar';
    }
    if (g.step === 'auction') {
      const a = g.auc;
      if (i !== a.cur) return 'Bukan giliranmu menawar';
      if (t === 'bid') {
        const amt = Math.round(+d.a || 0);
        if (!(amt > a.bid)) return 'Tawaran harus lebih tinggi';
        if (amt > p.cash) return 'Uang tidak cukup';
        a.bid = amt; a.by = i;
        log(g, `${p.name} menawar ${money(amt)}`);
        aucNext(g, i);
        return null;
      }
      if (t === 'pass') {
        a.act = a.act.filter(j => j !== i);
        aucNext(g, i);
        return null;
      }
      return 'Aksi tidak valid saat lelang';
    }
    if (i !== g.turn) return 'Bukan giliranmu';
    const canTrade = ['roll', 'end', 'debt'].includes(g.step);
    if (t === 'trade') {
      if (!canTrade) return 'Tidak bisa menawar tukar sekarang';
      return proposeTrade(g, i, d);
    }
    switch (g.step) {
      case 'roll':
        if (t === 'roll') { roll(g); return null; }
        if (t === 'jailpay') {
          if (!p.jail) return 'Kamu tidak di penjara';
          if (p.cash < JAIL_FINE) return 'Uang tidak cukup';
          p.cash -= JAIL_FINE; p.jail = 0;
          log(g, `${p.name} membayar denda ${money(JAIL_FINE)} dan bebas`);
          return null;
        }
        if (t === 'jailcard') {
          if (!p.jail) return 'Kamu tidak di penjara';
          if (!p.jc.length) return 'Tidak punya kartu bebas penjara';
          const [dk, k] = p.jc.shift().split(':');
          g.decks[dk].push(+k);
          p.jail = 0;
          log(g, `${p.name} memakai kartu Bebas dari Penjara`);
          return null;
        }
        break;
      case 'buy': {
        const pos = p.pos, T = TILES[pos];
        if (t === 'buy') {
          if (p.cash < T.p) return 'Uang tidak cukup';
          p.cash -= T.p; g.own[pos] = i;
          log(g, `${p.name} membeli ${T.n} seharga ${money(T.p)}`);
          finish(g);
          return null;
        }
        if (t === 'decline') {
          if (g.cfg.auction) startAuction(g, pos);
          else { log(g, `${p.name} tidak membeli ${T.n}`); finish(g); }
          return null;
        }
        break;
      }
      case 'debt': {
        const db = g.debt;
        if (t === 'pay') {
          if (p.cash < db.a) return 'Uang masih kurang';
          g.debt = null;
          transfer(g, i, db.a, db.to);
          log(g, `${p.name} melunasi ${money(db.a)}`);
          cont(g, db.nx);
          return null;
        }
        if (t === 'bankrupt') { bankrupt(g, i, db.to); return null; }
        break;
      }
      case 'end':
        if (t === 'end') { nextTurn(g); return null; }
        break;
    }
    return 'Aksi tidak valid';
  }
  function act(g, i, t, d) {
    const err = act0(g, i, t, d || {});
    if (!err) { post(g); g.seq++; }
    return err;
  }
  function whoActs(g) {
    if (g.phase !== 'play') return -1;
    if (g.trade) return g.trade.to;
    if (g.step === 'auction' && g.auc) return g.auc.cur;
    return g.turn;
  }
  function publicState(g) {
    const s = JSON.parse(JSON.stringify(g));
    s.decks = null; s.tmem = null;
    return s;
  }
  function animTime(mv, rolled) {
    let ms = rolled ? ANIM.dice : 0;
    (mv || []).forEach(m => { ms += m.w ? ANIM.card : m.j ? ANIM.jump : m.n * ANIM.step + ANIM.seg; });
    return ms;
  }

  // ---------- bot ----------
  function reserveOf(g, i) {
    const lvl = g.players[i].bot || 2;
    if (lvl === 1) return 30;
    let danger = 0;
    for (let t = 0; t < 40; t++) { const o = g.own[t]; if (o >= 0 && o !== i && alive(g, o)) danger = Math.max(danger, rent(g, t, 7)); }
    return lvl === 2 ? Math.min(250, 60 + danger * 0.3) : Math.min(450, 80 + danger * 0.5);
  }
  /** Nilai portofolio kasar untuk menilai tukar/lelang. */
  function pf(own, mg, i) {
    let v = 0;
    for (let t = 0; t < 40; t++) {
      if (own[t] !== i) continue;
      const T = TILES[t];
      let b = T.p * (mg[t] ? 0.6 : 1);
      if (T.t === 'prop') {
        const gt = GROUP_TILES[T.g], k = gt.filter(x => own[x] === i).length;
        b *= k === gt.length ? 2.2 : k > 1 ? 1.25 : 1;
      } else if (T.t === 'rail') b *= [1, 1, 1.2, 1.5, 1.9][RAILS.filter(r => own[r] === i).length];
      else if (UTILS.every(u => own[u] === i)) b *= 1.3;
      v += b;
    }
    return v;
  }
  function tradeView(g, tr, who) {
    const own2 = g.own.slice();
    tr.gp.forEach(t => { own2[t] = tr.to; });
    tr.tp.forEach(t => { own2[t] = tr.from; });
    const other = who === tr.from ? tr.to : tr.from;
    const cashIn = who === tr.to ? tr.gc - tr.tc : tr.tc - tr.gc;
    return [pf(own2, g.mg, who) - pf(g.own, g.mg, who) + cashIn, pf(own2, g.mg, other) - pf(g.own, g.mg, other) - cashIn];
  }
  function tradeOk(g, tr, who, lvl) {
    lvl = lvl || (g.players[who] && g.players[who].bot) || 2;
    const [m, o] = tradeView(g, tr, who);
    return m > 0 && m >= o * [0, 0.25, 0.5, 0.8][lvl];
  }
  function botTrade(g, i) {
    const p = g.players[i], lvl = p.bot || 2;
    if (g.tt > 0 || rnd() > [0, 0.15, 0.3, 0.45][lvl]) return null;
    for (let k = GROUPS.length - 1; k >= 0; k--) {
      const gt = GROUP_TILES[k];
      const mine = gt.filter(t => g.own[t] === i), miss = gt.filter(t => g.own[t] !== i);
      if (!mine.length || !miss.length) continue;
      const owners = [...new Set(miss.map(t => g.own[t]))];
      const j = owners[0];
      if (owners.length !== 1 || !alive(g, j) || j === i) continue;
      if (!miss.every(t => tradable(g, j, t)) || !mine.every(t => tradable(g, i, t))) continue;
      const key = i + '>' + j + ':' + miss.slice().sort((a, b) => a - b).join(',');
      if (g.tmem[key] != null && g.round - g.tmem[key] < 4) continue;
      // tawarkan tukar properti yang dibutuhkan lawan untuk melengkapi warnanya
      let gp = [];
      for (let h = 0; h < GROUPS.length && !gp.length; h++) {
        if (h === k) continue;
        const ht = GROUP_TILES[h], hm = ht.filter(t => g.own[t] === i);
        if (hm.length && hm.length < ht.length && ht.every(t => g.own[t] === i || g.own[t] === j) && hm.every(t => tradable(g, i, t))) gp = hm;
      }
      const base = miss.reduce((s, t) => s + TILES[t].p, 0);
      const cap = Math.max(0, p.cash - 80);
      const tLvl = (g.players[j].bot) || 2;
      for (let c = gp.length ? 0 : Math.round(base * 1.2 / 10) * 10; c <= cap; c += 10) {
        const tr = { from: i, to: j, gp, gc: c, tp: miss, tc: 0 };
        if (!tradeOk(g, tr, i)) break;
        if (tradeOk(g, tr, j, tLvl)) return { t: 'trade', d: { to: j, gp, gc: c, tp: miss, tc: 0 } };
      }
    }
    return null;
  }
  function botManage(g, i) {
    const p = g.players[i], lvl = p.bot || 2, res = reserveOf(g, i) + (lvl === 1 ? 120 : 0);
    // tebus gadai kalau uang berlebih (prioritaskan warna yang sudah lengkap)
    let best = -1, bs = -1;
    for (let t = 0; t < 40; t++) {
      if (g.own[t] !== i || !g.mg[t] || p.cash - unmortCost(t) < res + 150) continue;
      const s = TILES[t].t === 'prop' && hasMonopoly(g, i, TILES[t].g) ? 2 : 1;
      if (s > bs) { bs = s; best = t; }
    }
    if (best >= 0) return { t: 'unmort', d: { t: best } };
    // bangun rumah di grup termahal
    best = -1; bs = -1;
    for (let t = 0; t < 40; t++) {
      if (canBuild(g, i, t) || p.cash - houseCost(t) < res) continue;
      const T = TILES[t], s = (T.r[g.hs[t] + 1] - T.r[g.hs[t]]) / houseCost(t) - g.hs[t] * 0.01;
      if (s > bs) { bs = s; best = t; }
    }
    if (best >= 0) return { t: 'build', d: { t: best } };
    return null;
  }
  function botRaise(g, i, need) {
    const p = g.players[i];
    if (p.cash >= need) return null;
    let best = -1;
    for (let t = 0; t < 40; t++) if (!canSell(g, i, t) && (best < 0 || g.hs[t] > g.hs[best])) best = t;
    if (best >= 0) return { t: 'sell', d: { t: best } };
    const cands = range(40).filter(t => !canMort(g, i, t));
    cands.sort((a, b) => {
      const ma = TILES[a].t === 'prop' && hasMonopoly(g, i, TILES[a].g) ? 1 : 0, mb = TILES[b].t === 'prop' && hasMonopoly(g, i, TILES[b].g) ? 1 : 0;
      return ma - mb || TILES[a].p - TILES[b].p;
    });
    if (cands.length) return { t: 'mort', d: { t: cands[0] } };
    return null;
  }
  function botBid(g, i) {
    const a = g.auc, p = g.players[i], lvl = p.bot || 2, T = TILES[a.t];
    const gt = T.t === 'prop' ? GROUP_TILES[T.g] : T.t === 'rail' ? RAILS : UTILS;
    const mineN = gt.filter(t => g.own[t] === i).length;
    const oth = [...new Set(gt.filter(t => g.own[t] >= 0 && g.own[t] !== i).map(t => g.own[t]))];
    let f = 1;
    if (mineN === gt.length - 1) f = 1.9;                         // melengkapi warna
    else if (oth.length === 1 && gt.filter(t => g.own[t] === oth[0]).length === gt.length - 1) f = 1.5; // cegah lawan lengkap
    else if (mineN) f = 1.25;
    if (lvl === 1) f *= 0.75 + rnd() * 0.4;
    const cap = Math.min(Math.round(T.p * f), p.cash - (lvl === 1 ? 0 : Math.min(reserveOf(g, i), 150)));
    const inc = Math.max(10, Math.round(T.p * 0.1 / 10) * 10);
    const next = a.bid ? a.bid + inc : Math.max(10, Math.round(T.p * 0.4 / 10) * 10);
    if (next <= cap) return { t: 'bid', d: { a: next } };
    if (a.bid + 1 <= cap && a.bid + 10 <= cap) return { t: 'bid', d: { a: cap } };
    return { t: 'pass' };
  }
  function botDecide(g, i) {
    const p = g.players[i];
    if (!p || p.out || g.phase !== 'play') return null;
    const lvl = p.bot || 2;
    if (g.trade) return g.trade.to === i ? { t: tradeOk(g, g.trade, i) ? 'tradeok' : 'tradeno' } : g.trade.from === i ? { t: 'tradecancel' } : null;
    if (g.step === 'auction') return g.auc && g.auc.cur === i ? botBid(g, i) : null;
    if (g.turn !== i) return null;
    if (g.step === 'debt') {
      const need = g.debt.a;
      if (p.cash >= need) return { t: 'pay' };
      if (liquidity(g, i) < need) return { t: 'bankrupt' };
      return botRaise(g, i, need) || { t: 'bankrupt' };
    }
    if (g.step === 'buy') {
      const t = p.pos, T = TILES[t];
      if (p.cash < T.p) return { t: 'decline' };
      const left = p.cash - T.p;
      const gt = T.t === 'prop' ? GROUP_TILES[T.g] : T.t === 'rail' ? RAILS : UTILS;
      const key = gt.filter(x => g.own[x] === i).length === gt.length - 1 ||
        [...new Set(gt.map(x => g.own[x]).filter(o => o >= 0 && o !== i))].some(o => gt.filter(x => g.own[x] === o).length === gt.length - 1);
      if (left >= reserveOf(g, i) || (key && left >= 0) || (lvl === 1 && rnd() < 0.85)) return { t: 'buy' };
      return { t: 'decline' };
    }
    const m = botManage(g, i);
    if (m) return m;
    if (g.step === 'roll' || g.step === 'end') { const tr = botTrade(g, i); if (tr) return tr; }
    if (g.step === 'roll') {
      if (p.jail) {
        const unowned = range(40).filter(t => isOwnable(t) && g.own[t] < 0).length;
        const early = unowned > 8;
        if (p.jc.length && (early || lvl === 1)) return { t: 'jailcard' };
        if (early && p.cash >= JAIL_FINE + reserveOf(g, i)) return { t: 'jailpay' };
      }
      return { t: 'roll' };
    }
    if (g.step === 'end') return { t: 'end' };
    return null;
  }
  /** Aksi otomatis untuk pemain manusia yang waktu habis / terputus. */
  function autoDecide(g, i) {
    if (g.trade) return g.trade.to === i ? { t: 'tradeno' } : g.trade.from === i ? { t: 'tradecancel' } : null;
    if (g.step === 'auction') return g.auc && g.auc.cur === i ? { t: 'pass' } : null;
    if (g.turn !== i) return null;
    if (g.step === 'roll') return { t: 'roll' };
    if (g.step === 'buy') return { t: 'decline' };
    if (g.step === 'end') return { t: 'end' };
    if (g.step === 'debt') return botDecide(g, i);
    return null;
  }

  return Object.assign(api, {
    GROUPS, TILES, GROUP_TILES, RAILS, UTILS, CHANCE, CHEST, DECK_NAME, ANIM, GO_SALARY, JAIL_FINE, HOUSES, HOTELS,
    money, isOwnable, createGame, addPlayer, startGame, resetGame, removePlayer,
    rent, hasMonopoly, houseCost, mortValue, unmortCost, housesLeft, hotelsLeft, worth, liquidity,
    canBuild, canSell, canMort, canUnmort, tradable, validTrade, tradeView, tradeOk,
    act, whoActs, publicState, animTime, botDecide, autoDecide, aliveList,
  });
});
