import React from 'react';

/**
 * Exact Apache ECharts graphic-loading animation:
 * https://echarts.apache.org/examples/en/editor.html?c=graphic-loading
 * 
 * 7 rectangles (width: 10px, height: 80px, spacing: 20px) in #5470c6
 * Animated wave: scaleY 1 -> 0.3 -> 1 with cubicIn/cubicOut easing, delay i * 200ms
 * Rendered purely and cleanly with zero extra frills ("sama persis tidak usah ada embel2 lain").
 */
export default function DataLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 dark:bg-slate-950/70 backdrop-blur-[2px] transition-opacity duration-200 select-none pointer-events-auto">
      <svg 
        width="130" 
        height="80" 
        viewBox="0 0 130 80" 
        className="overflow-visible"
        aria-label="Loading..."
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            x={i * 20}
            y="0"
            width="10"
            height="80"
            fill="#5470c6"
            className="echarts-loading-bar"
            style={{
              animationDelay: `${i * 0.2}s`
            }}
          />
        ))}
      </svg>
    </div>
  );
}
