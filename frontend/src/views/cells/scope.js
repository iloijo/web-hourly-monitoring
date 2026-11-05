// Query params for the location scope
export const scopeParams = (f) => ({
  scope: f.scope,
  nops: f.scope === 'nop' ? f.nops : undefined,
  cities: f.scope === 'city' ? f.cities : undefined,
  kecamatans: f.scope === 'kecamatan' ? f.kecamatans : undefined,
});

export const scopeLabel = (f) => {
  if (f.scope === 'nop') return f.nops.join(', ') || '-';
  if (f.scope === 'city') return f.cities.join(', ') || '-';
  if (f.scope === 'kecamatan') return f.kecamatans.join(', ') || '-';
  return 'Region Sulawesi';
};
