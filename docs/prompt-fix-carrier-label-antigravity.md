# Fix: carrier 4G dengan band sama dalam satu sektor tergabung jadi satu garis

## Bug

Site KKA047, chart Payload Sector 3 (4G Daily) hanya menampilkan `L1800 ML3`, `L2100 MR3`, `L900 MT3`.
Cell `KKA047ML1_KOLAKAASI-DMT_ML06` (ci 61) tidak muncul. Payload-nya **dijumlahkan** ke garis `L1800 ML3`
(ML3 ≈ 150–200 GB + ML6 ≈ 150–230 GB → tampil ≈ 330–450 GB). Tool referensi menampilkan MT3, ML3, ML6, MR3 terpisah.

## Root cause

`get_clean_carrier_label(cell_name, sector, band)` di `backend/app/queries.py:22` membuat label = kode band dari suffix nama cell
+ **sektor logis** (dari `"sec new type"`, mis. `KKA047_3_MAC` → 3). Label ini dipakai sebagai **kunci carrier** di `sector_buckets`,
jadi dua cell dengan band sama dalam satu sektor logis mendapat kunci yang sama dan nilainya digabung.

Data CellListRCI KKA047 (sudah dicek):

| cell suffix | ci | sec new type | label sekarang | label seharusnya |
|---|---|---|---|---|
| ML03 | 31 | KKA047_3_MAC | ML3 | ML3 |
| ML06 | 61 | KKA047_3_MAC | ML3 ❌ | ML6 |
| MR01 | 13 | KKA047_1_MAC | MR1 | MR1 |
| MR04 | 43 | KKA047_1_MAC | MR1 ❌ | MR4 |
| TE04 / TF04 | 44 / 45 | KKA047_1_MAC | TE1 / TF1 ❌ | TE4 / TF4 |
| ML05 / MR05 / TE05 / TF05 | 51 / 53 / 54 / 55 | KKA047_2_MAC | ML2 / MR2 / TE2 / TF2 ❌ | ML5 / MR5 / TE5 / TF5 |

Dampak: semua KPI per carrier salah untuk site seperti ini (SUM digabung; KPI rata-rata seperti PRB/CQI dirata-rata antar dua cell), di Daily **dan** Hourly.

## Perbaikan yang diminta

1. Ubah `get_clean_carrier_label` di `backend/app/queries.py` agar angka di label = **sektor fisik dari ci**, bukan sektor logis:
   - sektor fisik = semua digit ci kecuali digit terakhir (`str(int(ci))[:-1]`): 31 → 3, 61 → 6, 43 → 4.
   - Tambah parameter `ci` (opsional). Jika ci kosong/tidak valid, ambil angka dari suffix nama cell (`ML06` → 6, `MR04` → 4);
     jika itu juga gagal, baru pakai `sector` logis seperti sekarang.
   - Kode band (`ML`, `MR`, `MT`, `TE`, …) tetap diambil dari suffix nama cell seperti sekarang.
2. Perbarui semua pemanggilnya agar mengirim ci:
   - `backend/app/queries.py` baris ±111, ±143 (dari `r['ci']`), ±317 (tidak ada ci → `None`, fallback ke nama).
   - `backend/app/queries_daily.py` baris ±857, ±895 (dari `r['ci']`), ±1086 (dari `cid`).
3. **Jangan ubah** cara menentukan sektor chart (`meta['sector']` dari `"sec new type"`): ML06 tetap tampil di chart **Sector 3**, hanya labelnya jadi `ML6`.
4. Pengaman: jika dalam satu sektor masih ada dua cell berbeda dengan label sama, jangan digabung — beri label unik
   (mis. tambahkan ci: `ML3_61`). Kunci carrier harus unik per cell.
5. Warna/band tidak berubah: band tetap dari `lte_band()` di `backend/app/bands.py`, `carrier_bands[label]` tetap terisi.

Jangan refactor bagian lain, jangan ubah format response API, jangan ubah frontend kecuali perlu.

## Verifikasi (wajib)

1. Daily 4G, site KKA047, range 24 Okt–07 Nov 2026:
   - Sector 3 menampilkan `L900 MT3`, `L1800 ML3`, `L1800 ML6`, `L2100 MR3` (4 garis + Total).
   - Sector 1 menampilkan MR1 **dan** MR4 terpisah; Sector 2 menampilkan ML2 dan ML5 terpisah.
   - **Total Payload per sektor tidak berubah** dibanding sebelum fix (hanya dipecah, bukan berubah nilai).
   - Nilai ML3 + ML6 ≈ nilai `L1800 ML3` lama per tanggal.
2. Hourly 4G site KKA047: label sama seperti poin 1.
3. Site biasa tanpa sektor 4/5/6 (mis. MRW002): label dan nilai sama persis seperti sebelum fix.
4. Cluster Monitoring dan Export Excel per site tetap jalan (tidak error, kolom carrier ikut label baru).

## Git

Buat branch `fix/carrier-label-collision` dari HEAD sekarang, commit dengan pesan yang menjelaskan bug di atas. Jangan push tanpa konfirmasi user.
