import { useEffect, useRef, useState } from 'react';
import { drawBuddy, updateConfetti, spawnConfetti, rotateBuddyColor } from '../drawing.js';
import { extractFeatures, trainModel, poly } from '../gazeUtils.js';
import { playChime, speak } from '../audio.js';

const MIN_SAMPLES = 30;

function buildCalibPoints() {
  const W = window.innerWidth, H = window.innerHeight;
  const px = W * 0.08, py = H * 0.08;
  return [
    [W / 2, H / 2], [W / 2, py], [W - px, H / 2], [W / 2, H - py], [px, H / 2],
    [px, py], [W - px, py], [W - px, H - py], [px, H - py], [W / 2, H / 2],
  ];
}

function calibAdaptiveParams(ptX, ptY) {
  const W = window.innerWidth, H = window.innerHeight;
  const distNorm = Math.min(1, Math.hypot((ptX - W / 2) / (W / 2), (ptY - H / 2) / (H / 2)) / Math.SQRT2);
  return {
    gazeRadius: Math.round(220 + distNorm * 420),
    holdMs: Math.round(900 - distNorm * 200),
    sampleMs: Math.round(1500 - distNorm * 300),
    lapseMs: Math.round(600 + distNorm * 400),
  };
}

export default function CalibrationScreen({ workerRef, gazeModel, buddy, soundEnabled, ttsEnabled, onCalibDone }) {
  const canvasRef = useRef(null);
  const [showCard, setShowCard] = useState(true);
  const [cardMsg, setCardMsg] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const calibSamplesRef = useRef([]);
  const calibPtsRef = useRef([]);
  const ptIdxRef = useRef(0);
  const rafRef = useRef(null);
  const bctRef = useRef(0);
  const confettiRef = useRef([]);
  const calibLastFeatRef = useRef(null);
  const calibLastGazeInRadiusRef = useRef(false);
  const gazeModelRef = useRef(gazeModel);

  const buddyName = buddy === 'spaceship' ? 'spaceship' : buddy;
  const buddyEmoji = buddy === 'dog' ? '🐶' : buddy === 'spaceship' ? '🚀' : '🐱';

  // Receive landmarks from worker
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const handler = (e) => {
      if (e.data.type !== 'result') return;
      const { landmarks, matrices } = e.data;
      if (!landmarks || landmarks.length === 0) { calibLastFeatRef.current = null; return; }
      const lm = landmarks[0];
      const mat = matrices && matrices.length > 0 ? matrices[0] : null;
      const feat = extractFeatures(lm, mat);
      calibLastFeatRef.current = feat;

      const pts = calibPtsRef.current;
      const idx = ptIdxRef.current;
      if (pts.length === 0 || idx >= pts.length) return;
      const [tx, ty] = pts[idx];
      const { gazeRadius } = calibAdaptiveParams(tx, ty);
      const isBlink = feat[7] < 0.06;
      if (!isBlink && gazeModelRef.current) {
        const pf = poly(feat);
        const gx = pf.reduce((s, v, i) => s + v * gazeModelRef.current.wx[i], 0);
        const gy = pf.reduce((s, v, i) => s + v * gazeModelRef.current.wy[i], 0);
        calibLastGazeInRadiusRef.current = Math.hypot(gx - tx, gy - ty) <= gazeRadius;
      } else if (!isBlink) {
        calibLastGazeInRadiusRef.current = true;
      } else {
        calibLastGazeInRadiusRef.current = false;
      }
    };
    worker.addEventListener('message', handler);
    return () => worker?.removeEventListener('message', handler);
  }, [workerRef]);

  const startCalib = () => {
    setShowCard(false);
    rotateBuddyColor();
    calibSamplesRef.current = [];
    calibPtsRef.current = buildCalibPoints();
    ptIdxRef.current = 0;
    bctRef.current = 0;
    confettiRef.current = [];
    speak(`Watch the ${buddyName}!`, ttsEnabled && soundEnabled);
    runPoint();
  };

  const finalise = () => {
    cancelAnimationFrame(rafRef.current);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    const model = trainModel(calibSamplesRef.current);
    if (!model) {
      setRetrying(true);
      setCardMsg({ h: '⚠️ Calibration incomplete', p: `Only ${calibSamplesRef.current.length} samples (need ${MIN_SAMPLES}). Please retry.`, btn: '↺ Retry' });
      setShowCard(true);
      calibSamplesRef.current = [];
      return;
    }
    onCalibDone(model, calibSamplesRef.current);
  };

  function runPoint() {
    const idx = ptIdxRef.current;
    const pts = calibPtsRef.current;
    if (idx >= pts.length) { finalise(); return; }

    const [tx, ty] = pts[idx];
    const { gazeRadius, holdMs, sampleMs, lapseMs } = calibAdaptiveParams(tx, ty);
    const progressFrac = idx / Math.max(pts.length - 1, 1);

    let holdStart = null, sampStart = null, curSamples = [], lapseStart = null;
    let inGap = false, gapStart = 0, soundDone = false;

    function frame() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();
      bctRef.current += 0.005;

      updateConfetti(ctx, confettiRef.current);

      if (inGap) {
        if (now - gapStart > 1400) { ptIdxRef.current++; runPoint(); return; }
        rafRef.current = requestAnimationFrame(frame); return;
      }

      // Dashed ring
      ctx.save();
      ctx.beginPath(); ctx.arc(tx, ty, gazeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();

      // Progress bar
      ctx.save();
      ctx.fillStyle = 'rgba(0,229,176,0.25)';
      ctx.fillRect(0, canvas.height - 6, canvas.width * progressFrac, 6);
      ctx.restore();

      const inRadius = calibLastGazeInRadiusRef.current;

      if (sampStart === null) {
        if (inRadius) {
          if (holdStart === null) holdStart = now;
          const held = now - holdStart;
          ctx.save(); ctx.beginPath();
          ctx.arc(tx, ty, gazeRadius * 0.55, -Math.PI / 2, -Math.PI / 2 + (held / holdMs) * Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,229,176,0.6)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
          if (held >= holdMs) { sampStart = now; curSamples = []; lapseStart = null; }
        } else { holdStart = null; }
      } else {
        const sampElapsed = now - sampStart;
        if (inRadius) {
          lapseStart = null;
          const feat = calibLastFeatRef.current;
          if (feat && feat[7] >= 0.06) curSamples.push({ feat, sx: tx, sy: ty });
        } else {
          if (lapseStart === null) lapseStart = now;
          if (now - lapseStart > lapseMs) {
            sampStart = null; holdStart = null; curSamples = []; lapseStart = null;
            ctx.save(); ctx.beginPath(); ctx.arc(tx, ty, gazeRadius * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,180,50,0.7)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
            drawBuddy(ctx, tx, ty, bctRef.current, false, buddy);
            rafRef.current = requestAnimationFrame(frame); return;
          }
          const feat = calibLastFeatRef.current;
          if (feat && feat[7] >= 0.06) curSamples.push({ feat, sx: tx, sy: ty });
        }
        ctx.save(); ctx.beginPath();
        ctx.arc(tx, ty, gazeRadius * 0.55, -Math.PI / 2, -Math.PI / 2 + (sampElapsed / sampleMs) * Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,0,0.8)'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();

        if (sampElapsed >= sampleMs) {
          curSamples.forEach(s => calibSamplesRef.current.push(s));
          spawnConfetti(confettiRef.current, tx, ty);
          if (!soundDone) { playChime(600 + Math.random() * 200, 0.1, 0.3, soundEnabled); soundDone = true; }
          inGap = true; gapStart = now;
          rafRef.current = requestAnimationFrame(frame); return;
        }
      }

      drawBuddy(ctx, tx, ty, bctRef.current, true, buddy);

      // DEBUG INFO
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '16px monospace';
      const feat = calibLastFeatRef.current;
      if (!feat) {
        ctx.fillText('Tracking: NO FACE DETECTED', 20, 40);
      } else {
        const ear = feat[7];
        const isBlink = ear < 0.06;
        ctx.fillText(`EAR: ${ear.toFixed(3)} ${isBlink ? '(BLINK/EYES CLOSED)' : '(OPEN)'}`, 20, 40);
        ctx.fillText(`inRadius: ${inRadius ? 'YES' : 'NO'}`, 20, 60);
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(frame);
    }
    frame();
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const h = cardMsg?.h || `${buddyEmoji} Follow the ${buddyName.charAt(0).toUpperCase() + buddyName.slice(1)}!`;
  const btnLabel = cardMsg?.btn || `${buddyEmoji}  Start — Follow the ${buddyName.charAt(0).toUpperCase() + buddyName.slice(1)}!`;

  return (
    <div id="s-calib" className="screen active" style={{ background: '#0e1018' }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {showCard && (
        <div id="calib-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 10, background: 'rgba(10,12,16,.88)', backdropFilter: 'blur(6px)' }}>
          <div className="calib-card">
            <h2>{h}</h2>
            {!retrying && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left', margin: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><span style={{ fontSize: 28 }}>🪑</span><span style={{ fontSize: 15, color: 'var(--text)' }}>Sit your child facing the screen so their face is clearly visible</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><span style={{ fontSize: 28 }}>{buddyEmoji}</span><span style={{ fontSize: 15, color: 'var(--text)' }}>Say <strong style={{ color: 'var(--accent)' }}>"Watch the {buddyName} — follow it with your eyes!"</strong></span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><span style={{ fontSize: 28 }}>▶</span><span style={{ fontSize: 15, color: 'var(--text)' }}>Press Start — the buddy hops around for about 30 seconds</span></div>
              </div>
            )}
            {retrying && <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>{cardMsg?.p}</p>}
            <button className="calib-start-btn" onClick={() => { setRetrying(false); setCardMsg(null); startCalib(); }}>
              {btnLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
