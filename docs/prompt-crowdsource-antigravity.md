# PROMPT ANTIGRAVITY — Halaman OKR > Crowdsource (OpenSignal + Ookla) di netPulse

> **Cara pakai:** salin seluruh dokumen ini ke Antigravity sebagai satu prompt.
> Semua fakta data di dokumen ini **sudah diverifikasi langsung ke onedb** (user `userdb`, read-only) pada 2026-11-14.
> Referensi bisnis: `R09_Crowdsource_W44_2026.pptx` (laporan mingguan Crowdsource Region Sulawesi).

---

## BAGIAN 0 — Peran, tujuan, dan aturan kerja

### 0.1 Peran kamu
Kamu adalah engineer full-stack yang menambahkan **satu halaman baru** ke aplikasi netPulse
(repo `D:\AI ENGINEER\Web Hourly Monitoring`). Backend FastAPI + psycopg2 (`backend/app/`), frontend React 19 + Vite + Tailwind 4 + ECharts (`frontend/src/`).

### 0.2 Tujuan
Membuat halaman **Crowdsource** di group sidebar **OKR** (di bawah menu CEI yang sudah ada) yang memvisualisasikan
achievement Telkomsel di OpenSignal (tabel `measONX`) dan Ookla (tabel `measOoklaRegion`, `measOoklaCity`):

1. **Filter** (week, source, tech, region, level, kabupaten, competitor, panjang trend). **Default region = SULAWESI.**
2. **Tile ringkasan** WIN vs target per source.
3. **Trend WIN/LOSE per minggu** dengan garis target.
4. **Tabel Achievement & Target week-to-week**, termasuk nilai yang dibutuhkan untuk pass (WIN/DRAW).
5. **Path to Target**: KPI LOSE yang paling dekat untuk menang / KPI WIN yang rawan.
6. **Tabel Contributor degradasi minggu terakhir** (KPI region + kabupaten penyumbang).
7. **Peta distribusi WIN/LOSE per kabupaten** (filter WIN/DRAW/LOSE dan KPI), koordinat dari tabel **`raw_desiqa`**.
8. **Trend per KPI** (garis per operator, band confidence interval untuk OpenSignal).

Tampilan **tidak harus sama** dengan PPT. Yang wajib: semua data di 3 tabel bisa dilihat.

### 0.3 Aturan kerja (WAJIB)
- **Jangan commit / push** apa pun. User yang memutuskan.
- **Jangan ubah** perilaku halaman lain. Perubahan pada file yang sudah ada hanya yang disebut di dokumen ini.
- **Jangan menulis ke tabel `measONX`, `measOoklaRegion`, `measOoklaCity`, `raw_desiqa`.** Hanya SELECT. Satu-satunya tulis = tabel baru `netpulse_crowd_target` dan `netpulse_crowd_manual` (§3.2).
- Jangan menaruh password/kredensial di kode. Koneksi selalu via `get_onedb_connection()` / `get_onedb_rw_connection()` dari `backend/app/db.py` (membaca `backend/.env`).
- Label UI pakai **bahasa Inggris** (konsisten dengan halaman CEI). Komentar kode singkat, bahasa Inggris.
- Ikuti pola halaman **CEI** (contoh terdekat): `backend/app/queries_cei.py`, `backend/app/cei_store.py`, bagian `# OKR > CEI` di `backend/app/main.py`, `frontend/src/views/CeiView.jsx`, `frontend/src/views/cei/*`.
- Jika hasil query berbeda dari angka validasi di §6, **laporkan** perbedaannya + hipotesis. Jangan mengubah rumus hanya supaya angkanya sama.
- Kerjakan berurutan sesuai **§7 Urutan implementasi**, dan jalankan verifikasi di setiap langkah.

---

## BAGIAN 1 — Fakta data (sudah diverifikasi)

### 1.1 `measONX` — OpenSignal (~3,0 juta baris, owner `userdb`)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `lvl` | varchar | `'Nation'`, `'Area'`, `'Region'`, `'Kabupaten'` (huruf besar di awal, persis seperti ini) |
| `location` | varchar | Nation: `'NATIONWIDE'`; Area: `'AREA 1'..'AREA 4'`; Region: 14 nilai, termasuk **`'SULAWESI'`**; Kabupaten: nama kabupaten huruf besar (514 nasional) |
| `provider` | varchar | `'Telkomsel'`, `'Indosat'`, `'XL'`, `'3'`, `'Smartfren'`, dan `'NULL'` (string, 12 baris — abaikan) |
| `yearweek` | int | YYYYWW, rentang 202501–202644 |
| `metric` | varchar | 17 nilai, lihat §2 |
| `rank` | smallint | 1 = terbaik. **Sejak 2026 hanya terisi untuk Telkomsel, Indosat, XL.** `3` dan `Smartfren` selalu `NULL` (sudah merger) |
| `final_value` | double | nilai skor |
| `lci`, `uci` | double | lower / upper confidence interval |
| `week_date` | date | Senin awal minggu (W44 2026 = `2026-11-02`) |
| `snapshot_date`, `created_at` | | info saja |

- Unique key: `(yearweek, lvl, location, provider, metric)`.
- Index: `(yearweek, lvl, location)`, `(metric, provider)`, `(week_date)`, `(location)`.
- `lvl='Kabupaten'` **tidak punya kolom region**. Untuk memfilter kabupaten Sulawesi, pakai daftar kabupaten dari `measOoklaCity WHERE region='SULAWESI'` lalu terapkan normalisasi nama (§1.5).
- Di Region SULAWESI W44 ada **16 metric** (semua kecuali `timeon_5g`). Di kabupaten Sulawesi ada 83 dari 91 kabupaten dengan nama persis sama; 8 sisanya beda ejaan (§1.5).

### 1.2 `measOoklaRegion` (~17 ribu baris) dan `measOoklaCity` (~388 ribu baris) — Ookla

| Kolom | Keterangan |
|---|---|
| `yearweek` | YYYYWW, 202501–202644 |
| `area` | `'AREA 0'..'AREA 4'` atau NULL. SULAWESI ada di `'AREA 4'` |
| `level` | Region table: `'nation'`, `'area'`, `'region'`. City table: `'kabupaten'` (abaikan level lain di City table, isinya kosong) |
| `region` | `'SULAWESI'` dll. (14 region sama seperti ONX) |
| `kabupaten` | hanya di `measOoklaCity`; SULAWESI = **91 kabupaten** + 1 baris `NULL` (abaikan) |
| `tech` | `'ALL'` (= Overall), `'4G'`, `'5G'` |
| `operator` | di SULAWESI: s/d **202625** `IOH`, `Smartfren`, `Telkomsel`, `XL`; sejak **202626** `IOH`, `Telkomsel`, `XLSMART`. Region lain juga punya `'3'`, `'IM3 Ooredoo'` |
| `connectivity_score` / `rank_connectivity` | skor + rank (rank bertipe **double**, bandingkan `== 1`) |
| `speed_score` / `rank_speed` | |
| `video_score` / `rank_video` | |
| `game_score` / `rank_game` | |
| `web_score` / `rank_web` | |
| `page_load_time_percent` | % (info) |
| `avg_val_web_page_load_time` | ms, lower is better (info) |

- Unique key Region: `(yearweek, level, area, region, tech, operator)`; City: `+ kabupaten`.
- Index ada di `(yearweek, level)`, `yearweek`, `region`, `kabupaten`, `area`, `(tech, operator)`.
- **Kabupaten Sulawesi termasuk Maluku Utara** (Halmahera*, Kota Ternate, Kota Tidore Kepulauan, Pulau Morotai, Pulau Taliabu, Kepulauan Sula). Ini benar (wilayah Region Sulawesi Telkomsel).
- Histori Ookla di-snapshot ulang (`created_at` 2026-11-07), jadi nilai minggu lama bisa sedikit beda dengan PPT lama.

### 1.3 `raw_desiqa` — koordinat site untuk peta (134.099 baris)

| Kolom | Keterangan |
|---|---|
| `weeknum` | smallint; saat ini hanya `43` (snapshot). Selalu pakai `MAX(weeknum)` |
| `site_id` | 8.124 site unik |
| `site_lat`, `site_long` | double, **semua terisi dan valid** (tidak ada NULL/0) |
| `kota_kabupaten` | 91 kabupaten Sulawesi + Maluku Utara |
| `propinsi` | GORONTALO, MALUKU UTARA, SULAWESI BARAT, SULAWESI SELATAN, SULAWESI TENGAH, SULAWESI TENGGARA, SULAWESI UTARA |
| `nop`, `kecamatan`, `network`, `band`, ... | info (tidak wajib) |

- Index ada di `kota_kabupaten`, `site_id`.
- Satu site punya banyak baris (per cell/teknologi) → **dedup per `site_id` dulu**, baru rata-rata per kabupaten.
- Query centroid (cache 24 jam di memori):
  ```sql
  WITH s AS (
    SELECT DISTINCT ON (site_id) site_id, UPPER(TRIM(kota_kabupaten)) AS kab, site_lat, site_long
    FROM raw_desiqa
    WHERE weeknum = (SELECT MAX(weeknum) FROM raw_desiqa)
      AND site_lat BETWEEN -12 AND 6 AND site_long BETWEEN 95 AND 142
    ORDER BY site_id
  )
  SELECT kab, AVG(site_lat) AS lat, AVG(site_long) AS lon, COUNT(*) AS n_sites
  FROM s GROUP BY kab;
  ```
