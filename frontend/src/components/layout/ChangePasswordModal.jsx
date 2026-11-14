import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, KeyRound, X } from 'lucide-react';
import { postJson } from '../../api/client';

// Lets the logged-in user change their own password (old password required)
export default function ChangePasswordModal({ onClose, darkMode }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPw !== confirmPw) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }
    setBusy(true);
    try {
      await postJson('/api/me/password', { old_password: oldPw, new_password: newPw });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Gagal mengganti password.');
    } finally {
      setBusy(false);
    }
  };

  const input = `w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
  }`;
  const label = `block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={onClose}>
      <div
        className={`w-full max-w-sm rounded-xl border shadow-2xl ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pw-title"
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <h2 id="change-pw-title" className="text-sm font-bold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-500" /> Ganti password
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-4 space-y-3">
            <p className="text-sm flex items-center gap-2 text-emerald-500 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Password berhasil diganti.
            </p>
            <button type="button" onClick={onClose} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer">
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 space-y-3">
            <div>
              <label className={label} htmlFor="pw-old">Password lama</label>
              <input id="pw-old" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="pw-new">Password baru (min. 8 karakter)</label>
              <input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="pw-confirm">Ulangi password baru</label>
              <input id="pw-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={input} required />
            </div>
            {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold cursor-pointer">
              {busy ? 'Menyimpan...' : 'Simpan password'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
