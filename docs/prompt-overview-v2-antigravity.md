# Prompt Antigravity — Overview v2 (NOP, mode YoY/MTD/YTD, chart tahunan, perpindahan instan)

Kamu melanjutkan halaman **Network Overview** di netPulse (`D:\AI ENGINEER\Web Hourly Monitoring`, FastAPI + React/ECharts + Tailwind). Versi pertama sudah ada di branch `feat/overview` (commit `8309abe`): `backend/app/queries_overview.py`, endpoint `/api/overview/*` di `backend/app/main.py`, dan `frontend/src/views/OverviewView.jsx`.

## 0. Persiapan
1. Jalankan `git status` dan `git log --oneline -5`. Pastikan berada di `feat/overview`, lalu lanjutkan di branch itu. Jangan buat branch baru, jangan merge, jangan push.
2. Seluruh teks UI dan pesan error backend memakai **bahasa Inggris**, sesuai halaman lain. Komentar kode bebas.
3. Pertahankan identitas visual netPulse: `cardCls`/`headerCls` yang sudah ada, palet slate/blue, dukungan dark & light mode, ikon lucide, ECharts lewat `../lib/echarts`. Gambar referensi hanya untuk **bentuk chart dan isi ubin**, bukan warnanya.

## 1. Toggle 1/2/3 di kanan atas
Tombol 1/2/3 (`chartsPerRow`) di `frontend/src/components/layout/AppHeader.jsx` tidak berpengaruh di Overview. **Sembunyikan hanya saat menu Overview aktif.** Menu lain tetap menampilkannya seperti sekarang.

Di header kartu Overview, tambahkan segmented toggle **Mode: `YoY | MTD | YTD`**. Gaya mengikuti `SegmentedToggle` di `ClusterMonitoringView.jsx`; pakai ulang komponennya jika bisa diimpor. Default = `YTD`.

Semua mode membandingkan dengan **periode yang sama tahun lalu** (tanggal MM-DD yang sama):

| Mode | Periode sekarang | Pembanding |
|---|---|---|
| YoY | tanggal terpilih (1 hari) | tanggal yang sama tahun lalu |
| MTD | tanggal 1 bulan itu → tanggal terpilih | rentang yang sama tahun lalu |
| YTD | 1 Jan → tanggal terpilih | rentang yang sama tahun lalu |

Badge delta menampilkan label mode (`▲ 12.08% YTD`, `▼ 3.10% MTD`, `+1.2% YoY`). 29 Feb tidak punya pasangan, jadi dilewati.

## 2. Branch → NOP
Ganti filter **Branch** dengan **NOP**.

- `measDailyTrafficPayload` **tidak punya kolom NOP**. Ambil NOP dari `"LookupSITEID"."NOP"` lewat `prefix_site_id = "Prefix Site ID"`.
- ⚠️ `LookupSITEID` berisi **10.751 baris untuk 8.469 prefix site** (duplikat). Join langsung menggandakan payload: 2026-11-07 menjadi ~10.000 baris, padahal seharusnya 7.798. **Wajib dedup** dengan:
  ```sql
  WITH lk AS (
    SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop,
           "Kota/Kabupaten" AS kab, "Kecamatan" AS kec
    FROM "LookupSITEID" ORDER BY "Prefix Site ID"
  )
  ... LEFT JOIN lk ON lk.p = m.prefix_site_id
  ```
  Duplikatnya sudah dicek: tidak ada prefix dengan NOP berbeda.
- Opsi NOP: `All, BONE, KENDARI, MAKASSAR, MANADO, PALU, PARE-PARE, TERNATE, Unmapped`. Ada ±46 site tanpa padanan; tampilkan sebagai **Unmapped**.
- NOP ≠ Branch persis: sebagian site Branch MANADO masuk NOP PALU. Jadi jangan pakai kolom `branch` sebagai pengganti NOP.
- Drill-down ranking menjadi **NOP → Kabupaten → Kecamatan**, sama seperti filter geografis di menu lain. Breadcrumb tetap ada.
- Jumlah site inventori (2G/4G/5G) mengikuti NOP. `CellList2G`/`CellList4G` cukup di-join ke `lk` lewat 6 karakter pertama `"Site ID"`. Cek dulu formatnya; jika tabel itu punya kolom `"NOP"` sendiri, pakai kolom itu. `ref_cell_5g` di-join lewat `LEFT(siteid,6)`.
- Top 10 decline sites: kolom Branch diganti NOP.

