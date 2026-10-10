// Jalankan: node tests/engine.test.js
'use strict';
const E = require('../engine.js');
const assert = require('assert');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
function seeded(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/** Paksa hasil dadu berikutnya: rng dipanggil 2x per lempar. */
function diceSeq(pairs) {
  const q = [];
  pairs.forEach(([a, b]) => q.push((a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01));
  return () => (q.length ? q.shift() : 0.5);
}
function newGame(n, cfg) {
  const g = E.createGame(cfg);
  for (let i = 0; i < n; i++) E.addPlayer(g, i, { id: 'p' + i, name: 'P' + i });
  E.rng = seeded(7);
  E.startGame(g);
  g.turn = 0; g.round = 1;
  return g;
}
const ok = (g, i, t, d) => { const e = E.act(g, i, t, d); assert.strictEqual(e, null, `${t}: ${e}`); };

console.log('Papan');
test('40 petak, 22 kota, 4 stasiun, 2 utilitas', () => {
  assert.strictEqual(E.TILES.length, 40);
  assert.strictEqual(E.TILES.filter(t => t.t === 'prop').length, 22);
  assert.deepStrictEqual(E.TILES.map((t, i) => (t.t === 'rail' ? i : -1)).filter(i => i >= 0), E.RAILS);
  assert.deepStrictEqual(E.GROUP_TILES.map(a => a.length), [2, 3, 3, 3, 3, 3, 3, 2]);
  assert.strictEqual(E.money(1500), 'Rp 15jt');
  assert.strictEqual(E.money(60), 'Rp 600rb');
  assert.strictEqual(E.money(1234), 'Rp 12,34jt');
});

console.log('Sewa');
test('sewa dasar, monopoli ×2, rumah, stasiun, utilitas', () => {
  const g = newGame(2);
  g.own[1] = 1;
  assert.strictEqual(E.rent(g, 1, 7), 2);
  g.own[3] = 1;
  assert.strictEqual(E.rent(g, 1, 7), 4);
  g.hs[1] = 3;
  assert.strictEqual(E.rent(g, 1, 7), 90);
  g.mg[3] = 1;
  assert.strictEqual(E.rent(g, 3, 7), 0);
  g.own[5] = 1; g.own[15] = 1;
  assert.strictEqual(E.rent(g, 5, 7), 50);
  g.own[12] = 1;
  assert.strictEqual(E.rent(g, 12, 8), 32);
  g.own[28] = 1;
  assert.strictEqual(E.rent(g, 12, 8), 80);
});

console.log('Giliran');
test('lempar, beli, lewat MULAI', () => {
  const g = newGame(2);
  E.rng = diceSeq([[2, 1]]);
  ok(g, 0, 'roll');
  assert.strictEqual(g.players[0].pos, 3);
  assert.strictEqual(g.step, 'buy');
  ok(g, 0, 'buy');
  assert.strictEqual(g.own[3], 0);
  assert.strictEqual(g.players[0].cash, 1440);
  assert.strictEqual(g.step, 'end');
  ok(g, 0, 'end');
  assert.strictEqual(g.turn, 1);
  g.players[1].pos = 38;
  E.rng = diceSeq([[1, 2]]);
  ok(g, 1, 'roll');
  assert.strictEqual(g.players[1].pos, 1);
  assert.strictEqual(g.players[1].cash, 1700);
  assert.strictEqual(E.act(g, 0, 'roll'), 'Bukan giliranmu');
});
test('bayar sewa ke pemilik', () => {
  const g = newGame(2);
  g.own[6] = 1;
  E.rng = diceSeq([[4, 2]]);
  ok(g, 0, 'roll');
  assert.strictEqual(g.players[0].cash, 1494);
  assert.strictEqual(g.players[1].cash, 1506);
  assert.strictEqual(g.step, 'end');
});
test('kembar main lagi, kembar 3× masuk penjara', () => {
  const g = newGame(2);
  E.rng = diceSeq([[1, 1], [2, 2], [3, 3]]);
  ok(g, 0, 'roll'); // ke 2 (Dana Umum) → kartu
  assert.strictEqual(g.step === 'roll' || g.step === 'buy' || g.step === 'debt', true);
  g.step = 'roll'; g.players[0].pos = 0; g.again = true;
  ok(g, 0, 'roll');
  g.step = 'roll'; g.players[0].pos = 0; g.again = true;
  ok(g, 0, 'roll');
  assert.strictEqual(g.players[0].pos, 10);
  assert.strictEqual(g.players[0].jail, 1);
  assert.strictEqual(g.step, 'end');
});
test('penjara: diam 2 giliran, giliran ke-3 bebas jalan normal tanpa denda', () => {
  const g = newGame(2);
  const p = g.players[0];
  p.pos = 10; p.jail = 1;
  E.rng = diceSeq([[1, 2], [4, 1], [1, 2], [4, 1], [2, 3]]);
  ok(g, 0, 'roll'); assert.strictEqual(g.step, 'end'); assert.strictEqual(p.jail, 2); assert.strictEqual(p.pos, 10);
  ok(g, 0, 'end'); ok(g, 1, 'roll'); if (g.step === 'buy') ok(g, 1, 'decline'); while (g.step === 'auction') ok(g, E.whoActs(g), 'pass');
  ok(g, 1, 'end');
  ok(g, 0, 'roll'); assert.strictEqual(p.jail, 3); assert.strictEqual(p.pos, 10);
  ok(g, 0, 'end'); ok(g, 1, 'roll'); if (g.step === 'buy') ok(g, 1, 'decline'); while (g.step === 'auction') ok(g, E.whoActs(g), 'pass');
  ok(g, 1, 'end');
  assert.strictEqual(p.jail, 0); // masa tahanan habis di awal giliran ke-3
  ok(g, 0, 'roll');
  assert.strictEqual(p.pos, 15);
  assert.strictEqual(p.cash, 1500);
  assert.strictEqual(E.act(g, 0, 'jailpay'), 'Aksi tidak valid');
});
test('penjara: lempar kembar langsung bebas', () => {
  const g = newGame(2);
  const p = g.players[0];
  p.pos = 10; p.jail = 1;
  E.rng = diceSeq([[3, 3]]);
  ok(g, 0, 'roll');
  assert.strictEqual(p.jail, 0);
  assert.strictEqual(p.pos, 16);
  assert.strictEqual(g.again, false);
});
test('petak Masuk Penjara', () => {
  const g = newGame(2);
  g.players[0].pos = 25;
  E.rng = diceSeq([[2, 3]]);
  ok(g, 0, 'roll');
  assert.strictEqual(g.players[0].pos, 10);
  assert.strictEqual(g.players[0].jail, 1);
  assert.strictEqual(g.players[0].cash, 1500);
});

console.log('Bangunan & gadai');
test('bangun merata, hotel, jual, gadai, tebus', () => {
  const g = newGame(2);
  g.own[1] = 0;
  assert(E.canBuild(g, 0, 1));
  g.own[3] = 0;
  ok(g, 0, 'build', { t: 1 });
  assert.strictEqual(E.act(g, 0, 'build', { t: 1 }), 'Bangun merata: kota lain dulu');
  ok(g, 0, 'build', { t: 3 });
  for (let k = 0; k < 3; k++) { ok(g, 0, 'build', { t: 1 }); ok(g, 0, 'build', { t: 3 }); }
  assert.strictEqual(g.hs[1], 4);
  ok(g, 0, 'build', { t: 1 });
  assert.strictEqual(g.hs[1], 5);
  assert.strictEqual(E.hotelsLeft(g), 11);
  assert.strictEqual(E.housesLeft(g), 28);
  assert.strictEqual(E.act(g, 0, 'sell', { t: 3 }), 'Jual merata: kota lain dulu');
  assert(E.act(g, 0, 'mort', { t: 3 }));
  ok(g, 0, 'sell', { t: 1 });
  while (g.hs[1] || g.hs[3]) ok(g, 0, 'sell', { t: g.hs[1] >= g.hs[3] ? 1 : 3 });
  const c = g.players[0].cash;
  ok(g, 0, 'mort', { t: 3 });
  assert.strictEqual(g.players[0].cash, c + 30);
  assert(E.canBuild(g, 0, 1));
  ok(g, 0, 'unmort', { t: 3 });
  assert.strictEqual(g.players[0].cash, c + 30 - 33);
});

console.log('Kartu');
test('kartu mundur 3 langkah & bebas penjara', () => {
  const g = newGame(2);
  g.decks.chance = [10, 9];
  g.players[0].pos = 3;
  E.rng = diceSeq([[2, 2]]);
  ok(g, 0, 'roll'); // 7 Kesempatan → mundur ke 4 (pajak)
  assert.strictEqual(g.players[0].pos, 4);
  assert.strictEqual(g.players[0].cash, 1500 - 200);
  assert.strictEqual(g.card.i, 10);
  assert.deepStrictEqual(g.mv.map(m => (m.w ? 'w' : m.d)), [1, 'w', -1]);
  g.step = 'roll'; g.again = false;
  g.players[0].pos = 3;
  E.rng = diceSeq([[1, 3]]);
  ok(g, 0, 'roll');
  assert.deepStrictEqual(g.players[0].jc, ['chance:9']);
  assert(!g.decks.chance.includes(9));
  g.players[0].jail = 1; g.step = 'roll';
  ok(g, 0, 'jailcard');
  assert.strictEqual(g.players[0].jail, 0);
  assert(g.decks.chance.includes(9));
});
test('ke stasiun terdekat bayar 2×', () => {
  const g = newGame(2);
  g.own[15] = 1;
  g.decks.chance = [5];
  g.players[0].pos = 3;
  E.rng = diceSeq([[2, 2]]);
  ok(g, 0, 'roll');
  assert.strictEqual(g.players[0].pos, 15);
  assert.strictEqual(g.players[1].cash, 1550);
});
test('kartu pesawat: pilih tujuan, lewat MULAI, tiket berbayar, boleh menolak', () => {
  const g = newGame(2);
  g.decks.chance = [16];
  g.players[0].pos = 3;
  E.rng = diceSeq([[1, 3]]);
  ok(g, 0, 'roll'); // 7 Kesempatan → tiket gratis
  assert.strictEqual(g.step, 'fly');
  assert(E.act(g, 0, 'fly', { t: 7 }), 'tidak boleh terbang ke petak sendiri');
  assert(E.act(g, 0, 'roll'));
  ok(g, 0, 'fly', { t: 1 }); // lewat MULAI → Jayapura
  assert.strictEqual(g.players[0].pos, 1);
  assert.strictEqual(g.players[0].cash, 1700);
  assert.strictEqual(g.step, 'buy');
  assert(g.mv.some(m => m.fl && m.t === 1));
  assert.strictEqual(g.fly, null);

  const h = newGame(2);
  h.decks.chance = [17];
  h.players[0].pos = 3; h.players[0].cash = 90;
  E.rng = diceSeq([[1, 3]]);
  ok(h, 0, 'roll'); // tiket Rp 1jt
  assert.strictEqual(h.fly.c, 100);
  assert(E.act(h, 0, 'fly', { t: 20 }), 'uang kurang untuk tiket');
  ok(h, 0, 'nofly');
  assert.strictEqual(h.step, 'end');
  assert.strictEqual(h.players[0].pos, 7);
  h.step = 'fly'; h.fly = { c: 100 }; h.players[0].cash = 500;
  ok(h, 0, 'fly', { t: 20 }); // Bebas Parkir
  assert.strictEqual(h.players[0].cash, 400);
  assert.strictEqual(h.step, 'end');
});
test('bot memakai kartu pesawat untuk melengkapi warna', () => {
  const g = newGame(2);
  g.players[0].bot = 2;
  g.own[37] = 0; g.players[0].pos = 7; g.step = 'fly'; g.fly = { c: 0 };
  assert.deepStrictEqual(E.botDecide(g, 0), { t: 'fly', d: { t: 39 } });
  g.fly = { c: 100 }; g.players[0].cash = 120;
  assert.strictEqual(E.botDecide(g, 0).t, 'nofly');
});
test('kartu Bebas Sewa disimpan lalu otomatis dipakai', () => {
  const g = newGame(2);
  g.decks.chest = [19];
  g.own[5] = 1;
  E.rng = diceSeq([[1, 1], [1, 2]]);
  ok(g, 0, 'roll'); // 2 Dana Umum
  assert.deepStrictEqual(g.players[0].sc, ['chest:19']);
  assert(!g.decks.chest.includes(19));
  ok(g, 0, 'roll'); // kembar → lempar lagi, 5 Stasiun Gambir milik P1
  assert.strictEqual(g.players[0].cash, 1500);
  assert.strictEqual(g.players[1].cash, 1500);
  assert.deepStrictEqual(g.players[0].sc, []);
  assert(g.decks.chest.includes(19));
});
test('kartu banjir, pajak kekayaan, lempar lagi, maju ke properti kosong', () => {
  const g = newGame(2);
  g.own[37] = 0; g.own[39] = 0; g.hs[37] = 2; g.hs[39] = 2;
  g.decks.chance = [22, 21, 19, 20];
  g.players[0].pos = 33;
  E.rng = diceSeq([[1, 2]]);
  ok(g, 0, 'roll'); // 36 → banjir: rumah di Jakarta (termahal) rusak
  assert.deepStrictEqual([g.hs[37], g.hs[39]], [2, 1]);
  g.step = 'roll'; g.players[0].pos = 33;
  E.rng = diceSeq([[1, 2]]);
  ok(g, 0, 'roll'); // pajak kekayaan 10%
  assert.strictEqual(g.players[0].cash, 1350);
  g.step = 'roll'; g.players[0].pos = 33;
  E.rng = diceSeq([[1, 2]]);
  ok(g, 0, 'roll'); // lempar lagi
  assert.strictEqual(g.step, 'roll');
  g.players[0].pos = 33;
  E.rng = diceSeq([[1, 2]]);
  ok(g, 0, 'roll'); // maju ke properti kosong terdekat: 37/39 milik sendiri → lewat MULAI ke Jayapura
  assert.strictEqual(g.players[0].pos, 1);
  assert.strictEqual(g.step, 'buy');
});

console.log('Lelang');
test('tolak beli → lelang, pemenang bayar', () => {
  const g = newGame(3);
  E.rng = diceSeq([[3, 3]]);
  ok(g, 0, 'roll'); // 6 Kupang
  ok(g, 0, 'decline');
  assert.strictEqual(g.step, 'auction');
  assert.strictEqual(E.whoActs(g), 1);
  ok(g, 1, 'bid', { a: 50 });
  assert.strictEqual(E.act(g, 2, 'bid', { a: 40 }), 'Tawaran harus lebih tinggi');
  ok(g, 2, 'bid', { a: 60 });
  ok(g, 0, 'pass');
  ok(g, 1, 'pass');
  assert.strictEqual(g.own[6], 2);
  assert.strictEqual(g.players[2].cash, 1440);
  assert.strictEqual(g.step, 'roll'); // kembar → main lagi
  assert.strictEqual(g.turn, 0);
});

console.log('Utang & bangkrut');
test('utang lalu gadai lalu bayar', () => {
  const g = newGame(2);
  g.own[39] = 1; g.own[37] = 1; g.hs[39] = 5; g.hs[37] = 5;
  g.own[1] = 0; g.own[5] = 0;
  g.players[0].cash = 1000; g.players[0].pos = 33;
  E.rng = diceSeq([[4, 2]]);
  ok(g, 0, 'roll');
  assert.strictEqual(g.step, 'debt');
  assert.strictEqual(g.debt.a, 2000);
  assert.strictEqual(E.act(g, 0, 'pay'), 'Uang masih kurang');
  assert.strictEqual(E.act(g, 0, 'end'), 'Aksi tidak valid');
  ok(g, 0, 'bankrupt');
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winner, 1);
  assert.strictEqual(g.own[1], 1);
  assert.strictEqual(g.own[5], 1);
  assert.strictEqual(g.players[1].cash, 1500 + 1000);
});
test('bangkrut ke bank mengembalikan properti', () => {
  const g = newGame(3);
  g.own[1] = 0; g.own[3] = 0; g.hs[1] = 1; g.hs[3] = 1; g.mg[5] = 1; g.own[5] = 0;
  g.players[0].cash = 10; g.players[0].pos = 2;
  E.rng = diceSeq([[1, 1]]);
  ok(g, 0, 'roll'); // 4 pajak 200
  assert.strictEqual(g.step, 'debt');
  const d = E.botDecide(g, 0);
  assert.strictEqual(d.t, 'bankrupt');
  ok(g, 0, 'bankrupt');
  assert.strictEqual(g.own[1], -1); assert.strictEqual(g.hs[1], 0); assert.strictEqual(g.mg[5], 0);
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turn, 1);
});

