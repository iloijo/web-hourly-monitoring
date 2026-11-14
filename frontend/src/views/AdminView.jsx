import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  History, KeyRound, Lock, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, Unlock, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { getJson, sendJson } from '../api/client';

const ACTION_LABEL = {
  login: 'Login', login_failed: 'Login gagal', logout: 'Logout', change_password: 'Ganti password sendiri',
  user_create: 'Add user', user_update: 'Update user', user_delete: 'Delete user',
  role_create: 'Add role', role_update: 'Update role', role_delete: 'Delete role',
  bootstrap_superadmin: 'SuperAdmin awal dibuat',
};

const fmtTime = (ts) => (ts ? new Date(ts * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function useStyles(darkMode) {
  return useMemo(() => ({
    card: `rounded-xl border shadow-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`,
    th: `px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400 bg-slate-800/60' : 'text-slate-500 bg-slate-50'}`,
    td: `px-3 py-2 text-xs border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`,
    input: `w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
    }`,
    label: `block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`,
    muted: darkMode ? 'text-slate-400' : 'text-slate-500',
    iconBtn: `p-1.5 rounded-md transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
      darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
    }`,
    primary: 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition',
    ghost: `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
      darkMode ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
    }`,
  }), [darkMode]);
}

function Modal({ title, onClose, darkMode, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-xl border shadow-2xl ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <h2 className="text-sm font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  const cls = notice.type === 'error'
    ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-300'
    : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300';
  return (
    <div className={`flex items-start justify-between gap-3 px-3 py-2 rounded-lg border text-xs font-semibold ${cls}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} className="cursor-pointer opacity-70 hover:opacity-100" aria-label="Tutup pesan"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ------------------------------------------------------------------ Users tab

function UserForm({ user, roles, minLen, onSubmit, onCancel, s }) {
  const isNew = !user;
  const [username, setUsername] = useState(user?.username || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [roleId, setRoleId] = useState(user?.role_id || roles.find(r => !r.is_super)?.id || roles[0]?.id || '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user ? user.is_active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = isNew
        ? { username, full_name: fullName, role_id: roleId, password, is_active: isActive }
        : { full_name: fullName, role_id: roleId, is_active: isActive };
      await onSubmit(body);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={s.label} htmlFor="u-username">Username / ID</label>
        <input id="u-username" className={s.input} value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isNew} required autoComplete="off" />
      </div>
      <div>
        <label className={s.label} htmlFor="u-name">Nama lengkap</label>
        <input id="u-name" className={s.input} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className={s.label} htmlFor="u-role">Role</label>
        <select id="u-role" className={s.input} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {isNew && (
        <div>
          <label className={s.label} htmlFor="u-pass">Password awal (min. {minLen} karakter)</label>
          <input id="u-pass" type="password" className={s.input} value={password} onChange={(e) => setPassword(e.target.value)} minLength={minLen} required autoComplete="new-password" />
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Akun aktif
      </label>
      {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={s.ghost}>Cancel</button>
        <button type="submit" disabled={busy} className={s.primary}><Save className="w-3.5 h-3.5" />{busy ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, minLen, onSubmit, onCancel, s }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ password });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className={`text-xs ${s.muted}`}>New password for <b>{user.username}</b>. This user's login sessions will be ended.</p>
      <input type="password" className={s.input} value={password} onChange={(e) => setPassword(e.target.value)} minLength={minLen} required autoComplete="new-password" aria-label="Password baru" placeholder={`Min. ${minLen} karakter`} />
      {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={s.ghost}>Cancel</button>
        <button type="submit" disabled={busy} className={s.primary}><KeyRound className="w-3.5 h-3.5" />Reset password</button>
      </div>
    </form>
  );
}

function UsersTab({ authUser, roles, minLen, darkMode, s, notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // { kind: 'new' | 'edit' | 'reset' | 'delete', user }
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getJson('/api/admin/users')
      .then((d) => setUsers(d.users || []))
      .catch((e) => notify('error', e.message))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);

  const save = async (method, path, body, okText) => {
    const d = await sendJson(method, path, body);
    if (d.users) setUsers(d.users);
    setDialog(null);
    notify('ok', okText);
  };

  const quick = async (u, body, okText) => {
    try {
      await save('PUT', `/api/admin/users/${u.id}`, body, okText);
    } catch (e) {
      notify('error', e.message);
    }
  };

  const shown = users.filter(u => !query || `${u.username} ${u.full_name} ${u.role_name}`.toLowerCase().includes(query.toLowerCase()));
  const close = () => setDialog(null);

  return (
    <div className={s.card}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <input className={`${s.input} !py-1.5 !text-xs w-56`} placeholder="Search username, name, role" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
          <button type="button" onClick={load} className={s.ghost} title="Muat ulang"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <button type="button" onClick={() => setDialog({ kind: 'new' })} className={s.primary}><Plus className="w-3.5 h-3.5" />Add user</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={s.th}>Username</th>
              <th className={s.th}>Nama</th>
              <th className={s.th}>Role</th>
              <th className={s.th}>Status</th>
              <th className={s.th}>Login terakhir</th>
              <th className={`${s.th} text-right`}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const self = u.id === authUser?.id;
              return (
                <tr key={u.id}>
                  <td className={`${s.td} font-bold`}>{u.username}{self && <span className={`ml-1.5 text-[10px] font-semibold ${s.muted}`}>(Anda)</span>}</td>
                  <td className={s.td}>{u.full_name || '—'}</td>
                  <td className={s.td}>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${u.is_super ? 'bg-violet-600 text-white' : darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>{u.role_name}</span>
                  </td>
                  <td className={s.td}>
                    {u.locked
                      ? <span className="text-amber-500 font-bold">Terkunci</span>
                      : u.is_active ? <span className="text-emerald-500 font-bold">Active</span> : <span className="text-rose-500 font-bold">Inactive</span>}
                  </td>
                  <td className={`${s.td} ${s.muted}`}>{fmtTime(u.last_login_at)}</td>
                  <td className={`${s.td} text-right whitespace-nowrap`}>
                    <button type="button" className={s.iconBtn} title="Edit" onClick={() => setDialog({ kind: 'edit', user: u })}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className={s.iconBtn} title="Reset password" onClick={() => setDialog({ kind: 'reset', user: u })}><KeyRound className="w-3.5 h-3.5" /></button>
                    {u.locked && (
                      <button type="button" className={s.iconBtn} title="Buka kunci" onClick={() => quick(u, { unlock: true }, `${u.username} dibuka kuncinya.`)}><Unlock className="w-3.5 h-3.5" /></button>
                    )}
                    <button
                      type="button" className={s.iconBtn} disabled={self}
                      title={u.is_active ? 'Deactivate' : 'Activate'}
                      onClick={() => quick(u, { is_active: !u.is_active }, `${u.username} ${u.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`)}
                    >
                      {u.is_active ? <UserX className="w-3.5 h-3.5 text-amber-500" /> : <UserCheck className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                    <button type="button" className={s.iconBtn} disabled={self} title="Delete" onClick={() => setDialog({ kind: 'delete', user: u })}><Trash2 className="w-3.5 h-3.5 text-rose-500" /></button>
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} className={`${s.td} text-center ${s.muted}`}>Tidak ada user.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'new' && (
        <Modal title="Add user"onClose={close} darkMode={darkMode}>
          <UserForm roles={roles} minLen={minLen} s={s} onCancel={close}
            onSubmit={(body) => save('POST', '/api/admin/users', body, `User ${body.username} ditambahkan.`)} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title={`Edit ${dialog.user.username}`} onClose={close} darkMode={darkMode}>
          <UserForm user={dialog.user} roles={roles} minLen={minLen} s={s} onCancel={close}
            onSubmit={(body) => save('PUT', `/api/admin/users/${dialog.user.id}`, body, `${dialog.user.username} disimpan.`)} />
        </Modal>
      )}
      {dialog?.kind === 'reset' && (
        <Modal title="Reset password" onClose={close} darkMode={darkMode}>
          <ResetPasswordForm user={dialog.user} minLen={minLen} s={s} onCancel={close}
            onSubmit={(body) => save('PUT', `/api/admin/users/${dialog.user.id}`, body, `Password ${dialog.user.username} direset.`)} />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <Modal title="Delete user" onClose={close} darkMode={darkMode}>
          <p className="text-sm mb-4">Permanently delete user <b>{dialog.user.username}</b>? To block access temporarily, use Deactivate instead.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className={s.ghost}>Cancel</button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              onClick={() => save('DELETE', `/api/admin/users/${dialog.user.id}`, undefined, `${dialog.user.username} dihapus.`).catch((e) => { close(); notify('error', e.message); })}
            >
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Roles tab

function RolesTab({ roles, menus, setRoles, darkMode, s, notify }) {
  // Edited permissions per role id (only roles the SuperAdmin touched)
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const permsOf = (r) => draft[r.id] ?? r.permissions;
  const dirtyIds = Object.keys(draft).filter((id) => {
    const r = roles.find((x) => x.id === id);
    return r && [...draft[id]].sort().join() !== [...r.permissions].sort().join();
  });

  const toggle = (role, menuId) => {
    const cur = permsOf(role);
    const next = cur.includes(menuId) ? cur.filter((m) => m !== menuId) : [...cur, menuId];
    setDraft((d) => ({ ...d, [role.id]: next }));
  };

  const saveAll = async () => {
    setBusy(true);
    try {
      let latest = roles;
      for (const id of dirtyIds) {
        const d = await sendJson('PUT', `/api/admin/roles/${id}`, { permissions: draft[id] });
        latest = d.roles;
      }
      setRoles(latest);
      setDraft({});
      notify('ok', 'Access rights saved. Affected users see the change after reloading the page.');
    } catch (e) {
      notify('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const addRole = async (e) => {
    e.preventDefault();
    try {
      const d = await sendJson('POST', '/api/admin/roles', { name: newName, description: newDesc, permissions: ['overview'] });
      setRoles(d.roles);
      setAdding(false);
      setNewName('');
      setNewDesc('');
      notify('ok', `Role ${newName} added. Tick the menus it may access, then Save.`);
    } catch (err) {
      notify('error', err.message);
    }
  };

  const deleteRole = async (r) => {
    setConfirmDelete(null);
    try {
      const d = await sendJson('DELETE', `/api/admin/roles/${r.id}`);
      setRoles(d.roles);
      setDraft(({ [r.id]: _drop, ...rest }) => rest);
      notify('ok', `Role ${r.name} dihapus.`);
    } catch (e) {
      notify('error', e.message);
    }
  };

  // Menus grouped like the sidebar
  const groups = menus.reduce((acc, m) => {
    (acc[m.group] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className={s.card}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <p className={`text-xs ${s.muted}`}>Tick the menus each role may open. SuperAdmin always has full access.</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAdding(true)} className={s.ghost}><Plus className="w-3.5 h-3.5" />Add role</button>
          <button type="button" onClick={saveAll} disabled={busy || dirtyIds.length === 0} className={s.primary}>
            <Save className="w-3.5 h-3.5" />{busy ? 'Saving...' : `Save${dirtyIds.length ? ` (${dirtyIds.length})` : ''}`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={s.th}>Menu</th>
              {roles.map((r) => (
                <th key={r.id} className={`${s.th} text-center`}>
                  <div className="flex items-center justify-center gap-1">
                    <span>{r.name}</span>
                    {!r.builtin && (
                      <button type="button" className={s.iconBtn} title={`Delete role ${r.name}`} onClick={() => setConfirmDelete(r)}>
                        <Trash2 className="w-3 h-3 text-rose-500" />
                      </button>
                    )}
                  </div>
                  <div className="normal-case font-medium tracking-normal">{r.user_count} user</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, items]) => items.map((m, i) => (
              <tr key={m.id}>
                <td className={s.td}>
                  {i === 0 && <div className={`text-[10px] font-bold uppercase tracking-wider ${s.muted}`}>{group}</div>}
                  <span className="font-semibold">{m.label}</span>
                </td>
                {roles.map((r) => {
                  const checked = r.is_super || permsOf(r).includes(m.id);
                  return (
                    <td key={r.id} className={`${s.td} text-center`}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed accent-blue-600"
                        checked={checked}
                        disabled={r.is_super}
                        onChange={() => toggle(r, m.id)}
                        aria-label={`${r.name}: ${m.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="Add role"onClose={() => setAdding(false)} darkMode={darkMode}>
          <form onSubmit={addRole} className="space-y-3">
            <div>
              <label className={s.label} htmlFor="r-name">Nama role</label>
              <input id="r-name" className={s.input} value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div>
              <label className={s.label} htmlFor="r-desc">Deskripsi</label>
              <input id="r-desc" className={s.input} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className={s.ghost}>Cancel</button>
              <button type="submit" className={s.primary}><Plus className="w-3.5 h-3.5" />Add</button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete role" onClose={() => setConfirmDelete(null)} darkMode={darkMode}>
          <p className="text-sm mb-4">Delete role <b>{confirmDelete.name}</b>? A role still assigned to users cannot be deleted.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(null)} className={s.ghost}>Cancel</button>
            <button type="button" onClick={() => deleteRole(confirmDelete)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Audit tab

function AuditTab({ darkMode, s, notify }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    getJson('/api/admin/audit', { limit: 300 })
      .then((d) => setEntries(d.entries || []))
      .catch((e) => notify('error', e.message))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);

  return (
    <div className={s.card}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <p className={`text-xs ${s.muted}`}>Last 300 activities: logins, user and role changes.</p>
        <button type="button" onClick={load} className={s.ghost}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang</button>
      </div>
      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0">
            <tr>
              <th className={s.th}>Waktu</th>
              <th className={s.th}>Oleh</th>
              <th className={s.th}>Aksi</th>
              <th className={s.th}>Target</th>
              <th className={s.th}>Detail</th>
              <th className={s.th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className={`${s.td} whitespace-nowrap ${s.muted}`}>{fmtTime(e.ts)}</td>
                <td className={`${s.td} font-semibold`}>{e.actor}</td>
                <td className={`${s.td} ${e.action === 'login_failed' ? 'text-rose-500 font-semibold' : ''}`}>{ACTION_LABEL[e.action] || e.action}</td>
                <td className={s.td}>{e.target || '—'}</td>
                <td className={`${s.td} ${s.muted}`}>{e.detail || '—'}</td>
                <td className={`${s.td} ${s.muted} font-mono`}>{e.ip || '—'}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className={`${s.td} text-center ${s.muted}`}>Belum ada aktivitas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

const TABS = [
  { id: 'users', label: 'User', Icon: Users },
  { id: 'roles', label: 'Roles & Access', Icon: ShieldCheck },
  { id: 'audit', label: 'Log Aktivitas', Icon: History },
];

// Administrasi: SuperAdmin manages user accounts, roles and per-menu privileges
export default function AdminView({ authUser, darkMode }) {
  const s = useStyles(darkMode);
  const [tab, setTab] = useState('users');
  const [roles, setRoles] = useState([]);
  const [menus, setMenus] = useState([]);
  const [minLen, setMinLen] = useState(8);
  const [notice, setNotice] = useState(null);
  const notify = useCallback((type, text) => setNotice({ type, text }), []);

  useEffect(() => {
    getJson('/api/admin/roles')
      .then((d) => {
        setRoles(d.roles || []);
        setMenus(d.menus || []);
      })
      .catch((e) => notify('error', e.message));
    getJson('/api/admin/meta').then((d) => setMinLen(d.min_password_len || 8)).catch(() => {});
  }, [notify]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`flex items-center p-0.5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`} role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                tab === id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
        <span className={`text-[11px] flex items-center gap-1 ${s.muted}`}>
          <Lock className="w-3 h-3" /> Hanya SuperAdmin. Semua perubahan tercatat di Log Aktivitas.
        </span>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {tab === 'users' && <UsersTab authUser={authUser} roles={roles} minLen={minLen} darkMode={darkMode} s={s} notify={notify} />}
      {tab === 'roles' && <RolesTab roles={roles} menus={menus} setRoles={setRoles} darkMode={darkMode} s={s} notify={notify} />}
      {tab === 'audit' && <AuditTab darkMode={darkMode} s={s} notify={notify} />}
    </div>
  );
}
