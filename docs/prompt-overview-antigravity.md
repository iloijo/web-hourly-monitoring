# Prompt: Halaman Overview netPulse (untuk Antigravity)

> Tempel seluruh isi file ini ke Antigravity. Gambar referensi chart: `docs/overview-trend-reference.webp`.
> File ini dan gambar referensi tidak perlu di-commit.

---

## Tugas

Buat menu/halaman baru **Overview** di netPulse (`D:\AI ENGINEER\Web Hourly Monitoring`) dan jadikan halaman **pertama yang terbuka setelah login**. Sumber data utama: tabel onedb `measDailyTrafficPayload` (agregat harian per site).

## Git

1. Repo sedang di branch `feat/cluster-monitoring` (bersih, belum di-merge ke main). Buat branch baru **`feat/overview` dari `feat/cluster-monitoring`**.
2. `git log` dulu: kode bisa berubah di luar sesi ini.
3. Commit di `feat/overview`. **Jangan push, jangan merge.** Repo GitHub-nya publik, jadi jangan commit kredensial apa pun (`.env` sudah di-ignore).

## Pola kode yang wajib diikuti

- Backend FastAPI di `backend/app/`. Endpoint ada di `main.py` (`@app.get("/api/...")`), dan query ditaruh di modul `queries_*.py`. Buat **`backend/app/queries_overview.py`**.
- Koneksi onedb untuk baca: `get_onedb_connection()` dari `db.py` (akun `read1`, read-only). **`read1` sudah diberi `GRANT SELECT` pada `measDailyTrafficPayload`.** Jangan pakai `get_onedb_rw_connection()` di sini.
- Endpoint membungkus error menjadi `{"error": str(e), ...}` seperti `/api/worstcell`.
- Frontend React + ECharts (`frontend/src/lib/echarts.jsx`), Tailwind, ikon `lucide-react`.
  - View baru di **`frontend/src/views/OverviewView.jsx`**, di-lazy-load di `App.jsx` seperti `WorstCellView`.
  - Tambahkan `'overview'` ke `constants/menus.js` (`MENU_META`, source `OneDb Live (measDailyTrafficPayload)`, db `onedb`) dan sebagai menu teratas di `components/layout/AppSidebar.jsx`.
  - Di `App.jsx`, `useState('4g-hourly')` untuk `activeMenu` diganti menjadi `'overview'`.
  - Daftarkan export Excel lewat `onExportData`, seperti halaman lain.
- **Semua teks UI dalam bahasa Inggris** (keputusan sebelumnya). Komentar kode bebas.
- Dukung dark mode dan semua tema yang ada (`darkMode` prop, palet di `constants/themes.js`). Lihat `WorstCellView.jsx` / `ZtzpView.jsx` untuk gaya kartu.

## Performa (penting)

Link ke onedb lambat (~42 ribu baris ≈ 25 detik). **Semua agregasi dilakukan di SQL.** Kirim ke frontend hanya hasil ringkas: angka ubin, 30 titik tren, ±7 branch, dan Top-N. Gunakan index yang ada: `(date, prefix_site_id)` unik, `date`, `branch`, `sales_cluster`, `rtpo`, `prefix_site_id`. Satu hari ≈ 7.800 baris; filter selalu dengan rentang `date`.

## Data: `measDailyTrafficPayload` (onedb)

Kolom: `date` (date), `prefix_site_id`, `kota_kabupaten`, `branch`, `sales_cluster`, `rtpo`, `traffic_2g_mio_erl`, `payload_2g_tb`, `traffic_3g_mio_erl`, `payload_3g_tb` (selalu 0), `traffic_volte_mio_erl`, `payload_4g_fdd_tb`, `payload_4g_tdd_tb`, `payload_4g_tb`, `payload_5g_tb`, `total_traffic_mio_erl`, `total_payload_tb`, `source`, `created_at`.

Fakta data:
- Satuan payload **TB** dan traffic **Mio Erl**. Di UI, traffic ditampilkan dalam **KErl** (× 1000).
- Rentang data **2024-01-01 s/d kemarin**, tanpa tanggal kosong. Data 2024–2025 berasal dari Excel (`source='EXCEL_HISTORICAL'`); mulai 2026-01-01 dihitung dari measDy (`DAILY_IMPORT`) dan di-update otomatis tiap 2 jam (10:00–18:00).
- `total_traffic = traffic 2G + VoLTE`; `total_payload = payload 2G + 4G + 5G`.
- ±88 site punya `branch` NULL. Tampilkan sebagai **"Unmapped"**.
- 7 branch: BONE, KENDARI, MAKASSAR, MANADO, PALU, PARE-PARE, TERNATE.

## Isi halaman (urut dari atas)

**Kontrol kanan atas:** pilihan tanggal (default = tanggal terakhir yang ada di tabel) dan filter Branch (default All). Tidak ada pilihan DoD/WoW. **Semua pembanding memakai YoY**, yaitu tanggal yang sama tahun lalu (`date - interval '1 year'`).

### 1. Ubin KPI (satu baris)
| Ubin | Nilai | Pembanding |
|---|---|---|
| Total payload | SUM `total_payload_tb` (TB) | YoY % |
| Payload 4G | SUM `payload_4g_tb` | YoY % (**tanpa** porsi FDD/TDD) |
| Payload 5G | SUM `payload_5g_tb` + porsi % dari total | YoY % |
| Total traffic | SUM `total_traffic_mio_erl` × 1000 (KErl) | YoY % |