- Contoh hasil (untuk cek): KOTA MAKASSAR 742 site (−5.1434, 119.4513); GOWA 206 (−5.2566, 119.5549); KOTA MANADO 271 (1.4871, 124.8493); KOTA TERNATE 115 (0.7855, 127.3673); BANGGAI LAUT 26 (−1.6419, 123.5509).
- **Jangan pakai `CellList4G`** untuk koordinat: kolom `Latitude/Longitude` kosong semua.
- Peta hanya tersedia untuk Region SULAWESI (desiqa hanya berisi Sulawesi). Region lain → tampilkan pesan "Map available for SULAWESI only".

### 1.4 Hak akses DB
- Aplikasi memakai `ONEDB_USER=userdb` (baca) dan `ONEDB_RW_USER=userdb` (tulis) di `backend/.env` → aman.
- User `read1` **tidak** punya SELECT ke `measONX`/`measOokla*`. Tidak perlu diubah.

### 1.5 Normalisasi nama kabupaten (WAJIB untuk join ONX ↔ Ookla ↔ desiqa)
Kunci kanonik = nama di `measOoklaCity`. Ejaan di sumber lain berbeda untuk 8 kabupaten:

| measOoklaCity (kanonik) | measONX | raw_desiqa |
|---|---|---|
| KOTA PARE PARE | KOTA PAREPARE | KOTA PARE-PARE |
| KOTA BAU BAU | KOTA BAUBAU | KOTA BAUBAU |
| TOLI TOLI | TOLI-TOLI | TOLI-TOLI |
| TOJO UNA UNA | TOJO UNA-UNA | TOJO UNA-UNA |
| PANGKAJENE KEPULAUAN | PANGKAJENE DAN KEPULAUAN | PANGKAJENE DAN KEPULAUAN |
| PASANGKAYU | MAMUJU UTARA | MAMUJU UTARA |
| PAHUWATO | POHUWATO | POHUWATO |
| KEPULAUAN SIAU TAGULANDANG BIARO | SIAU TAGULANDANG BIARO | SIAU TAGULANDANG BIARO |

Implementasi (letakkan di `queries_crowdsource.py`):
```python
import re

# Different spellings of the same kabupaten across ONX / Ookla / desiqa (after kab_key()).
_KAB_ALIAS = {
    "PANGKAJENEDANKEPULAUAN": "PANGKAJENEKEPULAUAN",
    "MAMUJUUTARA": "PASANGKAYU",
    "POHUWATO": "PAHUWATO",
    "SIAUTAGULANDANGBIARO": "KEPULAUANSIAUTAGULANDANGBIARO",
}

def kab_key(name: str) -> str:
    """Join key for kabupaten names: upper case, letters only, then alias."""
    k = re.sub(r"[^A-Z]", "", (name or "").upper())
    return _KAB_ALIAS.get(k, k)
```
Dengan ini KOTA PAREPARE / KOTA PARE PARE / KOTA PARE-PARE → `KOTAPAREPARE`. Hasil yang diharapkan: **91 dari 91** kabupaten Sulawesi cocok di ketiga sumber. Tampilkan nama kanonik (versi Ookla) di UI.

---

## BAGIAN 2 — Katalog KPI

Buat konstanta `KPI_CATALOG` (list of dict) di `queries_crowdsource.py`. Ini satu-satunya sumber label, unit, dan mapping ke DB.
Semua KPI higher-is-better (arah sudah tercermin di kolom `rank`). `in_target=True` = termasuk 26 KPI di PPT (16 ONX + 10 Ookla) dan dihitung di tile/target.

```python
KPI_CATALOG = [
    # ---------------- OpenSignal (measONX.metric) ----------------
    {"key": "onx_video_all",  "source": "ONX", "tech": "overall", "label": "Video Experience",        "db": "videoexperience_overall",   "unit": "pts",  "in_target": True},
    {"key": "onx_games_all",  "source": "ONX", "tech": "overall", "label": "Games Experience",        "db": "gamesexperience_overall",   "unit": "pts",  "in_target": True},
    {"key": "onx_voice_all",  "source": "ONX", "tech": "overall", "label": "Voice App Experience",    "db": "voiceexperience_overall",   "unit": "pts",  "in_target": True},
    {"key": "onx_dl_all",     "source": "ONX", "tech": "overall", "label": "Download Speed",          "db": "download_overall",          "unit": "Mbps", "in_target": True},
    {"key": "onx_ul_all",     "source": "ONX", "tech": "overall", "label": "Upload Speed",            "db": "upload_overall",            "unit": "Mbps", "in_target": True},
    {"key": "onx_cov_all",    "source": "ONX", "tech": "overall", "label": "Coverage Experience",     "db": "onxcoveragesim_overall",    "unit": "pts",  "in_target": True},
    {"key": "onx_timeon_all", "source": "ONX", "tech": "overall", "label": "Time On",                 "db": "timeon_overall",            "unit": "%",    "in_target": True},
    {"key": "onx_cq_all",     "source": "ONX", "tech": "overall", "label": "Consistent Quality",      "db": "consistentquality_overall", "unit": "%",    "in_target": True},
    {"key": "onx_rel_all",    "source": "ONX", "tech": "overall", "label": "Reliability Experience",  "db": "reliability_overall",       "unit": "pts",  "in_target": True},
    {"key": "onx_video_5g",   "source": "ONX", "tech": "5g", "label": "5G Video Experience",          "db": "videoexperience_5g",        "unit": "pts",  "in_target": True},
    {"key": "onx_games_5g",   "source": "ONX", "tech": "5g", "label": "5G Games Experience",          "db": "gamesexperience_5g",        "unit": "pts",  "in_target": True},
    {"key": "onx_voice_5g",   "source": "ONX", "tech": "5g", "label": "5G Voice App Experience",      "db": "voiceexperience_5g",        "unit": "pts",  "in_target": True},
    {"key": "onx_dl_5g",      "source": "ONX", "tech": "5g", "label": "5G Download Speed",            "db": "download_5g",               "unit": "Mbps", "in_target": True},
    {"key": "onx_ul_5g",      "source": "ONX", "tech": "5g", "label": "5G Upload Speed",              "db": "upload_5g",                 "unit": "Mbps", "in_target": True},
    {"key": "onx_avail_5g",   "source": "ONX", "tech": "5g", "label": "5G Availability",              "db": "availability_5g",           "unit": "%",    "in_target": True},
    {"key": "onx_cov_5g",     "source": "ONX", "tech": "5g", "label": "5G Coverage Experience",       "db": "onxcoveragesim_5g",         "unit": "pts",  "in_target": True},
    {"key": "onx_timeon_5g",  "source": "ONX", "tech": "5g", "label": "5G Time On",                   "db": "timeon_5g",                 "unit": "%",    "in_target": False},
    # ---------------- Ookla (measOokla*.<col>_score + rank_<col>) ----------------
    # tech: "ALL" = Overall. 'db' = column prefix: connectivity / speed / video / game / web
    {"key": "ook_conn_all",  "source": "OOKLA", "tech": "ALL", "label": "Best Mobile Network",        "db": "connectivity", "unit": "pts", "in_target": True},
    {"key": "ook_speed_all", "source": "OOKLA", "tech": "ALL", "label": "Fastest Mobile Network",     "db": "speed",        "unit": "pts", "in_target": True},
    {"key": "ook_video_all", "source": "OOKLA", "tech": "ALL", "label": "Video Experience",           "db": "video",        "unit": "pts", "in_target": True},
    {"key": "ook_game_all",  "source": "OOKLA", "tech": "ALL", "label": "Gaming Experience",          "db": "game",         "unit": "pts", "in_target": True},
    {"key": "ook_coverage_all", "source": "OOKLA", "tech": "ALL", "label": "Coverage",                "db": None, "manual": True, "unit": "pts",    "in_target": True},
    {"key": "ook_toprated_all", "source": "OOKLA", "tech": "ALL", "label": "Top Rated Mobile Network","db": None, "manual": True, "unit": "rating", "in_target": True},
    {"key": "ook_conn_5g",   "source": "OOKLA", "tech": "5G", "label": "Best 5G Mobile Network",      "db": "connectivity", "unit": "pts", "in_target": True},
    {"key": "ook_speed_5g",  "source": "OOKLA", "tech": "5G", "label": "Fastest 5G Mobile Network",   "db": "speed",        "unit": "pts", "in_target": True},
    {"key": "ook_video_5g",  "source": "OOKLA", "tech": "5G", "label": "Best 5G Video Experience",    "db": "video",        "unit": "pts", "in_target": True},
    {"key": "ook_game_5g",   "source": "OOKLA", "tech": "5G", "label": "Best 5G Gaming Experience",   "db": "game",         "unit": "pts", "in_target": True},
    # Extra Ookla KPIs (shown under "Other KPI", not counted in target)
    {"key": "ook_web_all",   "source": "OOKLA", "tech": "ALL", "label": "Web Browsing",               "db": "web", "unit": "pts", "in_target": False},
    {"key": "ook_web_5g",    "source": "OOKLA", "tech": "5G",  "label": "5G Web Browsing",            "db": "web", "unit": "pts", "in_target": False},
    # + generate 5 entries for tech "4G": ook_conn_4g, ook_speed_4g, ook_video_4g, ook_game_4g, ook_web_4g (in_target False)
]
```
Catatan:
- Untuk filter Tech di UI: ONX `overall` ↔ Ookla `ALL` = **Overall**; `5g` ↔ `5G` = **5G**; Ookla `4G` = **4G** (ONX tidak punya 4G).
- Coverage & Top Rated Ookla **tidak ada di DB** → input manual (§3.2). PPT menghitung keduanya sebagai WIN.
- Bila ada metric ONX yang tidak ada di katalog muncul di DB, tetap tampilkan di grup "Other KPI" dengan label = nama metric mentah.

