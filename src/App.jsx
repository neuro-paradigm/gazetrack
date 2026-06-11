import { useState, useRef, useEffect, useCallback } from 'react';
import IntakeFormScreen from './screens/IntakeFormScreen.jsx';
import CameraCheckScreen from './screens/CameraCheckScreen.jsx';
import CalibrationScreen from './screens/CalibrationScreen.jsx';
import ValidationScreen from './screens/ValidationScreen.jsx';
import StimulusScreen from './screens/StimulusScreen.jsx';
import DoneScreen from './screens/DoneScreen.jsx';
import { playChime, speak } from './audio.js';

const isMobile = /Android|iPad|iPhone|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1200);
const MP_DELEGATE = isMobile ? 'CPU' : 'GPU';

// Celebration overlay — shown between validation and stimulus
function CelebrationOverlay({ onDone }) {
  useEffect(() => {
    [523, 659, 784].forEach((freq, i) => setTimeout(() => playChime(freq, 0.12, 0.5, true), i * 180));
    speak('Amazing job! You did so well! Now it is time to watch a fun video. Keep looking at the screen!', true);
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#0a0c14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, animation: 'fadeIn .3s ease both' }}>
      <div style={{ fontSize: 80, animation: 'pop .5s cubic-bezier(.17,.67,.26,1.4) both' }}>⭐</div>
      <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: 'var(--sans)' }}>Amazing job!</div>
      <div style={{ fontSize: 20, color: '#7dd8c0', fontFamily: 'var(--sans)', textAlign: 'center', lineHeight: 1.6, maxWidth: 400 }}>Now it's time to watch a fun video 🎬<br/>Keep looking at the screen!</div>
    </div>
  );
}

// Loading screen
function LoadingScreen({ msg }) {
  return (
    <div id="s-loading" className="screen active" style={{ background: 'var(--ink)', gap: 20 }}>
      <div className="load-ring" />
      <div className="load-title">Loading Eye Tracker</div>
      <div className="load-msg">{msg}</div>
    </div>
  );
}