console.log('Tukar');
test('tawar tukar, terima, tolak', () => {
  const g = newGame(2);
  g.own[1] = 0; g.own[3] = 1; g.own[6] = 1;
  ok(g, 0, 'trade', { to: 1, gp: [1], gc: 100, tp: [3], tc: 0 });
  assert.strictEqual(E.whoActs(g), 1);
  assert.strictEqual(E.act(g, 0, 'roll'), 'Menunggu jawaban tawaran tukar');
  ok(g, 1, 'tradeok');
  assert.strictEqual(g.own[1], 1); assert.strictEqual(g.own[3], 0);
  assert.strictEqual(g.players[0].cash, 1400); assert.strictEqual(g.players[1].cash, 1600);
  ok(g, 0, 'trade', { to: 1, gp: [], gc: 10, tp: [6], tc: 0 });
  ok(g, 1, 'tradeno');
  assert.strictEqual(g.trade, null);
  assert(E.act(g, 0, 'trade', { to: 1, gp: [], gc: 10, tp: [], tc: 0 }));
  g.own[8] = 1; g.own[9] = 1; g.hs[6] = 1; g.hs[8] = 1; g.hs[9] = 1;
  assert(E.act(g, 0, 'trade', { to: 1, gp: [], gc: 10, tp: [6], tc: 0 }));
});
test('bot menolak tawaran murah yang memberi lawan monopoli', () => {
  const g = newGame(2);
  g.players[1].bot = 2;
  g.own[1] = 0; g.own[3] = 1;
  ok(g, 0, 'trade', { to: 1, gp: [], gc: 60, tp: [3], tc: 0 });
  assert.strictEqual(E.botDecide(g, 1).t, 'tradeno');
  ok(g, 1, 'tradeno');
  g.tt = 0;
  ok(g, 0, 'trade', { to: 1, gp: [], gc: 300, tp: [3], tc: 0 });
  assert.strictEqual(E.botDecide(g, 1).t, 'tradeok');
});