---

## BAGIAN 3 — Aturan bisnis & rumus

### 3.1 Status per KPI (per minggu, per lokasi, per tech)
Pakai `rank` dari DB sebagai sumber kebenaran. **Jangan menghitung rank ulang.**

```python
COMPETITORS_ONX = {"Indosat": "IOH", "XL": "XLSMART"}          # providers with a rank
OPERATOR_LABEL = {"Telkomsel": "TSEL", "Indosat": "IOH", "IOH": "IOH",
                  "XL": "XLSMART", "XLSMART": "XLSMART"}         # display labels

def status_of(tsel_rank, other_ranks):
    """WIN / DRAW / LOSE from ranks. other_ranks = ranks of ranked competitors (None ignored)."""
    if tsel_rank is None:
        return None                                  # no data
    if tsel_rank == 1:
        return "DRAW" if any(r == 1 for r in other_ranks if r is not None) else "WIN"
    return "LOSE"
```
- **DRAW dihitung WIN** untuk target (PPT: "draw win").
- Kompetitor (OLO) = provider/operator dengan `rank IS NOT NULL` di minggu & lokasi itu. ONX: Indosat, XL. Ookla: IOH + XL/XLSMART (+ Smartfren sebelum 202626 bila rank terisi).
- ONX: rank kembar terjadi bila CI overlap. Contoh W44 Voice 5G: Tsel 84,49 [84,34–84,63] vs Indosat 84,03 [83,53–84,44] → keduanya rank 1 → DRAW.
- Ookla tidak memberi rank kembar. Contoh W44 5G Video: Tsel 90,51 dan IOH 90,51 tapi IOH rank 1, Tsel rank 2 → LOSE.
- **Filter Competitor = IOH atau XLSMART** (head-to-head): `WIN` bila `tsel_rank < rank_op`, `DRAW` bila sama, `LOSE` bila lebih besar.
- Label operator di UI: `Indosat` → **IOH**, `XL`/`XLSMART` → **XLSMART** (garis trend menyambung sebelum/sesudah 202626).

### 3.2 Nilai yang dibutuhkan untuk pass
Untuk setiap KPI (minggu terakhir yang dipilih):
- **Leader** = kompetitor dengan rank terbaik; bila rank sama, nilai tertinggi.
- **Runner-up** (untuk KPI WIN) = kompetitor terbaik selain Tsel.
- **Gap** = `leader.value − tsel.value` (hanya untuk LOSE/DRAW).
- **Gap %** = `gap / leader.value × 100` → dipakai mengurutkan "paling dekat menang".

```python
def needed_values(source, tsel, leader):
    """Value Telkomsel needs to WIN (and, for ONX, to at least DRAW).
    tsel / leader = dict(value, lci, uci). Returns (needed_win, needed_draw)."""
    if source == "ONX":
        # OpenSignal: a clear win needs Tsel's lower bound above the leader's upper bound.
        # Assume Tsel keeps its current CI width.
        needed_win = leader["uci"] + (tsel["value"] - tsel["lci"])
        # A draw needs the intervals to start overlapping.
        needed_draw = leader["lci"] - (tsel["uci"] - tsel["value"])
        return round(needed_win, 2), round(needed_draw, 2)
    return round(leader["value"] + 0.01, 2), None   # Ookla: just beat the leader's score
```
**Contoh wajib cocok** (W44, ONX Download Speed Overall, SULAWESI):
XL 44,22 [43,45–44,98], Tsel 40,78 [40,41–41,14] → `needed_win = 44,98 + 0,37 = 45,35`, `needed_draw = 43,45 − 0,36 = 43,09`, gap 3,44, gap % 7,78.

- **Margin** (untuk KPI WIN/DRAW) = `tsel.value − runner_up.value`.
- **At risk** = ONX: CI Tsel overlap dengan CI runner-up (`tsel.lci <= runner_up.uci`) atau status DRAW; Ookla: `margin / tsel.value < 1%`.

### 3.3 Target portofolio (keputusan user, FINAL)
**Target current (berlaku mulai 202641):** OpenSignal **8 WIN** + Ookla **4 WIN** = **TOTAL 12 WIN**.

**Status achievement mingguan ditentukan dari TOTAL:**
```python
total_wins = onx_wins + ookla_wins            # DRAW counts as WIN, manual Ookla KPIs included
total_target = onx_target + ookla_target      # current: 8 + 4 = 12
achievement = "ACH" if total_wins >= total_target else "NOT ACH"
```
- Label UI persis: **`ACH`** (hijau) dan **`NOT ACH`** (merah). Jangan pakai PASS/FAIL.
- Per source tetap ditampilkan `wins / target` (mis. ONX `8/8`, Ookla `4/4`) dengan warna hijau bila `wins >= target`, merah bila kurang — ini **informasi**, bukan status resmi. Status resmi hanya dari TOTAL.
- `wins = jumlah KPI in_target berstatus WIN atau DRAW` (DRAW = WIN), termasuk KPI manual Ookla.
- `wins_needed = max(0, total_target − total_wins)`.
- **Path to target** = KPI `in_target` berstatus LOSE (gabungan ONX + Ookla), urut `gap_pct` naik; tandai N teratas (N = `wins_needed`) sebagai "Focus".

**Target lama (histori, hanya untuk garis target di grafik trend, s/d 202640):**
Diambil dari data grafik di PPT. Garis target di grafik **hanya digambar sampai 202640**; mulai 202641 tidak ada garis target di grafik (target current ditampilkan di tile dan tabel achievement).

| Source | Berlaku | Target WIN (lama) |
|---|---|---|
| ONX | 202601 – 202624 | 12 |
| ONX | 202625 – 202640 | 14 |
| OOKLA | 202601 – 202626 | 5 |
| OOKLA | 202627 – 202640 | 9 |
| ONX | mulai 202641 | **8** (current) |
| OOKLA | mulai 202641 | **4** (current) |

Implementasi: kolom `show_on_chart` di `netpulse_crowd_target` (§4.1). Baris lama `show_on_chart = true`, baris current `false`. Grafik menggambar garis target hanya untuk minggu yang target-nya `show_on_chart = true`; minggu lain → nilai `null` (garis putus). Tile, tabel achievement, `wins_needed`, dan status ACH/NOT ACH **selalu** memakai target yang berlaku di minggu itu (lama atau current) — untuk minggu ≤ 202640 berarti target lama.

### 3.4 KPI manual Ookla (Coverage, Top Rated)
- Disimpan di tabel `netpulse_crowd_manual` per `(region, yearweek, kpi_key)`.
- **Carry forward**: bila minggu X tidak ada input, pakai input terakhir sebelum X. Tandai di UI dengan ikon ✎ dan tooltip "Manual input from W.. ".
- Seed: `('SULAWESI', 202644, 'ook_coverage_all', 30.34, 'WIN')`, `('SULAWESI', 202644, 'ook_toprated_all', 3.51, 'WIN')`.
- Minggu sebelum input pertama → status `None` (tampil "–", tidak dihitung).

### 3.5 Minggu
- Label `W44 2026` dari `yearweek` 202644 (`f"W{yw % 100:02d} {yw // 100}"`).
- Week picker = gabungan minggu yang ada di ONX dan Ookla. Untuk tiap source pakai `MAX(yearweek) <= week` milik source itu. Bila berbeda dengan minggu yang dipilih, tampilkan badge "ONX data W43".
- **WoW** = nilai minggu itu − minggu data sebelumnya (yearweek sebelumnya yang ada di source itu, perhatikan pergantian tahun 202552 → 202601).
- Saat ini kedua source punya data sampai **202644**.

---

## BAGIAN 4 — Backend

### 4.1 File baru `backend/app/crowd_store.py`
Salin pola `backend/app/cei_store.py` (fungsi `_rw()`, `_read()`, flag `_ready`, DDL + seed saat tabel baru dibuat).

