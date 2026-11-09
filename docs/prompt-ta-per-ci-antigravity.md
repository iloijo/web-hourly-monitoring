# Chart TA 4G: satu series per CI, dikelompokkan per sektor

## Prasyarat

Jalankan **setelah** prompt `docs/prompt-fix-carrier-label-antigravity.md` selesai. Prompt ini memakai
`get_clean_carrier_label(cell_name, sector, band, ci)` versi baru, yang menghasilkan label unik per ci
(ci 31 → `ML3`, ci 61 → `ML6`, ci 43 → `MR4`). Kalau fungsi itu belum menerima `ci`, berhenti dan beri tahu user.

## Masalah

`get_ta_4g_data` di `backend/app/queries_ta.py` menjumlahkan sample TA per **sektor → band** (`sector_band_counts[sec][band]`, ±baris 198–235).
Akibatnya pada site KKA047, ML03 (ci 31) dan ML06 (ci 61) sama-sama ada di Sector 3 (`"sec new type"` = `KKA047_3_MAC`)
dan tampil sebagai satu garis/bar `L1800`. Profil TA ML6 tidak bisa dilihat sendiri.

User ingin **satu series per CI**, tetap satu chart per sektor seperti sekarang.

## Backend (`get_ta_4g_data`)

1. Ganti agregasi menjadi `sector → ci`. Sektor tetap dari `derive_sector_and_type_4g` (`"sec new type"`), jadi ci 61 tetap di Sector 3.
2. Kunci series = label dari `get_clean_carrier_label(cell_name, sector, band, ci)` (mis. `ML3`, `ML6`, `MR3`). Kunci harus unik per ci dalam satu sektor.
3. Tiap entri `data_by_sector[sec][key]` tetap punya `counts`, `cumulative`, `total`, **plus** `band` (dari `derive_band_4g`), `ci` (int), `cell_name`.
4. Filter band tetap berdasarkan band cell, bukan nama kunci. Field `bands` di response tetap daftar band (untuk dropdown Band).
5. `get_ta_compare_data`: gabungkan before/after per kunci CI yang sama, dan teruskan `band`, `ci`, `cell_name` ke entri hasil.
6. Fallback query (tanpa CellListRCI, ±baris 163) juga harus menghasilkan kunci per ci.
7. TA 5G (`get_ta_5g_data`) **tidak diubah**.

## Frontend (`frontend/src/components/TimingAdvanceView.jsx`)

Berlaku untuk chart Distribution (±baris 238) dan Cumulative (±baris 349), termasuk mode Compare:

1. Series dibuat dari kunci `data_by_sector[sec]`. Filter Band memakai `entry.band`, bukan nama kunci.
2. Nama legend/series: `<band> <label> (<ci>)`, mis. `L1800 ML3 (31)`, `L1800 ML6 (61)`, `L900 MT3 (32)`.
3. Warna dasar dari `BAND_COLORS[entry.band]`. Jika dalam satu sektor ada lebih dari satu CI dengan band sama, CI berikutnya
   pakai varian warna yang jelas berbeda (lebih gelap/terang) supaya bisa dibedakan.
4. Urutan series: per band (L700, L900, L1800, L2100, L2300_1, L2300_2, L2300_3, L2600), lalu ci naik.
5. Tabel detail TA (sudah per cell) tidak perlu diubah.

Jangan refactor bagian lain.

## Verifikasi (wajib)

- KKA047, Sector 3: series `L900 MT3 (32)`, `L1800 ML3 (31)`, `L1800 ML6 (61)`, `L2100 MR3 (33)`.
  Total ML3 + ML6 = total `L1800` sebelum perubahan.
- Sector 1: MR1 (13) dan MR4 (43) terpisah; Sector 2: ML2 (21) dan ML5 (51) terpisah.
- Filter Band = L1800 → hanya ML3 dan ML6 di Sector 3.
- Mode Compare (Before/After) jalan, delta per CI benar.
- Site tanpa sektor 4/5/6 (mis. MRW002): jumlah series sama dengan jumlah band sebelumnya, hanya nama legend berubah.
- TA 5G tidak berubah.

## Git

Buat branch `fix/ta-per-ci` dari branch `fix/carrier-label-collision`, commit dengan pesan yang menjelaskan perubahan di atas.
Jangan push tanpa konfirmasi user.