/*
  phase states:
  'intake' → 'loading' → 'calib' → 'validation' → 'celebration' → 'stimulus' → 'done'
*/
export default function App() {
  const [phase, setPhase] = useState('intake_form');
  const [formData, setFormData] = useState(null);
  const [loadMsg, setLoadMsg] = useState('Initialising…');

  // Session config (set on intake submit)
  const [sessionConfig, setSessionConfig] = useState(null);

  // Gaze model state
  const [gazeModel, setGazeModel] = useState(null);
  const [affineBias, setAffineBias] = useState({ dx: 0, dy: 0, sx: 1, sy: 1 });
  const [valSamples, setValSamples] = useState([]);
  const [valQuality, setValQuality] = useState([]);

  // Calibration tracking
  const [calibAttemptNum, setCalibAttemptNum] = useState(0);
  const [calibPassed, setCalibPassed] = useState(false);
  const [calibTimestamp, setCalibTimestamp] = useState('');

  // Session timing
  const [sessionStart, setSessionStart] = useState(0);
  const [perfStart, setPerfStart] = useState(0);

  // Done screen stats
  const [doneStats, setDoneStats] = useState(null);
  const [csvData, setCsvData] = useState('');

  // Web Worker ref — single instance for whole session
  const workerRef = useRef(null);
  const isWorkerBusy = useRef(false);
  // Hidden webcam video element used by worker sender loop
  const webcamRef = useRef(null);
  const sendRafRef = useRef(null);
  const lastSentVT = useRef(-1);

  // Cleanup worker on unmount
  useEffect(() => () => {
    workerRef.current?.postMessage({ type: 'destroy' });
    workerRef.current?.terminate();
    cancelAnimationFrame(sendRafRef.current);
  }, []);

  // Frame-sending loop — captures ImageBitmap from webcam and posts to worker
  const startSendLoop = useCallback((stream) => {
    webcamRef.current = document.createElement('video');
    const video = webcamRef.current;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.play().catch(err => console.error('Hidden video play error:', err));
    
    video.onloadedmetadata = () => { 
      video.play(); 
    };

    function sendFrame() {
      if (!workerRef.current || video.readyState < 2 || isWorkerBusy.current) {
        sendRafRef.current = requestAnimationFrame(sendFrame); return;
      }
      if (video.currentTime === lastSentVT.current) {
        sendRafRef.current = requestAnimationFrame(sendFrame); return;
      }
      lastSentVT.current = video.currentTime;
      isWorkerBusy.current = true;
      const ts = video.currentTime * 1000 || performance.now();
      createImageBitmap(video).then(bitmap => {
        workerRef.current?.postMessage({ type: 'detect', bitmap, timestamp: ts }, [bitmap]);
      }).catch(err => {
        console.error('createImageBitmap error:', err);
        isWorkerBusy.current = false;
      });
      sendRafRef.current = requestAnimationFrame(sendFrame);
    }
    sendRafRef.current = requestAnimationFrame(sendFrame);
  }, []);

  // ─── Intake → Loading → Calib ─────────────────────────────────────────────
  const handleIntakeStart = useCallback(async (config) => {
    setSessionConfig(config);
    setPhase('loading');
    setLoadMsg('Loading eye tracking model…');

    try {
      // Initialise worker
      const worker = new Worker(new URL('./gazeWorker.js', import.meta.url));
      workerRef.current = worker;
      worker.addEventListener('message', (e) => {
        if (e.data.type === 'result' || e.data.type === 'error') {
          isWorkerBusy.current = false;
        }
      });

      await new Promise((resolve, reject) => {
        const initListener = (e) => {
          if (e.data.type === 'ready') { worker.removeEventListener('message', initListener); resolve(); }
          if (e.data.type === 'error') { worker.removeEventListener('message', initListener); reject(new Error(e.data.message)); }
        };
        worker.addEventListener('message', initListener);
        worker.onerror = reject;
        // If previewFl already loaded in IntakeScreen, use its model via re-init in worker
        worker.postMessage({ type: 'init', delegate: MP_DELEGATE });
      });

      setLoadMsg('Model ready — starting camera…');

      // Re-use existing stream from intake or open new one
      let stream = config.camStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      }

      startSendLoop(stream);

      window.addEventListener('resize', () => {
        const c = document.getElementById('calib-canvas');
        const g = document.getElementById('gaze-canvas');
        if (c) { c.width = window.innerWidth; c.height = window.innerHeight; }
        if (g) { g.width = window.innerWidth; g.height = window.innerHeight; }
      });

      setPhase('calib');
    } catch (err) {
      setLoadMsg('❌ ' + (err.message || 'Startup error'));
    }
  }, [startSendLoop]);

  // ─── Calib → Validation ───────────────────────────────────────────────────
  const handleCalibDone = useCallback((model) => {
    setCalibAttemptNum(prev => prev + 1);
    setCalibPassed(true);
    setCalibTimestamp(new Date().toISOString());
    setGazeModel(model);
    setPhase('validation');
    speak('Find the star!', sessionConfig?.ttsEnabled && sessionConfig?.soundEnabled);
  }, [sessionConfig]);

  // ─── Bad calib → back to calib ────────────────────────────────────────────
  const handleBadCalib = useCallback(() => {
    setGazeModel(null);
    setAffineBias({ dx: 0, dy: 0, sx: 1, sy: 1 });
    setPhase('calib');
  }, []);

  // ─── Validation → Celebration → Stimulus ─────────────────────────────────
  const handleValDone = useCallback((bias, samples, quality) => {
    setAffineBias(bias);
    setValSamples(samples);
    setValQuality(quality);
    setPhase('celebration');
  }, []);

  const handleCelebrationDone = useCallback(() => {
    setSessionStart(Date.now());
    setPerfStart(performance.now());
    setPhase('stimulus');
  }, []);

  // ─── Stimulus → Done ──────────────────────────────────────────────────────
  const handleSessionEnd = useCallback((csv, stats) => {
    cancelAnimationFrame(sendRafRef.current);
    setCsvData(csv);

    // Stop camera
    const video = webcamRef.current;
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }

    // Use stats passed from StimulusScreen, with safe fallbacks
    setDoneStats(stats || { frames: 0, tracked: 0, total: 0, duration: 0, ystd: 0 });
    setPhase('done');
  }, []);

  const handleRestart = () => window.location.reload();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden webcam — feeds the worker */}
      <video ref={webcamRef} id="webcam" autoPlay playsInline muted style={{ position: 'fixed', width: 1, height: 1, opacity: 0, top: 0, left: 0 }} />

      {phase === 'intake_form' && <IntakeFormScreen onNext={(data) => { setFormData(data); setPhase('camera_check'); }} />}
      {phase === 'camera_check' && <CameraCheckScreen formData={formData} onStart={handleIntakeStart} onBack={() => setPhase('intake_form')} />}
      {phase === 'loading' && <LoadingScreen msg={loadMsg} />}
      {phase === 'calib' && (
        <CalibrationScreen
          workerRef={workerRef}
          gazeModel={gazeModel}
          buddy={sessionConfig?.buddy || 'cat'}
          soundEnabled={sessionConfig?.soundEnabled ?? true}
          ttsEnabled={sessionConfig?.ttsEnabled ?? true}
          onCalibDone={handleCalibDone}
          onRetry={handleBadCalib}
        />
      )}
      {phase === 'validation' && (
        <ValidationScreen
          workerRef={workerRef}
          gazeModel={gazeModel}
          soundEnabled={sessionConfig?.soundEnabled ?? true}
          ttsEnabled={sessionConfig?.ttsEnabled ?? true}
          onDone={handleValDone}
          onBadCalib={handleBadCalib}
        />
      )}
      {phase === 'celebration' && <CelebrationOverlay onDone={handleCelebrationDone} />}
      {phase === 'stimulus' && sessionConfig && (
        <StimulusScreen
          workerRef={workerRef}
          gazeModel={gazeModel}
          affineBias={affineBias}
          meta={sessionConfig.meta}
          buddy={sessionConfig.buddy}
          soundEnabled={sessionConfig.soundEnabled}
          mediaQueue={sessionConfig.mediaQueue}
          sessionStart={sessionStart}
          perfStart={perfStart}
          calibAttemptNum={calibAttemptNum}
          calibPassed={calibPassed}
          calibTimestamp={calibTimestamp}
          valSamples={valSamples}
          valQuality={valQuality}
          stimFilename={sessionConfig.mediaQueue.map(m => m.name).join(', ') || 'webcam_stimulus'}
          onEnd={handleSessionEnd}
        />
      )}
      {phase === 'done' && sessionConfig && (
        <DoneScreen
          csvData={csvData}
          meta={sessionConfig.meta}
          recordStats={doneStats || { frames: 0, tracked: 0, total: 0, duration: 0, ystd: 0 }}
          affineBias={affineBias}
          trialNumber={1}
          onRestart={handleRestart}
        />
      )}
    </>
  );
}
