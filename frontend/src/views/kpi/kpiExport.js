// Excel sheets for the KPI monitoring page: every chart point on screen in long format + Excel charts + Filters metadata
import { filterCarrierKeys, getBandForCarrier, getColorForCarrier } from '../../components/SectorPayloadChart';

export function buildKpiExport({ km, activeMenu, sectors, propertyRows, propertyColumns }) {
  const kpiIds = km.activeSelectedKpiIds || [];
  const catalog = Object.fromEntries((km.activeKpiCatalog || []).map(k => [k.id, k]));
  const bandFilter = km.selectedBands;
  const availableBands = km.data?.available_bands || km.aggregationData?.available_bands || [];

  const sheets = [];
  const charts = [];

  if (km.aggregationScope === 'sector' && km.data?.sectors) {
    const kpiRows = [];
    const activeSectors = (sectors && sectors.length > 0) ? sectors : [Number(km.selectedSector || 1)];

    activeSectors.forEach(s => {
      const sec = km.data.sectors[`sector${s}`];
      if (!sec) return;
      const ts = sec.timestamps || km.data.timestamps || [];

      kpiIds.forEach(id => {
        const kd = sec.kpis?.[id];
        if (!kd) return;

        const kpiTitle = kd.title || catalog[id]?.label || id;
        const unit = kd.unit || '';

        // Extract and sort all carrier keys numerically
        const allCarriers = Object.keys(kd.carrier_series || {}).sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return String(a).localeCompare(String(b), undefined, { numeric: true });
        });

        // Apply identical active band filter as the screen
        const filteredCarriers = filterCarrierKeys(allCarriers, availableBands, kd.carrier_bands, bandFilter);

        // Recalculate dynamic Total strictly based on filtered carriers
        let dynamicTotal = null;
        if (kd.has_total || kd.has_tot) {
          dynamicTotal = ts.map((_, i) => {
            let sum = 0;
            filteredCarriers.forEach(c => {
              const v = kd.carrier_series?.[c]?.[i];
              if (typeof v === 'number') sum += v;
            });
            return Number(sum.toFixed(2));
          });
        }

        // 1. Data rows for KPI sheet: Time, Site, Sector, CI, Cell Name, Band, KPI, Unit, Value
        filteredCarriers.forEach(carrier => {
          const cellName = kd.carrier_names?.[carrier] || sec.carrier_names?.[carrier] || '';
          const rawBand = kd.carrier_bands?.[carrier] || sec.carrier_bands?.[carrier] || getBandForCarrier(carrier, kd.carrier_bands);
          const band = rawBand === 'ENTITY' ? '' : rawBand;
          const vals = kd.carrier_series?.[carrier] || [];
          vals.forEach((v, i) => {
            if (v !== null && v !== undefined) {
              kpiRows.push([ts[i], km.siteId, s, carrier, cellName, band, kpiTitle, unit, v]);
            }
          });
        });

        if (dynamicTotal) {
          dynamicTotal.forEach((v, i) => {
            if (v !== null && v !== undefined) {
              kpiRows.push([ts[i], km.siteId, s, 'TOTAL', 'Total Payload', '', kpiTitle, unit, v]);
            }
          });
        }

        // 2. Chart specification for Charts sheet
        if (filteredCarriers.length > 0 || dynamicTotal) {
          charts.push({
            title: `${kpiTitle} - ${km.siteId} Sector ${s}`,
            unit: unit,
            categories: ts,
            series: filteredCarriers.map((cName, idxInFilter) => {
              const color = getColorForCarrier(cName, kd.carrier_bands || {}, idxInFilter);
              const rawBand = kd.carrier_bands?.[cName] || getBandForCarrier(cName, kd.carrier_bands);
              return {
                name: String(cName),
                band: rawBand,
                color: color,
                values: kd.carrier_series?.[cName] || []
              };
            }),
            total: dynamicTotal ? {
              name: 'Total Payload',
              values: dynamicTotal
            } : undefined
          });
        }
      });
    });

    sheets.push({
      name: 'KPI',
      columns: ['Time', 'Site', 'Sector', 'CI', 'Cell Name', 'Band', 'KPI', 'Unit', 'Value'],
      rows: kpiRows,
      number_formats: { 'Value': '0.00' }
    });

  } else if (km.aggregationData?.kpis) {
    const ts = km.aggregationData.timestamps || [];
    const kpiRows = [];

    kpiIds.forEach(id => {
      const kd = km.aggregationData.kpis[id];
      if (!kd) return;

      const kpiTitle = kd.title || id;
      const unit = kd.unit || '';
      const cEntries = Object.entries(kd.carrier_series || {});

      cEntries.forEach(([carrier, values]) => {
        const band = kd.carrier_bands?.[carrier];
        (values || []).forEach((v, i) => {
          if (v !== null && v !== undefined) {
            kpiRows.push([ts[i], km.aggregationScope, km.aggregationMode, carrier, band === 'ENTITY' ? '' : band || '', kpiTitle, unit, v]);
          }
        });
      });

      if (kd.total_series) {
        kd.total_series.forEach((v, i) => {
          if (v !== null && v !== undefined) {
            kpiRows.push([ts[i], km.aggregationScope, km.aggregationMode, 'TOTAL', '', kpiTitle, unit, v]);
          }
        });
      }

      charts.push({
        title: `${kpiTitle} (${km.aggregationScope.toUpperCase()})`,
        unit: unit,
        categories: ts,
        series: cEntries.map(([cName, vals], idx) => ({
          name: cName,
          band: kd.carrier_bands?.[cName] || 'ENTITY',
          color: getColorForCarrier(cName, kd.carrier_bands || {}, idx),
          values: vals
        })),
        total: kd.total_series ? {
          name: 'Total',
          values: kd.total_series
        } : undefined
      });
    });

    sheets.push({
      name: 'KPI',
      columns: ['Date', 'Scope', 'Mode', 'Entity / Band', 'Band', 'KPI', 'Unit', 'Value'],
      rows: kpiRows,
      number_formats: { 'Value': '0.00' }
    });
  }

  // Charts sheet (if there are charts to export)
  if (charts.length > 0) {
    sheets.push({
      name: 'Charts',
      charts: charts
    });
  }

  // 4G Properties sheet
  if (propertyRows?.length) {
    sheets.push({
      name: '4G Properties',
      columns: propertyColumns.map(c => c.label),
      rows: propertyRows.map(r => propertyColumns.map(c => r[c.key]))
    });
  }

  // Filters sheet
  const sectorsSummary = km.aggregationScope === 'sector'
    ? (km.sectorViewMode === 'sectoral'
        ? (sectors || []).map(s => `Sector ${s}`).join(', ')
        : `Sector ${km.selectedSector}`)
    : 'N/A';

  const bandsSummary = Array.isArray(km.selectedBands)
    ? km.selectedBands.join(', ')
    : (km.selectedBands || 'All');

  sheets.push({
    name: 'Filters',
    columns: ['Filter', 'Value'],
    rows: [
      ['Menu', activeMenu || '4g-hourly'],
      ['Site', km.aggregationScope === 'sector' ? (km.siteId || '-') : km.aggregationScope],
      ['Sectors', sectorsSummary],
      ['Bands', bandsSummary],
      ['Type', km.filterType || 'All'],
      ['KPIs', kpiIds.map(id => catalog[id]?.label || id).join(', ')],
      ['Start', km.startDate || '-'],
      ['End', km.endDate || '-'],
      ['Exported at', new Date().toISOString().replace('T', ' ').slice(0, 19)]
    ]
  });

  const target = km.aggregationScope === 'sector' ? km.siteId : km.aggregationScope;
  return { filename: `${activeMenu}_${target}_${km.startDate}_${km.endDate}`, sheets };
}
