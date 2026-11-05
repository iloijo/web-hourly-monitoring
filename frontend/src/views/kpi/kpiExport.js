// Excel sheets for the KPI monitoring page: every chart point on screen in long format

const chartRows = (timestamps, kpiData, kpiTitle, unit, context) => {
  const rows = [];
  Object.entries(kpiData.carrier_series || {}).forEach(([carrier, values]) => {
    const band = kpiData.carrier_bands?.[carrier];
    (values || []).forEach((v, i) => {
      if (v !== null && v !== undefined) rows.push([timestamps[i], ...context, carrier, band === 'ENTITY' ? '' : band || '', kpiTitle, unit, v]);
    });
  });
  if (kpiData.total_series) {
    kpiData.total_series.forEach((v, i) => {
      if (v !== null && v !== undefined) rows.push([timestamps[i], ...context, 'TOTAL', '', kpiTitle, unit, v]);
    });
  }
  return rows;
};

export function buildKpiExport({ km, activeMenu, sectors, propertyRows, propertyColumns }) {
  const kpiIds = km.activeSelectedKpiIds;
  const catalog = Object.fromEntries(km.activeKpiCatalog.map(k => [k.id, k]));
  const sheets = [];

  if (km.aggregationScope === 'sector' && km.data?.sectors) {
    const rows = [];
    sectors.forEach(s => {
      const sec = km.data.sectors[`sector${s}`];
      if (!sec) return;
      const ts = sec.timestamps || km.data.timestamps || [];
      kpiIds.forEach(id => {
        const kd = sec.kpis?.[id];
        if (kd) rows.push(...chartRows(ts, kd, kd.title || catalog[id]?.label || id, kd.unit || '', [km.siteId, s]));
      });
    });
    sheets.push({ name: 'KPI', columns: ['Time', 'Site', 'Sector', 'Carrier', 'Band', 'KPI', 'Unit', 'Value'], rows });
  } else if (km.aggregationData?.kpis) {
    const ts = km.aggregationData.timestamps || [];
    const rows = [];
    kpiIds.forEach(id => {
      const kd = km.aggregationData.kpis[id];
      if (kd) rows.push(...chartRows(ts, kd, kd.title || id, kd.unit || '', [km.aggregationScope, km.aggregationMode]));
    });
    sheets.push({ name: 'KPI', columns: ['Date', 'Scope', 'Mode', 'Entity / Band', 'Band', 'KPI', 'Unit', 'Value'], rows });
  }

  if (propertyRows?.length) {
    sheets.push({
      name: '4G Properties',
      columns: propertyColumns.map(c => c.label),
      rows: propertyRows.map(r => propertyColumns.map(c => r[c.key])),
    });
  }

  const target = km.aggregationScope === 'sector' ? km.siteId : km.aggregationScope;
  return { filename: `${activeMenu}_${target}_${km.startDate}_${km.endDate}`, sheets };
}
