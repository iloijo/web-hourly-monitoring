// Area scope of the CEI page: All, or NOP / Kabupaten / Kecamatan picks

export const SCOPES = [['all', 'All'], ['nop', 'NOP'], ['kabupaten', 'Kabupaten'], ['kecamatan', 'Kecamatan']];
export const EMPTY_FILTERS = { scope: 'all', nops: [], kabs: [], kecKab: '', kecs: [] };

// {scope, values} for the API, or null while a scope still has no value picked
export function scopeParams(f) {
  if (f.scope === 'all') return { scope: 'all', values: [] };
  const values = f.scope === 'nop' ? f.nops : f.scope === 'kabupaten' ? f.kabs : f.kecs.map(k => `${f.kecKab}|${k}`);
  return values.length ? { scope: f.scope, values: [...values].sort() } : null;
}

export function scopeLabel(sp) {
  if (!sp || sp.scope === 'all') return 'Region Sulawesi';
  const names = sp.values.map(v => v.split('|').pop());
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}