```sql
CREATE TABLE IF NOT EXISTS netpulse_crowd_target (
    source      TEXT NOT NULL CHECK (source IN ('ONX', 'OOKLA')),
    region      TEXT NOT NULL DEFAULT 'SULAWESI',
    start_week  INT  NOT NULL,
    target_win  INT  NOT NULL CHECK (target_win >= 0),
    show_on_chart BOOLEAN NOT NULL DEFAULT false,   -- true = draw as target line on the trend chart
    PRIMARY KEY (source, region, start_week)
);
CREATE TABLE IF NOT EXISTS netpulse_crowd_manual (
    region      TEXT NOT NULL DEFAULT 'SULAWESI',
    yearweek    INT  NOT NULL,
    kpi_key     TEXT NOT NULL CHECK (kpi_key IN ('ook_coverage_all', 'ook_toprated_all')),
    tsel_value  DOUBLE PRECISION,
    status      TEXT NOT NULL CHECK (status IN ('WIN', 'DRAW', 'LOSE')),
    updated_at  TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (region, yearweek, kpi_key)
);
```
Seed (hanya saat tabel baru dibuat):
```python
_SEED_TARGETS = [
    # (source, region, start_week, target_win, show_on_chart)
    ("ONX",   "SULAWESI", 202601, 12, True),    # old target (chart line)
    ("ONX",   "SULAWESI", 202625, 14, True),    # old target (chart line, until 202640)
    ("ONX",   "SULAWESI", 202641,  8, False),   # current target
    ("OOKLA", "SULAWESI", 202601,  5, True),
    ("OOKLA", "SULAWESI", 202627,  9, True),    # until 202640
    ("OOKLA", "SULAWESI", 202641,  4, False),   # current target
]
```
- manual: lihat §3.4

Fungsi publik:
```python
def list_targets(region: str | None = None) -> list[dict]          # [{source, region, start_week, target_win, show_on_chart}]
def target_for(source: str, region: str, week: int, targets) -> dict | None   # row valid at `week` (latest start_week <= week)
def save_target(source: str, region: str, start_week: int, target_win: int, show_on_chart: bool = False) -> None   # upsert, validasi input
def delete_target(source: str, region: str, start_week: int) -> None
def list_manual(region: str | None = None) -> list[dict]           # [{region, yearweek, kpi_key, tsel_value, status}]
def manual_for(region: str, week: int, kpi_key: str, manual) -> dict | None   # carry forward
def save_manual(region, yearweek, kpi_key, tsel_value, status) -> None        # upsert
def delete_manual(region, yearweek, kpi_key) -> None
```
Validasi: `source ∈ {ONX, OOKLA}`, `start_week`/`yearweek` format YYYYWW (tahun 2024–2030, minggu 1–53), `target_win` 0–30. Input salah → `ValueError` (endpoint mengembalikan 400).

### 4.2 File baru `backend/app/queries_crowdsource.py`
Isi: `KPI_CATALOG`, `kab_key()`, `status_of()`, `needed_values()`, label operator, dan fungsi query di bawah. Setiap fungsi publik mengembalikan `dict` (agar bisa di-cache oleh `_cached` di main.py, yang hanya menyimpan dict tanpa key `error`).

**Loader internal (satu query per source, logic di Python):**
```python
def _load_onx_region(region: str, w_from: int, w_to: int) -> list[tuple]:
    sql = '''SELECT yearweek, metric, provider, rank, final_value, lci, uci
             FROM "measONX"
             WHERE lvl = 'Region' AND location = %s
               AND yearweek BETWEEN %s AND %s AND rank IS NOT NULL'''

def _load_onx_kab(kab_names: list[str], weeks: list[int]) -> list[tuple]:
    # kab_names = ONX spellings of the region's kabupaten (match with kab_key against measOoklaCity list)
    sql = '''SELECT yearweek, location, metric, provider, rank, final_value, lci, uci
             FROM "measONX"
             WHERE lvl = 'Kabupaten' AND yearweek = ANY(%s) AND location = ANY(%s) AND rank IS NOT NULL'''

def _load_ookla_region(region: str, w_from: int, w_to: int) -> list[tuple]:
    sql = '''SELECT yearweek, tech, operator,
                    connectivity_score, rank_connectivity, speed_score, rank_speed,
                    video_score, rank_video, game_score, rank_game, web_score, rank_web,
                    page_load_time_percent, avg_val_web_page_load_time
             FROM "measOoklaRegion"
             WHERE level = 'region' AND region = %s AND yearweek BETWEEN %s AND %s'''

def _load_ookla_kab(region: str, weeks: list[int]) -> list[tuple]:
    # same columns + kabupaten, from "measOoklaCity" WHERE level='kabupaten' AND region=%s
    # AND kabupaten IS NOT NULL AND yearweek = ANY(%s)
```
- Untuk ONX kabupaten: ambil sekali daftar `SELECT DISTINCT location FROM "measONX" WHERE lvl='Kabupaten'` (cache 24 jam), cocokkan ke kabupaten region via `kab_key()`.
- Untuk menghitung `w_from` dari "N minggu terakhir": ambil daftar yearweek yang ada (`SELECT DISTINCT yearweek ...`, cache 10 menit) lalu potong N terakhir — jangan aritmetika YYYYWW manual.
- Bentuk struktur antara: `data[(source, key, yearweek)] = {provider_label: {"value", "lci", "uci", "rank"}}`.
- Selalu tutup koneksi di `finally` (pola `queries_cei.py`).

**Fungsi publik (nama harus diawali `get_crowd` agar cache bisa di-drop sekaligus):**

| Fungsi | Param | Return |
|---|---|---|
| `get_crowd_meta()` | – | lihat contoh JSON §4.4 |
| `get_crowd_summary(week, region)` | | tiles + trend |
| `get_crowd_achievement(week, weeks, region, level, kabupaten, source, tech, competitor)` | | tabel |
| `get_crowd_trend(key, region, kabupaten, weeks)` | | series per operator |
| `get_crowd_contributors(week, region, source, tech, key)` | | 2 tabel |
| `get_crowd_map(week, region, source, tech, key)` | | marker per kabupaten |

### 4.3 Perubahan `backend/app/main.py`
1. Import:
   ```python
   from . import crowd_store
   from .queries_crowdsource import (get_crowd_meta, get_crowd_summary, get_crowd_achievement,
                                     get_crowd_trend, get_crowd_contributors, get_crowd_map)
   ```
2. Bungkus cache (di dekat `get_cei_* = _cached(...)`): `get_crowd_meta = _cached(get_crowd_meta)` dst. untuk keenam fungsi.
3. `API_MENU_RULES`: tambah `("/api/crowdsource/", ("crowdsource",)),` tepat setelah baris `("/api/cei/", ("cei",)),`.
4. Section baru `# OKR > Crowdsource` setelah section CEI (sebelum "Static file serving"), dengan helper:
   ```python
   def _crowd_error(e: Exception):
       return JSONResponse(status_code=400 if isinstance(e, ValueError) else 503, content={"error": str(e)})

   def _drop_crowd_cache():
       with _RESULT_CACHE_LOCK:
           for key in [k for k in _RESULT_CACHE if str(k[0]).startswith("get_crowd")]:
               del _RESULT_CACHE[key]
   ```
5. Endpoint:

| Method & path | Query / body | Panggil |
|---|---|---|
| `GET /api/crowdsource/meta` | – | `get_crowd_meta()` |
| `GET /api/crowdsource/summary` | `week:int=None` (default terakhir), `region:str='SULAWESI'` | `get_crowd_summary` |
| `GET /api/crowdsource/achievement` | `week`, `weeks:int=8 (1–26)`, `region`, `level:'region'\|'kabupaten'='region'`, `kabupaten:List[str]=None`, `source:'all'\|'ONX'\|'OOKLA'='all'`, `tech:'all'\|'overall'\|'5g'\|'4g'='all'`, `competitor:'all'\|'IOH'\|'XLSMART'='all'` | `get_crowd_achievement` |
| `GET /api/crowdsource/trend` | `key:str` (wajib), `region`, `kabupaten:str=None`, `weeks:int=26 (4–104)` | `get_crowd_trend` |
| `GET /api/crowdsource/contributors` | `week`, `region`, `source`, `tech`, `key:str=None` | `get_crowd_contributors` |
| `GET /api/crowdsource/map` | `week`, `region`, `source:'ONX'\|'OOKLA'='ONX'`, `tech='overall'`, `key:str='all'` | `get_crowd_map` |
| `GET /api/crowdsource/settings` | – | `{"targets": crowd_store.list_targets(), "manual": crowd_store.list_manual()}` |
| `POST /api/crowdsource/targets` | `{source, region, start_week, target_win, show_on_chart}` | `save_target` → `_drop_crowd_cache()` → return settings |
| `DELETE /api/crowdsource/targets/{source}/{region}/{start_week}` | | `delete_target` → drop cache |
| `POST /api/crowdsource/manual` | `{region, yearweek, kpi_key, tsel_value, status}` | `save_manual` → drop cache |
| `DELETE /api/crowdsource/manual/{region}/{yearweek}/{kpi_key}` | | `delete_manual` → drop cache |

   - Semua endpoint dibungkus `try/except Exception as e: return _crowd_error(e)` seperti CEI.
   - Normalisasi `kabupaten` list: `sorted({v.strip().upper() for v in values or [] if v and v.strip()})` (seperti `_cei_values`).
   - POST/DELETE tulis: hanya untuk user SuperAdmin. Cek seperti endpoint admin yang sudah ada (cari bagaimana `/api/admin/*` memeriksa user/`is_super` dan pakai cara yang sama); bila bukan SuperAdmin → 403 `{"error": "Only SuperAdmin can change targets"}`.

