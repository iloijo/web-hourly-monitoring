// Tree-shaken ECharts: only the chart types and components this dashboard uses.
// Add a module here when a chart starts using a new series type or component.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactEChartsCore from 'echarts-for-react/esm/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  TitleComponent, TooltipComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { ClipboardCopy, Image as ImageIcon, Table2 } from 'lucide-react';
import { chartTable, copyImage, copyText, toTsv } from './chartCopy';

echarts.use([
  LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, MarkPointComponent, MarkAreaComponent, GraphicComponent, LabelLayout, CanvasRenderer,
]);

const isDark = () => document.documentElement.classList.contains('dark');

// Right-click menu of a chart: copy the shown data as a table (pastes into Excel) or the chart as an image
function ChartMenu({ menu, onClose, getChart }) {
  const boxRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  useEffect(() => {
    const el = boxRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({
        left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
        top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
      });
    }
    const away = (e) => { if (!boxRef.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);

  const done = (text) => { setMsg(text); setTimeout(onClose, 900); };
  const copyData = async (opts) => {
    const table = chartTable(getChart(), opts.series || null);
    if (!table || !table.rows.length) { done('No data to copy'); return; }
    const ok = await copyText(toTsv(table, opts));
    done(ok ? `Copied ${table.rows.length} rows × ${table.header.length - 1} series` : 'Copy failed');
  };
  const copyPng = async () => {
    const r = await copyImage(getChart(), { background: isDark() ? '#0f172a' : '#ffffff' });
    done(r === 'copied' ? 'Image copied' : 'Image saved as PNG');
  };

  const dark = isDark();
  const item = `w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer ${dark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`;
  return createPortal(
    <div
      ref={boxRef}
      role="menu"
      onContextMenu={e => e.preventDefault()}
      className={`fixed z-[10000] min-w-[220px] rounded-lg border shadow-lg py-1 text-xs ${dark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
      style={pos}
    >
      {msg ? (
        <div className="px-3 py-1.5 font-semibold">{msg}</div>
      ) : (
        <>
          <button type="button" role="menuitem" className={item} onClick={() => copyData({})}>
            <Table2 className="w-3.5 h-3.5 opacity-70" /> Copy data
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => copyData({ decimalComma: true })}
            title="For Excel set to Indonesian number format (1,5 instead of 1.5)">
            <Table2 className="w-3.5 h-3.5 opacity-70" /> Copy data (decimal comma)
          </button>
          {menu.series && (
            <button type="button" role="menuitem" className={item} onClick={() => copyData({ series: menu.series })}>
              <ClipboardCopy className="w-3.5 h-3.5 opacity-70" /> Copy series “{menu.series}”
            </button>
          )}
          <div className={`my-1 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`} />
          <button type="button" role="menuitem" className={item} onClick={copyPng}>
            <ImageIcon className="w-3.5 h-3.5 opacity-70" /> Copy as image
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

export default function ReactECharts({ ref, onEvents, ...props }) {
  const coreRef = useRef(null);
  const hit = useRef(null);       // series under the cursor at the last right-click (from the ECharts event)
  const [menu, setMenu] = useState(null);

  const setRef = useCallback((inst) => {
    coreRef.current = inst;
    if (typeof ref === 'function') ref(inst);
    else if (ref) ref.current = inst;
  }, [ref]);

  // ECharts fires its own contextmenu on the canvas before the DOM event reaches the wrapper
  const events = useMemo(() => ({
    ...onEvents,
    contextmenu: (params, chart) => {
      hit.current = { series: params?.seriesType === 'pie' ? null : params?.seriesName || null, at: Date.now() };
      onEvents?.contextmenu?.(params, chart);
    },
  }), [onEvents]);

  const onContextMenu = (e) => {
    if (!coreRef.current?.getEchartsInstance) return;
    e.preventDefault();
    const h = hit.current && Date.now() - hit.current.at < 300 ? hit.current : null;
    hit.current = null;
    setMenu({ x: e.clientX, y: e.clientY, series: h?.series || null });
  };
  const close = useCallback(() => setMenu(null), []);
  const getChart = useCallback(() => coreRef.current?.getEchartsInstance(), []);

  return (
    <div onContextMenu={onContextMenu} style={{ display: 'contents' }}>
      <ReactEChartsCore echarts={echarts} ref={setRef} onEvents={events} {...props} />
      {menu && <ChartMenu menu={menu} onClose={close} getChart={getChart} />}
    </div>
  );
}
