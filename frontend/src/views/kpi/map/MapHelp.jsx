import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

// "How to use" summary of the cell map, opened from the toolbar (?).
const SECTIONS = [
  {
    id: 'basic',
    title: 'Dasar',
    items: [
      ['Buka peta', 'Pilih site di 4G Daily / 4G Hourly (scope Sector), lalu klik Map pada tombol kapsul 4G Properties | Map. Lebar panel bisa diubah dengan menyeret tepi kirinya.'],
      ['Basemap', 'OpenStreet, Satellite (Esri) atau Contour (OpenTopoMap, garis kontur ketinggian).'],
      ['Borders', 'Garis batas NOP (ungu), Kabupaten (hitam putus-putus) dan Kecamatan (abu-abu, dari zoom 10). Arahkan kursor ke peta untuk melihat nama NOP / kabupaten / kecamatan di bawah peta. NOP tiap kecamatan diambil dari NOP mayoritas site DESIQA di dalamnya.'],
      ['DESIQA Original / RNO', 'Menu Sites > DESIQA version. Original = raw_desiqa sync mingguan apa adanya. RNO = DESIQA + revisi tim (badge oranye "revised") + edit azimuth/tilt. Tombol DESIQA di popup sektor membuka semua kolom DESIQA site itu (RF / Location / Other): kotak abu-abu = nilai DESIQA, oranye = revisi RNO. Kosongkan kotak untuk kembali ke DESIQA; revisi tertutup otomatis bila DESIQA sudah sama. Export all revisions = daftar RNO vs DESIQA semua site untuk dikirim ke pemilik DESIQA.'],
      ['Horizon', 'Tombol Horizon di popup sektor: tanah yang dikenai sepertiga atas (High, jauh), tengah (Mid, main beam) dan bawah (Low, dekat) dari vertical beam -3 dB, dihitung dari DEM GLO-30 di onedb. Warna makin gelap = tanah tertutup terrain di depannya (0-5, 5-20, 20-50, >50 m). Isi Proposed tilt untuk membandingkan Now vs Proposed. Hitungan pertama per sektor ~15 detik, berikutnya instan.'],
      ['Main site / + 1st tier', 'Hanya site yang dicari, atau ditambah site tier 1 di sekelilingnya (garis putus-putus). Other sites = titik abu-abu site lain dari zoom 11, label site ID kuning dari zoom 14.'],
      ['Sektor', 'Klik sektor untuk melihat properti DESIQA, KPI hari terakhir (BDBH), TA 70/80/90 dan status RCI / CEI / Unbalance. Sektor yang sedang dipilih di chart diberi garis tebal. Cell indoor digambar sebagai lingkaran kecil di site.'],
      ['Crosshair', 'Kembali ke tengah site yang dicari.'],
      ['Go to coordinate', 'Ketik atau paste lat, long (-5.102156, 119.59453; koma desimal juga bisa), DMS, link Google Maps atau geohash (qxhbtbs), lalu Enter. Pin menampilkan sektor yang mengarah ke titik itu, 3 site terdekat dan tombol profile ke pin. Esc atau × menghapus pin.'],
    ],
  },
  {
    id: 'color',
    title: 'Warna, TA dan Covmo',
    items: [
      ['Colour by', 'Band, DL PRB, User DL Thp, RCI, CEI atau Unbalance. Legenda kanan bawah menunjukkan arti warna dan minggu/tanggal datanya.'],
      ['TA70 / TA80 / TA90', 'Panjang sektor mengikuti jarak TA cell tersebut. Garis titik-titik = cell tanpa data TA. Cell indoor menjadi cincin putus-putus (TA jauh di luar gedung = indikasi leakage).'],
      ['TA70 / ISD', 'Warna sektor (menu Sectors → TA70 / ISD) dan baris ISD di popup: ISD = jarak ke site 4G terdekat di depan azimuth (±60°, lalu ±90°; site < 50 m, indoor, Combat dan micro dilewati). TA70 / ISD < 0.3 Undershooting, 0.3–1.0 Normal, 1.0–1.3 Overlap, > 1.3 Overshooting; tanpa site di depan = End Cell. Saat popup sektor terbuka, garis putus-putus menunjuk site ISD-nya.'],
      ['Opacity', 'Transparansi isi sektor.'],
      ['Covmo RSRP / RSRQ', 'Grid MR (~38 m) hanya untuk area yang terlihat, mulai zoom 13. Default minggu terakhir; pilih minggu sebelumnya di dropdown Week untuk membandingkan (misal sebelum vs sesudah reazimuth). Arahkan kursor ke grid untuk nilai dan jumlah MR.'],
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    items: [
      ['Ruler', 'Klik titik-titik di peta, double-click atau Esc untuk selesai. Ikon tempat sampah menghapus ukuran.'],
      ['Profile', 'Klik titik-titik, double-click untuk selesai (maks 20 km). Panel bawah menampilkan profil terrain (+ lengkung bumi k=4/3), garis LOS, Fresnel zone 1 dan jarak blokir. Dari popup sektor, tombol Profile membuat profil sepanjang azimuth dengan main beam dan batas -3 dB dari tilt cell (titik beam menyentuh tanah ditandai). Tinggi antena, UE, tilt dan V-BW bisa diubah di panel. Sumber DEM: OpenTopoData SRTM 30 m, cadangan Copernicus GLO-30 di onedb.'],
      ['Protractor (Reazimuth)', 'Klik peta untuk meletakkan busur derajat; di dekat site ia menempel ke site dan memuat satu jarum per sektor. Tombol Reazimuth di popup langsung memasang protractor di site itu. Seret jarum untuk memutar, ujung jarum untuk panjang, pusat untuk memindah (Shift = bebas, tidak menempel), roda mouse di cincin untuk ukuran, double-click di dalam cincin untuk menggambar garis. Δ = selisih dari azimuth sekarang; → menunjukkan site yang berada di dalam beam. Ikon gunung = profil azimuth baru vs lama.'],
      ['Shortcut protractor', 'S = snap 5°, R = kembalikan ke azimuth asli, Esc = batal gambar garis.'],
    ],
  },
  {
    id: 'edit',
    title: 'Edit azimuth / tilt (RNO)',
    items: [
      ['Siapa', 'Role yang punya hak "Edit Azimuth/Tilt (Cell Map)" — default RNO dan SuperAdmin. Admin bisa mengatur hak ini di menu Administrasi → Role.'],
      ['Edit', 'Klik sektor → Edit → isi Azimuth, M-Tilt, E-Tilt dan catatan (alasan, MOP, tiket) → Save. Editan langsung berlaku di peta, profil dan protractor. Centang "Azimuth also for the other cells" untuk menerapkan azimuth ke semua band di sektor yang sama.'],
      ['Dari protractor', 'Setelah jarum sektor diputar, tombol simpan (ikon disket) pada baris jarum menyimpan azimuth baru ke semua cell macro sektor itu.'],
      ['Tanda', 'Sektor yang diedit diberi garis ungu dan label "Edited". Popup menampilkan nilai editan, nilai DESIQA, siapa dan kapan.'],
      ['Selesai otomatis', 'DESIQA diganti tiap minggu. Begitu DESIQA memuat nilai yang sama dengan editan, editan itu selesai sendiri (status "DESIQA updated"). Jika DESIQA berubah ke nilai lain, popup memberi peringatan.'],
      ['Reset', 'Tombol Reset menghapus editan dan cell kembali mengikuti DESIQA. Semua perubahan tersimpan di History (aktif, diganti, reset, DESIQA updated).'],
    ],
  },
];

export function HelpButton({ onClick, active, darkMode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="How to use the cell map"
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
      }`}
    >
      <HelpCircle className="w-3.5 h-3.5" /> Help
    </button>
  );
}

export default function MapHelp({ open, onClose, darkMode }) {
  const [tab, setTab] = useState('basic');
  if (!open) return null;
  const section = SECTIONS.find(s => s.id === tab) || SECTIONS[0];
  const shell = darkMode ? 'bg-slate-900/97 border-slate-700 text-slate-200' : 'bg-white/97 border-slate-200 text-slate-700';
  return (
    <div className={`absolute top-2 left-12 z-[660] w-[min(420px,calc(100%-4rem))] max-h-[calc(100%-1rem)] flex flex-col rounded-lg border shadow-xl text-[11px] ${shell}`}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-500/20">
        <HelpCircle className="w-4 h-4 text-blue-500" />
        <span className="font-bold uppercase tracking-wider">How to use · Cell Map</span>
        <button type="button" onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setTab(s.id)}
            className={`px-2 py-0.5 rounded-full border font-semibold cursor-pointer ${
              tab === s.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-500/30 hover:bg-slate-500/10'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>
      <dl className="px-3 py-2 overflow-auto space-y-1.5 leading-snug">
        {section.items.map(([term, text]) => (
          <div key={term}>
            <dt className="font-bold">{term}</dt>
            <dd className="opacity-80">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
