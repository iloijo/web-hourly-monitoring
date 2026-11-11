# PROMPT ANTIGRAVITY — netPulse Bugfix Batch (Sector/EPS, Legend CI, Responsive Legend, Export Chart, Worst Cell Site Search)

> Ditujukan untuk: Antigravity (Gemini 3.8 Flash High Turbo)
> Repo: `D:\AI ENGINEER\Web Hourly Monitoring` (FastAPI `backend/app` + React/Vite/ECharts `frontend/src`)
> Tanggal analisa: 2026-11-11, basis kode: branch `main` (HEAD 33a9880)

---

## 0. ATURAN KERJA (WAJIB DIBACA DULU)

1. **Buat branch baru** dari `main`: `fix/sector-legend-export`. Jangan commit ke `main`.
2. **Kerjakan per task (T1 → T6) secara berurutan**, satu commit per task, pesan commit format `fix(scope): ...` / `feat(scope): ...`.
3. **Surgical change**: ubah hanya baris yang berhubungan dengan task. Jangan refactor/rapikan kode lain, jangan ganti format, jangan hapus kode yang tidak terkait.
4. **Seluruh teks UI dan pesan error backend dalam Bahasa Inggris** (konvensi aplikasi). Komentar kode boleh Inggris.
5. **Jangan jalankan query agregasi regional ke `measHy4g` (twodb)**. Tabel 55 GB / 71 juta baris — seq scan > 10 menit dan mengganggu auto import. Query `measHy4g` WAJIB memakai filter `"Begin Time"` + `"eNodeB Name"` (index). Jangan pakai `LIKE` pada `"eNodeB Name"`.
6. Link onedb lambat → ranking/filter dilakukan di SQL, kirim hanya Top-N/halaman ke frontend.
7. Tes lokal: jalankan backend `uvicorn app.main:app --port 8010` dari folder `backend` dengan env `DASHBOARD_USER=` dan `DASHBOARD_PASS=` (kosong) supaya tanpa login; frontend `npm run dev` atau `npm run build` lalu buka `http://localhost:8010`.
8. Setelah semua task selesai: `npm run build` harus sukses tanpa error, dan `python -m py_compile` semua file backend yang diubah harus lolos.

---

## 1. RINGKASAN BUG & AKAR MASALAH (hasil analisa)

| # | Bug yang dilaporkan | Akar masalah (terverifikasi) | File utama |
|---|---|---|---|
| T1 | SDR027: carrier L700 numpuk (overlap) di 1 sector | Cell L700 SDR027 (`..._MY01/02/03`, cellId 17/27/37) **ada di `measHy4g` tapi tidak ada di `CellListRCI`**. Baris measurement yang tidak ketemu di `cell_map` jatuh ke fallback `sec = 1` → ketiga carrier L700 (sektor 1, 2, 3) masuk **Sector 1**. Band-nya juga salah: fallback nama tidak mengenal kode `MY`, lalu `"DMT"` mengandung `"MT"` → terbaca L900. | `backend/app/queries.py` (hourly, baris ±344–361), `backend/app/queries_daily.py` (daily, baris ±1093–1110) |
| T2 | EPS: Sector 1 berisi semua cell induk, harusnya hanya sector EPS & otomatis terpilih | Site EPS (contoh `EPS001` sektor 17, `EPS002` sektor 18/19) **menumpang di eNodeB site induk** (`E_ISM122M41_...`, `E_KDI303M41_...`). Query measurement diambil per eNodeB → semua cell induk ikut terbaca, tidak ada di `cell_map` EPS → semua jatuh ke `sec = 1`. Di frontend `selectedSector` default `'1'` dan **tidak di-reset** saat site berganti, jadi sector EPS (17/18/19) tidak otomatis terpilih. | `queries.py`, `queries_daily.py`, `queries_5g.py` (cek juga), `frontend/src/hooks/useKpiMonitoring.js` |
| T3 | Legend chart overlap dengan tanggal sumbu-X di laptop lain (resolusi beda) | Jumlah baris legend **ditebak** dari `chartsPerRow` (`itemsPerLegendRow = 4` untuk 3 chart/baris), bukan dari lebar chart sebenarnya dan panjang teks legend. Di layar lebih sempit / zoom Windows 125–150% legend membungkus lebih banyak baris dari tebakan → `grid.bottom` kurang → legend menimpa label tanggal. | `frontend/src/components/SectorPayloadChart.jsx` (baris ±529–535, 636–649, 733–738) |
| T4 | Legend pakai CI saja untuk 4G & 5G | Saat ini legend = `"<band> <carrier label>"` (contoh `L1800 ML1`, untuk EPS malah jadi `PS18_181`). Backend tidak mengirim peta carrier → CI. | `queries.py`, `queries_daily.py`, `queries_5g.py`, `SectorPayloadChart.jsx` |
| T5 | Export Excel ikut export chart sesuai filter aktif; tabel Cluster Monitoring ter-export rapi | Export sekarang hanya data mentah format long. Filter band (`selectedBands`) **tidak diterapkan** ke export, tidak ada chart di Excel. `build_workbook` hanya menulis tabel polos (header biru, tanpa number format, tanpa warna remark). | `frontend/src/views/kpi/kpiExport.js`, `frontend/src/views/ClusterMonitoringView.jsx` (baris ±237–274), `backend/app/export_xlsx.py`, `backend/app/main.py` (`/api/export/xlsx`) |
| T6 | Tombol search/filter Worst Cell by Site ID | Worst Cell hanya punya filter scope (Regional/NOP/Kab/Kec). Ranking Top-N dilakukan di SQL, jadi site yang tidak masuk Top-N regional tidak akan pernah muncul → butuh filter Site ID **di backend** (sebelum ranking), bukan hanya filter tabel di frontend. | `backend/app/queries_worstcell.py` (`get_worst_cells`, baris ±160–262), endpoint di `main.py`, `frontend/src/views/WorstCellView.jsx`, `frontend/src/views/cells/CellScopeFilters.jsx` |

