// Trend chart tooltips: keep the box beside the cursor, on the half of the chart away from it and near the top,
// so the lines under the mouse stay visible. Used as ECharts tooltip.position.
export function sideTooltipPosition(point, _params, _dom, _rect, size) {
  const [x] = point;
  const [boxW] = size.contentSize;
  const [viewW] = size.viewSize;
  const gap = 18;
  const left = x < viewW / 2 ? x + gap : x - boxW - gap;
  return [Math.max(4, Math.min(left, viewW - boxW - 4)), 8];
}

// See-through background: the chart behind the box stays readable
export const TOOLTIP_BG = 'rgba(15, 23, 42, 0.78)';