## 3. Chart seperti referensi (gambar 2)
Ganti dua chart "30-Day Productivity Trend" dengan dua chart tahunan berdampingan: **Payload Trend (TB)** dan **Traffic Trend (KErl)**.

- Sumbu X = tanggal dalam setahun, 1 Jan → 31 Des. Label tiap ±5 minggu (`01 Jan, 04 Feb, 10 Mar …`), disejajarkan per MM-DD.
- Dua seri garis harian dengan area tipis di bawahnya:
  - **tahun lalu** (mis. `2025 (TB)`): warna lembut `slate-400`
  - **tahun terpilih** (mis. `2026 (TB)`): `blue-500` untuk payload, `emerald-500` untuk traffic

  Seri tahun berjalan berhenti di tanggal data terakhir. Bagian setelah tanggal terpilih diberi bayangan tipis (`markArea`) sebagai penanda "belum terjadi".
- Seri ketiga di **sumbu Y kanan**: **Δ % (garis putus-putus, `amber-500`)**, isinya mengikuti mode:
  - YoY = Δ% harian (hari ini vs MM-DD yang sama tahun lalu)
  - MTD = Δ% kumulatif yang di-reset tiap tanggal 1
  - YTD = Δ% kumulatif sejak 1 Jan

  Nama legend: `YTD Δ (%)` / `MTD Δ (%)` / `YoY Δ (%)`.
- Sumbu kiri tidak mulai dari 0 (`scale: true`) supaya fluktuasi terlihat, seperti referensi.
- Tooltip per tanggal berisi:
  - nilai tahun ini dan tahun lalu
  - breakdown 2G/4G/5G untuk payload, atau 2G/VoLTE untuk traffic
  - Δ%
- Tombol expand (ikon `Maximize2`) di pojok kartu membuka chart dalam modal layar penuh.
- Tinggi chart ±320 px. Grid tetap `grid-cols-1 lg:grid-cols-2`.

## 4. Ubin KPI
Nilai mengikuti mode dan NOP:

1. **Total Payload ({tahun})**: jumlah periode. Satuan otomatis TB → **PB** bila ≥ 1.000 TB. Badge Δ% mode, dan baris kecil "Last yr: …".
2. **4G Payload** dan 3. **5G Payload**: tetap ada; 5G tetap menampilkan "% share".
4. **Total Traffic**: KErl, otomatis menjadi **Mio Erl** bila ≥ 1.000 KErl.
5. **Peak Daily Payload ({tahun})**: payload harian tertinggi dalam periode mode, ditambah tanggalnya (`→ 30 Jun`).

Grid ubin: `grid-cols-2 lg:grid-cols-5`.

## 5. Performa — perpindahan NOP, mode, dan tanggal harus instan
Penyebab lambat saat ini: setiap ganti branch menjalankan 5 request ulang ke onedb, ditambah overlay loading satu halaman. Link onedb lambat. Hasil ukur: agregat harian per NOP dari 2025-01-01 s.d. 2026-11-07 = **5.249 baris, ±5 detik**. Data itu kecil, jadi cukup diambil sekali.

