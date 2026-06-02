import { useState, useRef, useEffect, useCallback } from 'react';
import { drawPreviewMesh } from '../drawing.js';

const isMobile = /Android|iPad|iPhone|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1200);
const MP_DELEGATE = isMobile ? 'CPU' : 'GPU';

export default function IntakeScreen({ onStart }) {
  const [pid, setPid] = useState('');
  const [age, setAge] = useState('');
  const [group, setGroup] = useState('');
  const [clinician, setClinician] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [buddy, setBuddy] = useState('cat');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(true);
  const [mediaQueue, setMediaQueue] = useState([]);
  const [mediaLabel, setMediaLabel] = useState('');

  // Camera / preflight state
  const [camStatus, setCamStatus] = useState('Initialising…');
  const [camOk, setCamOk] = useState(false);
  const [qPct, setQPct] = useState(0);
  const [chkFace, setChkFace] = useState(false);
  const [chkIris, setChkIris] = useState(false);
  const [pfState, setPfState] = useState({ cam: 'scanning', face: 'scanning', light: 'scanning', browser: 'scanning' });
  const [allClear, setAllClear] = useState(false);
  const [allClearDetail, setAllClearDetail] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const camStreamRef = useRef(null);
  const previewFlRef = useRef(null);
  const pfRafRef = useRef(null);
  const previewRafRef = useRef(null);
  const pfStateRef = useRef({ cam: 'scanning', face: 'scanning', light: 'scanning', browser: 'scanning' });
  const pfSamplesRef = useRef([]);
  const pfThrottleRef = useRef(0);
  const pfCanvasRef = useRef(null);
  const lastPreviewTsRef = useRef(-1);
  const prevLastRunRef = useRef(0);
  const goodStreakRef = useRef(0);
  const badStreakRef = useRef(0);
  const allClearShowingRef = useRef(false);
  const GOOD_STREAK = 8, BAD_STREAK = 12;

  const canStart = pid.trim().length > 0 && group !== '';

  const updatePfState = useCallback((id, state, msg) => {
    pfStateRef.current[id] = state;
    setPfState(prev => ({ ...prev, [id]: state, [id + '_msg']: msg }));
  }, []);

  // Preflight score
  const pfScore = (() => {
    const vals = Object.values({ cam: pfState.cam, face: pfState.face, light: pfState.light, browser: pfState.browser });
    const passes = vals.filter(v => v === 'pass').length;
    const warns = vals.filter(v => v === 'warn').length;
    return Math.round(((passes + warns * 0.6) / vals.length) * 100);
  })();

  // All-clear logic
  const updateAllClear = useCallback((bright) => {
    const posOk = pfStateRef.current.face === 'pass';
    const lightOk = pfStateRef.current.light === 'pass';
    const allOk = posOk && lightOk;
    if (allOk) {
      badStreakRef.current = 0;
      goodStreakRef.current = Math.min(goodStreakRef.current + 1, GOOD_STREAK + 1);
      if (goodStreakRef.current >= GOOD_STREAK && !allClearShowingRef.current) {
        allClearShowingRef.current = true;
        setAllClear(true);
        setAllClearDetail(`Brightness ${Math.round(bright)}/255`);
      }
    } else {
      goodStreakRef.current = 0;
      badStreakRef.current = Math.min(badStreakRef.current + 1, BAD_STREAK + 1);
      if (badStreakRef.current >= BAD_STREAK && allClearShowingRef.current) {
        allClearShowingRef.current = false;
        setAllClear(false);
      }
    }
  }, []);

  // Pixel analysis loop
  const pfAnalyseFrame = useCallback(function tick() {
    const now = performance.now();
    if (now - pfThrottleRef.current < 200) { pfRafRef.current = requestAnimationFrame(tick); return; }
    pfThrottleRef.current = now;
    const vid = videoRef.current;
    if (!vid || vid.readyState < 2) { pfRafRef.current = requestAnimationFrame(tick); return; }
    if (!pfCanvasRef.current) {
      pfCanvasRef.current = document.createElement('canvas');
      pfCanvasRef.current.width = 80; pfCanvasRef.current.height = 60;
    }
    const pCtx = pfCanvasRef.current.getContext('2d', { willReadFrequently: true });
    try {
      pCtx.drawImage(vid, 0, 0, 80, 60);
      const d = pCtx.getImageData(0, 0, 80, 60).data;
      let sumR = 0, sumG = 0, sumB = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sumR += d[i]; sumG += d[i + 1]; sumB += d[i + 2]; n++; }
      const bright = (sumR + sumG + sumB) / (n * 3);
      pfSamplesRef.current.push(bright);
      if (pfSamplesRef.current.length > 3) pfSamplesRef.current.shift();
      const avg = pfSamplesRef.current.reduce((a, b) => a + b, 0) / pfSamplesRef.current.length;
      if (avg >= 60 && avg <= 220) updatePfState('light', 'pass', `✓ Good (${Math.round(avg)}/255)`);
      else if (avg < 40) updatePfState('light', 'fail', `✗ Too dark (${Math.round(avg)}) — add light`);
      else if (avg < 60) updatePfState('light', 'warn', `⚠ Dim (${Math.round(avg)}) — improve lighting`);
      else updatePfState('light', 'warn', `⚠ Bright (${Math.round(avg)}) — reduce backlight`);
      updateAllClear(avg);
    } catch { /* ignore */ }
    pfRafRef.current = requestAnimationFrame(tick);
  }, [updatePfState, updateAllClear]);

  // Preview mesh loop
  const previewLoop = useCallback(function loop() {
    const now = performance.now();
    if (now - prevLastRunRef.current < 125) { previewRafRef.current = requestAnimationFrame(loop); return; }
    prevLastRunRef.current = now;
    const vid = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas || vid.readyState < 2 || !previewFlRef.current) {
      previewRafRef.current = requestAnimationFrame(loop); return;
    }
    const rect = canvas.getBoundingClientRect();
    const dW = Math.round(rect.width) || 640, dH = Math.round(rect.height) || 480;
    if (canvas.width !== dW || canvas.height !== dH) { canvas.width = dW; canvas.height = dH; }
    let ts = vid.currentTime * 1000;
    if (ts <= lastPreviewTsRef.current) ts = lastPreviewTsRef.current + 0.001;
    lastPreviewTsRef.current = ts;
    try {
      const res = previewFlRef.current.detectForVideo(vid, ts);
      const hasFace = !!(res.faceLandmarks && res.faceLandmarks.length > 0);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hasFace) {
        drawPreviewMesh(ctx, res.faceLandmarks[0], canvas.width, canvas.height);
        const lm = res.faceLandmarks[0];
        const hasIris = !!(lm[468] && lm[473]);
        setChkFace(true); setChkIris(hasIris);
        if (hasIris) {
          const iodNorm = Math.hypot(lm[473].x - lm[468].x, lm[473].y - lm[468].y);
          const faceCX = (lm[33].x + lm[263].x) / 2;
          const offCentre = faceCX < 0.25 || faceCX > 0.75;
          const lEAR = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
          const rEAR = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);
          const earPx = (lEAR + rEAR) / 2;
          const q = (earPx / (iodNorm + 1e-6)) > 0.08 ? 95 : 75;
          setQPct(q);
          if (iodNorm > 0.24) updatePfState('face', 'warn', '⚠ Too close — move back ~15 cm');
          else if (iodNorm >= 0.10) updatePfState('face', 'pass', offCentre ? '✔ Good distance · Centre your face' : '✔ Face visible · Good distance (~45–75 cm)');
          else if (iodNorm >= 0.06) updatePfState('face', 'warn', '⚠ Too far — move ~20 cm closer');
          else updatePfState('face', 'warn', '⚠ Very far — move much closer');
        } else {
          setQPct(40);
          updatePfState('face', 'warn', '⚠ Face detected but iris not visible — look at camera');
        }
      } else {
        setChkFace(false); setChkIris(false); setQPct(0);
        updatePfState('face', 'fail', '✗ No face detected — check camera position');
      }
    } catch { /* ignore */ }
    previewRafRef.current = requestAnimationFrame(loop);
  }, [updatePfState]);

  // Init camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        camStreamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        const t = stream.getVideoTracks()[0].getSettings();
        setCamOk(true);
        setCamStatus('Camera active');
        updatePfState('cam', 'pass', `✓ ${t.width || 640}×${t.height || 480}`);

        // Browser check
        const ua = navigator.userAgent;
        if (/Chrome/.test(ua) && !/Edg/.test(ua) && !/OPR/.test(ua)) updatePfState('browser', 'pass', '✓ Chrome — optimal');
        else if (/Edg/.test(ua)) updatePfState('browser', 'pass', '✓ Edge — good');
        else if (/Firefox/.test(ua)) updatePfState('browser', 'warn', '⚠ Firefox — use Chrome for best results');
        else updatePfState('browser', 'warn', '⚠ Use Chrome for best results');

        pfRafRef.current = requestAnimationFrame(pfAnalyseFrame);

        // Load preview detector
        const { FaceLandmarker, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        );
        if (cancelled) return;
        const resolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        previewFlRef.current = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: MP_DELEGATE,
          },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true, outputIrisLandmarks: true,
        });
        if (!cancelled) previewRafRef.current = requestAnimationFrame(previewLoop);
      } catch {
        setCamStatus('✗ Camera error — allow access');
        updatePfState('cam', 'fail', '✗ Camera denied or not found');
        updatePfState('face', 'fail', '✗ No camera');
        updatePfState('light', 'fail', '✗ No camera');
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(pfRafRef.current);
      cancelAnimationFrame(previewRafRef.current);
    };
  }, [pfAnalyseFrame, previewLoop, updatePfState]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const q = files.map(f => ({ src: URL.createObjectURL(f), type: f.type.startsWith('image/') ? 'image' : 'video', name: f.name }));
    setMediaQueue(q);
    setMediaLabel(files.length === 1 ? files[0].name : `${files.length} files selected`);
  };

  const handleStart = () => {
    cancelAnimationFrame(pfRafRef.current);
    cancelAnimationFrame(previewRafRef.current);
    
    // Request fullscreen on user gesture if enabled
    if (fullscreenEnabled && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    onStart({
      meta: { pid: pid.trim(), age, group, clinician: clinician.trim(), location: location.trim(), notes: notes.trim(), colorTag: '' },
      buddy, ttsEnabled, soundEnabled, mediaQueue,
      camStream: camStreamRef.current,
      previewFl: previewFlRef.current,
    });
  };

  const pfLabels = { cam: 'Camera', face: 'Position & Distance', light: 'Lighting', browser: 'Browser' };
  const pfIcons = { cam: '📷', face: '👤', light: '💡', browser: '🌐' };
  const pfKeys = ['cam', 'face', 'light', 'browser'];

  const advice = [];
  if (pfState.light === 'fail') advice.push('💡 Too dark: Add a front-facing lamp.');
  if (pfState.light === 'warn') advice.push('💡 Lighting: Brighter room helps iris detection.');
  if (pfState.face === 'fail') advice.push('👤 No face: Make sure child is in frame, camera at eye level.');
  if (pfState.browser === 'warn') advice.push('🌐 Browser: Use Chrome for best webcam performance.');

  return (
    <div id="s-intake" className="screen active" style={{ background: '#f0f4f8', overflowY: 'auto', padding: '40px 20px', alignItems: 'stretch', justifyContent: 'flex-start', color: '#1e293b' }}>
      <div className="intake-wrap">
        {/* Header */}
        <div className="intake-header">
          <div className="intake-logo">
            <div className="logo-dot">👁</div>
            <div className="logo-name">Gaze<span>Track</span></div>
          </div>
          <div className="intake-title">New Session Setup</div>
          <div className="intake-sub">Complete the form below. Camera feed is previewed live to confirm positioning before starting.</div>
          <button
            onClick={() => setSoundEnabled(s => !s)}
            style={{ marginTop: 10, padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${soundEnabled ? '#cbd5e1' : '#f87171'}`, background: '#fff', fontSize: 13, fontWeight: 700, color: soundEnabled ? '#475569' : '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {soundEnabled ? '🔊 Sounds On' : '🔇 Sounds Off'}
          </button>
        </div>

        {/* All-clear banner */}
        {allClear && (
          <div id="position-allclear" className="show" style={{ display: 'flex', margin: '0 0 14px', padding: '12px 16px', borderRadius: 10, background: 'rgba(13,148,136,.08)', border: '1.5px solid rgba(13,148,136,.35)', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24 }}>✅</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0d9488', marginBottom: 2 }}>Great position! Ready to go.</div>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--mono)' }}>{allClearDetail}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {['✓ Face visible  |  Good distance', '✓ Lighting OK'].map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(13,148,136,.1)', color: '#0d9488', fontFamily: 'var(--mono)', border: '1px solid rgba(13,148,136,.25)' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Child Info */}
        <div className="form-section">
          <div className="section-label">Child Information</div>
          <div className="field">
            <label>Participant ID <span style={{ color: '#0d9488' }}>*</span></label>
            <div className="input-wrap"><input type="text" value={pid} onChange={e => setPid(e.target.value)} placeholder="e.g. CHILD_042" maxLength={40} /></div>
          </div>
          <div className="field">
            <label>Age (years)</label>
            <div className="input-wrap"><input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 4" min="1" max="18" /></div>
          </div>
          <div className="field">
            <label>Diagnosis Group <span style={{ color: '#0d9488' }}>*</span></label>
            <div className="radio-group">
              {[['ASD', '🔵', 'Diagnosed ASD'], ['TD', '🟢', 'Typically developing']].map(([val, emoji, sub]) => (
                <label key={val} className="radio-btn">
                  <input type="radio" name="group" value={val} checked={group === val} onChange={() => setGroup(val)} />
                  <div className="radio-face">
                    <div className="emoji">{emoji}</div>
                    <div className="label">{val}</div>
                    <div className="sub">{sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Sensory */}
        <div className="form-section">
          <div className="section-label">Sensory & Preferences</div>
          <div className="field">
            <label>Calibration Buddy <span style={{ color: '#0d9488' }}>*</span></label>
            <div className="radio-group" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {[['cat', '🐱', 'Cat', 'Calm'], ['dog', '🐶', 'Dog', 'Friendly'], ['spaceship', '🚀', 'Space', 'Non-face']].map(([val, emoji, label, sub]) => (
                <label key={val} className="radio-btn">
                  <input type="radio" name="char" value={val} checked={buddy === val} onChange={() => setBuddy(val)} />
                  <div className="radio-face">
                    <div className="emoji">{emoji}</div>
                    <div className="label">{label}</div>
                    <div className="sub">{sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Audio & Display</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#334155', marginTop: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={ttsEnabled} onChange={e => setTtsEnabled(e.target.checked)} style={{ width: 18, height: 18 }} /> Enable speech guidance
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#334155', marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={fullscreenEnabled} onChange={e => setFullscreenEnabled(e.target.checked)} style={{ width: 18, height: 18 }} /> Enter full screen automatically
            </label>
          </div>
        </div>

        {/* Session Details */}
        <div className="form-section">
          <div className="section-label">Session Details</div>
          <div className="field">
            <label>Clinician / Researcher</label>
            <div className="input-wrap"><input type="text" value={clinician} onChange={e => setClinician(e.target.value)} placeholder="Your name" /></div>
          </div>
          <div className="field">
            <label>Session Location</label>
            <div className="input-wrap"><input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Lab Room 2" /></div>
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <textarea className="notes-area" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any relevant observations…" />
          </div>
        </div>

        {/* Stimulus */}
        <div className="form-section">
          <div className="section-label">Stimulus Video</div>
          <div className="field">
            <label>Video File (optional — can load after calibration)</label>
            <div className="video-drop" onClick={() => document.getElementById('video-input-hidden').click()}>
              <div className="icon">🎬</div>
              {mediaLabel
                ? <div className="chosen">✓ {mediaLabel}</div>
                : <div className="hint">Click to choose videos or images (select multiple)</div>
              }
              <input type="file" id="video-input-hidden" accept="video/*,image/jpeg,image/png,image/gif,image/webp" multiple onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* Camera & Preflight */}
        <div className="section-label" style={{ marginBottom: 10 }}>📷 Camera & Environment Check</div>
        <div className="cam-card">
          <div className="cam-preview-wrap">
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block', minHeight: 220 }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            <div className="cam-badge">
              <div className={`cam-badge-dot${camOk ? ' ok' : ''}`} />
              <span>{camStatus}</span>
            </div>
          </div>
          <div className="cam-info">
            <div className="cam-quality">
              <span>Quality</span>
              <div className="quality-bar"><div className="quality-fill" style={{ width: qPct + '%' }} /></div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{qPct ? qPct + '%' : '--'}</span>
            </div>
            <div className="cam-checklist">
              <div className={`chk${camOk ? ' ok' : ''}`}>📷 {camOk ? '✓ Cam' : 'Camera'}</div>
              <div className={`chk${chkFace ? ' ok' : ''}`}>👤 {chkFace ? '✓ Face' : 'Face'}</div>
              <div className={`chk${chkIris ? ' ok' : ''}`}>👁 {chkIris ? '✓ Iris' : 'Iris'}</div>
            </div>
          </div>
        </div>

        {/* Preflight panel */}
        <div id="preflight-panel">
          <div className="pf-checks">
            {pfKeys.map(key => (
              <div key={key} className={`pf-check ${pfState[key] || 'scanning'}`}>
                <div className="pf-check-icon">{pfIcons[key]}</div>
                <div className="pf-check-body">
                  <div className="pf-check-name">{pfLabels[key]}</div>
                  <div className="pf-check-status">
                    {pfState[key] === 'scanning'
                      ? <><span className="pf-spin" /> Checking...</>
                      : pfState[key + '_msg'] || '…'
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="pf-score-row">
            <span className="pf-score-label">Readiness</span>
            <div className="pf-score-bar">
              <div className="pf-score-fill" style={{ width: pfScore + '%', background: pfScore >= 75 ? 'var(--accent)' : pfScore >= 50 ? 'var(--gold)' : 'var(--warn)' }} />
            </div>
            <span className="pf-score-pct">{pfScore}%</span>
          </div>
          {advice.length > 0 && (
            <div className="pf-advice show" dangerouslySetInnerHTML={{ __html: advice.join('<br>') }} />
          )}
        </div>

        <button className="start-btn" disabled={!canStart} onClick={handleStart}>
          Begin Session <span className="arrow">→</span>
        </button>
        <div className="disclaimer">
          All data processed locally. No video or biometric data uploaded to any server.<br />
          For research use only — not a clinical diagnostic instrument.
        </div>
      </div>
    </div>
  );
}