### 4.4 Kontrak JSON (contoh nilai nyata W44)

`GET /api/crowdsource/meta`
```json
{
  "weeks": {"ONX": [202501, "...", 202644], "OOKLA": [202501, "...", 202644]},
  "latest_week": 202644,
  "regions": ["SULAWESI", "BALI NUSRA", "CENTRAL JABOTABEK", "..."],
  "default_region": "SULAWESI",
  "kabupaten": {"SULAWESI": ["BANGGAI", "BANGGAI KEPULAUAN", "...", "WAKATOBI"]},
  "techs": [{"id": "overall", "label": "Overall"}, {"id": "5g", "label": "5G"}, {"id": "4g", "label": "4G (Ookla only)"}],
  "competitors": ["IOH", "XLSMART"],
  "catalog": [{"key": "onx_video_all", "source": "ONX", "tech": "overall", "label": "Video Experience", "unit": "pts", "in_target": true, "manual": false}]
}
```

`GET /api/crowdsource/summary?week=202644&region=SULAWESI`
```json
{
  "week": 202644, "region": "SULAWESI",
  "data_week": {"ONX": 202644, "OOKLA": 202644},
  "tiles": {
    "ONX":   {"total": 16, "win": 6, "draw": 2, "lose": 8, "wins": 8, "target": 8, "wins_needed": 0, "wow_wins": 0, "at_risk": 2},
    "OOKLA": {"total": 10, "win": 4, "draw": 0, "lose": 6, "wins": 4, "target": 4, "wins_needed": 0, "wow_wins": 0, "at_risk": 0, "manual": 2},
    "TOTAL": {"total": 26, "wins": 12, "target": 12, "wins_needed": 0, "achievement": "ACH"}
  },
  "trend": [
    {"week": 202640, "onx_win": 6, "onx_lose": 10, "onx_target": 14, "onx_target_line": 14,
                     "ook_win": 4, "ook_lose": 6, "ook_target": 9, "ook_target_line": 9,
                     "total_wins": 10, "total_target": 23, "achievement": "NOT ACH"},
    {"week": 202644, "onx_win": 8, "onx_lose": 8, "onx_target": 8, "onx_target_line": null,
                     "ook_win": 4, "ook_lose": 6, "ook_target": 4, "ook_target_line": null,
                     "total_wins": 12, "total_target": 12, "achievement": "ACH"}
  ]
}
```
- `trend` = 26 minggu terakhir; `onx_win`/`ook_win` sudah termasuk DRAW.
- `*_target` = target yang berlaku minggu itu (dipakai tooltip & status). `*_target_line` = nilai garis grafik: sama dengan target bila baris target `show_on_chart = true`, selain itu `null` → garis berhenti di 202640.
- Angka W40 di contoh di atas hanya ilustrasi bentuk; nilainya dihitung dari DB.
- Per-source tile (`ONX`, `OOKLA`) tidak punya field `achievement`; hanya `TOTAL` dan setiap baris `trend`.

`GET /api/crowdsource/achievement?...` — satu baris per KPI:
```json
{
  "weeks": [202637, 202638, "...", 202644],
  "week_summary": [
    {"week": 202644, "source": "ONX",   "wins": 8,  "target": 8},
    {"week": 202644, "source": "OOKLA", "wins": 4,  "target": 4},
    {"week": 202644, "source": "TOTAL", "wins": 12, "target": 12, "achievement": "ACH"}
  ],
  "rows": [{
    "key": "onx_dl_all", "source": "ONX", "tech": "overall", "label": "Download Speed", "unit": "Mbps",
    "in_target": true, "manual": false, "kabupaten": null,
    "cells": [{"week": 202643, "tsel": 41.03, "rank": 2, "status": "LOSE"}, {"week": 202644, "tsel": 40.78, "rank": 2, "status": "LOSE"}],
    "tsel": 40.78, "tsel_lci": 40.41, "tsel_uci": 41.14, "wow": -0.25,
    "leader": "XLSMART", "leader_value": 44.22, "gap": 3.44, "gap_pct": 7.78,
    "needed_win": 45.35, "needed_draw": 43.09, "margin": null, "at_risk": false
  }],
  "path_to_target": [{"key": "onx_dl_all", "label": "Download Speed", "gap_pct": 7.78, "focus": false}]
}
```
Level `kabupaten`: sama, tapi satu blok baris per kabupaten (`"kabupaten": "GOWA"`).

`GET /api/crowdsource/trend?key=onx_dl_all&region=SULAWESI&weeks=26`
```json
{"key": "onx_dl_all", "label": "Download Speed", "unit": "Mbps", "source": "ONX",
 "series": [{"name": "TSEL", "data": [{"week": 202644, "value": 40.78, "lci": 40.41, "uci": 41.14, "rank": 2}]},
            {"name": "IOH", "data": ["..."]}, {"name": "XLSMART", "data": ["..."]}],
 "needed_win": 45.35}
```

`GET /api/crowdsource/contributors?week=202644&region=SULAWESI&source=ONX&tech=all`
```json
{
  "week": 202644, "prev_week": 202643,
  "kpi_degrade": [{"key": "onx_video_5g", "label": "5G Video Experience", "prev": 70.06, "cur": 69.47, "delta": -0.59, "delta_pct": -0.84,
                   "status_prev": "LOSE", "status_cur": "LOSE", "rank_prev": 3, "rank_cur": 2, "leader": "IOH", "gap": 6.76, "flip": false}],
  "selected_key": "onx_video_5g",
  "kabupaten": [{"kabupaten": "KOTA MAKASSAR", "prev": 0, "cur": 0, "delta": 0, "status_prev": "WIN", "status_cur": "LOSE",
                 "leader": "IOH", "leader_value": 0, "gap": 0, "flip": true}]
}
```

`GET /api/crowdsource/map?week=202644&region=SULAWESI&source=ONX&tech=overall&key=all`
```json
{
  "week": 202644, "key": "all", "mode": "count",
  "points": [{"kabupaten": "KOTA MAKASSAR", "lat": -5.1434, "lon": 119.4513, "n_sites": 742,
              "status": null, "tsel": null, "leader": null, "leader_value": null, "gap": null, "gap_pct": null, "rank": null,
              "win_count": 3, "draw_count": 1, "lose_count": 5, "lose_kpis": ["Video Experience", "..."]}],
  "no_data": ["..."],
  "counts": {"WIN": 0, "DRAW": 0, "LOSE": 0}
}
```
Bila `key` = satu KPI → `mode: "status"`, field `status/tsel/leader/gap/gap_pct/rank` terisi, `*_count` boleh null.

### 4.5 Detail logic tiap fungsi

**`get_crowd_summary`**
- Ambil 26 minggu terakhir (≤ week) ONX & Ookla region. Hitung status semua KPI `in_target` per minggu, termasuk manual (carry forward).
- `wow_wins` = wins minggu ini − wins minggu data sebelumnya.
- `at_risk` = jumlah KPI WIN/DRAW yang memenuhi kriteria §3.2.

**`get_crowd_achievement`**
- `weeks` minggu terakhir per source. Baris dikelompokkan Source → Tech, urutan sesuai `KPI_CATALOG`.
- `source`/`tech` memfilter baris; `competitor` mengubah logika status (head-to-head §3.1) dan leader (= operator itu).
- Baris KPI ekstra (`in_target=False`) ikut dikirim dengan flag; frontend yang menyembunyikan/menampilkan.
- `path_to_target`: dari baris `in_target` LOSE minggu terakhir, urut `gap_pct`, `focus=True` untuk N = wins_needed teratas.
- Level `kabupaten`: pakai loader kabupaten untuk daftar kabupaten terpilih (maks 10; bila kosong → error 400 "Pick 1–10 kabupaten"). ONX kabupaten pakai nama ONX hasil `kab_key`. KPI manual tidak ada di level kabupaten.

**`get_crowd_trend`**
- Dari `key` → source/tech/db. Series TSEL, IOH, XLSMART (gabungkan XL+XLSMART jadi satu series XLSMART). ONX sertakan `lci/uci`. Opsional series abu-abu `3`, `Smartfren` (ONX) dengan `"muted": true`.
- `kabupaten` terisi → ambil dari level kabupaten.

