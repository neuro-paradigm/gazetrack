import { useEffect, useState } from 'react';
import { downloadCSV } from '../gazeUtils.js';

export default function DoneScreen({ csvData, meta, recordStats, affineBias, trialNumber, onRestart }) {
  const [dbIcon, setDbIcon] = useState('☁️');
  const [dbMsg, setDbMsg] = useState('Saving session to database…');
  const [dbBorder, setDbBorder] = useState('var(--border)');
  const [uploadDone, setUploadDone] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const { frames, tracked, total, duration, ystd } = recordStats;
  const ystdVal = typeof ystd === 'number' ? ystd : 0;
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0;
  const biasOk = Math.abs(affineBias.dx) > 5 || Math.abs(affineBias.dy) > 5;
  const biasLabel = biasOk
    ? `${affineBias.dx > 0 ? '+' : ''}${affineBias.dx.toFixed(0)},${affineBias.dy > 0 ? '+' : ''}${affineBias.dy.toFixed(0)}px`
    : 'Minimal';

  const stars = new Array(trialNumber).fill('🌟').join('');

  const doUpload = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: meta.pid,
          group: meta.group,
          csvData
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDbIcon('✅');
        setDbMsg('Session saved securely to database.');
        setDbBorder('rgba(0, 229, 176, 0.4)');
        setUploadDone(true);
      } else {
        throw new Error(data.message || 'Database error');
      }
    } catch (err) {
      console.error('Error saving session:', err);
      setDbIcon('❌');
      setDbMsg('Save failed — data stored locally only.');
      setDbBorder('rgba(255,92,58,0.4)');
      setDbError(true);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => doUpload(), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const handleDownload = () => {
    downloadCSV(csvData, meta.pid, meta.group);
    // Exit fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // Show countdown then redirect
    let secs = 3;
    setCountdown(secs);
    const interval = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        clearInterval(interval);
        onRestart();
      } else {
        setCountdown(secs);
      }
    }, 1000);
  };

  return (
    <div id="s-done" className="screen active" style={{ background: 'var(--ink)', gap: 20, padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 72 }} className="done-icon">🎉</div>
      <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>Session Complete!</h2>

      <div className="done-stats">
        <div style={{ width: '100%', textAlign: 'center' }}>
          {trialNumber > 0 && (
            <>
              <div style={{ fontSize: 32, letterSpacing: 4, marginBottom: 12 }}>{stars}</div>
              <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 24 }}>
                You earned {trialNumber} star{trialNumber === 1 ? '' : 's'}!
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            ['FRAMES', frames],
            [`${pct}%`, 'TRACKED'],
            [`${duration}s`, 'DURATION'],
            [trialNumber, 'TRIALS'],
            [ystdVal.toFixed(0) + 'px', 'Y STD'],
            [biasLabel, 'BIAS CORR'],
          ].map(([n, l]) => (
            <div key={l} className="done-stat">
              <div className="n" style={{ color: l === 'Y STD' ? (parseFloat(n) > 30 ? 'var(--accent)' : 'var(--warn)') : l === 'BIAS CORR' ? 'var(--accent)' : undefined, fontSize: l === 'BIAS CORR' ? 13 : undefined }}>{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div id="drive-status" style={{ margin: '4px 0 8px', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontFamily: 'var(--mono)', background: 'var(--ink2)', border: `1px solid ${dbBorder}`, display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, justifyContent: 'center' }}>
        <span>{dbIcon}</span><span>{dbMsg}</span>
      </div>

      <div className="done-actions">
        <button className="btn-dl" onClick={handleDownload} disabled={countdown !== null}>
          {countdown !== null ? `✅ Downloaded! Returning in ${countdown}s…` : '📥 Download CSV'}
        </button>
        <button className="btn-restart" onClick={onRestart}>New Session ↻</button>
      </div>
      {countdown === null && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Downloading CSV will automatically return to start after 3 seconds.
        </div>
      )}
    </div>
  );
}
