# Masukan user: 4G Properties, threshold chart, legend, tooltip, top bar

Kerjakan 6 bagian di bawah. Jangan refactor bagian lain, jangan ubah format response API kecuali disebut.
Semua teks UI dalam bahasa Inggris (konvensi aplikasi).

---

## 1. Bug: 4G Properties menampilkan baris dobel per siteID_CI

**Bukti (sudah dicek):** site KKA047 punya 21 cell, tapi `get_site_properties('KKA047')` mengembalikan **63 baris**
(tiap `siteid_ci` muncul 3x). MRW002 normal (26 baris).

**Root cause:** `backend/app/queries_properties.py` ±baris 94:
`LEFT JOIN "LookupSITEID" l ON l."Prefix Site ID" = %s`. Tabel `LookupSITEID` punya prefix dobel
(KKA047 = 3 baris; total 2.174 prefix dobel), sehingga setiap cell dikali jumlah baris lookup.

**Perbaikan:** ambil **satu** baris lookup saja, mis. `LEFT JOIN LATERAL (SELECT ... FROM "LookupSITEID" WHERE "Prefix Site ID" = %s
ORDER BY "NOP", "Kota/Kabupaten", "Kecamatan" LIMIT 1) l ON true`. Hasil harus deterministik.

**Verifikasi:** KKA047 → 21 baris, tidak ada `siteid_ci` dobel. MRW002 tetap 26 baris. Kolom NOP/Branch/Kabupaten/Kecamatan tetap terisi.

---

## 2. 4G Properties: sort kolom + filter sektor

File: `frontend/src/views/kpi/PropertiesPanel.jsx`.

1. Klik header kolom → sort naik; klik lagi → turun. Tampilkan ikon panah kecil di kolom aktif.
2. **Default sort: `siteid_ci` naik**, dengan natural sort (angka dibandingkan sebagai angka: `KKA047_11, _12, …, _61`,
   bukan urutan teks). Kolom angka di-sort numerik, nilai kosong selalu di bawah.
3. Backend: ubah `ORDER BY 2` menjadi urut `siteid_ci` (natural) agar urutan awal sudah benar.
4. Filter sektor sudah ada (`KpiMonitoringView.jsx` ±baris 17: `props.rows.filter(r => sectors.includes(r.sector))`).
   Pastikan: saat user memilih satu sektor, **hanya** baris sektor itu yang tampil, dan badge "Sector …" serta jumlah cell sesuai.
   Mode "sectoral" menampilkan sektor yang dicentang saja.
5. `React key` baris: pakai `siteid_ci` (bukan `cell_name`) supaya unik.
6. Export Excel properties (`kpiExport.js`) mengikuti urutan sort yang sedang tampil.

---

## 3. Garis threshold di chart PRB dan User Throughput (bisa show/hide + atur nilai)

### Kontrol
Komponen baru `frontend/src/views/kpi/ThresholdControl.jsx`, ditaruh di sebelah tombol Marker
(lewat `headerExtra` di `KpiMonitoringView.jsx` ±baris 46, pola sama dengan `MarkerControl.jsx`).
Tombol **Threshold** → popover:

| Pengaturan | 4G (Hourly & Daily) | 5G | Berlaku di KPI id |
|---|---|---|---|
| ☑ Show PRB threshold + input nilai (%) | default **90** | default **90** | `dl_prb`, `ul_prb` |
| ☑ Show Throughput threshold + input nilai (Mbps) | default **1.5** | default **20** | `user_dl_thp`, `user_ul_thp` |

- Show/hide PRB dan Throughput **terpisah**.
- **Satu nilai** untuk DL dan UL.
- Nilai Throughput **terpisah per teknologi**: di menu 4G popover menampilkan/mengubah nilai 4G, di menu 5G nilai 5G.
  Nilai PRB satu untuk 4G dan 5G.
- Tombol **Reset** → kembali ke default (90 %, 1.5 Mbps, 20 Mbps, semua show = on).
- Validasi input: angka > 0; PRB maksimal 100.
- Simpan pengaturan di `localStorage` (key mis. `netpulse_thresholds`), bungkus read/write dengan try/catch;
  jika gagal, pakai default. Tidak hilang saat refresh.
- Tidak tampil di menu 2G dan di menu tanpa chart tersebut.

### Gambar garis
- `KpiChartsPanel.jsx` `chartProps(kpiData)` menambahkan prop `threshold` (`{ value, unit }` atau `null`) hanya untuk 4 KPI id di atas,
  berdasarkan menu aktif dan pengaturan. KPI lain → `null`.