console.log('Mode Langsung Bangun');
test('beli tanah + 1 rumah, 1 upgrade per kunjungan, hanya di petak tempat berhenti', () => {
  const g = newGame(2, { build: 'direct' });
  E.rng = diceSeq([[3, 3]]);
  assert.strictEqual(E.act(g, 0, 'roll'), null); // 6 Kupang (kembar → main lagi)
  assert.strictEqual(g.step, 'buy');
  ok(g, 0, 'buy', { h: 3 }); // dibatasi jadi 1 rumah
  assert.strictEqual(g.own[6], 0);
  assert.strictEqual(g.hs[6], 1);
  assert.strictEqual(g.players[0].cash, 1500 - 100 - 50);
  assert.strictEqual(E.act(g, 0, 'build', { t: 6 }), 'Sudah upgrade di kunjungan ini — upgrade lagi saat mampir berikutnya');
  g.bt = -1; // anggap kunjungan berikutnya
  ok(g, 0, 'build', { t: 6 }); // tanpa syarat satu warna
  assert.strictEqual(g.hs[6], 2);
  g.bt = -1; ok(g, 0, 'build', { t: 6 });
  assert.strictEqual(g.hs[6], 3);
  g.own[1] = 0;
  assert.strictEqual(E.act(g, 0, 'build', { t: 1 }), 'Bangun rumah saat pionmu berhenti di kota ini');
  assert.strictEqual(E.rent(g, 6, 7), 270);
  ok(g, 0, 'sell', { t: 6 }); // tanpa aturan jual merata
  assert(E.canMort(g, 0, 6));
  assert.strictEqual(E.canMort(g, 0, 1), null);
  assert(E.tradable(g, 0, 1) && !E.tradable(g, 0, 6));
  E.rng = diceSeq([[1, 2]]);
  ok(g, 0, 'roll'); // lempar lagi → 9 Palu
  assert(E.canBuild(g, 0, 6));
  g.players[0].pos = 6; g.at = 6; g.bt = -1; // mampir lagi
  assert.strictEqual(E.canBuild(g, 0, 6), null);
});
test('mode klasik menolak beli rumah langsung', () => {
  const g = newGame(2);
  E.rng = diceSeq([[3, 3]]);
  ok(g, 0, 'roll');
  assert.strictEqual(E.act(g, 0, 'buy', { h: 1 }), 'Rumah tidak bisa dibeli langsung di mode ini');
});
test('150 game bot mode langsung bangun selesai', () => {
  let ended = 0, builds = 0;
  for (let s = 1; s <= 150; s++) {
    E.rng = seeded(s * 104729);
    const n = 2 + (s % 4);
    const g = E.createGame({ rounds: s % 2 ? 40 : 0, build: 'direct' });
    for (let i = 0; i < n; i++) E.addPlayer(g, i, { id: 'b' + i, name: 'B' + i, bot: 1 + ((s + i) % 3) });
    E.startGame(g);
    let steps = 0;
    while (g.phase === 'play' && steps < 40000) {
      const w = E.whoActs(g), d = E.botDecide(g, w);
      assert(d, `bot tanpa keputusan (step ${g.step})`);
      const err = E.act(g, w, d.t, d.d);
      assert.strictEqual(err, null, `aksi bot gagal: ${d.t} → ${err}`);
      if (d.t === 'build') builds++;
      g.players.forEach(p => { if (p && !p.out) assert(p.cash >= 0, 'uang negatif'); });
      assert(E.housesLeft(g) >= 0 && E.hotelsLeft(g) >= 0);
      steps++;
    }
    if (g.phase === 'over') ended++;
  }
  console.log(`    ${ended}/150 selesai · ${builds} bangun`);
  assert(ended >= 145 && builds > 0);
});