Data bukti (sudah dicek ke DB):

```
CellListRCI SDR027 : ci 11-16, 21-26, 31-36, 61  → TIDAK ADA ci 17/27/37
measHy4g   SDR027 : ada C_SDR027MY1_Watangpulu-DMT_MY01 (cellId 17), _MY02 (27), _MY03 (37)  ← L700
CellListRCI EPS001 : cell EPS001EL1_ISM122_..._EL17 ci 171, enodeb_name E_ISM122M41_Tolotio-DMT, sec new type EPS001_17_Easy-MAC
CellListRCI EPS002 : ci 181/183 (sektor 18), 191/193 (sektor 19), enodeb_name E_KDI303M41_HaluoleoAnduonohu-DMT
```

---

## 2. TASK DETAIL

### T1 — Cell yang tidak ada di CellListRCI: sektor & band dari cellId (bukan fallback Sector 1)

**Aturan dasar (single source of truth):** cellId/CI LTE → digit terakhir = band (lihat `backend/app/bands.py`, fungsi `lte_band`), digit di depannya = nomor sektor. Contoh: `17` → sektor 1, L700; `27` → sektor 2, L700; `171` → sektor 17, L1800; `183` → sektor 18, L2100.

Langkah:

1. Di `backend/app/bands.py` tambahkan helper kecil (satu fungsi, tanpa class):
   ```python
   def lte_sector_from_ci(ci) -> Optional[int]:
       """Sector number of an LTE cell from its ci / cellId: all digits except the last (17 -> 1, 183 -> 18)."""
       try:
           digits = str(int(float(ci)))
       except (ValueError, TypeError):
           return None
       return int(digits[:-1]) if len(digits) > 1 else None
   ```
2. `backend/app/queries.py` (`get_site_payload_data`, hourly):
   - Tambahkan `"cellId"` ke SELECT di subquery LATERAL **dan** di SELECT luar (`m."cellId" AS cell_id`). Jangan ubah WHERE (tetap `"Begin Time" = t.ts AND "eNodeB Name" = %s`).
   - Buat juga `cell_map_by_ci` (seperti di `queries_daily.py`) dari `CellListRCI.ci`.
   - Urutan lookup meta per baris: `cell_map_by_ci[cell_id]` → nama (yang sekarang).
   - Jika **tidak ketemu** (cell tidak ada di CellListRCI): **jangan pakai `sec = 1`**. Gunakan:
     - `sec = lte_sector_from_ci(cell_id)`; jika `None` baru fallback ke suffix nama (`_MY01` → 1), terakhir baru 1.
     - `band = lte_band(cell_id, cname)` (pakai cellId, bukan `None`).
     - `carrier` mengikuti aturan label baru di T4 (CI).
   - Tambahkan `"MY"` ke `_NAME_CODES` untuk **L700** di `bands.py` (sejajar `MD`, `VD`) — hanya dipakai bila cellId kosong. Letakkan entri L700 **sebelum** entri L900 (`MT`) supaya `DMT` di nama tidak membuat salah baca. Lebih aman: cocokkan kode band hanya pada **token suffix terakhir** nama cell (`..._MY01` → `MY`), bukan `in upper` seluruh nama. Lakukan itu di `lte_band` bagian fallback nama.