**`get_crowd_contributors`**
- `kpi_degrade`: KPI (sesuai filter source/tech; termasuk ekstra) dengan `delta < 0` ATAU status turun (WIN→DRAW, WIN→LOSE, DRAW→LOSE). Urutkan: `flip` dulu, lalu `delta_pct` paling negatif. Maks 15.
- `selected_key` = param `key` atau KPI pertama di `kpi_degrade`.
- `kabupaten`: untuk `selected_key`, semua kabupaten region, hitung prev/cur/delta/status; urutkan flip dulu lalu `delta_pct` paling negatif; ambil 15. Kabupaten tanpa data dilewati.
- Tidak ada sample count di tabel; ranking hanya dari Δ dan flip (tampilkan catatan ini di UI).

**`get_crowd_map`**
- Centroid dari `raw_desiqa` (§1.3), join via `kab_key()` ke daftar kabupaten region.
- `key='all'`: untuk tiap kabupaten hitung `win/draw/lose_count` atas KPI `in_target` source+tech yang punya data di level kabupaten (tanpa manual). `lose_kpis` = label KPI yang LOSE.
- `key=<kpi>`: status, tsel, leader, gap, gap_pct, rank.
- `no_data` = kabupaten region tanpa data KPI (tetap punya koordinat → marker abu-abu).
- Region ≠ SULAWESI → `{"points": [], "message": "Map available for SULAWESI only"}`.

### 4.6 `backend/app/auth_store.py`
- Tambah ke `MENUS` setelah baris `cei`: `{"id": "crowdsource", "label": "Crowdsource", "group": "OKR"},`.
- Role `oss` (`DEFAULT_ROLES`): kecualikan `"crowdsource"` juga → `m not in ("admin", "cei", "crowdsource")`.
- **Penting:** `DEFAULT_ROLES` hanya dipakai saat role dibuat pertama kali. Role yang sudah ada di `backend/data/netpulse_auth.sqlite3` **tidak otomatis** mendapat menu baru. SuperAdmin otomatis dapat (is_super). Untuk role lain (mis. RNO), user memberi akses via halaman **Administrasi**. **Jangan** menulis migrasi otomatis ke SQLite. Sebutkan ini di laporan akhir.

---

## BAGIAN 5 — Frontend

### 5.1 Registrasi menu (file yang sudah ada)
1. `frontend/src/constants/menus.js`
   - `MENU_META`: tambah
     `'crowdsource': { title: 'Crowdsource', crumbGroup: 'OKR', crumb: 'OpenSignal & Ookla', source: 'OneDb (measONX, measOoklaRegion, measOoklaCity, raw_desiqa)', db: 'onedb' },`
   - `MENU_ORDER`: sisipkan `'crowdsource'` tepat setelah `'cei'`.
2. `frontend/src/components/layout/AppSidebar.jsx`
   - Import ikon `Radar` dari `lucide-react`.
   - `useEffect`: `if (activeMenu === 'cei' || activeMenu === 'crowdsource') setOkrOpen(true);`
   - `showMainKpi`: `any('cluster', 'cei', 'crowdsource')`.
   - Blok OKR: ganti kondisi `can('cei')` menjadi `any('cei', 'crowdsource')`; di dalam `Group`:
     ```jsx
     {can('cei') && <MenuButton id="cei" label="CEI" Icon={Smile} accent="emerald" tag="OneDb/TwoDb" {...common} />}
     {can('crowdsource') && <MenuButton id="crowdsource" label="Crowdsource" Icon={Radar} accent="emerald" tag="OneDb" {...common} />}
     ```
3. `frontend/src/App.jsx`
   - `const CrowdsourceView = lazy(() => import('./views/CrowdsourceView'));`
   - Di render: `{show('crowdsource') && <CrowdsourceView {...common} />}` (di bawah baris CEI).
4. Cek `AppHeader.jsx`: halaman CEI menyembunyikan pill "charts per row". Lakukan hal yang sama untuk `crowdsource` (cari kondisi `'cei'` di AppHeader dan tambahkan `'crowdsource'`).

### 5.2 Dependency baru
```bash
cd frontend
npm install leaflet@1.9.4 react-leaflet@5.0.0
```
Import CSS sekali di `WinLoseMap.jsx`: `import 'leaflet/dist/leaflet.css';`. Pakai `CircleMarker` (bukan `Marker`) supaya tidak perlu file ikon Leaflet.

### 5.3 File baru
```
frontend/src/views/CrowdsourceView.jsx          // halaman utama, state filter, fetch, layout
frontend/src/views/crowdsource/
  constants.js          // STATUS_COLORS, OPERATOR_COLORS, TECH_OPTIONS, SOURCE_OPTIONS, weekLabel()
  CrowdFilters.jsx      // filter bar
  SummaryTiles.jsx      // 4–5 tile
  WinLoseTrend.jsx      // 2 chart stacked bar + garis target
  AchievementTable.jsx  // tabel week-to-week + target
  PathToTarget.jsx      // focus list / at-risk list
  KpiTrendChart.jsx     // trend KPI terpilih
  ContributorTables.jsx // KPI degrade + kabupaten contributor
  WinLoseMap.jsx        // peta Leaflet
  CrowdSettings.jsx     // modal Targets + Manual KPI (pola cei/CeiSettings.jsx)
  charts.js             // builder opsi ECharts
```
- Komponen `Card`, `Tile`, `Chart`, `Spinner` ada di `CeiView.jsx` (lokal). Pindahkan ke `frontend/src/views/cei/ui.jsx` (export), ubah `CeiView.jsx` untuk import dari sana **tanpa mengubah tampilannya**, lalu pakai juga di Crowdsource.
- Fetch pakai `getJson` dari `frontend/src/api/client.js`; POST/DELETE ikuti cara `CeiSettings.jsx`.
- Chart pakai `ReactECharts` dari `frontend/src/lib/echarts.jsx`. Bila memakai jenis chart/komponen ECharts yang belum didaftarkan di file itu (mis. `MarkAreaComponent`), daftarkan di sana.
- Props halaman: `export default function CrowdsourceView({ darkMode, onExportData })`.

### 5.4 Konstanta warna (`constants.js`)
```js
export const STATUS_COLORS = { WIN: '#16A34A', DRAW: '#0D9488', LOSE: '#DC2626', NONE: '#94A3B8' };
export const OPERATOR_COLORS = { TSEL: '#E11D48', IOH: '#F59E0B', XLSMART: '#2563EB', '3': '#A1A1AA', Smartfren: '#A1A1AA' };
export const weekLabel = (yw) => (yw ? `W${String(yw % 100).padStart(2, '0')} ${Math.floor(yw / 100)}` : '-');
```
Chip status: background warna 15% opacity + teks warna penuh; dark mode pakai `bg-*-500/15`.

### 5.5 Layout halaman (desktop; di mobile semua jadi 1 kolom)
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ FILTER BAR (sticky top)                                                       │
│ Week [W44 2026 ▾] Source [All|OpenSignal|Ookla] Tech [All|Overall|5G|4G]      │
│ Region [SULAWESI ▾] Level [Region|Kabupaten] Kabupaten [multi ▾ (Level=Kab)]  │
│ Competitor [All OLO|IOH|XLSMART] Trend [13|26|52]      ⚙ Settings   ⤓ Excel   │
│ badge kecil: "Data week ONX W44 · Ookla W44"                                  │
├────────────┬────────────┬────────────┬────────────┬───────────────────────────┤
│ TOTAL WIN  │ OPENSIGNAL │ OOKLA      │ WINS NEEDED│ WoW / AT RISK             │
│ 12 / 12    │ 8 WIN      │ 4 WIN (2 ✎)│ 0          │ ONX +0 · Ookla +0         │
│ [ ACH ]    │ target 8   │ target 4   │            │ 2 WIN at risk             │
├────────────┴────────────┴───────┬────┴────────────┴───────────────────────────┤
│ OpenSignal WIN/LOSE trend        │ Ookla WIN/LOSE trend                        │
├──────────────────────────────────┴────────────────────────────────────────────┤
│ ACHIEVEMENT & TARGET WEEK-TO-WEEK   [Lose only ☐] [Show other KPI ☐]          │
├───────────────────────────────────────────┬───────────────────────────────────┤
│ PATH TO TARGET / AT-RISK                   │ KPI TREND (row terpilih)          │
├───────────────────────────────────────────┴───────────────────────────────────┤
│ DEGRADATION CONTRIBUTORS W44   [KPI degrade]  |  [Kabupaten contributor]       │
├───────────────────────────────────────────────────────────────────────────────┤
│ WIN / LOSE MAP — SULAWESI                                                     │
│ Source [ONX|Ookla] Tech [Overall|5G|4G] KPI [All KPI ▾] ☑Win ☑Draw ☑Lose ☐Labels│
│ (peta tinggi 520px)                                       legend + counter    │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 5.6 Spesifikasi komponen

