# Handoff: OKR > CEI (Customer Experience Index) — status 2026-11-10

Dashboard CEI mingguan Region Sulawesi di netPulse. Dashboard ini meniru slide 1–4 report
`D:\INFRA\SULAWESI\CEI\CEI 2025\Weekly Report CEI 202643.pptx`; slide 5 (Availability Impact) tidak termasuk.
**Belum di-commit** dan masih di branch `main` (user belum minta commit).

## File

| File | Isi |
|---|---|
| `backend/app/queries_cei.py` (baru) | Semua query CEI: trend, NOP, profiling, kabupaten & demarcation, cohort, status, throughput, daily KQI, contributors, filter area |
| `backend/app/cei_store.py` (baru) | Target & remark/event di onedb: `netpulse_cei_target(start_week, target_pct)`, `netpulse_cei_event(id, event_date, kind 'weekly'/'daily', label)`; sudah dibuat & di-seed |
| `backend/app/main.py` | Endpoint `/api/cei/weeks, hierarchy, weekly, throughput, contributors, daily, settings`, POST/DELETE `/api/cei/targets` & `/api/cei/events`; semua GET menerima `scope` + `values`; cache dibersihkan setelah tulis target/event |
| `frontend/src/views/CeiView.jsx` (baru) | Halaman: tab Overview / Bad Cells / Contributors / Daily KQI, pilihan week, filter Area, 4 tile, Export Excel |
| `frontend/src/views/cei/` (baru) | `charts.js` (opsi ECharts), `CeiTables.jsx`, `CeiSettings.jsx` (modal Targets & Events), `CeiScopeFilter.jsx` + `scope.js` (filter All/NOP/Kabupaten/Kecamatan) |
| `App.jsx`, `AppSidebar.jsx`, `constants/menus.js`, `AppHeader.jsx`, `lib/echarts.jsx` | Group sidebar **OKR** → menu **CEI**, meta menu, sembunyikan pill charts-per-row, daftar PieChart |
| `.claude/launch.json` | Hanya untuk preview lokal (port 8013), **jangan di-commit** |

Di luar repo (`D:\AI ENGINEER\Akses\Schedjuler\cei_kqi`):
- `ceikqi_daily_site.sql`: DDL twodb `ceiKQI_daily_site` (datedd × site_id; per KQI: n, sum, fail).
- `sync_ceikqi.py`: task `Sync_CEI_KQI_twodb` sekaligus me-refresh ringkasan harian untuk tanggal yang baru dimuat.
- `backfill_daily_site.py`: isi ulang per 7 hari, resume otomatis, `--all` untuk bangun ulang. Ringkasan sudah terisi 2026-03-01 s.d. 2026-11-02.

## Sumber data
- onedb `measCEIweekly`: 1 baris per cell per week (Jumat–Kamis, W01 2026 mulai 2026-01-02).
- onedb `LookupSITEID`: NOP. Lalu `measBdbh4g` (throughput), `measDy4g`/`measBdbh4g` via `get_scope_aggregation_data` (KPI per kabupaten), `measTwamp4g` (packet loss).
- twodb `ceiKQI_daily_site`: ringkasan dari `ceiKQI_v2`. Lewat tunnel 127.0.0.1:5434 yang sering putus, jadi jangan jalankan query panjang ke `ceiKQI_v2`.

## Definisi (sudah dicocokkan dengan report W43)
- **Bad cell:** `remark_cell='Bad_cell'`. W43 = Good 88,87%, Bad 9.750.
- **KQI fail mingguan:** bad cell dengan `latest_week_only_*_hit_count > 0`.
- **Most KQI:** argmax dari 6 KQI (Game Jitter tidak ikut). Urutan tie: grtt, wulr, vsd, vdl, vul, wrtt.
- **Demarcation** dari `category_l2` (lihat `DEMARCATION`). Interference masuk Others.
- **Fail harian:** cell di atas threshold BH: VSD 4, WebRTT 526,6, WULR 10,46, GRTT 111,49, GJ 85,26. VoIP DL/UL fail jika di bawah 178,98 / 179,67.
- **Pie status:** aturan revisi Claude (lihat `STATUS_RULES`), disetujui user.

## Contributors (dinamis per week)
- **Kabupaten:** top-5 kenaikan bad cell WoW.
- **KQI:** 3 KQI dengan kenaikan fail cell-days harian terbesar dibanding minggu sebelumnya.
- **KPI:** dari demarcation dominan (`DEMARC_KPIS`, misalnya Packet Loss → TWAMP loss, Capacity → DL PRB + Max RRC), diisi sampai 3 dengan User DL Thp / Availability / Max RRC.
- Alasan pemilihan tampil di pojok kanan atas tiap chart.
- Load pertama sekitar 10–35 detik (lalu di-cache 10 menit), jadi tab Contributors dan throughput di-load saat tab dibuka.

## Yang sudah diperbaiki dari report
"12.12% vs 11.12%", judul "W41 vs W43", header "W43 | W43", dan garis avg Web RTT (server-side) yang tidak sejalan dengan fail count (client-side).

## Belum selesai / catatan
1. Tabel lama twodb `ceiKQI_daily_kab` tidak dipakai lagi. Menunggu persetujuan user untuk dihapus.
2. Tidak bisa direproduksi dari report: angka pie consecutive (42341), nilai KQI per kabupaten dari file "Cakaran", bin throughput BDBH, dan gap −1440 vs −1432 (total cell berbeda).
3. Commit belum dilakukan. Kecualikan `.claude/` saat commit.
4. Belum dicek ulang di browser setelah backfill selesai: tab Contributors & Daily KQI untuk W39–W43.
