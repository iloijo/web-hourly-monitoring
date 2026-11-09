# Warna chart: band LTE harus jelas berbeda satu sama lain

## Masalah

Di chart sektor (contoh: Max RRC User, UPD223 Sector 3, 06 Nov), warna antar band terlalu mirip:
- L1800 (biru `#3b82f6`) dan L2100 (ungu `#c084fc` / `#9333ea` / `#a855f7`) sulit dibedakan, apalagi di dark mode.
- Varian L1800 (`#0284c7`, `#38bdf8`) mendekati L2300_3 (cyan `#06b6d4`), dan varian L2100 (`#e879f9`, `#d946ef`) mendekati L2600 (pink).
- L700 (kuning-emas) dan L900 (oranye) sama-sama warna hangat.
- Carrier dengan band sama (mis. L1800 VL3, VL6, VL13, VL16) diberi **hue berbeda** dari `BAND_COLOR_VARIANTS`, sehingga
  sebagian varian satu band "menyeberang" ke warna band lain.

Lokasi: `frontend/src/components/SectorPayloadChart.jsx` — `BAND_COLORS`, `BAND_COLOR_VARIANTS`, `getColorForCarrier`,
dan `carrierColorMap` (±baris 218). `TimingAdvanceView.jsx` (±baris 19–45) juga memakai kedua konstanta ini.

## Prinsip baru

1. **Band dibedakan dengan hue** (warna dasar yang jelas berbeda).
2. **Carrier dalam band yang sama dibedakan dengan pola garis + sedikit terang/gelap**, **bukan** dengan hue lain.
   Jadi semua carrier L1800 tetap "biru", tapi garisnya solid / putus-putus / titik-titik.

## Palet band LTE (ganti nilai di `BAND_COLORS`)

| Band | Warna dasar | Catatan |
|---|---|---|
| L1800 | `#4e79a7` biru | |
| L900 | `#f28e2b` oranye | |
| L2100 | `#e15759` merah | dulu ungu; sekarang kontras jelas dengan biru L1800 |
| L2300_1 | `#59a14f` hijau | |
| L2300_2 | `#76b7b2` teal muda | |
| L2300_3 | `#9c755f` cokelat | dulu cyan (mirip biru) |
| L700 | `#edc948` kuning | |
| L2600 (dan L2600_1..4) | `#b07aa1` ungu | |

Ini palet "Tableau 10" yang memang dirancang agar 8–10 warna mudah dibedakan, di light maupun dark mode.

- Semua key L2600_1..L2600_4 pakai warna L2600 yang sama (dibedakan dengan pola garis seperti aturan di bawah).
- **Jangan ubah** warna 5G (NR*, VP1, VQ1, MK1, QP1), 2G (GSM, DCS, G900, G1800, MD1, MG1), dan `ENTITY_PALETTE`.
- Update komentar di atas `BAND_COLORS` agar sesuai (hapus klaim "strictly adhering to Image 7").

## Carrier dengan band yang sama (ganti `BAND_COLOR_VARIANTS`)

Untuk carrier ke-n (urut seperti sekarang) dalam satu band di satu chart:

| n | Warna | Pola garis (`lineStyle.type`) |
|---|---|---|
| 1 | warna dasar band | `solid` |
| 2 | warna dasar sedikit lebih gelap (±15 %) | `dashed` |
| 3 | warna dasar sedikit lebih terang (±15 %) | `dotted` |
| 4 | warna dasar | `[8, 3, 2, 3]` (dash-dot) |
| 5+ | ulangi dari 1, terang/gelap ±25 % | |

- Buat helper (mis. `getCarrierStyle(cName, carrierBands, idxInBand)`) yang mengembalikan `{ color, lineType }`.
  `getColorForCarrier` tetap ada dan mengembalikan `color` dari helper ini (dipakai file lain).
- Varian terang/gelap harus tetap jelas masuk keluarga hue yang sama dan tidak boleh mendekati warna band lain.
- Pola garis diterapkan ke series carrier di `SectorPayloadChart` (`lineStyle.type`). Total Payload, garis threshold, marker tidak berubah.
- Legend: ikon tetap kotak warna; nama carrier sudah membedakan. Tooltip: kotak warna tetap pakai `color` carrier.
- Mode `ENTITY` (agregasi site/NOP/dll.) tidak berubah.

## Timing Advance

`TimingAdvanceView.jsx` memakai `BAND_COLORS` / `BAND_COLOR_VARIANTS` untuk series per CI. Sesuaikan agar memakai
helper yang sama: warna dasar per band, CI kedua dst. dalam band sama dibedakan dengan terang/gelap.
Untuk bar chart (Distribution) pola garis tidak berlaku — cukup terang/gelap (boleh tambah `decal` bila perlu).
Cumulative (garis) pakai pola garis yang sama seperti chart sektor.

## Verifikasi (wajib, di browser, light dan dark mode)

1. Site UPD223 Sector 3, Max RRC User (4G Daily): L900, L1800, L2100, L2300_1 langsung bisa dibedakan dari warnanya;
   VL3/VL6/VL13/VL16 semuanya biru tetapi pola garisnya berbeda; VR3/VR6/VR13/VR16 semuanya merah dengan pola berbeda.
2. Site dengan L2300_3 dan L1800 di sektor yang sama: cokelat vs biru, tidak tertukar.
3. Tooltip dan legend memakai warna yang sama dengan garisnya.
4. 4G Hourly, 4G Daily, 5G, 2G, Cluster Monitoring, Timing Advance 4G: tidak ada error; 5G/2G warnanya tidak berubah.
5. Screenshot sebelum/sesudah untuk satu chart dengan banyak carrier.

## Git

Commit di branch yang sedang aktif (`feat/chart-ux-properties`) dengan pesan yang menjelaskan palet baru. Jangan push tanpa konfirmasi user.
