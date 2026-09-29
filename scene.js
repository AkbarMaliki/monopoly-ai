/* Monopoli Indonesia — scene Three.js: papan bertekstur canvas, pion, dadu, rumah/hotel, penanda pemilik, animasi. */
window.Scene3D = (() => {
  'use strict';
  const E = window.MonoEngine;
  const C = 1.6, W = 1.0, S = 2 * C + 9 * W, H = S / 2; // ukuran sudut, petak, papan
  const PCOL = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];
  const DICE_FACE = [3, 4, 1, 6, 2, 5]; // urutan material BoxGeometry: +x, -x, +y, -y, +z, -z
  const DICE_REST = [[-0.5, 3.15], [0.45, 3.4]];
  const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

  let renderer, scene, camera, controls, opts = {}, maxAniso = 1, canvasEl;
  let view = null, first = true, lastRid = -1, lastMid = -1, tagIdx = -1, focusIdx = -1, hover = -1, uiFocus = -1;
  let hlFocus, hlHover, turnRing, tagEl, diceAnim = null, cur = null, wasBusy = false;
  const tokens = [], diceM = [], ownTabs = {}, houseGroups = {}, mortPlanes = {}, flags = {}, queue = [], pops = [];
  const shared = {};

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /** Warna hex (sRGB) → linear, karena renderer memakai output sRGB (tanpa ini warna jadi pucat). */
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(cv) { const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso; return t; }
  function rr(x, px, py, w, h, r) {
    x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
  }

  // ---------- geometri petak ----------
  function tileInfo(i) {
    const side = Math.floor(i / 10), k = i % 10;
    const IN = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    const AL = [[-1, 0], [0, -1], [1, 0], [0, 1]][side];
    let x, z;
    if (k === 0) [x, z] = [[H - C / 2, H - C / 2], [-H + C / 2, H - C / 2], [-H + C / 2, -H + C / 2], [H - C / 2, -H + C / 2]][side];
    else {
      const o = H - C - (k - 0.5) * W;
      if (side === 0) { x = o; z = H - C / 2; } else if (side === 1) { x = -H + C / 2; z = o; } else if (side === 2) { x = -o; z = -H + C / 2; } else { x = H - C / 2; z = -o; }
    }
    return { x, z, side, corner: k === 0, inx: IN[0], inz: IN[1], ax: AL[0], az: AL[1] };
  }
  function slotPos(i, pi, jailed) {
    const T = tileInfo(i), col = pi % 3, row = (pi / 3) | 0;
    if (i === 10) {
      if (jailed) return V(-H + C / 2 + 0.25 + (col - 1) * 0.3, 0, H - C / 2 - 0.25 + (row - 0.5) * 0.38);
      const vis = [[-0.58, 0.58], [-0.12, 0.6], [0.3, 0.6], [0.7, 0.6], [-0.6, 0.12], [-0.6, -0.34]][pi];
      return V(-H + C / 2 + vis[0], 0, H - C / 2 + vis[1]);
    }
    if (T.corner) return V(T.x + (col - 1) * 0.4, 0, T.z + (row - 0.5) * 0.45);
    const du = (col - 1) * 0.3, dv = row ? -0.36 : 0.06;
    return V(T.x + T.inx * dv + T.ax * du, 0, T.z + T.inz * dv + T.az * du);
  }
  function tileAt(x, z) {
    if (Math.abs(x) > H || Math.abs(z) > H) return -1;
    const e = H - C;
    if (Math.abs(x) < e && Math.abs(z) < e) return -1;
    if (z > e) { if (x > e) return 0; if (x < -e) return 10; return 1 + Math.floor((e - x) / W); }
    if (x < -e) { if (z < -e) return 20; return 11 + Math.floor((e - z) / W); }
    if (z < -e) { if (x > e) return 30; return 21 + Math.floor((x + e) / W); }
    return 31 + Math.floor((z + e) / W);
  }

  // ---------- tekstur papan ----------
  function wrap(x, s, max) {
    const words = s.split(' '), lines = [];
    let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (line && x.measureText(t).width > max) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }
  function text(x, s, px, py, size, color, weight, font, maxW) {
    x.font = `${weight || 'bold'} ${size}px ${font || '"Segoe UI", Roboto, Arial, sans-serif'}`;
    if (maxW) { while (x.measureText(s).width > maxW && size > 8) { size *= 0.92; x.font = `${weight || 'bold'} ${size}px ${font || '"Segoe UI", Roboto, Arial, sans-serif'}`; } }
    x.fillStyle = color || '#1b1b1b'; x.fillText(s, px, py);
  }
  function lines(x, s, py, size, u, color) {
    x.font = `bold ${size}px "Segoe UI", Roboto, Arial, sans-serif`;
    const ls = wrap(x, s.toUpperCase(), W * u * 0.86);
    ls.forEach((l, k) => text(x, l, 0, py + k * size * 1.1, size, color, 'bold', null, W * u * 0.9));
    return ls.length;
  }
  function drawTile(x, i, u) {
    const T = E.TILES[i], ti = tileInfo(i);
    x.save();
    x.translate((ti.x + H) * u, (ti.z + H) * u);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (ti.corner) { drawCorner(x, i, u); x.restore(); return; }
    x.rotate(ti.side * Math.PI / 2);
    const w = W * u, h = C * u, top = -h / 2;
    x.fillStyle = '#f7f2e4'; x.fillRect(-w / 2, -h / 2, w, h);
    const price = y => text(x, E.money(T.p), 0, y, 0.14 * u, '#222', '600');
    if (T.t === 'prop') {
      x.fillStyle = E.GROUPS[T.g].c; x.fillRect(-w / 2, top, w, 0.34 * u);
      x.strokeStyle = '#1b1b1b'; x.lineWidth = 0.018 * u; x.beginPath(); x.moveTo(-w / 2, top + 0.34 * u); x.lineTo(w / 2, top + 0.34 * u); x.stroke();
      lines(x, T.n, top + 0.56 * u, 0.15 * u, u);
      price(h / 2 - 0.36 * u);
    } else if (T.t === 'rail') {
      const nm = T.n.replace('Stasiun ', '');
      text(x, 'STASIUN', 0, top + 0.2 * u, 0.12 * u, '#333', '600');
      lines(x, nm, top + 0.38 * u, 0.14 * u, u);
      text(x, '🚆', 0, 0.12 * u, 0.42 * u, '#111', 'normal', EMOJI);
      price(h / 2 - 0.36 * u);
    } else if (T.t === 'util') {
      text(x, T.n, 0, top + 0.24 * u, 0.2 * u, '#1b1b1b', '800');
      text(x, T.n === 'PLN' ? 'Listrik' : 'Air Minum', 0, top + 0.44 * u, 0.12 * u, '#444', '600');
      text(x, T.n === 'PLN' ? '⚡' : '🚰', 0, 0.1 * u, 0.44 * u, '#111', 'normal', EMOJI);
      price(h / 2 - 0.36 * u);
    } else if (T.t === 'chance') {
      text(x, 'KESEMPATAN', 0, top + 0.22 * u, 0.13 * u, '#1b1b1b', '800', null, w * 0.9);
      text(x, '?', 0, 0.08 * u, 0.85 * u, '#e8620c', '900', 'Georgia, serif');
    } else if (T.t === 'chest') {
      text(x, 'DANA UMUM', 0, top + 0.22 * u, 0.14 * u, '#1b1b1b', '800', null, w * 0.9);
      text(x, '💰', 0, 0.12 * u, 0.5 * u, '#111', 'normal', EMOJI);
    } else if (T.t === 'tax') {
      lines(x, T.n, top + 0.24 * u, 0.14 * u, u);
      text(x, T.a >= 200 ? '🧾' : '💎', 0, 0.12 * u, 0.42 * u, '#111', 'normal', EMOJI);
      text(x, 'BAYAR ' + E.money(T.a), 0, h / 2 - 0.36 * u, 0.12 * u, '#222', '600', null, w * 0.9);
    }
    x.strokeStyle = '#1b1b1b'; x.lineWidth = 0.02 * u; x.strokeRect(-w / 2, -h / 2, w, h);
    x.restore();
  }
  function drawCorner(x, i, u) {
    const c = C * u;
    x.fillStyle = '#f7f2e4'; x.fillRect(-c / 2, -c / 2, c, c);
    if (i === 0) {
      x.save(); x.rotate(-Math.PI / 4);
      text(x, 'Terima ' + E.money(E.GO_SALARY), 0, -0.36 * u, 0.13 * u, '#333', '600');
      text(x, 'MULAI', 0, -0.05 * u, 0.44 * u, '#d62828', '900', 'Georgia, serif');
      x.restore();
      // panah arah jalan
      x.fillStyle = '#d62828';
      x.beginPath(); x.moveTo(-0.7 * u, 0.55 * u); x.lineTo(-0.35 * u, 0.36 * u); x.lineTo(-0.35 * u, 0.48 * u); x.lineTo(0.6 * u, 0.48 * u);
      x.lineTo(0.6 * u, 0.62 * u); x.lineTo(-0.35 * u, 0.62 * u); x.lineTo(-0.35 * u, 0.74 * u); x.closePath(); x.fill();
    } else if (i === 10) {
      x.fillStyle = '#f39021'; x.fillRect(-0.3 * u, -0.8 * u, 1.1 * u, 1.1 * u);
      x.fillStyle = '#fff3df'; x.fillRect(-0.18 * u, -0.68 * u, 0.86 * u, 0.86 * u);
      x.save(); x.translate(0.25 * u, -0.25 * u); x.rotate(-Math.PI / 4);
      text(x, 'PENJARA', 0, 0, 0.17 * u, '#1b1b1b', '900');
      x.restore();
      x.strokeStyle = '#333'; x.lineWidth = 0.035 * u;
      for (let k = 0; k < 5; k++) { const px = (-0.1 + k * 0.175) * u; x.beginPath(); x.moveTo(px, -0.68 * u); x.lineTo(px, 0.18 * u); x.stroke(); }
      x.lineWidth = 0.02 * u; x.strokeStyle = '#1b1b1b'; x.strokeRect(-0.3 * u, -0.8 * u, 1.1 * u, 1.1 * u);
      text(x, 'MAMPIR', 0.2 * u, 0.56 * u, 0.15 * u, '#1b1b1b', '800');
      x.save(); x.translate(-0.56 * u, -0.25 * u); x.rotate(Math.PI / 2);
      text(x, 'HANYA', 0, 0, 0.15 * u, '#1b1b1b', '800');
      x.restore();
    } else if (i === 20) {
      x.save(); x.rotate(Math.PI * 0.75);
      text(x, 'BEBAS', 0, -0.44 * u, 0.2 * u, '#1b1b1b', '900');
      text(x, '🚗', 0, 0.02 * u, 0.55 * u, '#111', 'normal', EMOJI);
      text(x, 'PARKIR', 0, 0.46 * u, 0.2 * u, '#1b1b1b', '900');
      x.restore();
    } else if (i === 30) {
      x.save(); x.rotate(-Math.PI * 0.75);
      text(x, 'MASUK', 0, -0.44 * u, 0.2 * u, '#1b1b1b', '900');
      text(x, '👮', 0, 0.02 * u, 0.55 * u, '#111', 'normal', EMOJI);
      text(x, 'PENJARA', 0, 0.46 * u, 0.2 * u, '#d62828', '900');
      x.restore();
    }
    x.strokeStyle = '#1b1b1b'; x.lineWidth = 0.02 * u; x.strokeRect(-c / 2, -c / 2, c, c);
  }
  function drawBoard(N) {
    const cv = canvas(N, N), x = cv.getContext('2d'), u = N / S;
    const g = x.createRadialGradient(N / 2, N / 2, N * 0.05, N / 2, N / 2, N * 0.55);
    g.addColorStop(0, '#dcefdc'); g.addColorStop(1, '#bfdcc3');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    // motif kawung (batik) tipis di tengah papan
    x.save();
    x.beginPath(); x.rect(C * u, C * u, 9 * W * u, 9 * W * u); x.clip();
    x.strokeStyle = 'rgba(40,110,60,0.13)'; x.lineWidth = 0.025 * u;
    const step = 0.9 * u;
    for (let py = C * u; py < (S - C) * u + step; py += step) {
      for (let px = C * u; px < (S - C) * u + step; px += step) {
        for (let k = 0; k < 4; k++) {
          x.save(); x.translate(px, py); x.rotate(k * Math.PI / 2 + Math.PI / 4);
          x.beginPath(); x.ellipse(step * 0.26, 0, step * 0.24, step * 0.12, 0, 0, Math.PI * 2); x.stroke();
          x.restore();
        }
      }
    }
    x.restore();
    for (let i = 0; i < 40; i++) drawTile(x, i, u);
    x.strokeStyle = '#1b1b1b'; x.lineWidth = 0.05 * u;
    x.strokeRect(0.025 * u, 0.025 * u, N - 0.05 * u, N - 0.05 * u);
    x.strokeRect(C * u, C * u, 9 * W * u, 9 * W * u);
    // logo
    x.save(); x.translate(N / 2, N / 2); x.rotate(-Math.PI / 4);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 0.12 * u; x.shadowOffsetY = 0.05 * u;
    rr(x, -3.3 * u, -0.75 * u, 6.6 * u, 1.3 * u, 0.18 * u); x.fillStyle = '#d62828'; x.fill();
    x.shadowColor = 'transparent';
    x.lineWidth = 0.07 * u; x.strokeStyle = '#fff'; rr(x, -3.18 * u, -0.63 * u, 6.36 * u, 1.06 * u, 0.12 * u); x.stroke();
    text(x, 'MONOPOLI', 0, -0.08 * u, 0.86 * u, '#fff', '900', 'Georgia, "Times New Roman", serif');
    rr(x, -2.2 * u, 0.72 * u, 4.4 * u, 0.55 * u, 0.1 * u); x.fillStyle = '#fff'; x.fill();
    x.lineWidth = 0.03 * u; x.strokeStyle = '#d62828'; x.stroke();
    text(x, 'I N D O N E S I A', 0, 1.0 * u, 0.34 * u, '#d62828', '900');
    x.restore();
    // area kartu
    [[-2.5, -2.5, '#f39021'], [2.5, 2.5, '#2a7de1']].forEach(([wx, wz, col]) => {
      x.save(); x.translate((wx + H) * u, (wz + H) * u); x.rotate(-Math.PI / 4);
      x.setLineDash([0.1 * u, 0.07 * u]); x.lineWidth = 0.03 * u; x.strokeStyle = col;
      rr(x, -0.95 * u, -0.66 * u, 1.9 * u, 1.32 * u, 0.1 * u); x.stroke();
      x.restore();
    });
    return tex(cv);
  }
  function stackTex(title, sym, bg, emoji) {
    const cv = canvas(512, 340), x = cv.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 512, 340);
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 10; rr(x, 16, 16, 480, 308, 20); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    text(x, sym, 256, 150, 150, '#fff', '900', emoji ? EMOJI : 'Georgia, serif');
    text(x, title, 256, 272, 52, '#fff', '900');
    return tex(cv);
  }
  function diceTex(n) {
    const S2 = 128, cv = canvas(S2, S2), x = cv.getContext('2d');
    x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, S2, S2);
    x.strokeStyle = '#d8d3c4'; x.lineWidth = 6; rr(x, 4, 4, S2 - 8, S2 - 8, 22); x.stroke();
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]] }[n];
    x.fillStyle = n === 1 ? '#d62828' : '#1b1b1b';
    P.forEach(([a, b]) => { x.beginPath(); x.arc(a * 32, b * 32, n === 1 ? 16 : 11, 0, Math.PI * 2); x.fill(); });
    return tex(cv);
  }
  function mortTex() {
    const cv = canvas(200, 320), x = cv.getContext('2d');
    x.fillStyle = 'rgba(20,20,28,0.62)'; x.fillRect(0, 0, 200, 320);
    x.save(); x.translate(100, 160); x.rotate(-Math.PI / 2.6);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    text(x, 'DIGADAIKAN', 0, 0, 34, '#ffd36a', '900');
    x.restore();
    return tex(cv);
  }

  // ---------- objek 3D ----------
  function makePawn(col) {
    const pts = [[0, 0], [0.2, 0], [0.21, 0.035], [0.16, 0.07], [0.11, 0.12], [0.075, 0.25], [0.11, 0.28], [0.07, 0.31], [0.1, 0.35], [0.125, 0.41], [0.11, 0.47], [0.06, 0.51], [0, 0.52]]
      .map(([a, b]) => new THREE.Vector2(a, b));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: lin(col), roughness: 0.3, metalness: 0.35 }));
    m.castShadow = true;
    m.scale.setScalar(1.05);
    return m;
  }
  /** Atap pelana (prisma segitiga) dengan bubungan searah sumbu x. */
  function roofGeo(w, h, len) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2);
    return geo;
  }
  /** Rumah hijau / hotel merah ala bidak Monopoli klasik. */
  function makeHouse(hotel) {
    if (!shared.houseGeo) {
      shared.houseGeo = [new THREE.BoxGeometry(0.2, 0.17, 0.2), roofGeo(0.25, 0.14, 0.23)];
      shared.hotelGeo = [new THREE.BoxGeometry(0.5, 0.24, 0.24), roofGeo(0.29, 0.15, 0.55)];
    }
    const [bg, rg] = hotel ? shared.hotelGeo : shared.houseGeo, bh = hotel ? 0.24 : 0.17;
    const mat = hotel ? shared.hotelMat : shared.houseMat;
    const g = new THREE.Group();
    const body = new THREE.Mesh(bg, mat), roof = new THREE.Mesh(rg, mat);
    body.position.y = bh / 2; roof.position.y = bh;
    body.castShadow = roof.castShadow = true;
    g.add(body, roof);
    return g;
  }
  /** Bendera kecil warna pemilik yang ditancapkan saat properti dibeli. */
  function makeFlag(o) {
    if (!shared.poleGeo) {
      shared.poleGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.56, 8);
      shared.poleMat = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.6, roughness: 0.3 });
      shared.knobGeo = new THREE.SphereGeometry(0.025, 12, 8);
      shared.knobMat = new THREE.MeshStandardMaterial({ color: lin(0xffc83d), metalness: 0.7, roughness: 0.25 });
      shared.clothGeo = new THREE.PlaneGeometry(0.27, 0.17); shared.clothGeo.translate(0.135, 0, 0);
      shared.clothMats = PCOL.map(c => new THREE.MeshStandardMaterial({ color: lin(c), emissive: lin(c), emissiveIntensity: 0.2, side: THREE.DoubleSide, roughness: 0.6 }));
    }
    const g = new THREE.Group();
    const pole = new THREE.Mesh(shared.poleGeo, shared.poleMat); pole.position.y = 0.28;
    const knob = new THREE.Mesh(shared.knobGeo, shared.knobMat); knob.position.y = 0.57;
    const cloth = new THREE.Mesh(shared.clothGeo, shared.clothMats[o]); cloth.position.y = 0.46;
    pole.castShadow = cloth.castShadow = true;
    g.add(pole, knob, cloth);
    g.userData = { o, cloth, ph: Math.random() * 6 };
    return g;
  }
  /** Animasi "muncul" (membal) untuk bangunan/bendera baru. */
  function pop(obj, delay) {
    obj.scale.setScalar(0.001);
    pops.push({ obj, t0: performance.now() + (delay || 0) });
  }
  function makeMonas() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: lin(0xffc83d), emissive: lin(0x7a4a00), emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.25 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.95), white); base.position.y = 0.04;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.2, 4, 1), white); cup.position.y = 0.18; cup.rotation.y = Math.PI / 4;
    const obel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 1.2, 4, 1), white); obel.position.y = 0.88; obel.rotation.y = Math.PI / 4;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.07, 4, 1), white); cap.position.y = 1.51; cap.rotation.y = Math.PI / 4;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 12), gold); flame.position.y = 1.66;
    [base, cup, obel, cap, flame].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    return g;
  }
  function tilePlane(i, mat, y) {
    const ti = tileInfo(i);
    const geo = new THREE.PlaneGeometry(ti.corner ? C : W, C);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(ti.x, y, ti.z);
    m.rotation.y = -ti.side * Math.PI / 2;
    return m;
  }

  function init(canvasElement, o) {
    opts = o || {}; canvasEl = canvasElement;
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = renderer.capabilities.getMaxAnisotropy();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10141c);
    scene.fog = new THREE.Fog(0x10141c, 45, 90);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    controls = new THREE.OrbitControls(camera, canvasEl);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.32; controls.minDistance = 5; controls.maxDistance = 60;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x2a3040, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(5, 14, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // meja
    const tcv = canvas(512, 512), tx = tcv.getContext('2d');
    const tg = tx.createRadialGradient(256, 256, 20, 256, 256, 360);
    tg.addColorStop(0, '#5a3b24'); tg.addColorStop(1, '#1d130c');
    tx.fillStyle = tg; tx.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 900; k++) { tx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; tx.fillRect(0, Math.random() * 512, 512, 1); }
    const table = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: tex(tcv), roughness: 0.85 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.32; table.receiveShadow = true;
    scene.add(table);

    // papan
    const N = Math.min(renderer.capabilities.maxTextureSize, window.innerWidth < 800 ? 2048 : 4096);
    const side = new THREE.MeshStandardMaterial({ color: lin(0x1f2a22), roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(S + 0.2, 0.3, S + 0.2), side);
    body.position.y = -0.15; body.receiveShadow = true; body.castShadow = true;
    scene.add(body);
    const topGeo = new THREE.PlaneGeometry(S, S); topGeo.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: drawBoard(N), roughness: 0.7 }));
    top.position.y = 0.001; top.receiveShadow = true;
    scene.add(top);

    // tumpukan kartu
    const plain = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.7 });
    [[-2.5, -2.5, stackTex('KESEMPATAN', '?', '#f07f13', false)], [2.5, 2.5, stackTex('DANA UMUM', '💰', '#2a7de1', true)]].forEach(([x, z, t]) => {
      const mats = [plain, plain, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), plain, plain, plain];
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.12), mats);
      st.position.set(x, 0.08, z); st.rotation.y = Math.PI / 4; st.castShadow = true; st.receiveShadow = true;
      scene.add(st);
    });
    const monas = makeMonas(); monas.position.set(3.3, 0, -3.3); scene.add(monas);

    shared.houseMat = new THREE.MeshStandardMaterial({ color: lin(0x15a043), roughness: 0.3, metalness: 0.05 });
    shared.hotelMat = new THREE.MeshStandardMaterial({ color: lin(0xd81e1e), roughness: 0.3, metalness: 0.05 });
    shared.mortMat = new THREE.MeshBasicMaterial({ map: mortTex(), transparent: true, depthWrite: false });
    shared.tabGeo = new THREE.BoxGeometry(W * 0.86, 0.06, 0.2);
    shared.tabMats = PCOL.map(c => new THREE.MeshBasicMaterial({ color: lin(c), toneMapped: false }));

    hlFocus = tilePlane(1, new THREE.MeshBasicMaterial({ color: lin(0xffd34a), transparent: true, opacity: 0.35, depthWrite: false }), 0.012);
    hlHover = tilePlane(1, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }), 0.011);
    hlFocus.visible = hlHover.visible = false;
    scene.add(hlFocus, hlHover);
    turnRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 32), new THREE.MeshBasicMaterial({ color: lin(0xffd34a), transparent: true, opacity: 0.9, depthWrite: false }));
    turnRing.rotation.x = -Math.PI / 2; turnRing.visible = false;
    scene.add(turnRing);

    // dadu
    const dmats = DICE_FACE.map(n => new THREE.MeshStandardMaterial({ map: diceTex(n), roughness: 0.35 }));
    for (let k = 0; k < 2; k++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), dmats);
      d.castShadow = true;
      d.position.set(DICE_REST[k][0], 0.23, DICE_REST[k][1]);
      d.quaternion.copy(faceQuat(k ? 4 : 3, k ? 0.3 : -0.2));
      scene.add(d); diceM.push(d);
    }

    tagEl = document.createElement('div'); tagEl.className = 'tokTag'; tagEl.hidden = true;
    (opts.plates || document.body).appendChild(tagEl);

    bindPointer();
    window.addEventListener('resize', resize);
    resize();
    resetCam();
    loop();
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, was = camera.aspect;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if ((was < 1) !== (camera.aspect < 1)) resetCam(); // orientasi layar berubah
  }
  function resetCam() {
    const a = camera.aspect || 1, tn = Math.tan(camera.fov * Math.PI / 360);
    // jarak minimum agar lebar papan muat di layar (layar potret butuh kamera lebih jauh & lebih tegak)
    const d = Math.max(17, 7.4 / (tn * Math.min(a, 1.3)));
    const up = a < 1 ? 0.93 : 0.79;
    camera.position.set(0, d * up, d * Math.sqrt(1 - up * up));
    controls.target.set(0, 0, a < 1 ? 0.6 : 1.2);
    controls.update();
  }

  function faceQuat(v, yaw) {
    const e = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] }[v];
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    return new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw).multiply(base);
  }

  // ---------- pointer ----------
  function bindPointer() {
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(V(0, 1, 0), 0), hit = V(0, 0, 0), ndc = new THREE.Vector2();
    let down = null;
    const pick = e => {
      const r = canvasEl.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit) ? tileAt(hit.x, hit.z) : -1;
    };
    canvasEl.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    canvasEl.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      const t = pick(e);
      if (t >= 0 && opts.onTile) opts.onTile(t);
    });
    canvasEl.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const t = pick(e);
      if (t !== hover) { hover = t; canvasEl.style.cursor = t >= 0 ? 'pointer' : ''; }
    });
    canvasEl.addEventListener('pointerleave', () => { hover = -1; });
  }

  // ---------- sinkronisasi state ----------
  function ensureToken(i) {
    if (tokens[i]) return tokens[i];
    const mesh = makePawn(PCOL[i]);
    scene.add(mesh);
    tokens[i] = { mesh, tile: 0, jail: false, moving: false, target: V(0, 0, 0) };
    return tokens[i];
  }
  function removeToken(i) {
    if (!tokens[i]) return;
    scene.remove(tokens[i].mesh);
    tokens[i] = null;
  }
  function busy() { return !!diceAnim || !!cur || queue.length > 0; }

  function update(v) {
    view = v;
    const initial = first;
    for (let i = 0; i < 6; i++) {
      const p = v.players[i];
      if (p && !p.out) ensureToken(i); else removeToken(i);
    }
    if (first) {
      first = false; lastRid = v.rid; lastMid = v.mid;
      settle(true);
      diceM.forEach((d, k) => d.quaternion.copy(faceQuat(v.dice[k], k ? 0.3 : -0.2)));
    } else {
      if (v.rid !== lastRid) { lastRid = v.rid; startDice(v.dice); }
      if (v.mid !== lastMid) { lastMid = v.mid; (v.mv || []).forEach(m => queue.push(Object.assign({}, m))); }
      if (!busy()) settle(false);
    }
    syncBoard(v, initial);
    const w = v.phase === 'play' ? E.whoActs(v) : -1;
    tagIdx = v.phase === 'play' ? v.turn : -1;
    focusIdx = v.phase !== 'play' ? -1 : v.step === 'auction' && v.auc ? v.auc.t : v.step === 'buy' ? v.players[v.turn].pos : -1;
    tagEl.dataset.who = w;
  }
  function settle(snap) {
    if (!view) return;
    tokens.forEach((tk, i) => {
      if (!tk) return;
      const p = view.players[i];
      tk.tile = p.pos; tk.jail = !!p.jail;
      tk.target.copy(slotPos(p.pos, i, tk.jail));
      if (snap) tk.mesh.position.copy(tk.target);
    });
  }
  function syncBoard(v, initial) {
    for (let t = 0; t < 40; t++) {
      if (!E.isOwnable(t)) continue;
      const o = v.own[t], ti = tileInfo(t);
      // penanda pemilik
      const tab = ownTabs[t];
      if (o < 0) { if (tab) { scene.remove(tab); delete ownTabs[t]; } } else {
        if (!tab || tab.userData.o !== o) {
          if (tab) scene.remove(tab);
          const m = new THREE.Mesh(shared.tabGeo, shared.tabMats[o]);
          const d = C / 2 - 0.12;
          m.position.set(ti.x - ti.inx * d, 0.03, ti.z - ti.inz * d);
          m.rotation.y = -ti.side * Math.PI / 2;
          m.userData.o = o;
          scene.add(m); ownTabs[t] = m;
        }
      }
      // bendera pemilik
      const fl = flags[t];
      if (o < 0) { if (fl) { scene.remove(fl); delete flags[t]; } } else if (!fl || fl.userData.o !== o) {
        if (fl) scene.remove(fl);
        const f = makeFlag(o), dv = -0.6, du = 0.4;
        f.position.set(ti.x + ti.inx * dv + ti.ax * du, 0, ti.z + ti.inz * dv + ti.az * du);
        scene.add(f); flags[t] = f;
        if (!initial) pop(f, 250);
      }
      // rumah (hijau, 1–4) / hotel (merah)
      const h = o >= 0 ? v.hs[t] : 0, hg = houseGroups[t], prev = hg ? hg.userData.h : 0;
      if (!hg || prev !== h) {
        if (hg) scene.remove(hg);
        delete houseGroups[t];
        if (h) {
          const g = new THREE.Group(); g.userData.h = h;
          const d = C / 2 - 0.17;
          const n = h === 5 ? 1 : h;
          for (let k = 0; k < n; k++) {
            const hm = makeHouse(h === 5), du = h === 5 ? 0 : (k - (n - 1) / 2) * 0.235;
            hm.position.set(ti.x + ti.inx * d + ti.ax * du, 0, ti.z + ti.inz * d + ti.az * du);
            hm.rotation.y = -ti.side * Math.PI / 2;
            g.add(hm);
            if (!initial && h > prev && (h === 5 || k >= prev)) pop(hm, (k - (h === 5 ? 0 : prev)) * 120);
          }
          scene.add(g); houseGroups[t] = g;
        }
      }
      // gadai
      const mg = o >= 0 && v.mg[t];
      if (mg && !mortPlanes[t]) { mortPlanes[t] = tilePlane(t, shared.mortMat, 0.008); scene.add(mortPlanes[t]); }
      if (!mg && mortPlanes[t]) { scene.remove(mortPlanes[t]); delete mortPlanes[t]; }
    }
  }

  // ---------- animasi ----------
  function startDice(vals) {
    const t0 = performance.now();
    diceAnim = {
      t0, dur: E.ANIM.dice,
      parts: diceM.map((d, k) => {
        const axis = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const to = V(DICE_REST[k][0] + (Math.random() - 0.5) * 0.3, 0.23, DICE_REST[k][1] + (Math.random() - 0.5) * 0.25);
        return { from: V((k ? 0.9 : -0.9) + (Math.random() - 0.5), 2.4, 6.4), to, q1: faceQuat(vals[k], (Math.random() - 0.5) * 1.2), axis, spin: (3 + Math.random() * 2) * Math.PI * 2 };
      }),
    };
    if (opts.onDice) opts.onDice();
  }
  function beginSeg(m, t) {
    const tk = tokens[m.p];
    if (!tk && !m.w) return;
    if (m.w) { cur = { m, t0: t, dur: E.ANIM.card }; if (opts.onCard) opts.onCard(); return; }
    tk.moving = true;
    if (m.j) { cur = { m, t0: t, dur: E.ANIM.jump, from: tk.mesh.position.clone(), to: slotPos(10, m.p, true) }; return; }
    if (tk.tile !== m.f) { tk.tile = m.f; tk.jail = false; tk.mesh.position.copy(slotPos(m.f, m.p, false)); }
    tk.jail = false;
    cur = { m, t0: t, dur: m.n * E.ANIM.step + E.ANIM.seg, k: -1 };
  }
  function runSeg(t) {
    const m = cur.m, tk = tokens[m.p], el = t - cur.t0;
    if (m.w) { if (el >= cur.dur) cur = null; return; }
    if (!tk) { cur = null; return; }
    if (m.j) {
      const e = Math.min(1, el / cur.dur), s = e * e * (3 - 2 * e);
      tk.mesh.position.lerpVectors(cur.from, cur.to, s);
      tk.mesh.position.y = Math.sin(e * Math.PI) * 1.6;
      if (e >= 1) { tk.tile = 10; tk.jail = true; tk.moving = false; tk.target.copy(cur.to); cur = null; }
      return;
    }
    const st = E.ANIM.step, k = Math.min(m.n, Math.floor(el / st));
    if (k < m.n) {
      const a = (m.f + m.d * k + 40) % 40, b = (a + m.d + 40) % 40, f = (el - k * st) / st;
      const pa = slotPos(a, m.p, false), pb = slotPos(b, m.p, false);
      tk.mesh.position.lerpVectors(pa, pb, f);
      tk.mesh.position.y = Math.sin(f * Math.PI) * 0.38;
      if (k !== cur.k) { cur.k = k; if (opts.onStep) opts.onStep(); }
    } else {
      const end = (m.f + m.d * m.n + 400) % 40;
      tk.mesh.position.copy(slotPos(end, m.p, false));
      tk.tile = end;
      if (el >= cur.dur) { tk.moving = false; tk.target.copy(tk.mesh.position); cur = null; }
    }
  }
  function animate(t) {
    if (diceAnim) {
      const e = Math.min(1, (t - diceAnim.t0) / diceAnim.dur), s = 1 - Math.pow(1 - e, 3);
      diceAnim.parts.forEach((p, k) => {
        const d = diceM[k];
        d.position.lerpVectors(p.from, p.to, s);
        d.position.y = 0.23 + Math.abs(Math.sin(e * Math.PI * 2.5)) * 1.4 * (1 - e);
        d.quaternion.copy(p.q1).multiply(new THREE.Quaternion().setFromAxisAngle(p.axis, (1 - s) * p.spin));
      });
      if (e >= 1) diceAnim = null;
    }
    if (!diceAnim) {
      if (!cur && queue.length) beginSeg(queue.shift(), t);
      if (cur) runSeg(t);
    }
    tokens.forEach(tk => { if (tk && !tk.moving) tk.mesh.position.lerp(tk.target, 0.2); });
    for (let k = pops.length - 1; k >= 0; k--) {
      const p = pops[k], e = Math.max(0, Math.min(1, (t - p.t0) / 480));
      const c = 2.2, s = e === 0 ? 0.001 : 1 + (c + 1) * Math.pow(e - 1, 3) + c * Math.pow(e - 1, 2); // easeOutBack
      p.obj.scale.setScalar(Math.max(0.001, s));
      if (e >= 1) { p.obj.scale.setScalar(1); pops.splice(k, 1); }
    }
    Object.values(flags).forEach(f => { f.userData.cloth.rotation.y = Math.sin(t / 420 + f.userData.ph) * 0.35; });
    const b = busy();
    if (wasBusy && !b) { settle(false); if (opts.onIdle) opts.onIdle(); }
    wasBusy = b;

    const pulse = 0.5 + 0.5 * Math.sin(t / 260);
    const fi = uiFocus >= 0 ? uiFocus : !b ? focusIdx : -1;
    placeHL(hlFocus, fi); hlFocus.material.opacity = 0.2 + pulse * 0.3;
    placeHL(hlHover, hover !== fi ? hover : -1);
    const tk = tagIdx >= 0 ? tokens[tagIdx] : null;
    turnRing.visible = !!tk;
    if (tk) { turnRing.position.set(tk.mesh.position.x, 0.015, tk.mesh.position.z); turnRing.scale.setScalar(1 + pulse * 0.25); }
  }
  function placeHL(m, i) {
    m.visible = i >= 0;
    if (i < 0) return;
    if (m.userData.i === i) return;
    m.userData.i = i;
    const ti = tileInfo(i), geo = new THREE.PlaneGeometry(ti.corner ? C : W, C);
    geo.rotateX(-Math.PI / 2);
    m.geometry.dispose(); m.geometry = geo;
    m.position.set(ti.x, m.position.y, ti.z); m.rotation.y = -ti.side * Math.PI / 2;
  }
  const proj = V(0, 0, 0);
  function updateTag() {
    const tk = tagIdx >= 0 && view ? tokens[tagIdx] : null;
    if (!tk) { tagEl.hidden = true; return; }
    const p = view.players[tagIdx];
    proj.copy(tk.mesh.position); proj.y += 0.75;
    proj.project(camera);
    if (proj.z > 1) { tagEl.hidden = true; return; }
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth, y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
    tagEl.hidden = false;
    const html = `<i style="background:${PCOL[tagIdx]}"></i>${escapeHtml(p.name)}`;
    if (tagEl.innerHTML !== html) tagEl.innerHTML = html;
    tagEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function loop() {
    requestAnimationFrame(loop);
    const t = performance.now();
    animate(t);
    controls.update();
    renderer.render(scene, camera);
    updateTag();
  }

  function reset() {
    tokens.forEach((_, i) => removeToken(i));
    Object.keys(ownTabs).forEach(t => { scene.remove(ownTabs[t]); delete ownTabs[t]; });
    Object.keys(houseGroups).forEach(t => { scene.remove(houseGroups[t]); delete houseGroups[t]; });
    Object.keys(mortPlanes).forEach(t => { scene.remove(mortPlanes[t]); delete mortPlanes[t]; });
    Object.keys(flags).forEach(t => { scene.remove(flags[t]); delete flags[t]; });
    pops.length = 0;
    queue.length = 0; cur = null; diceAnim = null; first = true; view = null; tagIdx = -1; focusIdx = -1; uiFocus = -1;
    if (tagEl) tagEl.hidden = true;
  }
  function highlight(i) { uiFocus = i == null ? -1 : i; }

  return { init, update, reset, busy, resetCam, highlight, PCOL };
})();
