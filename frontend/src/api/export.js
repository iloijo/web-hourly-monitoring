// Excel export: pages describe sheets, the backend builds the .xlsx
import { getAuthToken } from './client';

// payload: { filename, sheets: [{ name, columns: [..], rows: [[..], ..] }] }
export async function downloadXlsx(payload) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Basic ${token}`;
  }
  const res = await fetch('/api/export/xlsx', {
    method: 'POST',
    headers,
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
