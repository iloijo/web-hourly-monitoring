import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Globe, Key, Lock, Play, Shield, Sparkles, Volume2, VolumeX, ArrowRight, CheckCircle2 } from 'lucide-react';
import { postJson, setAuthSession } from '../api/client';
import DataLoadingOverlay from '../components/DataLoadingOverlay';

const BG_THEMES = {
  sky: {
    name: 'Sky Light',
    pageBg: 'linear-gradient(135deg, #f0f7ff 0%, #dbeafe 52%, #bae6fd 100%)',
    panelBg: 'rgba(255, 255, 255, 0.86)',
    panelBorder: 'rgba(2, 132, 199, 0.28)',
    pillBg: 'rgba(255, 255, 255, 0.88)',
    isLight: true,
    edgeFront: '2, 132, 199',
    edgeBack: '37, 99, 235',
    nodeFront: '3, 105, 161',
    nodeBack: '29, 78, 216',
    pulseColor: '#0284c7',
    pulseCore: '#00f2fe',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
  },
  ocean: {
    name: 'Ocean Blue',
    pageBg: 'linear-gradient(135deg, #0d2863 0%, #154c99 52%, #0e7490 100%)',
    panelBg: 'rgba(14, 38, 92, 0.68)',
    panelBorder: 'rgba(103, 232, 249, 0.35)',
    pillBg: 'rgba(12, 36, 88, 0.72)',
    isLight: false,
    edgeFront: '0, 230, 255',
    edgeBack: '96, 165, 250',
    nodeFront: '103, 232, 249',
    nodeBack: '59, 130, 246',
    pulseColor: '#00f2fe',
    pulseCore: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#cbd5e1',
  },
  teal: {
    name: 'Teal Aurora',
    pageBg: 'linear-gradient(135deg, #0c4a6e 0%, #0f766e 52%, #0d9488 100%)',
    panelBg: 'rgba(13, 58, 72, 0.68)',
    panelBorder: 'rgba(94, 234, 212, 0.35)',
    pillBg: 'rgba(11, 52, 65, 0.72)',
    isLight: false,
    edgeFront: '94, 234, 212',
    edgeBack: '56, 189, 248',
    nodeFront: '153, 246, 228',
    nodeBack: '45, 212, 191',
    pulseColor: '#2dd4bf',
    pulseCore: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#cbd5e1',
  },
  indigo: {
    name: 'Royal Indigo',
    pageBg: 'linear-gradient(135deg, #1e296b 0%, #3730a3 50%, #2563eb 100%)',
    panelBg: 'rgba(30, 34, 96, 0.68)',
    panelBorder: 'rgba(129, 140, 248, 0.38)',
    pillBg: 'rgba(28, 32, 88, 0.72)',
    isLight: false,
    edgeFront: '56, 189, 248',
    edgeBack: '129, 140, 248',
    nodeFront: '103, 232, 249',
    nodeBack: '99, 102, 241',
    pulseColor: '#00f2fe',
    pulseCore: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#cbd5e1',
  },
  navy: {
    name: 'Midnight Dark',
    pageBg: 'linear-gradient(135deg, #05091e 0%, #0a1236 55%, #07102e 100%)',
    panelBg: 'rgba(11, 19, 56, 0.72)',
    panelBorder: 'rgba(0, 242, 254, 0.20)',
    pillBg: 'rgba(10, 18, 52, 0.78)',
    isLight: false,
    edgeFront: '0, 210, 255',
    edgeBack: '29, 111, 242',
    nodeFront: '0, 242, 254',
    nodeBack: '29, 111, 242',
    pulseColor: '#00f2fe',
    pulseCore: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
  },
};