3. `backend/app/queries_daily.py` (daily 4G): blok `else: sec = 1` (±baris 1108) → logika yang sama (sektor dari `cid`, band dari `cid`).
4. Cek cepat `queries_scope_4g.py`, `queries_ta.py`, `queries_cluster.py`: kalau ada pola fallback `sec = 1` / `sector = 1` untuk cell tak dikenal, terapkan perbaikan yang sama. Kalau tidak ada, jangan diubah.

**Kriteria lulus T1:**
- Site `SDR027`, menu 4G Hourly dan 4G Daily: Sector 1 berisi carrier ci 11–17, Sector 2 ci 21–27, Sector 3 ci 31–37. Carrier L700 (17/27/37) masing-masing hanya muncul **sekali** di sektornya dengan warna band L700.
- Tidak ada carrier dengan band L900 yang sebenarnya `MY` (L700).
- Catatan: cell `ML06` (ci 61) di CellListRCI punya `sec new type = SDR027_3_MAC` tapi `site_id_sector_id = SDR027_6`. **Jangan ubah** aturan prioritas `sec new type` untuk cell yang ADA di CellListRCI — cukup laporkan di ringkasan akhir sebagai pertanyaan ke user.

### T2 — Site EPS: hanya cell milik site EPS + sektor EPS otomatis terpilih

Definisi: **site EPS** = site yang cell-nya menumpang di eNodeB site lain; nomor sektornya **> 3** (2 digit, contoh 17, 18, 19). Ciri di CellListRCI: `enodeb_name` tidak mengandung `site_id`, `sec new type` seperti `EPS001_17_Easy-MAC`.

Backend (`queries.py`, `queries_daily.py`, dan `queries_5g.py` bila pola sama):

1. Setelah measurement diambil per eNodeB, **buang baris yang cell-nya bukan milik site yang dipilih**:
   - Simpan `site_cis = {int(ci) for ci in CellListRCI rows of this site}`.
   - Saat looping baris measurement: jika site adalah **site tumpangan** (semua `enodeb_name` CellListRCI tidak mengandung `site_clean`), maka baris dengan `cell_id not in site_cis` → `continue` (dibuang).
   - Untuk site normal (eNodeB = site sendiri), cell yang tidak ada di CellListRCI **tetap dipakai** (itulah kasus T1 L700).
   - Implementasi sederhana: `is_hosted = not any(site_clean in (r['enodeb_name'] or '').upper() for r in cell_rows)`.
2. Pastikan `available_sectors` hanya berisi sektor yang benar-benar punya cell (untuk EPS001 → `[17]`, EPS002 → `[18, 19]`). Hapus perilaku "default `[1, 2, 3]`" hanya bila memang ada data; jika kosong tetap boleh fallback lama.
3. Tambahkan field respons `"default_sector": available_sectors[0]` (opsional, frontend boleh hitung sendiri).

Frontend (`frontend/src/hooks/useKpiMonitoring.js`):

4. Tambahkan `useEffect` yang bergantung pada `availableSectorsKey` (sudah ada): jika `selectedSector` tidak ada di `availableSectors`, set `setSelectedSector(String(availableSectors[0]))`. Pola sama dengan efek `setSectoralSectors` yang sudah ada di baris ±375 — tiru gayanya.
5. Untuk Sectoral View: efek yang ada sudah memilih `avail.slice(0, 3)` bila tidak ada yang cocok → untuk EPS002 hasilnya `['18','19']`. Pastikan tidak tersisa `'1','2','3'`.

**Kriteria lulus T2:**
- Pilih `EPS001` (4G Hourly & Daily): dropdown sector hanya `Sector 17`, langsung terpilih, chart hanya berisi carrier ci 171 dan 173. Tidak ada cell `ISM122` sama sekali.
- Pilih `EPS002`: sector `18` otomatis terpilih, dropdown `18, 19`.
- Pindah dari `EPS002` ke `SDR027`: sector otomatis kembali ke `1`.
- Site biasa (SDR027, MRW002) tidak berubah perilakunya selain perbaikan T1.