**CrowdFilters**
- Default: week = `meta.latest_week`, source `all`, tech `all`, region `meta.default_region` (SULAWESI), level `region`, kabupaten `[]`, competitor `all`, trendWeeks 26.
- Simpan filter di `localStorage` key `netpulse_crowd_filters` (bungkus `try/catch`); bila region tersimpan tidak ada di `meta.regions`, kembali ke SULAWESI.
- Kabupaten picker pakai `components/MultiSelectDropdown.jsx`, aktif hanya saat Level = Kabupaten, maks 10.
- Toggle pakai `components/filters/SegmentedToggle.jsx`.
- Tombol ⚙ hanya tampil untuk SuperAdmin (ambil dari `getStoredAuthUser()?.is_super`).

**SummaryTiles** — dari `/summary`.
- Tile **TOTAL WIN**: `total_wins / total_target` (mis. `12 / 12`) + badge besar **`ACH`** (hijau) bila `total_wins >= total_target`, **`NOT ACH`** (merah) bila kurang. Ini status resmi halaman.
- Tile OpenSignal & Ookla: jumlah WIN (DRAW termasuk) + "target 8" / "target 4"; angka hijau bila `wins >= target`, merah bila kurang (info saja, tanpa badge ACH). Tile Ookla menampilkan "(2 manual)".
- Tile WINS NEEDED: `wins_needed` dari TOTAL. Tile WoW: panah naik/turun + jumlah at risk.

**WinLoseTrend** — tiga chart dari `summary.trend`: **OpenSignal**, **Ookla**, dan **Total** (opsional tapi disarankan).
- Stacked bar WIN (hijau, termasuk DRAW) + LOSE (merah), sumbu x `W01..W44`.
- Garis target (step line, warna gelap/putih sesuai tema) memakai `*_target_line`: **hanya tergambar sampai 202640** (target lama). Mulai 202641 nilainya `null` sehingga garis berhenti; jangan menyambung (`connectNulls: false`).
- Chart Total: bar `total_wins`, warna bar per minggu hijau bila `achievement = ACH`, merah bila `NOT ACH`; tanpa garis target setelah 202640 (sama aturannya).
- Tooltip: WIN, LOSE, Target berlaku (`*_target`), dan untuk Total status ACH/NOT ACH.
- Klik bar → set week filter ke minggu itu.

**AchievementTable**
- Header 2 baris. Baris pertama tabel = **Wins vs Target** per minggu: baris ONX `8/8`, baris Ookla `4/4` (angka hijau/merah, info), dan baris **TOTAL** `12/12` + chip **ACH** / **NOT ACH** (status resmi). Baris TOTAL selalu tampil walau filter source = ONX/Ookla.
- Kolom per KPI: `KPI` (label + chip tech) | `Unit` | satu kolom per minggu (`W37`…`W44`): nilai Tsel 2 desimal + chip W/D/L kecil + angka rank kecil abu-abu | `Δ WoW` (▲ hijau / ▼ merah) | `Leader` | `Leader value` | `Gap` | `Gap %` | `Needed WIN` | `Needed DRAW` (ONX saja) | `Margin` (untuk WIN) + ikon ⚠ "At risk".
- Group header: "OpenSignal · Overall", "OpenSignal · 5G", "Ookla · Overall", "Ookla · 5G", "Other KPI".
- KPI manual: ikon ✎ + tooltip "Manual input (W44)". Sel kosong "–".
- "Lose only": tampilkan hanya baris yang statusnya LOSE di minggu terakhir.
- Klik baris → `selectedKey` (dipakai KpiTrendChart dan map KPI).
- Header kolom sticky, kolom KPI sticky kiri, scroll horizontal di layar kecil.
- Level Kabupaten: satu sub-header per kabupaten.

**PathToTarget**
- Bila `wins_needed > 0`: judul "Path to target — N more WIN needed"; tabel `# | KPI | Tsel | Leader | Gap | Gap % | Needed WIN`, baris `focus` diberi badge "Focus".
- Bila 0 (status ACH): judul "ACH — keep these WIN"; daftar KPI at risk (`margin`, alasan: "CI overlap" / "Draw" / "Margin < 1%"). Contoh W44 harus memuat Voice 5G (draw dengan IOH) dan 5G Availability (draw dengan XLSMART).

**KpiTrendChart** — `/trend?key=selectedKey`. Garis per operator (warna `OPERATOR_COLORS`), untuk ONX tambah band `lci–uci` (dua series `line` dengan `areaStyle` stack teknik "confidence band" ECharts, opacity 0.12). `markLine` horizontal di `needed_win` (label "Needed to win 45.35"). Label rank kecil di titik terakhir. Default `selectedKey` = KPI LOSE pertama di path_to_target, atau baris pertama.

**ContributorTables**
- Kiri "KPI degradation (region)": kolom `KPI | W43 | W44 | Δ | Δ% | Status W43→W44 | Rank | Leader | Gap`. Baris `flip` diberi latar merah tipis + badge "Flip". Klik baris → ubah `key` kontributor kabupaten.
- Kanan "Kabupaten contributors — {KPI}": `Kabupaten | W43 | W44 | Δ | Status | Leader | Leader value | Gap`. Klik baris → peta zoom (`map.flyTo([lat, lon], 9)`).
- Catatan kecil di bawah: "Ranked by WoW change and status flip; sample counts are not available in the source tables."

**WinLoseMap**
- `MapContainer` tinggi 520px, `scrollWheelZoom` aktif, `fitBounds` ke semua titik saat data berubah.
- Tile layer:
  - light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
  - dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
  - attribution: `&copy; OpenStreetMap contributors &copy; CARTO`
  - Ganti tile saat `darkMode` berubah (pakai `key={darkMode ? 'dark' : 'light'}` pada `TileLayer`).
- Kontrol peta sendiri (independen dari filter atas, default ikut filter atas): Source (ONX/Ookla), Tech (Overall/5G/4G — 4G hanya untuk Ookla), KPI (`All KPI` + daftar KPI source+tech), checkbox Win/Draw/Lose, toggle Labels.
- **Mode status** (KPI tertentu): `CircleMarker` warna `STATUS_COLORS[status]`, `radius = clamp(6 + |gap_pct| * 1.5, 6, 22)` (WIN pakai `margin%`), `fillOpacity 0.75`, border putih 1px.
- **Mode count** (`All KPI`): warna gradasi dari rasio `lose_count / (win+draw+lose)`: 0 → hijau, 0.5 → kuning, 1 → merah (interpolasi linear RGB); radius 9.
- Marker `no_data` → abu-abu, radius 5, tidak terpengaruh checkbox.
- Checkbox menyembunyikan marker berstatus itu (mode count: kategori dominan).
- `Tooltip` (hover): nama kabupaten, status, `TSEL 62.04 vs IOH 69.10`, gap, rank, jumlah site. Mode count: `Win 3 · Draw 1 · Lose 5` + daftar KPI LOSE.
- Labels on → `Tooltip permanent direction="right"` berisi nama kabupaten pendek (tanpa "KOTA ").
- Legend pojok kanan bawah + counter `Win n · Draw n · Lose n · No data n`.
- Region ≠ SULAWESI → tampilkan pesan dari API, jangan render peta.

**CrowdSettings** (modal, pola `cei/CeiSettings.jsx`)
- Tab **Targets**: tabel `Source | Region | Start week | Target WIN | 🗑`, form tambah (select source, input week `YYYYWW`, input angka).
- Tab **Manual KPI**: tabel `Week | KPI (Coverage/Top Rated) | Tsel value | Status | 🗑`, form tambah.
- Setelah simpan/hapus: refetch `settings`, `summary`, `achievement`.

**Export Excel** — daftarkan via `onExportData` seperti `CeiView.jsx` (lihat `frontend/src/api/export.js`, `objectRowsSheet`). Sheet: `Summary`, `Achievement`, `Path to target`, `KPI degradation`, `Kabupaten contributors`, `Map`. Filename `Crowdsource_SULAWESI_W44_2026`.

### 5.7 Alur fetch
- Mount: `GET /meta` → set default filter → paralel `summary`, `achievement`, `contributors`, `map`.
- Ubah week/region: refetch semua. Ubah source/tech/competitor/level/kabupaten: refetch `achievement` + `contributors`. Kontrol peta: hanya `map`. Klik baris: hanya `trend`.
- Batalkan request lama saat filter berubah cepat (pola `scopeRef`/sequence id di `CeiView.jsx`), supaya hasil lama tidak menimpa yang baru.
- Tiap card punya `Spinner` sendiri dan pesan error sendiri (`{error}` dari API), jangan satu error memblokir seluruh halaman.

---

## BAGIAN 6 — Angka validasi W44 2026, SULAWESI (WAJIB COCOK, toleransi 0,01)

### 6.1 OpenSignal (`measONX`, lvl Region) — **8/16 WIN**

