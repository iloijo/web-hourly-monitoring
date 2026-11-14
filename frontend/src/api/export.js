// Excel export: pages describe sheets, the backend builds the .xlsx
import { authHeaders } from './client';

// payload: { filename, sheets: [{ name, columns: [..], rows: [[..], ..] }] }
export async function downloadXlsx(payload) {
  const res = await fetch('/api/export/xlsx', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(payload.filename || 'export').replace(/[^A-Za-z0-9._-]+/g, '_')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Sheet from a list of objects (columns = keys of the first row)
export const objectRowsSheet = (name, rows) => {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { name, columns, rows: rows.map(r => columns.map(c => r[c])) };
};
