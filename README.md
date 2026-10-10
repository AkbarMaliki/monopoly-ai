# Monopoli Indonesia 3D

Monopoli edisi Indonesia (Three.js) untuk browser, dengan mode **Lawan Bot** dan **Online** (Firebase Realtime Database). 2–6 pemain.
Kota-kotanya dari Jayapura & Ambon (termurah) sampai Denpasar & Jakarta (termahal), stasiun Gambir/Tugu/Tawang/Pasar Turi, serta PLN & PDAM.

## Menjalankan

```bash
cd monopoly-ai
npx serve .        # atau: python -m http.server
```

Buka `http://localhost:3000` (atau port yang ditampilkan). Firebase tidak bisa dipakai dari `file://`, jadi harus lewat server lokal.

Test engine (aturan, sewa, penjara, kartu, lelang, utang, tukar, simulasi 300 game antar bot):

```bash
node tests/engine.test.js
```

## Cara main

Pilih **mode permainan** di menu (berlaku untuk lawan bot maupun room online):

| Mode | Cara membangun |
| --- | --- |
| 🚩 **Sewa Bendera** (klasik) | Beli tanah (ditandai bendera). Rumah baru bisa dibangun setelah punya **semua kota satu warna**, harus merata, kapan saja. |
| 🏠 **Langsung Bangun** | Saat membeli kota bisa **sekalian beli 1 rumah**. Setiap kali pionmu mampir lagi di kota milikmu, boleh upgrade **1 tingkat** (rumah ke-2, 3, 4, lalu hotel) — tanpa syarat satu warna. Gadai/tukar hanya terhalang bangunan di kota itu sendiri. |


- **Lawan Bot**: pilih jumlah bot (1–5), level (Mudah / Sedang / Sulit / Campur), modal awal, batas putaran, lelang, dan kecepatan awal.
- **Online**:
  - **Buat Room Baru** → dapat kode 5 karakter + link undangan (`?room=KODE`). Host bisa menambah/menghapus bot di lobby, lalu tekan **Mulai Game**.
  - **Gabung** dengan kode, atau klik room di daftar "Room terbuka". Yang masuk setelah game dimulai jadi penonton.
  - Ada timer giliran (20/30/45/60 detik; lelang maks. 15 detik). Kalau habis: lempar dadu / tidak membeli / lewati lelang / akhiri giliran / tolak tawaran otomatis.
  - Pemain yang terputus dimainkan otomatis dan bisa masuk lagi lewat link yang sama. Menekan **Keluar** saat game berjalan = bangkrut.
  - **Host pindah otomatis**: kalau host keluar atau terputus lebih dari ~6 detik, pemain lain jadi host dan game lanjut dari state terakhir.
  - Chat di panel 📜.
- **Dompet (kiri bawah)**: uangmu ditampilkan sebagai tumpukan uang kertas per pecahan (Rp 5jt, 1jt, 500rb, 200rb, 100rb, 50rb, 10rb)
  dengan animasi +/− saat uang berubah, dan semua properti milikmu tampil sebagai kartu Hak Milik yang dikelompokkan per warna
  (bingkai emas = warna lengkap, stempel DIGADAI = sedang digadaikan). Klik kartu untuk bangun / jual / gadai / tebus.
  Di layar kecil dompet dibuka lewat tombol 💼.
- **Di papan**: properti yang dibeli ditandai bendera + strip warna pemilik. Setelah satu warna lengkap, bangunan muncul sebagai
  rumah hijau (1–4) lalu berganti jadi hotel merah, dengan animasi muncul.
- Kontrol: klik petak untuk melihat harga & sewa, drag untuk memutar kamera, scroll/pinch untuk zoom, 🎥 untuk reset kamera.
- **⏩ Kecepatan 1x / 2x / 3x / 5x** (kanan atas, bisa diganti kapan saja): mempercepat lemparan dadu, langkah pion, kartu,
  animasi bangunan, dan jeda berpikir bot. Online: hanya host yang bisa mengubah, berlaku untuk semua pemain (`cfg.speed`).
  Di layar sempit hanya tombol aktif yang tampil — ketuk untuk ganti ke kecepatan berikutnya.
- **🤖 AI / autopilot** (kanan atas): giliranmu dimainkan otomatis oleh AI (logika bot level Sedang) — lempar dadu, beli,
  lelang, bangun rumah, gadai saat utang, menjawab tawaran tukar. Tekan lagi atau **✋ Ambil Alih** untuk main sendiri.
  Online: pemain lain melihat tag 🤖 AUTO di kartumu; tidak ada timer giliran selama autopilot aktif. Mati otomatis saat game baru.
- Keyboard: **Spasi** = lempar dadu / akhiri giliran, **B** = beli, **A** = aset, **I** = AI on/off, **Esc** = tutup jendela.

## Aturan yang diterapkan

- Uang dalam Rupiah (1 satuan engine = Rp 10rb). Modal default Rp 15jt, lewat MULAI terima Rp 2jt.
- Properti yang tidak dibeli dilelang ke semua pemain (bisa dimatikan). Lelang bergiliran: tawar lebih tinggi atau lewati.
- Sewa 2× jika memiliki semua kota satu warna (tanpa bangunan). Bangun rumah harus merata, maksimal 4 rumah lalu hotel.
  Stok bank 32 rumah dan 12 hotel.
- Gadai = setengah harga; tebus = nilai gadai + 10%. Tidak ada sewa untuk properti yang digadaikan. Harus menjual bangunan
  di satu warna sebelum menggadaikan kotanya.