Warna: hijau jika naik, merah jika turun. Jika nilai tahun lalu 0 atau tidak ada, tampilkan "–" (jangan dibagi nol).

### 2. Ubin jumlah site 2G / 4G / 5G (inventori)
Keputusan user: **jumlah site inventori (terdaftar)**, bukan site aktif. Tanpa YoY, karena tabel inventori hanya menyimpan minggu terakhir.
- 2G: `COUNT(DISTINCT "Site ID")` dari `"CellList2G"` pada `"Week" = MAX("Week")` (sekarang `2026-W44`, ±8.217). Filter branch pakai kolom `"Branch"`.
- 4G: sama, dari `"CellList4G"` (±8.253), kolom `"Site ID"` dan `"Branch"`.
- 5G: `COUNT(DISTINCT siteid)` dari `ref_cell_5g` (±451). Tabel ini tidak punya branch, jadi untuk filter branch join `LEFT(siteid,6)` ke `"LookupSITEID"."Prefix Site ID"` → `"Branch"` (cek dulu bahwa format siteid cocok, contoh `COI344`).
- Tulis label kecil "Inventory · week 2026-W44" di bawah angka.

### 3. Dua chart tren 30 hari (seperti `docs/overview-trend-reference.webp`)
Judul seksi: "30-Day Productivity Trend". Dua kartu berdampingan (bertumpuk di layar sempit):
- **Payload Trend**: stacked bar per hari, 2G / 4G / 5G (`payload_2g_tb`, `payload_4g_tb`, `payload_5g_tb`), sumbu Y "TB/day", subtitle "Stacked per Technology (TB/day) — last 30 days".
- **Traffic Trend**: stacked bar 2G / 4G (VoLTE) (`traffic_2g_mio_erl`, `traffic_volte_mio_erl`, × 1000), sumbu Y "KErl". 5G tidak punya traffic, jadi jangan tampilkan seri 5G yang kosong.
- Tambahkan **garis putus-putus total tahun lalu** (tanggal yang sama −1 tahun) di kedua chart.
- Label tanggal "09 Oct", tooltip menampilkan nilai per teknologi dan total. Warna legend mengikuti gambar referensi: teal (2G), biru (4G), biru tua (5G). Sesuaikan dengan tema aktif.
- Satu query `GROUP BY date` untuk 30 hari + satu untuk 30 hari tahun lalu.

### 4. Ranking branch
Tabel: Branch, Total payload (TB), YoY %, Traffic (KErl), YoY %, jumlah site (baris di tabel pada tanggal itu). Urut payload terbesar.
- Klik sebuah baris untuk drill-down ke `sales_cluster`, lalu `rtpo` (breadcrumb untuk kembali). Drill dilakukan di endpoint yang sama dengan parameter `level` + `parent`.

### 5. Site penurunan payload terbesar
Top 10 site dengan selisih `total_payload_tb` (tanggal terpilih − tanggal yang sama tahun lalu) paling negatif. Kolom: site, kabupaten, branch, payload sekarang, tahun lalu, Δ, Δ%. Hormati filter branch.
- Klik baris membuka 4G Daily untuk site itu, memakai `onOpenSite('4g', site)` yang sudah ada di `App.jsx` (`openSite`).

### 6. Freshness data
Kartu kecil berisi tanggal terakhir per sumber: dari `/api/latest_dates` yang sudah ada, ditambah `MAX(date)` `measDailyTrafficPayload` dari endpoint overview. Beri tanda kuning jika tertinggal lebih dari 2 hari dari hari ini.

> Kartu Worst Cell / ZTZP **tidak** dimasukkan: endpoint-nya berat di link onedb yang lambat.

## Endpoint backend yang diusulkan

- `GET /api/overview/summary?date=&branch=` → ubin KPI + YoY, jumlah site inventori, `latest_date`.
- `GET /api/overview/trend?end_date=&days=30&branch=` → array per tanggal (2G/4G/5G payload, 2G/VoLTE traffic, total) + total tahun lalu.
- `GET /api/overview/branches?date=&level=branch|sales_cluster|rtpo&parent=` → ranking + YoY.
- `GET /api/overview/top_decline?date=&branch=&top_n=10`.

Semua parameter memakai query terparameterisasi psycopg2 (`%s`), tanpa f-string untuk nilai dari user.

## Verifikasi sebelum selesai

1. Jalankan backend lokal dengan login dimatikan: uvicorn port 8010 dengan env `DASHBOARD_USER=` dan `DASHBOARD_PASS=` (kosong). Build frontend (`npm run build` di `frontend/`).
2. Cek angka 2026-11-07 (All branch) mendekati: total payload ≈ 7.933 TB, payload 4G ≈ 7.711 TB, 5G ≈ 220 TB, total traffic ≈ 345 KErl. Bandingkan langsung dengan query SQL.
3. Pastikan YoY tidak error saat filter branch dipilih dan pada tanggal tanpa data tahun lalu.
4. Waktu muat Overview pertama kali < 5 detik. Kalau lebih, perbaiki query (bukan menambah cache dulu).
5. Cek tampilan light dan dark, lebar ≥ 1280 px dan ~800 px.
6. Pastikan menu lain (4G Hourly, Worst Cell, Cluster, dll.) tetap jalan.

Laporkan di akhir: file yang diubah, hash commit, angka hasil verifikasi nomor 2, dan waktu muat.
