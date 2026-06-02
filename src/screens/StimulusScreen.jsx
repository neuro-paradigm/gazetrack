import { useEffect, useRef, useState, useCallback } from 'react';
import {
  extractFeatures, extractPupilData, extractGazeVector,
  predictGaze, KalmanFilter, IDTClassifier, EARSmoother, buildCSV,
} from '../gazeUtils.js';

const TRIAL_AUTO_SPLIT_MS = 60000;
const BLINK_MIN_CONSEC = 2;

export default function StimulusScreen({
  workerRef, gazeModel, affineBias, meta, mediaQueue, sessionStart, perfStart,
  calibAttemptNum, calibPassed, calibTimestamp, valSamples, valQuality, stimFilename,
  onEnd,
}) {
  const gazeCanvasRef = useRef(null);
  const videoRef = useRef(null);
  const imgRef = useRef(null);

  const [hudFace, setHudFace] = useState('—');
  const [hudFaceOk, setHudFaceOk] = useState(false);
  const [hudTimer, setHudTimer] = useState('00:00');
  const [hudTrial, setHudTrial] = useState(1);
  const [hudMedia, setHudMedia] = useState('1/1');
  const [stGaze, setStGaze] = useState('—');
  const [stGazeOk, setStGazeOk] = useState(false);
  const [stFrames, setStFrames] = useState(0);
  const [stTrack, setStTrack] = useState('—');
  const [stYstd, setStYstd] = useState('—');
  const [stYstdOk, setStYstdOk] = useState(false);
  const [paused, setPaused] = useState(false);
  const [noVideo, setNoVideo] = useState(mediaQueue.length === 0);

  // Mutable recording state (not React state — avoid re-renders)
  const recordedFrames = useRef([]);
  const totalF = useRef(0);
  const trackedF = useRef(0);
  const trialNumber = useRef(1);
  const trialStart = useRef(0);
  const mediaIdx = useRef(0);
  const annotations = useRef([]);
  const blinkIdCounter = useRef(0);
  const blinkIdActive = useRef(false);
  const currentBlinkId = useRef(NaN);
  const blinkConsec = useRef(0);
  const blinkActive = useRef(false);
  const pausedRef = useRef(false);
  const trialAutoTimer = useRef(null);
  const timerInt = useRef(null);
  const kalmanX = useRef(new KalmanFilter(20, 0.5));
  const kalmanY = useRef(new KalmanFilter(20, 0.5));
  const idt = useRef(new IDTClassifier());
  const earSmoother = useRef(new EARSmoother(5));

  const affineBiasRef = useRef(affineBias);
  const gazeModelRef = useRef(gazeModel);

  const separatorRow = useCallback((ts) => ({
    t: ts, x: NaN, y: NaN, tracked: 0, feat: null,
    trial: trialNumber.current, gazeEvent: 'Separator',
    irisRadiusPxL: NaN, irisRadiusPxR: NaN, faceConfPct: 0,
    fixationIndex: 0, wallClock: 0,
    pupilLX: NaN, pupilLY: NaN, pupilRX: NaN, pupilRY: NaN,
    pupilSizeLX: NaN, pupilSizeLY: NaN, pupilSizeRX: NaN, pupilSizeRY: NaN,
    gvX: NaN, gvY: NaN, gvZ: NaN, eyePosZ: NaN, blinkId: NaN, isSeparator: true,
  }), []);

  const advanceTrial = useCallback(() => {
    if (recordedFrames.current.length > 0) {
      recordedFrames.current.push(separatorRow(performance.now() - perfStart));
    }
    trialNumber.current++;
    trialStart.current = performance.now() - perfStart;
    idt.current.reset();
    kalmanX.current.reset(); kalmanY.current.reset();
    blinkConsec.current = 0; blinkActive.current = false;
    blinkIdActive.current = false; currentBlinkId.current = NaN;
    setHudTrial(trialNumber.current);
    showTrialToast(trialNumber.current);
    clearTimeout(trialAutoTimer.current);
    trialAutoTimer.current = setTimeout(advanceTrial, TRIAL_AUTO_SPLIT_MS);
  }, [perfStart, separatorRow]);

  function showTrialToast(n) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9001;background:rgba(124,58,237,.9);backdrop-filter:blur(8px);border:1px solid rgba(124,58,237,.6);color:#fff;font-family:var(--sans);font-size:14px;font-weight:700;padding:10px 22px;border-radius:20px;pointer-events:none`;
    t.textContent = `⏭ Trial ${n} started`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  const imageTimerRef = useRef(null);

  // Load media item
  const loadMedia = useCallback((idx) => {
    if (idx >= mediaQueue.length) { setNoVideo(mediaQueue.length === 0); onEnd(buildSessionCSV()); return; }
    
    clearTimeout(imageTimerRef.current);
    
    setHudMedia(`${idx + 1}/${mediaQueue.length}`);
    setNoVideo(false);
    const item = mediaQueue[idx];
    const video = videoRef.current;
    const img = imgRef.current;
    if (item.type === 'image') {
      if (video) { video.onended = null; video.onerror = null; video.oncanplay = null; video.pause(); video.removeAttribute('src'); video.load(); video.style.display = 'none'; }
      if (img) { img.src = item.src; img.style.display = 'block'; }
      
      // Auto-advance image after 45 seconds
      imageTimerRef.current = setTimeout(() => {
        const imgEl = imgRef.current;
        if (imgEl && imgEl.style.display !== 'none') { 
          mediaIdx.current++; 
          loadMedia(mediaIdx.current); 
        }
        advanceTrial();
      }, 45000);
      
    } else {
      if (img) img.style.display = 'none';
      if (video) {
        video.style.display = 'block';
        video.onended = null; video.onerror = null; video.oncanplay = null; video.onloadedmetadata = null;
        video.src = item.src; video.muted = true;
        video.onended = () => { video.onended = null; mediaIdx.current++; loadMedia(mediaIdx.current); };
        video.onerror = () => { video.onerror = null; mediaIdx.current++; loadMedia(mediaIdx.current); };
        video.oncanplay = () => { video.oncanplay = null; video.play().catch(() => {}); };
        video.load();
      }
    }
  }, [mediaQueue, onEnd, advanceTrial]); // eslint-disable-line

  function buildSessionCSV() {
    return buildCSV({
      frames: recordedFrames.current, meta, affineBias, valSamples, valQuality,
      annotations: annotations.current, calibAttemptNum, calibPassed, calibTimestamp,
      stimFilename, trialNumber: trialNumber.current,
    });
  }

  // Worker message handler — runs every frame
  useEffect(() => {
    if (!workerRef.current) return;
    const handler = (e) => {
      if (e.data.type !== 'result' || pausedRef.current) return;
      const { landmarks, matrices } = e.data;
      const hasFace = !!(landmarks && landmarks.length > 0);
      const canvas = gazeCanvasRef.current;
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;

      setHudFace(hasFace ? 'Yes' : 'No');
      setHudFaceOk(hasFace);
      totalF.current++;

      if (hasFace) {
        const lm = landmarks[0];
        const mat = matrices && matrices.length > 0 ? matrices[0] : null;
        const feat = extractFeatures(lm, mat);
        const iodNorm = feat[8];
        const iodPx = iodNorm * W;

        // Iris radii
        let irisRadiusPxL = NaN, irisRadiusPxR = NaN;
        if (lm[468] && lm[469]) {
          const lIrisCx = (lm[468].x + lm[470].x) / 2, lIrisCy = (lm[468].y + lm[470].y) / 2;
          const lRaw = Math.hypot((lm[469].x - lIrisCx) * W, (lm[469].y - lIrisCy) * H);
          irisRadiusPxL = iodPx > 2 ? lRaw / iodPx : NaN;
        }
        if (lm[473] && lm[474]) {
          const rIrisCx = (lm[473].x + lm[475].x) / 2, rIrisCy = (lm[473].y + lm[475].y) / 2;
          const rRaw = Math.hypot((lm[474].x - rIrisCx) * W, (lm[474].y - rIrisCy) * H);
          irisRadiusPxR = iodPx > 2 ? rRaw / iodPx : NaN;
        }

        const pd = extractPupilData(lm, W, H);
        const gv = extractGazeVector(mat, iodNorm);
        const wallClock = sessionStart + (performance.now() - perfStart);
        const rawEAR = feat[7];
        const smoothEAR = earSmoother.current.smooth(rawEAR);
        const faceConfPct = Math.round(Math.min(1, smoothEAR / 0.15) * 100);
        const smoothBlink = smoothEAR < 0.06;

        if (smoothBlink) {
          blinkConsec.current++;
          if (!blinkActive.current && blinkConsec.current >= BLINK_MIN_CONSEC) blinkActive.current = true;
        } else {
          blinkConsec.current = 0; blinkActive.current = false;
        }
        const confirmedBlink = blinkActive.current;
        const rawGaze = confirmedBlink ? null : predictGaze(feat, gazeModelRef.current, affineBiasRef.current);
        const ts = performance.now() - perfStart;

        if (rawGaze) {
          const gaze = { x: kalmanX.current.filter(rawGaze.x), y: kalmanY.current.filter(rawGaze.y) };
          trackedF.current++;
          const gazeEvent = idt.current.classify(gaze.x, gaze.y, ts, false);
          blinkIdActive.current = false; currentBlinkId.current = NaN;
          recordedFrames.current.push({
            t: ts, x: gaze.x, y: gaze.y, tracked: 1, feat,
            trial: trialNumber.current, trialStartMs: trialStart.current,
            gazeEvent, irisRadiusPxL, irisRadiusPxR, faceConfPct,
            fixationIndex: gazeEvent === 'Fixation' ? idt.current.fixationIndex : 0,
            wallClock, ...pd, ...gv, blinkId: NaN,
          });
          setStGaze('Tracking'); setStGazeOk(true);
          canvas.getContext('2d').clearRect(0, 0, W, H);
        } else {
          const blinkLabel = confirmedBlink ? 'Blink' : 'Unclassified';
          idt.current.classify(NaN, NaN, ts, true);
          if (!blinkIdActive.current) { blinkIdCounter.current++; blinkIdActive.current = true; }
          currentBlinkId.current = blinkIdCounter.current;
          recordedFrames.current.push({
            t: ts, x: NaN, y: NaN, tracked: 0, feat: null,
            trial: trialNumber.current, trialStartMs: trialStart.current,
            gazeEvent: blinkLabel, irisRadiusPxL, irisRadiusPxR, faceConfPct,
            fixationIndex: 0, wallClock, ...pd, ...gv,
            blinkId: currentBlinkId.current,
          });
          setStGaze(confirmedBlink ? 'Blink' : '—'); setStGazeOk(false);
          canvas.getContext('2d').clearRect(0, 0, W, H);
        }
      } else {
        // No face
        idt.current.classify(NaN, NaN, performance.now() - perfStart, true);
        blinkConsec.current = 0; blinkActive.current = false;
        if (!blinkIdActive.current) { blinkIdCounter.current++; blinkIdActive.current = true; }
        currentBlinkId.current = blinkIdCounter.current;
        const ts = performance.now() - perfStart;
        recordedFrames.current.push({
          t: ts, x: NaN, y: NaN, tracked: 0, feat: null,
          trial: trialNumber.current, trialStartMs: trialStart.current,
          gazeEvent: 'Blink', irisRadiusPxL: NaN, irisRadiusPxR: NaN, faceConfPct: 0,
          fixationIndex: 0, wallClock: sessionStart + ts,
          pupilLX: NaN, pupilLY: NaN, pupilRX: NaN, pupilRY: NaN,
          pupilSizeLX: NaN, pupilSizeLY: NaN, pupilSizeRX: NaN, pupilSizeRY: NaN,
          gvX: NaN, gvY: NaN, gvZ: NaN, eyePosZ: NaN, blinkId: currentBlinkId.current,
        });
      }

      const frames = recordedFrames.current.length;
      setStFrames(frames);
      if (totalF.current > 0) setStTrack(Math.round(trackedF.current / totalF.current * 100) + '%');
      if (frames > 10) {
        const ys = recordedFrames.current.filter(f => f.tracked).map(f => f.y);
        if (ys.length > 1) {
          const my = ys.reduce((a, b) => a + b, 0) / ys.length;
          const sy = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / ys.length);
          setStYstd(sy.toFixed(0) + 'px');
          setStYstdOk(sy > 30);
        }
      }
    };
    const worker = workerRef.current;
    worker.addEventListener('message', handler);
    return () => worker?.removeEventListener('message', handler);
  }, [workerRef, affineBias, gazeModel, meta, sessionStart, perfStart]);

  // Setup canvas resize + timer + media + key handlers
  useEffect(() => {
    const resize = () => {
      const c = gazeCanvasRef.current;
      if (c) { c.width = window.innerWidth; c.height = window.innerHeight; }
    };
    resize();
    window.addEventListener('resize', resize);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    timerInt.current = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      setHudTimer(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 500);

    trialAutoTimer.current = setTimeout(advanceTrial, TRIAL_AUTO_SPLIT_MS);

    if (mediaQueue.length > 0) loadMedia(0);

    const onKey = (e) => {
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const t = performance.now() - perfStart;
        annotations.current.push({ t, wallClock: sessionStart + t, label: 'Annotation_' + e.key });
        recordedFrames.current.push({
          t, x: NaN, y: NaN, tracked: 0, feat: null,
          trial: trialNumber.current, trialStartMs: trialStart.current,
          gazeEvent: 'Annotation_' + e.key,
          irisRadiusPxL: NaN, irisRadiusPxR: NaN, faceConfPct: 0, fixationIndex: 0,
          wallClock: sessionStart + t,
          pupilLX: NaN, pupilLY: NaN, pupilRX: NaN, pupilRY: NaN,
          pupilSizeLX: NaN, pupilSizeLY: NaN, pupilSizeRX: NaN, pupilSizeRY: NaN,
          gvX: NaN, gvY: NaN, gvZ: NaN, eyePosZ: NaN, blinkId: NaN, isSeparator: false,
        });
        showTrialToast('Annot ' + e.key);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearInterval(timerInt.current);
      clearTimeout(trialAutoTimer.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
    };
  }, []); // eslint-disable-line

  const handlePause = () => {
    const newPaused = !pausedRef.current;
    pausedRef.current = newPaused;
    setPaused(newPaused);
    if (newPaused) {
      videoRef.current?.pause();
      clearTimeout(trialAutoTimer.current);
    } else {
      videoRef.current?.play().catch(() => {});
      trialAutoTimer.current = setTimeout(advanceTrial, TRIAL_AUTO_SPLIT_MS);
    }
  };

  const handleEnd = () => {
    clearInterval(timerInt.current);
    clearTimeout(trialAutoTimer.current);
    videoRef.current?.pause();
    onEnd(buildSessionCSV());
  };

  const handleNextTrial = () => {
    const img = imgRef.current;
    if (img && img.style.display !== 'none') { mediaIdx.current++; loadMedia(mediaIdx.current); }
    advanceTrial();
  };

  return (
    <div id="s-stimulus" className="screen active" style={{ background: '#000', alignItems: 'stretch', justifyContent: 'stretch' }}>
      <video ref={videoRef} id="stim-video" playsInline muted style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 1, background: '#000' }} />
      <img ref={imgRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 1, background: '#000', display: 'none' }} alt="" />
      <canvas ref={gazeCanvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2, background: 'transparent' }} />

      {noVideo && (
        <div id="no-video" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#000', zIndex: 5, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 52 }}>🎬</div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No stimulus video loaded.<br />Choose a file to continue.</p>
          <label className="pick-btn" style={{ cursor: 'pointer' }}>
            📂 Choose Media File
            <input type="file" accept="video/*,image/jpeg,image/png,image/gif,image/webp" multiple onChange={e => {
              const files = Array.from(e.target.files); if (!files.length) return;
              const q = files.map(f => ({ src: URL.createObjectURL(f), type: f.type.startsWith('image/') ? 'image' : 'video', name: f.name }));
              mediaQueue.length = 0; mediaQueue.push(...q);
              mediaIdx.current = 0; setNoVideo(false); loadMedia(0); // use new queue inline
            }} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* HUD */}
      <div id="hud" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, background: 'rgba(11,13,17,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 100 }}>
        <div className="hud-l">
          <div className="hud-chip"><div className="rec-pulse" />&nbsp;<b>{hudTimer}</b></div>
          <div className="hud-chip">ID: <b>{meta.pid || '—'}</b></div>
          <div className="hud-chip">Group: <b>{meta.group || '—'}</b></div>
          <div className="hud-chip">Face: <b className={hudFaceOk ? 'ok' : 'bad'}>{hudFace}</b></div>
          <div className="hud-chip" style={{ background: 'rgba(0,229,176,0.15)', borderColor: 'var(--accent)' }}>Trial: <b>{hudTrial}</b></div>
          <div className="hud-chip" style={{ background: 'rgba(99,102,241,0.15)', borderColor: '#6366f1' }}>Media: <b>{hudMedia}</b></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="end-btn" onClick={handleNextTrial} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fontSize: 12, padding: '6px 14px', color: '#fff', border: 'none' }}>⏭ Next Trial</button>
          <button className="end-btn" onClick={handlePause} style={{ background: paused ? 'rgba(251,191,36,.28)' : 'rgba(251,191,36,.12)', borderColor: 'rgba(251,191,36,.35)', color: '#fbbf24', fontSize: 12, padding: '6px 14px' }}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="end-btn" onClick={handleEnd}>■ End</button>
        </div>
      </div>

      {/* Stats */}
      <div id="stats" style={{ position: 'fixed', top: 48, right: 0, width: 170, background: 'rgba(11,13,17,.92)', borderLeft: '1px solid var(--border)', padding: '14px 12px', zIndex: 90, fontSize: 12 }}>
        {[
          ['Face', hudFace, hudFaceOk],
          ['Gaze', stGaze, stGazeOk],
          ['Frames', stFrames, true],
          ['Track%', stTrack, true],
          ['POR Y std', stYstd, stYstdOk],
        ].map(([label, val, ok]) => (
          <div key={label} className="sr">
            <span className="sl">{label}</span>
            <span className={`sv ${ok ? 'ok' : 'bad'}`}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