- Dadu kembar = main lagi; kembar 3× = penjara. Di penjara pemain **diam 2 giliran**, kecuali lempar dadu kembar (langsung bebas
  & jalan) atau memakai kartu Bebas dari Penjara (tampil di dompet, klik untuk memakai). Giliran ke-3 otomatis bebas tanpa denda.
- 24 kartu Kesempatan dan 22 kartu Dana Umum bernuansa Indonesia (THR, tilang, Ketua RT, lomba 17-an, …). Selain kartu klasik
  ada kartu tambahan dari varian lain:
  - ✈️ **Kartu pesawat** (3 kartu, terinspirasi Monopoly Travel World Tour): pilih petak tujuan mana saja — klik petak di papan
    atau pilih dari daftar — lalu pion terbang ke sana (lewat MULAI tetap dapat Rp 2jt). Dua tiket gratis, satu promo
    berbayar Rp 1jt; semuanya boleh ditolak ("Tetap di sini").
  - 🛡️ **Bebas Sewa**: disimpan di dompet, otomatis dipakai saat berikutnya harus membayar sewa.
  - Maju 5 langkah, lempar dadu lagi, maju ke properti kosong terdekat, pajak kekayaan 10% / bunga deposito 5% dari uang tunai,
    PBB per properti, subsidi renovasi per rumah/hotel, banjir (1 bangunan di kota termahalmu hilang),
    sedekah ke pemain termiskin, dan arisan dari pemain terkaya.
- Kekurangan uang → fase utang: jual bangunan, gadaikan, atau tawarkan tukar. Kalau tetap tidak cukup, bangkrut:
  aset diserahkan ke pemain penagih (atau kembali ke bank).
- Tukar properti + uang antarpemain saat giliranmu. Properti yang warnanya masih ada bangunan tidak bisa ditukar.
- Pemenang: pemain terakhir yang tersisa, atau pemain terkaya (uang + properti + bangunan) saat batas putaran tercapai.

Penyederhanaan dibanding aturan resmi: properti bangkrut ke bank tidak dilelang ulang; kartu "terima dari setiap pemain"
hanya mengambil sebanyak uang tunai yang dimiliki pemain lain; kartu utilitas memakai angka dadu terakhir.

## Bot

Bot membeli properti sambil menyisakan cadangan uang yang disesuaikan dengan sewa termahal lawan, lebih agresif untuk
properti yang melengkapi warnanya atau mencegah lawan melengkapi warna. Bot membangun rumah di grup dengan kenaikan sewa terbaik,
menebus gadai saat kaya, memilih tujuan kartu pesawat (melengkapi/menghalangi warna, lewat MULAI, menghindari sewa mahal),
menawar lelang sampai nilai perkiraannya, menjual/menggadaikan aset saat berutang, dan menawarkan
tukar (uang atau tukar properti) untuk melengkapi warna. Bot menilai tawaran tukar dengan membandingkan untungnya sendiri
terhadap untung lawan; bot Sulit paling sulit dibujuk.

## Arsitektur

| File | Isi |
| --- | --- |
| `engine.js` | Logika murni (tanpa DOM): papan, kartu, aturan giliran, lelang, utang, tukar, bangkrut, AI bot. Dipakai browser & test Node. |
| `scene.js` | Scene Three.js: papan bertekstur canvas (motif kawung), pion, dadu, rumah/hotel, penanda pemilik, tanda gadai, Monas, animasi. |
| `game.js` | Kontroler: loop host/lokal, Firebase (room, presence, aksi, host pindah, chat), HUD, modal aset/petak/tukar, suara WebAudio. |
| `firebase-config.js` | Config Firebase (`window.MONO_FIREBASE_CONFIG`). |

**Online memakai model host-authoritative.** Browser host menjalankan engine dan bot. Pemain lain hanya mengirim aksi (`act`);
host memvalidasi giliran dan nomor urut state (`seq`). Aksi kelola aset (bangun/jual/gadai/tebus) boleh kapan saja.

Struktur data di `/monopoly/rooms/{KODE}`:

- `host`, `hn` (nama host), `created`, `status` (`lobby` / `playing` / `over` / `ended`), `n` (pemain online), `cfg`
- `players/{uid}`: `{name, conn, t}`. `conn` otomatis jadi `false` saat terputus (onDisconnect).
- `pub`: state publik (JSON string, tanpa urutan tumpukan kartu).
- `full`: state lengkap untuk host pengganti.
- `act/{push}`: antrean aksi dari pemain ke host.
- `chat/{push}`

Room yang lebih tua dari 4 jam dibersihkan otomatis saat ada yang membuka daftar room.

## Firebase Rules

Saat ini database mengizinkan baca/tulis node `monopoly` (sudah dicek). Jika nanti rules diperketat, tambahkan node `monopoly`
**tanpa menghapus** rules lain (`tetris`, `chess`, `poker`, `frontier`, …):

```json
"monopoly": {
  ".read": true,
  ".write": true,
  "rooms": { ".indexOn": ["created"] }
}
```

## Keterbatasan

- Tanpa autentikasi: siapa pun yang tahu kode room bisa membaca state dan mengirim aksi atas nama `uid` lain. Cocok untuk main
  bareng teman, bukan untuk kompetisi.
- Urutan kartu ada di `full`, jadi pemain yang mengintip database bisa melihat kartu berikutnya.