### T3 — Legend responsif terhadap lebar chart (tidak overlap tanggal di resolusi apa pun)

File: `frontend/src/components/SectorPayloadChart.jsx`.

Masalah: `itemsPerLegendRow` ditebak dari `chartsPerRow`. Ganti dengan **pengukuran nyata**:

1. Tambahkan `ref` ke `<div className="grow">` pembungkus chart dan ukur lebarnya dengan `ResizeObserver` → state `containerWidth` (default 400). Bersihkan observer di cleanup `useEffect`. Debounce ringan via `requestAnimationFrame` agar tidak re-render berulang.
2. Hitung jumlah baris legend secara realistis:
   ```js
   // width of one legend item = icon + gap + text width (fontSize 10 ≈ 6px per char)
   const ctx = measureCanvas.getContext('2d'); ctx.font = '500 10px Inter, system-ui, sans-serif';
   const itemW = (name) => 10 /*icon*/ + 5 /*icon-text gap*/ + ctx.measureText(name).width + 14 /*itemGap*/;
   // greedy line wrap over usable width (containerWidth - 20 padding)
   ```
   Buat satu `canvas` module-level (di luar komponen) untuk `measureText` agar tidak dibuat ulang tiap render.
3. `legendRows` = hasil greedy wrap. Lalu:
   - `const LEGEND_ROW_H = 16;`
   - `gridBottom = 34 /*x-axis labels + margin*/ + legendRows * LEGEND_ROW_H + 8;`
   - `chartHeight = 260 + legendRows * LEGEND_ROW_H;`
   - legend: `bottom: 4`, `itemGap: 14`, `width: containerWidth - 20` (supaya ECharts membungkus di lebar yang sama dengan hitungan kita), `left: 'center'`.
4. Batas maksimum: jika `legendRows > 3`, ganti `legend.type = 'scroll'` (1 baris, tombol panah halaman) dan hitung `legendRows = 1` untuk tinggi. Ini mencegah chart jadi sangat tinggi saat carrier banyak.
5. Label sumbu-X: tambahkan `hideOverlap: true` di `xAxis.axisLabel` dan ubah `labelInterval` agar ikut lebar: `Math.max(1, Math.ceil(tsLen / Math.max(2, Math.floor(containerWidth / 90))))`.
6. Uji pada tiga lebar memakai devtools responsive: **1280×720**, **1366×768**, **1920×1080**, dan zoom browser **125%** + **150%**, mode 1/2/3/4 chart per baris, light & dark. Tidak boleh ada teks legend yang menimpa tanggal.
7. Jika komponen chart lain memakai pola legend yang sama (cek `grep -rn "itemsPerLegendRow\|legendRows" frontend/src`), terapkan perbaikan yang sama di sana. Bila logika bisa dipakai bersama, buat satu helper kecil `frontend/src/lib/legendLayout.js` (fungsi `legendRowsFor(names, width)`), jangan copy-paste.

**Kriteria lulus T3:** di semua kombinasi di atas, jarak legend ke label tanggal ≥ 6px; screenshot sebelum/sesudah di 1366×768 zoom 125%.

### T4 — Legend chart = CI saja (4G dan 5G)

Keputusan user: **legend chart hanya menampilkan CI** untuk 4G dan 5G (tanpa prefix band, tanpa kode carrier).

Backend:
1. 4G hourly (`queries.py`) dan 4G daily (`queries_daily.py`): kunci carrier (`carrier`) menjadi **string CI** (contoh `"11"`, `"17"`, `"171"`), diambil dari `CellListRCI.ci` atau `cellId` measurement (T1). Karena CI unik per eNodeB, **safety net tabrakan `_ci` tidak lagi diperlukan** — hapus blok "Collision safety net" yang kini tidak berguna (perubahan ini yang membuatnya mati, jadi boleh dihapus). Bila CI benar-benar tidak ada, pakai label lama `get_clean_carrier_label(...)` sebagai cadangan.
2. 5G (`queries_5g.py`, `parse_5g_cell` dan pemakainya ±baris 518/567): carrier = string `cellId` 5G bila ada; cadangan label lama.
3. `carrier_bands` tetap dikirim (CI → band) supaya warna per band, filter band, tooltip, dan export tetap bekerja.
4. Tambahkan juga `"carrier_names": {ci: cell_name}` di tiap KPI/sektor → dipakai tooltip & export (nama cell lengkap tetap tersedia).

