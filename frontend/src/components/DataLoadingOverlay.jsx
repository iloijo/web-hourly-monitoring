import React, { useState, useEffect, useRef } from 'react';

// Build rich geodesic Fibonacci sphere mesh (88 nodes) matching netpulse_animated_welcoming_login_portal.html
const NUM_VERTS = 88;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const SPHERE_VERTICES = [];
const SPHERE_EDGES = [];

for (let i = 0; i < NUM_VERTS; i++) {
  const theta = (2 * Math.PI * i) / GOLDEN_RATIO;
  const phi = Math.acos(1 - (2 * (i + 0.5)) / NUM_VERTS);
  SPHERE_VERTICES.push({
    x: Math.cos(theta) * Math.sin(phi),
    y: Math.sin(theta) * Math.sin(phi),
    z: Math.cos(phi),
  });
}

for (let i = 0; i < NUM_VERTS; i++) {
  for (let j = i + 1; j < NUM_VERTS; j++) {
    const dx = SPHERE_VERTICES[i].x - SPHERE_VERTICES[j].x;
    const dy = SPHERE_VERTICES[i].y - SPHERE_VERTICES[j].y;
    const dz = SPHERE_VERTICES[i].z - SPHERE_VERTICES[j].z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.5) {
      SPHERE_EDGES.push([i, j]);
    }
  }
}

/**
 * NetPulse Animated Welcoming & Loading Overlay
 * Exact 1:1 implementation matching c:\Users\Lenovo\Downloads\netpulse_animated_welcoming_login_portal.html:
 * - Transparent blur backdrop (rgba(10, 22, 58, 0.40) + backdrop-filter: blur(20px))
 * - Ambient radial glowing cyan/blue blur orbs
 * - Pure transparent 3D rotating geodesic Fibonacci sphere on canvas (#loadingSphereCanvas)
 * - Percentage loading indicator (#loadingPercentText)
 * - Brand heading in Orbitron font with cyan drop-shadow (NETPULSE)
 */
export default function DataLoadingOverlay({
  progress: externalProgress,
}) {
  const [internalProgress, setInternalProgress] = useState(15);
  const canvasRef = useRef(null);

  // Smooth realistic progress animation
  useEffect(() => {
    if (typeof externalProgress === 'number') return;

    const timer = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= 96) return 96;
        const step = Math.max(0.8, (97 - prev) * 0.08);
        return Math.min(96, prev + step);
      });
    }, 70);

    return () => clearInterval(timer);
  }, [externalProgress]);

  const currentProgress = typeof externalProgress === 'number' ? externalProgress : internalProgress;

  // Render 3D Rotating Sphere on Canvas (identical to netpulse_animated_welcoming_login_portal.html)
  useEffect(() => {
    let animId;
    let loadingRotY = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const lCtx = canvas.getContext('2d');
      if (!lCtx) return;

      const lw = canvas.width;
      const lh = canvas.height;
      if (lw === 0 || lh === 0) return;

      const lcx = lw * 0.5;
      const lcy = lh * 0.5;
      const lRadius = lw * 0.41;

      lCtx.clearRect(0, 0, lw, lh);
      loadingRotY += 0.014;
      const loadingRotX = 0.22 + Math.sin(loadingRotY * 0.5) * 0.08;

      const lProj = SPHERE_VERTICES.map((v) => {
        const x1 = v.x * Math.cos(loadingRotY) - v.z * Math.sin(loadingRotY);
        const z1 = v.z * Math.cos(loadingRotY) + v.x * Math.sin(loadingRotY);
        const y2 = v.y * Math.cos(loadingRotX) - z1 * Math.sin(loadingRotX);
        const z2 = z1 * Math.cos(loadingRotX) + v.y * Math.sin(loadingRotX);
        const sc = 2.7 / (2.7 - z2 * 0.62);
        return { px: lcx + x1 * lRadius * sc, py: lcy + y2 * lRadius * sc, z: z2 };
      });

      // 1. Draw 3D wireframe struts
      lCtx.lineWidth = 1.3;
      for (let k = 0; k < SPHERE_EDGES.length; k++) {
        const [i, j] = SPHERE_EDGES[k];
        const p1 = lProj[i];
        const p2 = lProj[j];
        const avgZ = (p1.z + p2.z) * 0.5;
        const alpha = Math.max(0.10, (avgZ + 1.1) * 0.36);
        lCtx.strokeStyle = avgZ > 0.2
          ? `rgba(0, 230, 255, ${alpha})`
          : `rgba(96, 165, 250, ${alpha})`;
        lCtx.beginPath();
        lCtx.moveTo(p1.px, p1.py);
        lCtx.lineTo(p2.px, p2.py);
        lCtx.stroke();
      }

      // 2. Draw 3D sphere vertices/nodes with glowing front depth
      for (let i = 0; i < lProj.length; i++) {
        const p = lProj[i];
        const alpha = Math.max(0.18, (p.z + 1.1) * 0.52);
        const rNode = p.z > 0.25 ? 3.8 : 2.2;
        lCtx.save();
        lCtx.beginPath();
        lCtx.arc(p.px, p.py, rNode, 0, Math.PI * 2);
        if (p.z > 0.35) {
          lCtx.fillStyle = `rgba(103, 232, 249, ${alpha})`;
          lCtx.shadowColor = '#00f2fe';
          lCtx.shadowBlur = 10;
        } else {
          lCtx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
          lCtx.shadowBlur = 0;
        }
        lCtx.fill();
        lCtx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      id="splashOverlay"
      style={{
        background: 'rgba(10, 22, 58, 0.40)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 select-none transition-all duration-500 overflow-hidden"
      role="status"
      aria-label="Loading..."
    >
      {/* Ambient background glowing orbs matching netpulse_animated_welcoming_login_portal.html */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-400/20 blur-[130px] pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] rounded-full bg-blue-500/25 blur-[150px] pointer-events-none" />
      <div className="absolute -bottom-32 right-10 w-[28rem] h-[28rem] rounded-full bg-blue-400/25 blur-[140px] pointer-events-none" />

      {/* Main Loading Stage Card (#loadingMainCard) */}
      <div
        id="loadingMainCard"
        className="relative z-10 flex flex-col items-center justify-center w-full max-w-lg px-6 py-6 rounded-3xl transition-all duration-300"
      >
        {/* Pure Transparent 3D Rotating Sphere Loader Container (#loadingCanvasBox) */}
        <div
          id="loadingCanvasBox"
          className="relative w-80 h-80 sm:w-96 sm:h-96 flex items-center justify-center cursor-pointer"
          title="NetPulse Loading"
        >
          {/* Pure Transparent 3D Rotating Sphere Canvas */}
          <canvas
            ref={canvasRef}
            width={384}
            height={384}
            className="w-full h-full bg-transparent relative z-10"
          />

          {/* Percentage Readout (#loadingPercentText) centered inside 3D sphere */}
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <span
              id="loadingPercentText"
              className="font-brand text-3xl sm:text-4xl font-extrabold tracking-wider text-white drop-shadow-[0_0_16px_rgba(0,242,254,0.9)]"
            >
              {Math.round(currentProgress)}%
            </span>
          </div>
        </div>

        {/* Brand Title in Loading Screen */}
        <div className="mt-2 text-center">
          <div className="font-brand text-2xl sm:text-3xl font-extrabold tracking-widest text-white drop-shadow-[0_0_18px_rgba(0,242,254,0.5)]">
            NETPULSE
          </div>
        </div>
      </div>
    </div>
  );
}
