let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) { try { _audioCtx = new AudioContext(); } catch { /* ignore */ } }
  return _audioCtx;
}

export function playChime(freq, vol, duration, enabled) {
  if (!enabled) return;
  const a = getAudioCtx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.connect(g); g.connect(a.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.8, a.currentTime);
  o.frequency.linearRampToValueAtTime(freq, a.currentTime + 0.1);
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  o.start(); o.stop(a.currentTime + duration);
}

export function playCalibSound(enabled) {
  if (!enabled) return;
  const a = getAudioCtx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.connect(g); g.connect(a.destination);
  o.frequency.value = 880;
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(0.15, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.3);
  o.start(); o.stop(a.currentTime + 0.3);
}

// Prefer a female voice — loaded async by the browser
let _femaleVoice = null;
function getFemaleVoice() {
  if (_femaleVoice) return _femaleVoice;
  const voices = window.speechSynthesis.getVoices();
  // Priority list of well-known female voices across browsers / OS
  const preferred = [
    'Google UK English Female',
    'Google US English Female',
    'Samantha',            // macOS / iOS
    'Karen',               // macOS
    'Moira',               // macOS
    'Tessa',               // macOS
    'Veena',               // macOS
    'Microsoft Zira',      // Windows
    'Microsoft Aria',      // Windows 11
    'Microsoft Jenny',     // Windows 11
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { _femaleVoice = v; return v; }
  }
  // Fall back: any voice whose name contains 'female' (case-insensitive)
  const fallback = voices.find(v => /female/i.test(v.name));
  if (fallback) { _femaleVoice = fallback; return fallback; }
  return null; // browser will use its default
}

// Pre-warm voices list once the browser has loaded them
if (typeof window !== 'undefined') {
  window.speechSynthesis.addEventListener('voiceschanged', getFemaleVoice);
}

export function speak(text, enabled) {
  if (!enabled) return;
  const msg = new SpeechSynthesisUtterance(text);
  const voice = getFemaleVoice();
  if (voice) msg.voice = voice;
  msg.rate = 0.92; msg.pitch = 1.15;
  window.speechSynthesis.speak(msg);
}