**Backend**
1. Endpoint baru `GET /api/overview/dataset?year=2026` mengembalikan agregat **harian × NOP** untuk tahun itu dan tahun sebelumnya. Kolom: `date, nop, payload_2g, payload_4g, payload_5g, total_payload` (TB), `traffic_2g, traffic_volte, total_traffic` (KErl). Satu query `GROUP BY date, nop` dengan CTE `lk` di atas, filter `date >= make_date(year-1,1,1)`.
2. Cache di memori proses, dengan key `(year, latest_date)`. `latest_date` diambil dari `get_latest_overview_date()` yang sudah di-cache 10 menit. Saat data baru masuk (MAX(date) berubah), cache otomatis diganti.
3. Pre-warm cache tahun berjalan saat startup FastAPI di thread background, supaya pengguna pertama tidak menunggu.
4. Endpoint `inventory` mengembalikan jumlah site untuk **semua NOP sekaligus** (GROUP BY NOP). Cache dengan key `latest_week`.
5. Endpoint drill (`level=kabupaten|kecamatan`, `parent`, `mode`, `date`) dan `top_decline` (`nop`, `mode`, `date`) tetap query per permintaan. Hasilnya di-cache di memori dengan key semua parameter + `latest_date`, maksimal ±200 entri (LRU). Untuk MTD/YTD, decline dihitung dari **jumlah periode per site** vs periode yang sama tahun lalu.
6. Aktifkan `GZipMiddleware` (`minimum_size=1000`) jika belum ada.
7. Endpoint lama `summary`/`trend`/`branches` yang sudah tidak dipakai frontend dihapus, supaya tidak ada kode mati.

**Frontend**
1. Saat halaman dibuka: ambil `dataset` + `inventory` sekali. Simpan di state/ref, dengan key per `year`.
2. Ubin, kedua chart, dan **ranking level NOP** dihitung di browser dengan `useMemo` dari dataset. Mengganti NOP, mode, atau tanggal dalam tahun yang sama **tidak boleh memicu request jaringan**. Request hanya terjadi jika tahun berganti dan belum ada di cache.
3. Drill Kabupaten/Kecamatan dan Top Decline:
   - cache hasil di `Map` frontend dengan key parameter
   - tampilkan spinner kecil **di dalam kartu itu saja**, dan data lama tetap tampil sampai data baru datang
   - batalkan request usang dengan `requestId` yang sudah ada atau `AbortController`
4. `DataLoadingOverlay` satu halaman hanya muncul saat dataset pertama kali dimuat.
5. Tombol Reload memaksa refetch (abaikan cache frontend; tambahkan `?refresh=1` agar backend juga membuang cache key itu).

## 6. Bagian lain
- Kartu **Data Freshness** tetap ada.
- Export Excel menyesuaikan:
  - sheet Summary (mode, NOP, periode)
  - sheet Daily (dataset terfilter NOP, tahun ini vs tahun lalu per MM-DD, Δ%)
  - sheet Ranking
  - sheet Top Decline
- Nama file: `netPulse_Overview_{mode}_{date}_{nop}`.

## 7. Verifikasi (wajib, laporkan hasilnya)
1. `npm run build` di `frontend` tanpa error; backend jalan dengan `uvicorn` port 8010 (`DASHBOARD_USER=` `DASHBOARD_PASS=` kosong).
2. Dedup: jumlah baris join 2026-11-07 = **7.798** (sama dengan baris tabel tanpa join). Jumlah payload semua NOP = nilai All.
3. Mode YoY, All, 2026-11-07: total payload ≈ 7.933 TB, 4G ≈ 7.711 TB, 5G ≈ 220 TB, traffic ≈ 345 KErl. Bandingkan dengan SQL langsung.
4. Untuk YTD dan MTD All per 2026-11-07, cocokkan total payload/traffic tahun ini dan tahun lalu dengan SQL `SUM ... WHERE date BETWEEN`.
5. Di DevTools → Network: setelah halaman termuat, ganti NOP 3×, mode 3×, dan tanggal dalam 2026. **Tidak boleh ada request `/api/overview/dataset` baru**, dan perpindahan terasa < 100 ms.
6. Request `dataset` kedua (cache backend) selesai < 500 ms.
7. Pilih tanggal 2025: dataset 2025 (+2024) dimuat sekali, chart menampilkan 2024 vs 2025.
8. Toggle 1/2/3 hilang di Overview tetapi tetap ada dan berfungsi di 4G Daily / Cluster Monitoring.
9. Cek tampilan dark dan light mode.

Selesai: commit di `feat/overview` dengan pesan `feat(overview): NOP filter, YoY/MTD/YTD modes, yearly trend charts, cached dataset`. Laporkan hasil tiap poin verifikasi.
