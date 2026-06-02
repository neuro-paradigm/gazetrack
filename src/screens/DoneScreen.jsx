import { useEffect, useState } from 'react';
import { downloadCSV } from '../gazeUtils.js';
import { uploadToDrive, AUTHORISED_EMAIL } from '../drive.js';

export default function DoneScreen({ csvData, meta, recordStats, affineBias, trialNumber, onRestart }) {
  const [driveIcon, setDriveIcon] = useState('☁️');
  const [driveMsg, setDriveMsg] = useState('Connecting to Google Drive…');
  const [driveBorder, setDriveBorder] = useState('var(--border)');
  const [driveFileId, setDriveFileId] = useState(null);
  const [driveFolderId, setDriveFolderId] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [retryFilename, setRetryFilename] = useState('');
  const [wrongAccount, setWrongAccount] = useState(false);

  const { frames, tracked, total, duration, ystd } = recordStats;
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0;
  const biasOk = Math.abs(affineBias.dx) > 5 || Math.abs(affineBias.dy) > 5;
  const biasLabel = biasOk
    ? `${affineBias.dx > 0 ? '+' : ''}${affineBias.dx.toFixed(0)},${affineBias.dy > 0 ? '+' : ''}${affineBias.dy.toFixed(0)}px`
    : 'Minimal';

  const stars = new Array(trialNumber).fill('🌟').join('');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `gaze_${meta.pid}_${meta.group}_${ts}.csv`;

  const doUpload = async (fname) => {
    try {
      const { fileId, folderId } = await uploadToDrive(csvData, fname, (icon, msg, border) => {
        setDriveIcon(icon); setDriveMsg(msg); setDriveBorder(border);
      });
      setDriveFileId(fileId);
      setDriveFolderId(folderId);
      setUploadDone(true);
    } catch (err) {
      if (err.message && err.message.startsWith('WRONG_ACCOUNT:')) {
        const used = err.message.split(':')[1];
        setDriveIcon('⛔');
        setDriveMsg(`Wrong account: ${used} — must use ${AUTHORISED_EMAIL}`);
        setDriveBorder('rgba(255,92,58,0.4)');
        setWrongAccount(true);
        setRetryFilename(`gaze_${meta.pid}_${meta.group}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
      } else {
        setDriveIcon('❌');
        setDriveMsg('Drive failed — downloading locally instead');
        setDriveBorder('rgba(255,92,58,0.4)');
        downloadCSV(csvData, meta.pid, meta.group);
      }
    }
  };

  useEffect(() => {
    const t = setTimeout(() => doUpload(filename), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const handleDriveBtn = () => {
    if (wrongAccount) {
      setWrongAccount(false);
      doUpload(retryFilename);
    } else if (driveFileId) {
      window.open('https://drive.google.com/file/d/' + driveFileId + '/view', '_blank');
    } else if (driveFolderId) {
      window.open('https://drive.google.com/drive/folders/' + driveFolderId, '_blank');
    } else {
      window.open('https://drive.google.com', '_blank');
    }
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
            [ystd.toFixed(0) + 'px', 'Y STD'],
            [biasLabel, 'BIAS CORR'],
          ].map(([n, l]) => (
            <div key={l} className="done-stat">
              <div className="n" style={{ color: l === 'Y STD' ? (parseFloat(n) > 30 ? 'var(--accent)' : 'var(--warn)') : l === 'BIAS CORR' ? 'var(--accent)' : undefined, fontSize: l === 'BIAS CORR' ? 13 : undefined }}>{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div id="drive-status" style={{ margin: '4px 0 8px', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontFamily: 'var(--mono)', background: 'var(--ink2)', border: `1px solid ${driveBorder}`, display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, justifyContent: 'center' }}>
        <span>{driveIcon}</span><span>{driveMsg}</span>
      </div>

      <div className="done-actions">
        <button
          className="btn-dl"
          style={{ opacity: uploadDone || wrongAccount ? 1 : 0.45, pointerEvents: uploadDone || wrongAccount ? 'auto' : 'none', cursor: uploadDone || wrongAccount ? 'pointer' : 'not-allowed' }}
          onClick={handleDriveBtn}
        >
          {wrongAccount ? '↺ Retry Upload' : uploadDone ? '☁️ Open in Drive' : '⏳ Saving to Drive…'}
        </button>
        <button className="btn-restart" onClick={onRestart}>↺ New Session</button>
      </div>
    </div>
  );
}