Frontend (`SectorPayloadChart.jsx`):
5. `getSeriesDisplayName(cName)`: bila `carrierBands[cName]` adalah band (bukan `'ENTITY'`) → kembalikan **`cName` apa adanya** (CI). Jangan tambahkan prefix band.
6. Urutan legend: sort numerik CI (`Number(a) - Number(b)`), bukan alfabet (agar `17` setelah `16`, bukan setelah `1`).
7. Tooltip: tampilkan `CI 17 · L700` (CI + band) agar pengguna tetap tahu band-nya. Bila ada `carrier_names`, tampilkan nama cell kecil di bawahnya (font 9px, warna muted). Jaga layout tooltip 2 kolom yang sudah ada (commit 4a88905) — jangan ubah perilaku anti-flicker.
8. Warna tetap per band (palet Tableau 10 dari commit 419f523/c217533) — **jangan** diubah.
9. Cluster Monitoring / scope agregasi yang memakai `'ENTITY'` tidak terpengaruh.
10. Cek fungsi lain yang memparsing label carrier lama (`grep -rn "getBandForCarrier\|carrier_bands" frontend/src`), misal `TimingAdvanceView.jsx`, `DataTableModal.jsx`, `kpiExport.js`; pastikan masih benar dengan kunci CI.

**Kriteria lulus T4:** SDR027 Sector 1 legend: `11 12 13 14 15 16 17 Total Payload`; 5G site contoh (`UPD012`) legend berisi cellId; filter band masih menyaring carrier yang benar.

### T5 — Export Excel: chart ikut ter-export sesuai filter aktif + tabel Cluster Monitoring rapi

#### T5a. Kontrak payload export (frontend → `/api/export/xlsx`)
Perluas payload yang sudah ada tanpa mematahkan halaman lain (field baru opsional):

```jsonc
{
  "filename": "4g-hourly_SDR027_2026-11-03_2026-11-09",
  "sheets": [
    {
      "name": "KPI",
      "columns": [...], "rows": [[...]],          // tetap seperti sekarang (data long)
      "style": "table",                             // opsional: "table" (default) | "cluster"
      "number_formats": {"Value": "0.00"},          // opsional, per nama kolom
      "remark_column": "Remark"                     // opsional: kolom diberi warna Improve/Maintain/Degrade
    },
    {
      "name": "Charts",
      "charts": [                                   // opsional: sheet berisi chart native Excel
        {
          "title": "Sector 1 · Payload (GB)",
          "unit": "GB",
          "categories": ["2026-11-03 00:00", "..."],
          "series": [ {"name": "11", "band": "L1800", "color": "#4e79a7", "values": [..]}, ... ],
          "total": {"name": "Total Payload", "values": [..]} // opsional, sumbu kanan
        }
      ]
    }
  ]
}
```

#### T5b. Frontend KPI Monitoring (`frontend/src/views/kpi/kpiExport.js`)
1. Terapkan **filter aktif** yang sama dengan layar: sektor terpilih (sudah), **band terpilih (`km.selectedBands`)**, Filter Type (macro/indoor), KPI terpilih, rentang tanggal. Gunakan fungsi/aturan band yang sama dengan `SectorPayloadChart` (L2600_x → L2600). Ekstrak filter carrier ke helper yang dipakai keduanya agar hasil export == chart di layar.
2. Total Payload di export dihitung ulang dari carrier yang lolos filter (sama seperti `dynamicTotal` di chart).
3. Buat sheet `Charts` berisi satu entri chart per (sektor × KPI) yang tampil di layar, warna series = warna di layar (ambil dari helper style carrier yang sama).
4. Kolom data sheet `KPI`: `Time, Site, Sector, CI, Cell Name, Band, KPI, Unit, Value`.
5. Tambahkan sheet `Filters` (2 kolom `Filter`, `Value`): Menu, Site, Sectors, Bands, Type, KPIs, Start, End, Exported at.

