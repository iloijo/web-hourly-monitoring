/**
 * Accurate legend row calculation via 2D Canvas text measurement.
 * Used to responsively lay out ECharts legends and avoid overlapping X-axis date labels.
 */

let measureCanvas = null;

export function measureTextWidth(text, font = '500 10px Inter, system-ui, sans-serif') {
  if (typeof document === 'undefined') return (text || '').length * 6;
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return (text || '').length * 6;
  ctx.font = font;
  return ctx.measureText(text || '').width;
}

export function legendRowsFor(names, usableWidth) {
  if (!names || names.length === 0) return 0;
  if (!usableWidth || usableWidth <= 0) return 1;

  let rows = 1;
  let currentRowW = 0;

  for (const item of names) {
    const name = typeof item === 'string' ? item : item?.name || '';
    // 10px icon + 5px icon-text gap + measured text width + 14px itemGap
    const itemW = 10 + 5 + measureTextWidth(name) + 14;

    if (currentRowW + itemW > usableWidth && currentRowW > 0) {
      rows += 1;
      currentRowW = itemW;
    } else {
      currentRowW += itemW;
    }
  }

  return rows;
}