console.log('Simulasi bot');
test('300 game bot selesai tanpa error & invariant terjaga', () => {
  let ended = 0, turns = 0, trades = 0, auctions = 0, builds = 0, flights = 0;
  for (let s = 1; s <= 300; s++) {
    E.rng = seeded(s * 7919);
    const n = 2 + (s % 5);
    const g = E.createGame({ rounds: s % 3 === 0 ? 30 : 0, auction: s % 4 ? 1 : 0 });
    for (let i = 0; i < n; i++) E.addPlayer(g, i, { id: 'b' + i, name: 'B' + i, bot: 1 + ((s + i) % 3) });
    E.startGame(g);
    let steps = 0;
    while (g.phase === 'play' && steps < 40000) {
      const w = E.whoActs(g);
      const d = E.botDecide(g, w);
      assert(d, `bot tanpa keputusan (step ${g.step})`);
      const err = E.act(g, w, d.t, d.d);
      assert.strictEqual(err, null, `aksi bot gagal: ${d.t} ${JSON.stringify(d.d)} → ${err} (step ${g.step})`);
      if (d.t === 'end') turns++;
      if (d.t === 'tradeok') trades++;
      if (d.t === 'decline' && g.step === 'auction') auctions++;
      if (d.t === 'build') builds++;
      if (d.t === 'fly') flights++;
      g.players.forEach((p, i) => {
        if (!p || p.out) return;
        assert(p.cash >= 0, 'uang negatif');
        assert(p.pos >= 0 && p.pos < 40);
      });
      for (let t = 0; t < 40; t++) {
        assert(g.hs[t] >= 0 && g.hs[t] <= 5);
        if (g.hs[t]) assert(E.hasMonopoly(g, g.own[t], E.TILES[t].g), 'rumah tanpa monopoli');
        if (g.own[t] >= 0) assert(!g.players[g.own[t]].out, 'properti milik pemain bangkrut');
      }
      assert(E.housesLeft(g) >= 0 && E.hotelsLeft(g) >= 0);
      steps++;
    }
    if (g.phase === 'over') ended++;
  }
  console.log(`    ${ended}/300 selesai · ${turns} giliran · ${trades} tukar · ${auctions} lelang · ${builds} bangun · ${flights} terbang`);
  assert(ended >= 280, 'terlalu banyak game tidak selesai');
  assert(trades > 0 && builds > 0 && flights > 0);
});

console.log(`\n${passed} test lulus.`);