#### T5c. Backend `backend/app/export_xlsx.py` (openpyxl 3.1.5 sudah terpasang — jangan install paket baru)
1. Untuk sheet dengan `charts`: tulis data tiap chart ke blok tabel tersembunyi/di kanan (kolom kategori + satu kolom per series), lalu buat `openpyxl.chart.LineChart`:
   - judul = `title`, `y_axis.title = unit`, `x_axis.number_format`/kategori = timestamp teks.
   - warna garis `series.graphicalProperties.line.solidFill = color.lstrip('#')`, lebar 1.5pt, `smooth = False`, marker none.
   - Total (bila ada): `LineChart` kedua di **sumbu kanan** (`y_axis.axId = 200`, `crosses = "max"`) digabung `chart1 + chart2`, warna `#f43f5e`.
   - legend di bawah (`chart.legend.position = 'b'`), ukuran chart `width = 24`, `height = 9` (cm).
   - Tata letak: 2 chart per baris, jarak 20 baris antar baris chart (anchor `A1`, `P1`, `A21`, `P21`, ...), data mentah diletakkan mulai kolom `AF` dan disembunyikan (`column_dimensions[..].hidden = True`) **atau** di sheet `Chart Data` terpisah — pilih sheet terpisah `Chart Data` (lebih jelas untuk user).
2. Untuk sheet tabel: header tebal, fill biru tua `1F3864` + font putih (pakai `_HEADER_FILL`/`_HEADER_FONT` yang ada), border tipis abu, zebra row ringan (`F2F6FC`), `number_formats` per kolom, freeze pane, autofilter (sudah ada).
3. `remark_column`: isi sel diberi fill sesuai `REMARK_COLOR` frontend: Improve/Improved `16A34A`, Maintain/Maintained `F97316`, Degrade/Degraded `DC2626`, font putih tebal, rata tengah.
4. `style: "cluster"`: lihat T5d.
5. Validasi: batasi total titik data chart (mis. maks 60 chart dan 50.000 baris data) — bila lewat, abaikan `charts` dan tambahkan sheet `Note` berisi alasannya. Jangan crash.

#### T5d. Cluster Monitoring (`frontend/src/views/ClusterMonitoringView.jsx` ±baris 237–274)
Tampilan Excel meniru tabel di layar (`ClusterTable.jsx`):
1. Sheet `Summary <TECH>` dengan `style: "cluster"`:
   - Baris 1: judul gabung (merge) `Cluster <nama> – <TECH>` tebal 14pt.
   - Baris 2: `Before: <start>..<end>   After: <start>..<end>   Members: <n>   Exported: <timestamp>`.
   - Baris 4: header 2 tingkat bila memungkinkan (`KPI | Unit | Polarity | Before | After | Delta | Growth (%) | Remark`).
   - `Growth (%)` format `0.00"%"`; angka `#,##0.00`; Delta negatif merah, positif hijau (sesuai polaritas: untuk polarity `down`, kebalikannya); kolom Remark berwarna (T5c-3).
   - Lebar kolom otomatis, freeze di bawah header.
2. Sheet `Per Site <TECH>`: grup per KPI — baris judul KPI (fill abu muda, tebal, merge seluruh kolom), lalu baris site urut sama seperti layar (Degrade dulu, lalu growth terburuk — pakai `sortSiteRows` dari `ClusterTable.jsx`, ekspor fungsi itu bila perlu). Remark berwarna.
3. Sheet `Charts` (bila mode chart Cluster ada datanya): chart per KPI dari periode Start–End aktif, termasuk garis Marker sebagai seri terpisah (opsional; bila rumit, lewati marker dan tulis tanggal marker di judul chart).
4. Sheet `Members` tetap.
5. Payload ini dibangun di frontend → backend hanya merender sesuai `style`. Jangan memindahkan perhitungan Before/After/Growth ke backend export.

**Kriteria lulus T5:**
- Export dari SDR027 (Sector 1, band filter hanya L1800+L700, KPI Payload & DL PRB) → sheet `KPI` hanya ci 11 dan 17, sheet `Charts` berisi 2 chart dengan 2 garis + Total, warna sama dengan layar, file dibuka di Excel tanpa pesan "repair".
- Export Cluster Monitoring → Summary dengan judul, periode, remark berwarna, angka terformat; Per Site dikelompokkan per KPI.
- Halaman lain (Worst Cell, ZTZP, CEI, Overview) yang mengirim payload lama tetap ter-export seperti sebelumnya.

### T6 — Search / filter Site ID di Worst Cell

