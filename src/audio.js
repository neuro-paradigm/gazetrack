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

export function speak(text, enabled) {
  if (!enabled) return;
  const msg = new SpeechSynthesisUtterance(text);
  msg.rate = 0.95; msg.pitch = 1.1;
  window.speechSynthesis.speak(msg);
}