- `SectorPayloadChart.jsx`: jika `threshold` ada, tambahkan `markLine` horizontal di sumbu kiri (yAxisIndex 0):
  garis **putus-putus**, **opacity 0.2**, warna netral (mis. `#ef4444`), label kecil di ujung kanan (`90%`, `1.5 Mbps`, `20 Mbps`), `silent: true`.
  Jangan bentrok dengan markLine Marker aktivitas yang sudah ada (buat series terpisah).
- Pastikan garis tetap terlihat walau data di bawah threshold: sumbu Y kiri harus mencakup nilai threshold
  (mis. `max: v => Math.max(v.max, threshold.value)` bila `maxY` tidak diset). Saat threshold di-hide, sumbu kembali seperti sekarang.
- Cluster Monitoring **tidak** diubah (tidak mengirim prop `threshold`).

---

## 4. Legend terpotong

`SectorPayloadChart.jsx` ±baris 478: legend `type: 'scroll'` → sebagian carrier tersembunyi di halaman "1/2".

- Ganti ke `type: 'plain'` agar legend turun ke beberapa baris (wrap).
- Tinggi chart dan `grid.bottom` menyesuaikan jumlah baris legend: perkirakan jumlah baris dari jumlah item dan lebar chart
  (atau ukur setelah render) — tambah ±18 px per baris ekstra di atas tinggi dasar 290 px.
  Legend tidak boleh menimpa label sumbu X.
- Berlaku untuk semua pemakaian `SectorPayloadChart`.

---

## 5. Tooltip: urut nilai + tidak terpotong

`SectorPayloadChart.jsx` ±baris 498–530.

1. Tooltip saat hover **diurutkan berdasarkan nilai**, default **High → Low**. `Total Payload` selalu di baris paling bawah;
   nilai kosong/non-angka di bawah carrier lain.
2. Tambahkan toggle urutan **High→Low / Low→High** di popover kontrol chart (boleh di `ThresholdControl` sebagai baris "Tooltip order",
   atau tombol kecil terpisah di sebelahnya). Simpan di `localStorage` seperti threshold.
3. Tooltip terpotong di atas chart (gambar user: baris pertama hilang). Tambahkan `confine: true` (atau `appendToBody: true`)
   sehingga seluruh isi tooltip selalu terlihat. Jika item banyak, tooltip boleh 2 kolom atau scroll internal, tapi tidak terpotong.

---

## 6. Top bar freeze saat scroll + lebih pipih

`frontend/src/components/layout/AppHeader.jsx` ±baris 29 sudah `sticky top-0 z-30`, tetapi tidak menempel saat scroll.
Dugaan kuat (belum diuji): wrapper terluar di `frontend/src/App.jsx` ±baris 126 memakai `overflow-x-hidden`, yang membuat
elemen itu jadi scroll container sehingga `sticky` tidak bekerja terhadap scroll window.

1. Perbaiki agar header benar-benar menempel di atas saat halaman di-scroll (mis. ganti `overflow-x-hidden` → `overflow-x-clip`,
   atau cara lain yang setara). Cek tidak memunculkan scroll horizontal baru.
2. Setelah scroll > ±24 px, header masuk mode **compact**: padding vertikal lebih kecil (mis. `py-1`, `min-h-10`),
   badge breadcrumb disembunyikan, ukuran judul sedikit lebih kecil. Transisi halus. Kembali normal saat di atas.
3. Popover Threshold/Marker dan bottom sheet 4G Properties tidak boleh tertutup header (cek z-index).

---

## Verifikasi (wajib, di browser)

1. KKA047 4G Daily, Properties: 21 baris, default urut `siteid_ci`, sort per kolom jalan, filter Sector 3 → hanya cell sektor 3.
2. 4G Daily: chart DL PRB ada garis 90 % putus-putus tipis; User DL/UL Thp ada garis 1.5 Mbps. Ubah nilai → garis pindah;
   hide → garis hilang dan sumbu kembali normal; refresh → pengaturan tetap.
3. 5G: Throughput default 20 Mbps, terpisah dari nilai 4G.
4. Chart lain (Payload, CQI, Availability) tanpa garis threshold. 2G tidak berubah. Cluster Monitoring tidak berubah.
5. Site dengan banyak carrier (mis. KKA047 Sector 1): semua legend tampil tanpa "1/2", tidak menimpa sumbu X.
6. Hover tooltip: urut High→Low, toggle ke Low→High jalan, tooltip tidak terpotong.
7. Scroll halaman: header tetap di atas dan memipih; scroll ke atas → normal. Light dan dark mode.

## Git

Buat branch `feat/chart-ux-properties` dari HEAD sekarang. Commit per bagian (1–6) dengan pesan yang jelas.
Jangan push tanpa konfirmasi user.
