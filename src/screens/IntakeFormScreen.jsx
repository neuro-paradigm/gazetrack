import { useState, useEffect } from 'react';

// Shuffle array in-place using Fisher-Yates
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build a playlist where:
//  1. A video ALWAYS plays first
//  2. After that, videos are spread out between images (never two videos in a row)
//  3. Any leftover videos go at the end if we run out of images to separate them
function buildPlaylist(files) {
  const videos = shuffle(files.filter(f => f.type === 'video'));
  const images = shuffle(files.filter(f => f.type === 'image'));

  if (videos.length === 0) return images; // no videos – just shuffle images
  if (images.length === 0) return videos; // no images – just shuffle videos

  const result = [];

  // Always start with a video
  result.push(videos.shift());

  // Now interleave: for each remaining video, drop 1-2 images first
  let imgIdx = 0;
  while (videos.length > 0) {
    // Place 1 or 2 images (whatever's available) then a video
    const imgCount = Math.min(2, images.length - imgIdx);
    for (let i = 0; i < imgCount; i++) result.push(images[imgIdx++]);
    result.push(videos.shift());
  }

  // Append any remaining images at the end
  while (imgIdx < images.length) result.push(images[imgIdx++]);

  return result;
}

export default function IntakeFormScreen({ onNext }) {
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
  const [driveStatus, setDriveStatus] = useState('fetching'); // 'fetching', 'success', 'error'

  const canStart = pid.trim().length > 0 && group !== '';

  useEffect(() => {
    fetch('/api/stimuli/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.files && data.files.length > 0) {
          const raw = data.files.map(f => ({
            src: `/api/stimuli/media/${f.id}`,
            type: f.mimeType.startsWith('image/') ? 'image' : 'video',
            name: f.name
          }));
          const q = buildPlaylist(raw);
          setMediaQueue(q);
          const vCount = q.filter(f => f.type === 'video').length;
          const iCount = q.filter(f => f.type === 'image').length;
          setMediaLabel(`Loaded ${q.length} files (${vCount} videos, ${iCount} images) — video-first order`);
          setDriveStatus('success');
        } else {
          setMediaLabel('No files found in Drive folder');
          setDriveStatus('error');
        }
      })
      .catch(err => {
        console.error('Error fetching stimuli from Drive:', err);
        setMediaLabel('Failed to connect to Drive proxy');
        setDriveStatus('error');
      });
  }, []);

  const handleNext = () => {
    onNext({
      meta: { pid: pid.trim(), age, group, clinician: clinician.trim(), location: location.trim(), notes: notes.trim(), colorTag: '' },
      buddy, ttsEnabled, soundEnabled, fullscreenEnabled, mediaQueue
    });
  };

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
          <div className="intake-sub">Complete the form below. Camera will be activated on the next step.</div>
          <button
            onClick={() => setSoundEnabled(s => !s)}
            style={{ marginTop: 10, padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${soundEnabled ? '#cbd5e1' : '#f87171'}`, background: '#fff', fontSize: 13, fontWeight: 700, color: soundEnabled ? '#475569' : '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {soundEnabled ? '🔊 Sounds On' : '🔇 Sounds Off'}
          </button>
        </div>

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
        <div className="form-section" style={{ marginBottom: 20 }}>
          <div className="section-label">Stimulus Source</div>
          <div className="field">
            <div className="video-drop" style={{ cursor: 'default', background: driveStatus === 'success' ? '#f0fdf4' : driveStatus === 'error' ? '#fef2f2' : '#f8fafc', borderColor: driveStatus === 'success' ? '#bbf7d0' : driveStatus === 'error' ? '#fecaca' : '#e2e8f0' }}>
              <div className="icon">☁️</div>
              {driveStatus === 'fetching' && <div className="hint">Connecting to Google Drive...</div>}
              {driveStatus === 'success' && <div className="chosen" style={{ color: '#166534' }}>✓ {mediaLabel}</div>}
              {driveStatus === 'error' && <div className="hint" style={{ color: '#991b1b' }}>⚠ {mediaLabel}</div>}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Stimulus will play automatically after the calibration and validation sequence.
            </div>
          </div>
        </div>

        <button className="start-btn" disabled={!canStart} onClick={handleNext}>
          Next: Camera Check <span className="arrow">→</span>
        </button>
      </div>
    </div>
  );
}