Backend (`backend/app/queries_worstcell.py`, `get_worst_cells` ±baris 160):
1. Tambah parameter opsional `sites: Optional[List[str]] = None` (upper-case, trim, maks 50 site). Bila diisi: filter `WHERE <site expr> = ANY(%s)` **di dalam CTE sebelum `ORDER BY ... LIMIT top_n`** sehingga ranking Top-N dilakukan di antara cell site tersebut saja. Pakai parameter terikat (`%s`), **jangan** f-string nilai user ke SQL.
2. Bila `sites` diisi, scope wilayah (NOP/Kab/Kec) diabaikan (site sudah spesifik) — tulis ini di respons: `"scope": "site"`.
3. Endpoint di `main.py`: terima `sites` sebagai query param list (`sites=SDR027&sites=EPS001`), teruskan ke fungsi.

Frontend (`WorstCellView.jsx` + `cells/CellScopeFilters.jsx`):
4. Tambahkan field **"SITE ID"** di bar filter (setelah filter scope, sebelum DATE): pakai komponen yang sudah ada `components/filters/SiteSearchSelect.jsx` (autocomplete, multi) bila mendukung multi; kalau tidak, input teks + tombol.
5. Tombol **Search** (ikon `Search` dari `lucide-react`) di sebelahnya + **Enter** untuk menjalankan, tombol **Clear** (ikon `X`) untuk kembali ke Top-N scope wilayah. Saat site aktif, tampilkan chip `Site: SDR027 ×` di header hasil (sebelah `scopeLabel`).
6. Tambahkan juga **quick filter client-side** kecil (input "Filter table…") di atas tabel hasil untuk menyaring baris yang sudah tampil berdasarkan Cell/Site (tanpa request baru).
7. Export Worst Cell tetap mengikuti hasil di layar (sudah), tambahkan baris `Sites` di sheet `Filters` bila dipakai.
8. Sama untuk 2G/4G/5G (parameter `tech` sudah ada) — pastikan fungsi `_site_sql` dipakai konsisten per teknologi.

**Kriteria lulus T6:** cari `SDR027` (4G, 1 tanggal) → hanya cell SDR027, urut terburuk, kolom Days Failing benar; Clear → kembali ke Top-N regional; quick filter menyaring tanpa reload; respons < 30 dtk.

---

## 3. PANDUAN TAMPILAN (UI/UX) — wajib konsisten

- Gunakan komponen filter yang sudah ada (`FilterLabel`, `SimpleSelect`, `SiteSearchSelect`, `MultiSelectDropdown`, `SegmentedToggle`) dan kelas Tailwind yang sudah dipakai; jangan membuat gaya baru yang berbeda.
- Label filter huruf kapital kecil (`SITE ID`, `DATE`) seperti yang ada. Tombol utama warna biru yang sama dengan tombol Generate.
- Semua elemen baru harus berfungsi di **light & dark mode** (cek `darkMode` prop) dan di lebar 1280px tanpa scroll horizontal halaman.
- State loading: pakai `DataLoadingOverlay`/spinner yang ada; tombol Search disabled saat loading.
- Pesan kosong: `No worst cells found for SDR027 on 2026-11-09.`
- Tooltip & legend: font Inter, ukuran sama dengan chart lain (legend 10px, tooltip 11px).
- Jangan menambah dependensi npm/pip baru.

---

## 4. CHECKLIST VERIFIKASI AKHIR (laporkan hasil tiap poin)

1. `npm run build` sukses; `python -m py_compile backend/app/*.py` sukses.
2. SDR027 hourly & daily: 3 sektor, L700 di masing-masing sektor, legend CI. (screenshot)
3. EPS001 & EPS002: hanya sektor EPS, otomatis terpilih, tanpa cell induk. (screenshot)
4. Legend tidak overlap di 1366×768 zoom 125% & 150%, 1–4 chart/baris. (screenshot sebelum/sesudah)
5. 5G UPD012: legend cellId, filter band jalan.
6. Export KPI (dengan filter band) → buka di Excel: data & chart sesuai layar.
7. Export Cluster Monitoring → tabel rapi + remark berwarna.
8. Worst Cell: search SDR027, Clear, quick filter.
9. Halaman lain (Overview, CEI, ZTZP, TA, Packet Loss) tetap normal.
10. Ringkasan akhir: daftar file yang diubah per task, hal yang tidak bisa diverifikasi, dan pertanyaan terbuka (minimal: cell ci 61 SDR027 sector 3 vs 6).

Jangan merge ke `main` dan jangan push sebelum user mengecek.