export default function LoginPage({ onLoginSuccess }) {
  // Theme state: DEFAULT is 'sky' (Sky Light Terang) as instructed
  const [themeKey, setThemeKey] = useState('teal');
  // Animation Mode: ONLY 3D Sphere Live and Hologram Scan (No "Gambar 1")
  const [animMode, setAnimMode] = useState('sphere3d'); // 'sphere3d' | 'hologram'
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashText, setSplashText] = useState('Initializing NetPulse Geodesic Core...');

  // Auth Form State
  const [authTab, setAuthTab] = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('ilo');
  const [password, setPassword] = useState('ijo');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 3D Parallax tilt ref
  // 3D Parallax tilt ref & Hero section ref
  const tiltRef = useRef(null);
  const heroSectionRef = useRef(null);

  // Audio Context Ref
  const audioCtxRef = useRef(null);

  // Canvases
  const giantCanvasRef = useRef(null);
  const particleCanvasRef = useRef(null);

  // Animation Engine state
  const animStateRef = useRef({
    rotAngleY: 0,
    rotAngleX: 0.18,
    rotSpeedBoost: 1.0,
    pulseTravelPos: 0.0,
    pulseSpeedMultiplier: 1.0,
    fastPulses: [],
    hologramScanY: 0.2,
    hologramScanSpeed: 0.007,
  });

  const activeTheme = BG_THEMES[themeKey] || BG_THEMES.sky;

  // Sound Synth Generator
  const playPulseBeep = (isSurge = false) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isSurge ? 660 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(isSurge ? 880 : 280, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(isSurge ? 0.12 : 0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {
      // Audio playback suppressed if blocked by user gesture
    }
  };

  // Trigger pulse surge on canvas / background click
  const triggerPulseSurge = () => {
    playPulseBeep(true);
    const st = animStateRef.current;
    st.pulseSpeedMultiplier = 5.2;
    st.rotSpeedBoost = 2.8;
    st.fastPulses.push({
      pos: Math.max(0.0, st.pulseTravelPos - 0.12),
      speed: 0.028,
      intensity: 1.3,
    });
  };

  // Splash Screen Intro runner
  const runSplashIntro = () => {
    setShowSplash(true);
    setSplashProgress(0);
    setSplashText('Initializing NetPulse Geodesic Core...');
    let prog = 0;
    const timer = setInterval(() => {
      prog += 7;
      if (prog > 100) prog = 100;
      setSplashProgress(prog);

      if (prog >= 30 && prog < 60) {
        setSplashText('Syncing the network pulse...');
      } else if (prog >= 60 && prog < 90) {
        setSplashText('Verifying login portal encryption...');
      } else if (prog >= 90) {
        setSplashText('Welcome to NetPulse!');
        playPulseBeep(true);
      }

      if (prog >= 100) {
        clearInterval(timer);
        setTimeout(() => setShowSplash(false), 380);
      }
    }, 85);
  };

  // 3D Parallax Mouse Move on Hero section
  const handleHeroMouseMove = (e) => {
    if (!tiltRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    const rotY = relX * 22;
    const rotX = -relY * 22;
    tiltRef.current.style.transform = `perspective(700px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;
  };

  const handleHeroMouseLeave = () => {
    if (tiltRef.current) {
      tiltRef.current.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) scale(1)';
    }
  };

  // Auth Submit
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!username.trim() || !password) {
      setErrorMsg('Please enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await postJson('/api/auth/login', {
        username: username.trim(),
        password,
      });

      if (data?.success) {
        setSuccessMsg('Signed in! Redirecting to the dashboard...');
        if (rememberMe) {
          setAuthSession(data.token, data.user);
        } else {
          sessionStorage.setItem('netpulse_auth_token', data.token);
          sessionStorage.setItem('netpulse_auth_user', data.user);
        }
        playPulseBeep(true);
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(data.user, data.token);
          }
        }, 600);
      } else {
        setErrorMsg(data?.error || 'Login failed. Check your username and password.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Username and password do not match.');
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo / SSO handler
  const handleQuickDemoAccess = () => {
    setUsername('ilo');
    setPassword('ijo');
    setErrorMsg('');
    setSuccessMsg('NOC credentials filled in automatically. Click "Sign In".');
  };

  // Canvas Animation Loops
  useEffect(() => {
    // 1. Build Geodesic Fibonacci 3D Sphere Vertices (88 nodes)
    const numVerts = 88;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const vertices = [];
    for (let i = 0; i < numVerts; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / numVerts);
      vertices.push({
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta) * Math.sin(phi),
        z: Math.cos(phi),
      });
    }

    const edges = [];
    for (let i = 0; i < numVerts; i++) {
      for (let j = i + 1; j < numVerts; j++) {
        const dx = vertices[i].x - vertices[j].x;
        const dy = vertices[i].y - vertices[j].y;
        const dz = vertices[i].z - vertices[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.50) {
          edges.push([i, j]);
        }
      }
    }

    // 2. Sample 180 points along the normalized ECG pulse polyline
    const waveWaypoints = [
      [0.00,  0.00],
      [0.30,  0.00],
      [0.35, -0.18],
      [0.41,  0.14],
      [0.48, -0.56],
      [0.55,  0.46],
      [0.62, -0.22],
      [0.68,  0.00],
      [1.00,  0.00],
    ];
    const totalSamples = 180;
    const sampledWaveTemplate = [];
    for (let s = 0; s <= totalSamples; s++) {
      const u = s / totalSamples;
      let wy = 0;
      for (let k = 0; k < waveWaypoints.length - 1; k++) {
        const [u0, y0] = waveWaypoints[k];
        const [u1, y1] = waveWaypoints[k + 1];
        if (u >= u0 && u <= u1) {
          const localT = (u - u0) / (u1 - u0);
          wy = y0 + (y1 - y0) * localT;
          break;
        }
      }
      sampledWaveTemplate.push({ u, wy });
    }

    // 3. Floating Ambient Particles (36 nodes)
    const bgParticles = [];
    for (let i = 0; i < 36; i++) {
      bgParticles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0004,
        vy: (Math.random() - 0.5) * 0.0004,
        r: 1.2 + Math.random() * 1.8,
      });
    }

    let reqId;

    const render = () => {
      const gCanvas = giantCanvasRef.current;
      const pCanvas = particleCanvasRef.current;
      if (!gCanvas) return;

      const gCtx = gCanvas.getContext('2d');
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (gCanvas.width !== w || gCanvas.height !== h) {
        gCanvas.width = w;
        gCanvas.height = h;
      }
      gCtx.clearRect(0, 0, w, h);

      // Render Ambient Particles if particle canvas available
      if (pCanvas) {
        if (pCanvas.width !== w || pCanvas.height !== h) {
          pCanvas.width = w;
          pCanvas.height = h;
        }
        const pCtx = pCanvas.getContext('2d');
        pCtx.clearRect(0, 0, w, h);

        bgParticles.forEach((p, idx) => {
          p.x = (p.x + p.vx + 1) % 1;
          p.y = (p.y + p.vy + 1) % 1;
          const px = p.x * w;
          const py = p.y * h;

          pCtx.beginPath();
          pCtx.arc(px, py, p.r, 0, Math.PI * 2);
          pCtx.fillStyle = activeTheme.isLight ? 'rgba(2, 132, 199, 0.40)' : 'rgba(56, 189, 248, 0.45)';
          pCtx.fill();

          for (let j = idx + 1; j < bgParticles.length; j++) {
            const p2 = bgParticles[j];
            const dx = (p.x - p2.x) * w;
            const dy = (p.y - p2.y) * h;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 130) {
              pCtx.beginPath();
              pCtx.moveTo(px, py);
              pCtx.lineTo(p2.x * w, p2.y * h);
              pCtx.strokeStyle = activeTheme.isLight
                ? `rgba(2, 132, 199, ${(1 - dist / 130) * 0.16})`
                : `rgba(29, 111, 242, ${(1 - dist / 130) * 0.18})`;
              pCtx.lineWidth = 1;
              pCtx.stroke();
            }
          }
        });
      }

      // Sphere Geometry & Center (Symmetrically in center of page)
      const sphereCx = w * 0.5;
      const sphereCy = h * 0.42;
      const sphereRadius = Math.max(w * 0.26, h * 0.40);

      const st = animStateRef.current;
      // Smooth decay of speed bursts
      st.pulseSpeedMultiplier += (1.0 - st.pulseSpeedMultiplier) * 0.045;
      st.rotSpeedBoost += (1.0 - st.rotSpeedBoost) * 0.05;

      st.rotAngleY += 0.0045 * st.rotSpeedBoost;
      st.pulseTravelPos += 0.0052 * st.pulseSpeedMultiplier;
      if (st.pulseTravelPos > 1.18) {
        st.pulseTravelPos = -0.12;
      }

      // Update Hologram Scan Line position if in hologram mode
      if (animMode === 'hologram') {
        st.hologramScanY += st.hologramScanSpeed;
        if (st.hologramScanY > 0.88 || st.hologramScanY < 0.12) {
          st.hologramScanSpeed = -st.hologramScanSpeed;
        }
      }

      // Project 3D sphere vertices
      const projected = vertices.map((v) => {
        const x1 = v.x * Math.cos(st.rotAngleY) - v.z * Math.sin(st.rotAngleY);
        const z1 = v.z * Math.cos(st.rotAngleY) + v.x * Math.sin(st.rotAngleY);
        const y2 = v.y * Math.cos(st.rotAngleX) - z1 * Math.sin(st.rotAngleX);
        const z2 = z1 * Math.cos(st.rotAngleX) + v.y * Math.sin(st.rotAngleX);
        const perspective = 2.8 / (2.8 - z2 * 0.65);
        return {
          px: sphereCx + x1 * sphereRadius * perspective,
          py: sphereCy + y2 * sphereRadius * perspective,
          z: z2,
        };
      });

      // Draw 3D wireframe struts
      gCtx.lineWidth = activeTheme.isLight ? 1.5 : 1.35;
      edges.forEach(([i, j]) => {
        const p1 = projected[i];
        const p2 = projected[j];
        const avgZ = (p1.z + p2.z) * 0.5;
        const alpha = Math.max(0.12, (avgZ + 1.1) * (activeTheme.isLight ? 0.35 : 0.29));
        gCtx.strokeStyle =
          avgZ > 0.25
            ? `rgba(${activeTheme.edgeFront}, ${alpha})`
            : `rgba(${activeTheme.edgeBack}, ${alpha})`;
        gCtx.beginPath();
        gCtx.moveTo(p1.px, p1.py);
        gCtx.lineTo(p2.px, p2.py);
        gCtx.stroke();
      });

      // Draw 3D nodes
      projected.forEach((p) => {
        const alpha = Math.max(0.22, (p.z + 1.1) * (activeTheme.isLight ? 0.55 : 0.45));
        const nodeR = p.z > 0.25 ? 4.5 : 2.8;
        gCtx.beginPath();
        gCtx.arc(p.px, p.py, nodeR, 0, Math.PI * 2);
        gCtx.fillStyle =
          p.z > 0.35
            ? `rgba(${activeTheme.nodeFront}, ${alpha})`
            : `rgba(${activeTheme.nodeBack}, ${alpha})`;
        gCtx.fill();
      });

      // In Hologram Mode: render sweeping vertical laser beam across the sphere
      if (animMode === 'hologram') {
        gCtx.save();
        const scanY = sphereCy - sphereRadius + st.hologramScanY * sphereRadius * 2;
        const scanGrad = gCtx.createLinearGradient(0, scanY - 24, 0, scanY + 24);
        scanGrad.addColorStop(0, 'rgba(0, 242, 254, 0)');
        scanGrad.addColorStop(0.5, 'rgba(0, 242, 254, 0.45)');
        scanGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');

        gCtx.fillStyle = scanGrad;
        gCtx.fillRect(sphereCx - sphereRadius * 1.1, scanY - 20, sphereRadius * 2.2, 40);

        // Bright laser core beam
        gCtx.beginPath();
        gCtx.moveTo(sphereCx - sphereRadius * 1.05, scanY);
        gCtx.lineTo(sphereCx + sphereRadius * 1.05, scanY);
        gCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        gCtx.lineWidth = 2.0;
        gCtx.shadowColor = '#00f2fe';
        gCtx.shadowBlur = 18;
        gCtx.stroke();
        gCtx.restore();
      }

      // Build sampled world wave points across sphere diameter
      const leftX = sphereCx - sphereRadius * 1.05;
      const rightX = sphereCx + sphereRadius * 1.05;
      const spanW = rightX - leftX;
      const baseY = sphereCy;
      const peakScale = sphereRadius * 0.32;

      const sampledWave = sampledWaveTemplate.map((pt) => ({
        u: pt.u,
        x: leftX + pt.u * spanW,
        y: baseY + pt.wy * peakScale,
      }));

      // 1) Dim base track for full heartbeat silhouette
      gCtx.save();
      gCtx.beginPath();
      sampledWave.forEach((pt, idx) => {
        if (idx === 0) gCtx.moveTo(pt.x, pt.y);
        else gCtx.lineTo(pt.x, pt.y);
      });
      gCtx.strokeStyle = activeTheme.isLight
        ? 'rgba(2, 132, 199, 0.28)'
        : 'rgba(0, 242, 254, 0.22)';
      gCtx.lineWidth = 3.5;
      gCtx.lineCap = 'round';
      gCtx.lineJoin = 'round';
      gCtx.shadowColor = activeTheme.pulseColor;
      gCtx.shadowBlur = activeTheme.isLight ? 8 : 12;
      gCtx.stroke();
      gCtx.restore();

      // 2) Traveling Left-to-Right Pulse Packet Drawer
      const drawPulse = (headU, tailLength, intensity) => {
        const tailStart = headU - tailLength;
        const activePts = sampledWave.filter((pt) => pt.u >= tailStart && pt.u <= headU);
        if (activePts.length < 2) return;

        gCtx.save();
        const grad = gCtx.createLinearGradient(
          activePts[0].x,
          baseY,
          activePts[activePts.length - 1].x,
          baseY
        );
        grad.addColorStop(0, 'rgba(0, 242, 254, 0)');
        grad.addColorStop(
          0.65,
          activeTheme.isLight
            ? `rgba(2, 132, 199, ${0.9 * intensity})`
            : `rgba(0, 242, 254, ${0.85 * intensity})`
        );
        grad.addColorStop(1, `rgba(255, 255, 255, ${1.0 * intensity})`);

        gCtx.beginPath();
        activePts.forEach((pt, idx) => {
          if (idx === 0) gCtx.moveTo(pt.x, pt.y);
          else gCtx.lineTo(pt.x, pt.y);
        });
        gCtx.strokeStyle = grad;
        gCtx.lineWidth = 6.5;
        gCtx.lineCap = 'round';
        gCtx.lineJoin = 'round';
        gCtx.shadowColor = activeTheme.pulseColor;
        gCtx.shadowBlur = 24;
        gCtx.stroke();

        // Inner white laser core
        gCtx.lineWidth = 2.4;
        gCtx.strokeStyle = '#ffffff';
        gCtx.shadowBlur = 10;
        gCtx.stroke();

        // Glowing leading comet head moving to the right
        const headPt = activePts[activePts.length - 1];
        gCtx.beginPath();
        gCtx.arc(headPt.x, headPt.y, 6.5, 0, Math.PI * 2);
        gCtx.fillStyle = '#ffffff';
        gCtx.shadowColor = activeTheme.pulseColor;
        gCtx.shadowBlur = 28;
        gCtx.fill();
        gCtx.restore();
      };

      // Draw continuous wave
      drawPulse(st.pulseTravelPos, 0.32, 1.0);

      // Draw fast surge bolts
      for (let i = st.fastPulses.length - 1; i >= 0; i--) {
        const fp = st.fastPulses[i];
        fp.pos += fp.speed;
        if (fp.pos > 1.35) {
          st.fastPulses.splice(i, 1);
          continue;
        }
        drawPulse(fp.pos, 0.42, fp.intensity);
      }

      // Draw glowing anchor nodes at the sphere left/right perimeter
      [sampledWave[0], sampledWave[sampledWave.length - 1]].forEach((endPt) => {
        gCtx.save();
        gCtx.beginPath();
        gCtx.arc(endPt.x, endPt.y, 6, 0, Math.PI * 2);
        gCtx.fillStyle = activeTheme.pulseColor;
        gCtx.shadowColor = activeTheme.pulseColor;
        gCtx.shadowBlur = 18;
        gCtx.fill();
        gCtx.restore();
      });

      reqId = requestAnimationFrame(render);
    };

    reqId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(reqId);
  }, [themeKey, animMode, activeTheme]);

  return (
    <div
      style={{ background: activeTheme.pageBg }}
      className={`min-h-screen flex flex-col justify-between relative selection:bg-cyan-400 selection:text-slate-950 transition-all duration-500 overflow-x-hidden ${
        activeTheme.isLight ? 'theme-light-mode text-slate-900' : 'text-slate-100'
      }`}
      onClick={(e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (['input', 'button', 'a', 'label'].includes(tag)) return;
        if (e.target.closest('#authCard') || e.target.closest('#themeBar')) return;
        triggerPulseSurge();
      }}
    >
      {/* Background Animated Canvases & Soft Radial Glow Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className={`absolute -top-32 -left-32 w-[30rem] h-[30rem] rounded-full blur-[140px] transition-all duration-700 ${
            activeTheme.isLight ? 'bg-sky-400/25' : 'bg-sky-400/30'
          }`}
        />
        <div
          className={`absolute top-1/4 left-1/4 w-[36rem] h-[36rem] rounded-full blur-[150px] transition-all duration-700 ${
            activeTheme.isLight ? 'bg-cyan-300/20' : 'bg-cyan-300/25'
          }`}
        />
        <div
          className={`absolute -bottom-32 right-10 w-[30rem] h-[30rem] rounded-full blur-[140px] transition-all duration-700 ${
            activeTheme.isLight ? 'bg-blue-300/20' : 'bg-blue-400/25'
          }`}
        />
        <canvas ref={particleCanvasRef} className="absolute inset-0 w-full h-full opacity-65" />
        <canvas ref={giantCanvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* Welcome Intro Splash Screen Overlay */}
      {showSplash && (
        <DataLoadingOverlay
          progress={splashProgress}
          message={splashText}
          onSkip={() => setShowSplash(false)}
          showSkip={true}
        />
      )}
      {loading && (
        <DataLoadingOverlay
          message="Verifying credentials & portal encryption..."
        />
      )}

      {/* TOP HEADER: TRANSPARENT, LOGO MOVED TO TOP RIGHT */}
      <header className="relative z-20 px-6 sm:px-12 py-4 sm:py-6 flex items-center justify-start">
        {/* Logo Brand in Top Left Corner */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-400 to-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(45,212,191,0.4)] text-white font-bold">
            <Globe className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-brand text-base sm:text-lg font-extrabold tracking-wider bg-gradient-to-r from-teal-200 via-cyan-200 to-white bg-clip-text text-transparent">
                NETPULSE
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono-tech bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ONLINE
              </span>
            </div>
            <p className="text-[11px] hidden sm:block text-teal-100/70">
              KPI Monitoring & Network Telemetry Dashboard
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center w-full px-4 sm:px-6 py-4">
        {/* CENTER HERO STAGE: 100% SYMMETRICAL IN HORIZONTAL CENTER */}
        <section
          ref={heroSectionRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="w-full flex flex-col items-center justify-between text-center min-h-[460px] sm:min-h-[520px] lg:min-h-[580px] cursor-pointer select-none relative"
          title="Click to speed up the pulse"
        >
          {/* Transparent open corridor for 3D Fibonacci rotating sphere & ECG laser line */}
          <div className="flex-1 w-full min-h-[160px] sm:min-h-[220px] pointer-events-none" />

          {/* Bottom: Tilt Stage for NetPulse Brand Title & Subtitle (Centered symmetrically, raised slightly) */}
          <div
            ref={tiltRef}
            className="relative z-10 w-full max-w-2xl pb-12 sm:pb-20 flex flex-col items-center justify-end transition-transform duration-200 ease-out"
          >
            <div className="relative flex flex-col items-center">
              <h2 className="font-brand text-4xl sm:text-6xl lg:text-7xl font-black tracking-wider text-white drop-shadow-[0_0_28px_rgba(45,212,191,0.65)]">
                NetPulse
              </h2>
              <div className="flex items-center gap-2 mt-2.5">
                <span className="font-mono-tech text-xs sm:text-sm font-bold tracking-widest uppercase px-3.5 py-1 rounded-full bg-teal-500/15 text-teal-300 border border-teal-400/30">
                  Network analysis and monitoring
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: GLASSMORPHISM LOGIN PORTAL (Mentok ke kanan sampai di sudut mendekati border page) */}
        <aside className="w-full max-w-sm sm:max-w-md lg:absolute lg:right-3 xl:right-4 lg:top-1/2 lg:-translate-y-1/2 z-20 shrink-0 mt-6 lg:mt-0">
          <div
            id="authCard"
            style={{
              background: activeTheme.panelBg,
              borderColor: activeTheme.panelBorder,
            }}
            className="rounded-3xl p-6 sm:p-7 relative overflow-hidden transition-all duration-400 border backdrop-blur-xl shadow-2xl"
          >
            {/* Top Cyan Accent Strip */}
            <div className="absolute top-0 left-10 right-10 h-[2.5px] bg-gradient-to-r from-transparent via-teal-300 to-transparent" />

            {/* Card Header: Welcome */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono-tech uppercase tracking-wider font-bold text-teal-300">
                  NetPulse Portal v4.2
                </span>
                <span className="text-[11px] text-teal-200/70 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  TLS 1.3 Encrypted
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Welcome
              </h1>
              <p className="text-xs sm:text-sm mt-1 text-teal-100/80">
                Sign in to your network monitoring & diagnostics dashboard.
              </p>
            </div>

            {/* Error / Alert Message */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Message */}
            {successMsg && (
              <div className="mb-4 p-3 rounded-xl text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {/* User */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-slate-200">
                  User
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl text-sm transition focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-900/80 border border-teal-500/30 text-white placeholder-slate-400"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-300/60 text-sm pointer-events-none">
                    @
                  </span>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-slate-200">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="w-full pl-3.5 pr-16 py-2.5 rounded-xl text-sm transition focus:outline-none focus:ring-2 focus:ring-teal-400 bg-slate-900/80 border border-teal-500/30 text-white placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[11px] font-mono-tech text-slate-400 hover:text-teal-300 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Primary Submit Button: Login (Gambar 1: Ingat sesi dan 2FA Ready dihapus) */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 hover:from-teal-300 hover:to-cyan-400 shadow-[0_0_25px_rgba(45,212,191,0.35)] hover:shadow-[0_0_35px_rgba(45,212,191,0.6)] transition transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{loading ? 'Verifying...' : 'Login'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </aside>
      </main>

      {/* FOOTER: TRANSPARENT, CLEAN COPYRIGHT ONLY */}
      <footer className="relative z-10 px-6 sm:px-12 py-4 text-left text-[11px] text-teal-200/60">
        © 2026 <span className="font-semibold text-teal-300">NetPulse Systems</span> • Intelligent Network Diagnostics & Telemetry
      </footer>
    </div>
  );
}
