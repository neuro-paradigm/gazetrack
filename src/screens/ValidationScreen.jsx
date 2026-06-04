import { useEffect, useRef } from 'react';
import { drawStar, spawnSparkles, updateSparkles } from '../drawing.js';
import { extractFeatures, poly, computeAffineCorrection } from '../gazeUtils.js';
import { playChime, speak } from '../audio.js';

const VAL_DWELL_MS = 3000;
const VAL_GAP_MS = 800;
const VAL_STAR_RADIUS = 40;
const VAL_SAMPLE_START = 0.35;
const VAL_INTRO_MS = 2000;
const NOTES = [523, 659, 784, 880, 1047];

export default function ValidationScreen({ workerRef, gazeModel, soundEnabled, ttsEnabled, onDone, onBadCalib }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestMatricesRef = useRef(null);

  useEffect(() => {
    if (!workerRef.current) return;
    const handler = (e) => {
      if (e.data.type !== 'result') return;
      latestLandmarksRef.current = e.data.landmarks;
      latestMatricesRef.current = e.data.matrices;
    };
    const worker = workerRef.current;
    worker.addEventListener('message', handler);
    return () => worker?.removeEventListener('message', handler);
  }, [workerRef]);

  useEffect(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const mx = W * 0.1, my = H * 0.1;
    const valPoints = [
      { x: W / 2, y: H / 2 }, { x: mx, y: my }, { x: W - mx, y: my },
      { x: W - mx, y: H - my }, { x: mx, y: H - my },
    ];
    const valSamples = [];
    const particles = [];
    let valIdx = 0;
    let cancelled = false;

    const canvas = canvasRef.current;

    speak('Find the star!', ttsEnabled && soundEnabled);
    playChime(528, 0.1, 0.6, soundEnabled);

    const introTimeout = setTimeout(() => {
      if (cancelled) return;
      runStar();
    }, VAL_INTRO_MS);

    function runStar() {
      if (cancelled || valIdx >= valPoints.length) { finish(); return; }
      const pt = valPoints[valIdx];
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      const vCtx = canvas.getContext('2d');
      playChime(NOTES[valIdx % NOTES.length], 0.12, 0.5, soundEnabled);

      const collected = [];
      const valStart = performance.now();
      const gapEnd = valStart + VAL_GAP_MS;
      let inGap = true, sparkled = false;

      const introEl = document.getElementById('val-intro-text');
      if (introEl) introEl.style.opacity = '0';

      function frame() {
        if (cancelled) return;
        const now = performance.now();
        vCtx.clearRect(0, 0, canvas.width, canvas.height);

        if (inGap) {
          updateSparkles(vCtx, particles);
          if (now >= gapEnd) inGap = false;
          rafRef.current = requestAnimationFrame(frame); return;
        }

        const starElapsed = now - gapEnd;
        const starProgress = Math.min(starElapsed / VAL_DWELL_MS, 1);
        const entPct = Math.min(starElapsed / 220, 1);
        let entrance = entPct < 1
          ? Math.min(1 - Math.pow(1 - entPct, 3) * Math.cos(entPct * Math.PI * 2.5), 1.12)
          : 1;

        if (!sparkled && entPct >= 0.9) { spawnSparkles(particles, pt.x, pt.y); sparkled = true; }
        updateSparkles(vCtx, particles);
        drawStar(vCtx, pt.x, pt.y, VAL_STAR_RADIUS, starElapsed * 0.001, Math.min(entrance, 1));

        if (starProgress >= VAL_SAMPLE_START && gazeModel) {
          const lm = latestLandmarksRef.current;
          const mat = latestMatricesRef.current;
          if (lm && lm.length > 0) {
            try {
              const feat = extractFeatures(lm[0], mat && mat.length > 0 ? mat[0] : null);
              if (feat[7] >= 0.06) {
                const pf = poly(feat);
                collected.push({
                  px: pf.reduce((s, v, i) => s + v * gazeModel.wx[i], 0),
                  py: pf.reduce((s, v, i) => s + v * gazeModel.wy[i], 0),
                });
              }
            } catch { /* ignore */ }
          }
        }

        if (starProgress < 1) { rafRef.current = requestAnimationFrame(frame); return; }

        if (collected.length >= 3) {
          const mxs = collected.map(p => p.px).sort((a, b) => a - b);
          const mys = collected.map(p => p.py).sort((a, b) => a - b);
          const mid = Math.floor(mxs.length / 2);
          valSamples.push({ px: mxs[mid], py: mys[mid], tx: pt.x, ty: pt.y });
        }
        valIdx++;
        runStar();
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    function finish() {
      cancelAnimationFrame(rafRef.current);
      if (valSamples.length >= 3) {
        const affineBias = computeAffineCorrection(valSamples);
        const bad = Math.abs(affineBias.dx) > 600 || affineBias.sx > 2.0 || affineBias.sx < 0.3
          || Math.abs(affineBias.dy) > 600 || affineBias.sy > 2.0 || affineBias.sy < 0.3;
        if (bad) { onBadCalib(); return; }
        const valQuality = valSamples.map(s => ({
          tx: Math.round(s.tx), ty: Math.round(s.ty),
          gx: s.px.toFixed(1), gy: s.py.toFixed(1),
          errPx: Math.hypot(s.px - s.tx, s.py - s.ty).toFixed(1),
        }));
        onDone(affineBias, valSamples, valQuality);
      } else {
        onBadCalib();
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(introTimeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [gazeModel, soundEnabled, ttsEnabled, onDone, onBadCalib, workerRef]);

  return (
    <div id="val-overlay" style={{ display: 'block', position: 'fixed', inset: 0, background: '#0a0c14', zIndex: 200, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div id="val-intro-text" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 210, transition: 'opacity 0.8s ease-out' }}>
        <span style={{ fontSize: 72, display: 'block', marginBottom: 16 }}>⭐</span>
        <h3 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Find the Star!</h3>
        <p style={{ fontSize: 16, color: 'var(--muted)' }}>Look at each star as it appears</p>
      </div>
    </div>
  );
}
