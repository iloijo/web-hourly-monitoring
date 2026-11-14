# netPulse — Network KPI Monitoring Dashboard

Web dashboard pemantauan KPI jaringan (4G Hourly & Daily, 5G, 2G) **netPulse v3.8**, menggunakan data sumber dari **TwoDb** (measHy4g & CellListRCI) via Cloudflare Tunnel (localhost:5434) serta **OneDb**.

---

## 1. Arsitektur & Teknologi

* **Backend**: FastAPI (Python 3.11) + `psycopg2`
* **Frontend**: React 19 + Vite + Tailwind CSS v4 + **Apache ECharts** + Lucide Icons
* **Integrasi Database**:
  * **Primary**: `twodb` (PostgreSQL 16 via Cloudflare Tunnel `localhost:5434`, database name: `twodb`)
  * **Reference / Topology**: `onedb` (PostgreSQL 16 direct `187.127.124.130:5432`)
  * **Kredensial**: disimpan di `backend/.env` (tidak ikut git). Salin dari `backend/.env.example` lalu isi user/password DB dan login dashboard.
* **Metode Derivasi Frekuensi**:
  * Menerapkan aturan dari skill **`Band_LTE`** (digit terakhir `cellId`/`ci`: `L700`, `L900`, `L1800`, `L2100`, `L2300_1`, `L2300_2`, `L2300_3`, `L2600`).

---

## 2. 6 Metrik KPI Utama (Multi-Grid)

1. **Payload (GB)**: `"4G Payload (MByte) AMQ" / 1024.0`
2. **Max RRC User (Users)**: `"Maximum Number of RRC Connection User"`
3. **Availability (%)**: `("Cell Availability Num 4G AMQ" / NULLIF("Cell Availability Denum 4G AMQ", 0)) * 100`
4. **DL PRB (%)**: `("DL PRB Utilization Num AMQ" / NULLIF("DL PRB Utilization Denum AMQ", 0)) * 100`
5. **User DL Thp (Mbps)**: `("User DL Throughput Num AMQ" / NULLIF("User DL Throughput Denum AMQ", 0)) / 1000.0`
6. **CQI**: `"CQI Average AMQ"`

---

## 3. Cara Menjalankan

### A. Menjalankan Dashboard Lokal
Cukup klik ganda file:
```cmd
start_dashboard.bat
```
Atau via terminal:
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```
Buka peramban di: **`http://localhost:8000`**

### B. Meng-onlinekan ke Internet (Cloudflare Tunnel)
Cukup klik ganda file:
```cmd
online_tunnel.bat
```
Cloudflare akan memberikan tautan publik gratis berenkripsi HTTPS (misal: `https://xxxx.trycloudflare.com`) yang bisa langsung diakses dari perangkat mobile atau rekan kerja di luar jaringan lokal.

## Login, User & Hak Akses

* User, role, sesi dan log aktivitas disimpan di `backend/data/netpulse_auth.sqlite3` (SQLite lokal, tidak ikut git). Password di-hash dengan scrypt; token login acak dan kedaluwarsa setelah 30 menit tanpa aktivitas.
* **SuperAdmin pertama** dibuat otomatis saat server start jika database user masih kosong, memakai `DASHBOARD_USER` / `DASHBOARD_PASS` dari `backend/.env`. Setelah itu nilai di `.env` tidak dipakai lagi untuk login (boleh dikosongkan).
* Role bawaan:

  | Role | Akses |
  |---|---|
  | SuperAdmin | Semua menu + halaman **Administrasi** (kelola user, role, hak akses per menu, log aktivitas) |
  | RNO | Semua menu monitoring |
  | OSS/Viewer | Semua menu monitoring kecuali **OKR (CEI)** |

* Hak akses diatur per menu dari halaman Administrasi → *Role & Hak Akses*. Menu yang tidak diizinkan disembunyikan di sidebar, dan API-nya ditolak server (HTTP 403).
* Login dikunci 5 menit setelah 5 kali salah password. SuperAdmin bisa membuka kunci, reset password, atau menonaktifkan user. Setiap user bisa mengganti password sendiri dengan klik namanya di header.
* Lupa password SuperAdmin: hentikan server, hapus `backend/data/netpulse_auth.sqlite3`, isi `DASHBOARD_USER` / `DASHBOARD_PASS`, lalu start ulang (semua user lain ikut terhapus).