| KPI | Tsel W44 | Tsel W43 | WoW | Rank | Status | Leader (nilai) |
|---|---|---|---|---|---|---|
| Games Exp Overall | 83,39 | 82,57 | +0,82 | 1 | WIN | – |
| Upload Overall | 13,52 | 13,50 | +0,02 | 1 | WIN | – |
| Coverage Exp Overall | 8,55 | 8,55 | 0,00 | 1 | WIN | – |
| Games Exp 5G | 92,65 | 91,75 | +0,90 | 1 | WIN | – |
| Voice Exp 5G | 84,49 | 84,62 | −0,13 | 1 | DRAW | IOH 84,03 (rank 1) |
| Upload 5G | 25,83 | 25,79 | +0,04 | 1 | WIN | – |
| 5G Availability | 6,96 | 7,04 | −0,08 | 1 | DRAW | XLSMART 7,28 (rank 1) |
| Coverage Exp 5G | 0,27 | 0,27 | 0,00 | 1 | WIN | – |
| Video Exp Overall | 58,70 | 59,23 | −0,53 | 3 | LOSE | IOH 67,31 |
| Voice Exp Overall | 80,78 | 80,95 | −0,17 | 3 | LOSE | IOH 82,37 |
| Download Overall | 40,78 | 41,03 | −0,25 | 2 | LOSE | XLSMART 44,22 |
| Time On Overall | 96,35 | 96,40 | −0,05 | 3 | LOSE | IOH 97,29 |
| Consistent Quality | 68,40 | 68,34 | +0,06 | 3 | LOSE | IOH 71,60 |
| Reliability | 845,14 | 847,22 | −2,08 | 3 | LOSE | XLSMART 880,13 |
| Video Exp 5G | 69,47 | 70,06 | −0,59 | 2 | LOSE | IOH 76,23 |
| Download 5G | 99,16 | 99,89 | −0,73 | 3 | LOSE | IOH 195,95 |

### 6.2 Ookla (`measOoklaRegion`, level region) — **2 WIN dari DB + 2 manual = 4/10**

| KPI | Tsel W44 | Rank | Status | Leader (nilai) |
|---|---|---|---|---|
| Video Exp (ALL) | 71,72 | 1 | WIN | – |
| Gaming Exp (ALL) | 75,77 | 1 | WIN | – |
| Coverage (manual) | 30,34 | – | WIN | – |
| Top Rated (manual) | 3,51 | – | WIN | – |
| Best Mobile Network (ALL) | 66,27 | 2 | LOSE | XLSMART 66,76 |
| Fastest (ALL) | 52,60 | 3 | LOSE | XLSMART 60,58 |
| Best 5G Network | 67,56 | 3 | LOSE | IOH 76,38 |
| Fastest 5G | 42,98 | 3 | LOSE | IOH 62,18 |
| Best 5G Video | 90,51 | 2 | LOSE | IOH 90,51 |
| Best 5G Gaming | 80,63 | 2 | LOSE | IOH 81,75 |

KPI ekstra W44: Web ALL 88,15 rank 1; Web 5G 93,78 rank 1; 4G: connectivity 71,24 r1, speed 62,86 r3, video 71,22 r1, game 75,16 r1, web 88,00 r1.

> ⚠️ WoW Ookla dari DB: Video ALL 71,76→71,72 (**−0,04**), Gaming ALL 75,88→75,77 (**−0,11**). PPT menulis −0,12 dan −0,26 karena histori Ookla sudah di-snapshot ulang. **Ini bukan bug**; halaman memakai data DB terkini.

### 6.3 Target
W44: TOTAL wins 12, target 12, wins_needed 0 → **ACH**. ONX 8/8, Ookla 4/4.
Target yang berlaku: W41–W44 = 8 + 4 (current). W40 ke bawah = target lama (ONX 14 / Ookla 9 untuk W25–W40 dan W27–W40; ONX 12 / Ookla 5 sebelumnya).
Garis target grafik: ada sampai W40, kosong mulai W41.

### 6.4 Kabupaten (contoh cek cepat, W44, metric `videoexperience_overall`, ONX)
- GOWA: Indosat 68,74 r1; Telkomsel 62,00 r2; XL 63,51 r2 → Tsel LOSE, leader IOH.
- KOTA MAKASSAR: Indosat 69,10 r1; XL 64,87 r2; Telkomsel 62,04 r3 → LOSE.
- Ookla `video_score` ALL W44: GOWA Tsel 78,34 r1; KOTA MAKASSAR Tsel 70,06 r1 → WIN.

---

## BAGIAN 7 — Urutan implementasi & verifikasi tiap langkah

1. **`queries_crowdsource.py`: katalog + helper + loader.** Tulis skrip uji sementara di luar repo (folder scratch) yang memanggil loader dan mencetak tabel §6.1 & §6.2. Harus cocok sebelum lanjut.
2. **Normalisasi kabupaten.** Cetak jumlah kabupaten SULAWESI yang cocok di ONX dan desiqa → harus **91/91**.
3. **`crowd_store.py`.** Jalankan sekali → tabel dibuat + seed. Cek `SELECT * FROM netpulse_crowd_target` (2 baris) dan `netpulse_crowd_manual` (2 baris).
4. **Fungsi `get_crowd_*`** lalu endpoint di `main.py`. Jalankan backend (`start_dashboard.bat` atau uvicorn seperti di README) dan cek:
   ```bash
   curl -s "http://localhost:<port>/api/crowdsource/summary?week=202644&region=SULAWESI" -H "Authorization: Bearer <token>"
   ```
   (Lihat `frontend/src/api/client.js` untuk header auth yang dipakai. Bila login dimatikan, header tidak perlu.)
   Harus: ONX wins 8, Ookla wins 4, TOTAL 12/12.
   `achievement`: baris `onx_dl_all` `needed_win = 45.35`, `needed_draw = 43.09`.
   `map?key=all`: 91 titik, KOTA MAKASSAR lat ≈ −5.1434.
5. **`auth_store.py`** menu baru; restart; login SuperAdmin → menu terlihat; user role tanpa izin → API 403.
6. **Frontend registrasi menu** (§5.1) → halaman kosong tampil di OKR > Crowdsource.
7. **Komponen** sesuai urutan: Filters → Tiles → Trend → AchievementTable → PathToTarget → KpiTrendChart → Contributors → Map → Settings → Export.
8. **Cek akhir**:
   - `cd frontend && npm run lint` dan `npm run build` tanpa error.
   - Buka halaman: default SULAWESI W44, angka tile cocok §6.3.
   - Ganti tema dark/light: tabel, chart, dan tile peta ikut.
   - Lebar 375px: tidak ada scroll horizontal di level halaman (tabel boleh scroll di dalam card-nya).
   - Halaman CEI tetap tampil sama seperti sebelumnya (karena komponen UI dipindah ke `cei/ui.jsx`).
   - Console browser bersih dari error.

---

## BAGIAN 8 — Acceptance criteria
1. Menu **OKR > Crowdsource** tampil; SuperAdmin otomatis punya akses; role `oss` baru tidak; API `/api/crowdsource/*` ditolak (403) tanpa permission.
2. Halaman terbuka dengan default **Region SULAWESI** dan minggu terakhir (W44 2026).
3. Semua angka W44 di §6 cocok (toleransi 0,01).
4. Tabel achievement: 8 minggu, W/D/L, rank, Δ WoW, leader, gap, Needed WIN/DRAW, baris Wins vs Target dengan status TOTAL ACH / NOT ACH.
5. Path to target benar (`wins_needed = target − wins`); W44 menampilkan daftar at-risk (Voice 5G, 5G Availability).
6. Contributor: KPI degrade region + kabupaten contributor untuk minggu terakhir; klik kabupaten → peta zoom.
7. Peta: 91 kabupaten Sulawesi dari `raw_desiqa`; filter Win/Draw/Lose, pilihan KPI, mode count, label; dark mode.
8. Semua 17 metric ONX dan 5 skor Ookla × 3 tech bisa dilihat (KPI di luar target di grup "Other KPI").
9. Target & KPI manual bisa ditambah/hapus dari Settings (SuperAdmin), dan hasil langsung berubah (cache di-drop).
10. Export Excel berisi 6 sheet.
11. `npm run lint` dan `npm run build` bersih; endpoint < 2 detik setelah cache hangat.
12. Tidak ada commit. Laporan akhir berisi: daftar file baru/diubah, hasil verifikasi §6, hal yang tidak cocok (bila ada), dan catatan bahwa role selain SuperAdmin perlu diberi akses lewat halaman Administrasi.

## BAGIAN 9 — Di luar scope
- "Activity BAU (RET, Power, Layering & Physical Antenna) 100% 69/69" dan "Focus grid W35" di PPT (tidak ada di tabel).
- Peta untuk region selain SULAWESI (desiqa hanya Sulawesi).
- Polygon batas kabupaten (GeoJSON). Buat komponen peta supaya marker bisa diganti layer polygon nanti.

## BAGIAN 10 — Keputusan user (FINAL, sudah dikonfirmasi)
1. **DRAW dihitung WIN.**
2. **Target current** = OpenSignal 8 WIN + Ookla 4 WIN = **12**. Status mingguan: **TOTAL WIN ≥ 12 → `ACH`**, **< 12 → `NOT ACH`**.
3. **Garis target di grafik hanya sampai 202640** (target lama). Mulai 202641 tidak ada garis target di grafik; target current tampil di tile dan tabel achievement.
4. **`connectivity_score` = "Best Mobile Network": YA.**
5. Ookla Coverage & Top Rated = input manual (tidak ada di DB).
