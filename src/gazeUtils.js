// ─── Constants ────────────────────────────────────────────────────────────────
export const LEFT_IRIS   = [468, 469, 470, 471];
export const RIGHT_IRIS  = [473, 474, 475, 476];
export const L_CORNERS   = [33, 133];
export const R_CORNERS   = [362, 263];
export const RIDGE_ALPHA = 0.01;
export const MIN_SAMPLES = 30;

// ─── Feature Extraction ───────────────────────────────────────────────────────
export function extractFeatures(lm, mat) {
  const avg = (ids) => {
    const s = { x: 0, y: 0, z: 0 };
    ids.forEach((i) => { s.x += lm[i].x; s.y += lm[i].y; s.z += (lm[i].z || 0); });
    return { x: s.x / ids.length, y: s.y / ids.length, z: s.z / ids.length };
  };
  const li = avg(LEFT_IRIS), ri = avg(RIGHT_IRIS);
  const lIn = lm[L_CORNERS[0]], lOut = lm[L_CORNERS[1]];
  const rIn = lm[R_CORNERS[0]], rOut = lm[R_CORNERS[1]];
  const lW = Math.hypot(lOut.x - lIn.x, lOut.y - lIn.y) + 1e-6;
  const rW = Math.hypot(rOut.x - rIn.x, rOut.y - rIn.y) + 1e-6;
  const lCx = (lIn.x + lOut.x) / 2, rCx = (rIn.x + rOut.x) / 2;
  const liX = (li.x - lCx) / lW, riX = (ri.x - rCx) / rW, avgX = (liX + riX) / 2;
  let pitchDeg = 0;
  if (mat?.data) {
    const m = mat.data;
    pitchDeg = Math.asin(Math.max(-1, Math.min(1, -m[6]))) * 180 / Math.PI / 30;
  }
  const nose = lm[1], fore = lm[10], chin = lm[152];
  const pitchZ = ((nose.z || 0) - ((fore.z || 0) + (chin.z || 0)) / 2) * 10;
  const vertMain = (Math.abs(pitchDeg) > 0.001) ? pitchDeg : pitchZ;
  const foreheadY = fore.y;
  const faceCY = (fore.y + chin.y) / 2, faceH = Math.abs(chin.y - fore.y) + 1e-6;
  const irisY = ((li.y + ri.y) / 2 - faceCY) / faceH;
  const lEAR = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y) / lW;
  const rEAR = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y) / rW;
  const ear = (lEAR + rEAR) / 2;
  const iod = Math.hypot(ri.x - li.x, ri.y - li.y);
  return [liX, riX, vertMain, foreheadY, irisY, (li.y + ri.y) / 2, avgX, ear, iod];
}

export function extractPupilData(lm, W, H) {
  let pupilLX = NaN, pupilLY = NaN, pupilSizeLX = NaN, pupilSizeLY = NaN;
  let pupilRX = NaN, pupilRY = NaN, pupilSizeRX = NaN, pupilSizeRY = NaN;
  if (lm[468] && lm[469] && lm[470] && lm[471]) {
    const pts = [lm[468], lm[469], lm[470], lm[471]];
    const xs = pts.map(p => p.x * W), ys = pts.map(p => p.y * H);
    pupilLX = lm[468].x * W; pupilLY = lm[468].y * H;
    pupilSizeLX = (Math.max(...xs) - Math.min(...xs)) / 2;
    pupilSizeLY = (Math.max(...ys) - Math.min(...ys)) / 2;
  }
  if (lm[473] && lm[474] && lm[475] && lm[476]) {
    const pts = [lm[473], lm[474], lm[475], lm[476]];
    const xs = pts.map(p => p.x * W), ys = pts.map(p => p.y * H);
    pupilRX = lm[473].x * W; pupilRY = lm[473].y * H;
    pupilSizeRX = (Math.max(...xs) - Math.min(...xs)) / 2;
    pupilSizeRY = (Math.max(...ys) - Math.min(...ys)) / 2;
  }
  return { pupilLX, pupilLY, pupilSizeLX, pupilSizeLY, pupilRX, pupilRY, pupilSizeRX, pupilSizeRY };
}

export function extractGazeVector(mat, iodNorm) {
  let gvX = NaN, gvY = NaN, gvZ = NaN, eyePosZ = NaN;
  if (mat?.data) {
    const m = mat.data;
    gvX = +m[2].toFixed(4); gvY = +m[6].toFixed(4); gvZ = +m[10].toFixed(4);
  }
  if (iodNorm > 0.01) eyePosZ = Math.round(9 / iodNorm);
  return { gvX, gvY, gvZ, eyePosZ };
}

// ─── Ridge Regression ─────────────────────────────────────────────────────────
export function poly(f) { return [1, ...f.slice(0, 7)]; }

export function ridgeFit(X, y, alpha = RIDGE_ALPHA) {
  const n = X[0].length;
  const XtX = Array.from({ length: n }, () => new Array(n).fill(0));
  const Xty = new Array(n).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < n; i++) {
      Xty[i] += X[r][i] * y[r];
      for (let j = 0; j < n; j++) XtX[i][j] += X[r][i] * X[r][j];
    }
  }
  for (let i = 0; i < n; i++) XtX[i][i] += alpha;
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[p][c])) p = r;
    [aug[c], aug[p]] = [aug[p], aug[c]];
    const pv = aug[c][c]; if (Math.abs(pv) < 1e-12) continue;
    for (let j = c; j <= n; j++) aug[c][j] /= pv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = aug[r][c]; for (let j = c; j <= n; j++) aug[r][j] -= f * aug[c][j]; }
  }
  return aug.map(r => r[n]);
}

export function trainModel(samples) {
  if (samples.length < MIN_SAMPLES) return null;
  const X = samples.map(s => poly(s.feat));
  return { wx: ridgeFit(X, samples.map(s => s.sx)), wy: ridgeFit(X, samples.map(s => s.sy)) };
}

export function predictGaze(feat, model, affineBias) {
  if (!model) return null;
  const pf = poly(feat);
  const gx = pf.reduce((s, v, i) => s + v * model.wx[i], 0);
  const gy = pf.reduce((s, v, i) => s + v * model.wy[i], 0);
  const cx = affineBias.sx * gx + affineBias.dx;
  const cy = affineBias.sy * gy + affineBias.dy;
  return { x: Math.max(0, Math.min(window.innerWidth, cx)), y: Math.max(0, Math.min(window.innerHeight, cy)) };
}

// ─── Affine Correction ────────────────────────────────────────────────────────
export function computeAffineCorrection(pairs) {
  function linfit(ps, ts) {
    const n = ps.length, mp = ps.reduce((a, b) => a + b, 0) / n, mt = ts.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (ps[i] - mp) * (ts[i] - mt); den += (ps[i] - mp) ** 2; }
    const s = den > 1e-6 ? num / den : 1;
    const sc = Math.max(0.6, Math.min(1.6, s));
    return { s: sc, d: mt - sc * mp };
  }
  const fx = linfit(pairs.map(p => p.px), pairs.map(p => p.tx));
  const fy = linfit(pairs.map(p => p.py), pairs.map(p => p.ty));
  return { sx: fx.s, dx: fx.d, sy: fy.s, dy: fy.d };
}

// ─── Kalman Filter ────────────────────────────────────────────────────────────
export class KalmanFilter {
  constructor(r, q) { this.r = r; this.q = q; this.reset(); }
  reset() { this.x = NaN; this.p = 1; this.k = 0; }
  filter(measurement) {
    if (isNaN(this.x)) { this.x = measurement; } else {
      this.p = this.p + this.q;
      this.k = this.p / (this.p + this.r);
      this.x = this.x + this.k * (measurement - this.x);
      this.p = (1 - this.k) * this.p;
    }
    return this.x;
  }
}

// ─── I-DT Fixation Classifier ─────────────────────────────────────────────────
export class IDTClassifier {
  constructor() {
    this.DISPERSION_PX = 40;
    this.MIN_DURATION_MS = 100;
    this.VELOCITY_PX_MS = 0.3;
    this.buffer = [];
    this.fixStableStart = null;
    this.fixationIndex = 0;
    this.lastEvent = 'Unclassified';
  }

  classify(gazeX, gazeY, timestamp, isBlink) {
    if (isBlink) {
      this.buffer = []; this.fixStableStart = null;
      return 'Blink';
    }
    this.buffer.push({ x: gazeX, y: gazeY, t: timestamp });
    this.buffer = this.buffer.filter(s => timestamp - s.t < 100);
    if (this.buffer.length < 3) return 'Unclassified';

    const xs = this.buffer.map(s => s.x);
    const ys = this.buffer.map(s => s.y);
    const dispersion = (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));

    let event;
    if (dispersion <= this.DISPERSION_PX) {
      if (this.fixStableStart === null) this.fixStableStart = timestamp;
      const stableDur = timestamp - this.fixStableStart;
      if (stableDur >= this.MIN_DURATION_MS) {
        event = 'Fixation';
      } else {
        event = this.lastEvent === 'Fixation' ? 'Fixation' : 'Unclassified';
      }
    } else {
      this.fixStableStart = null;
      const last = this.buffer[this.buffer.length - 1];
      const prev = this.buffer[this.buffer.length - 2];
      const dt = last.t - prev.t;
      const vel = dt > 0 ? Math.hypot(last.x - prev.x, last.y - prev.y) / dt : 0;
      event = vel > this.VELOCITY_PX_MS ? 'Saccade' : 'Fixation';
    }

    if (event === 'Fixation' && this.lastEvent !== 'Fixation') this.fixationIndex++;
    this.lastEvent = event;
    return event;
  }

  reset() {
    this.buffer = []; this.fixStableStart = null;
    this.fixationIndex = 0; this.lastEvent = 'Unclassified';
  }
}

// ─── EAR Rolling Window ───────────────────────────────────────────────────────
export class EARSmoother {
  constructor(window = 5) { this.window = window; this.buf = []; }
  smooth(raw) {
    this.buf.push(raw);
    if (this.buf.length > this.window) this.buf.shift();
    return this.buf.reduce((a, b) => a + b, 0) / this.buf.length;
  }
  reset() { this.buf = []; }
}

// ─── CSV Builder ──────────────────────────────────────────────────────────────
export const CSV_HDR = [
  'RecordingTime [ms]', 'WallClock [ms]', 'Participant', 'ColorTag',
  'Trial', 'TrialStartMs', 'Stimulus', 'Category Group', 'Category Right',
  'Category Left', 'Index Right', 'Index Left',
  'Point of Regard Right X [px]', 'Point of Regard Right Y [px]',
  'Point of Regard Left X [px]', 'Point of Regard Left Y [px]',
  'Pupil Position Left X [px]', 'Pupil Position Left Y [px]',
  'Pupil Position Right X [px]', 'Pupil Position Right Y [px]',
  'Pupil Diameter Right [mm]', 'Pupil Diameter Left [mm]',
  'Pupil Size Right X [px]', 'Pupil Size Right Y [px]',
  'Pupil Size Left X [px]', 'Pupil Size Left Y [px]',
  'Gaze Vector X', 'Gaze Vector Y', 'Gaze Vector Z',
  'Eye Position Z [mm]', 'Blink ID', 'Tracking Ratio [%]',
].join(',');

export function buildCSV({ frames, meta, affineBias, valSamples, valQuality, annotations, calibAttemptNum, calibPassed, calibTimestamp, stimFilename, trialNumber, IDT_DISPERSION_PX = 40, IDT_MIN_DUR_MS = 100, EAR_WINDOW = 5, BLINK_CONSEC = 2 }) {
  const metaLine = `# GazeTrack v14 | bias_dx=${affineBias.dx.toFixed(2)} bias_dy=${affineBias.dy.toFixed(2)} bias_sx=${affineBias.sx.toFixed(4)} bias_sy=${affineBias.sy.toFixed(4)} val_samples=${valSamples.length} trials=${trialNumber} IDT_dispersion_px=${IDT_DISPERSION_PX} IDT_min_dur_ms=${IDT_MIN_DUR_MS} EAR_window=${EAR_WINDOW} blink_consec=${BLINK_CONSEC} screen_w=${window.innerWidth} screen_h=${window.innerHeight} participant=${meta.pid} group=${meta.group} age=${meta.age}`;
  const calibLine = `# CALIB | attempt=${calibAttemptNum} | passed=${calibPassed} | timestamp=${calibTimestamp} | n_val_points=${valQuality.length}`;
  const valLines = valQuality.map((v, i) => `# VAL_PT | ${i} | tx=${v.tx} | ty=${v.ty} | gx=${v.gx} | gy=${v.gy} | err_px=${v.errPx}`).join('\n');
  const annotLines = annotations.map(a => `# ANNOT | t=${a.t.toFixed(1)} | wallClock=${a.wallClock} | label=${a.label}`).join('\n');
  const lines = [metaLine, calibLine];
  if (valLines) lines.push(valLines);
  if (annotLines) lines.push(annotLines);
  lines.push(CSV_HDR);

  const fmt = v => (v === undefined || v === null || (typeof v === 'number' && isNaN(v))) ? '' : (typeof v === 'number' ? +v.toFixed(3) : v);

  frames.forEach(f => {
    const tr = f.tracked === 1;
    const xR = tr ? f.x.toFixed(1) : '';
    const yR = tr ? f.y.toFixed(1) : '';
    const catGrp = f.isSeparator ? 'Separator' : (tr ? 'Eye' : 'Information');
    const catRL = f.gazeEvent || '';
    lines.push([
      f.t.toFixed(3), f.wallClock ? Math.round(f.wallClock) : '', meta.pid, meta.colorTag || '',
      f.trial ?? 1, f.trialStartMs != null ? f.trialStartMs.toFixed(0) : '', stimFilename,
      catGrp, catRL, catRL,
      f.fixationIndex != null ? f.fixationIndex : '', f.fixationIndex != null ? f.fixationIndex : '',
      xR, yR, xR, yR,
      fmt(f.pupilLX), fmt(f.pupilLY), fmt(f.pupilRX), fmt(f.pupilRY),
      fmt(f.irisRadiusPxR), fmt(f.irisRadiusPxL),
      fmt(f.pupilSizeRX), fmt(f.pupilSizeRY), fmt(f.pupilSizeLX), fmt(f.pupilSizeLY),
      fmt(f.gvX), fmt(f.gvY), fmt(f.gvZ), fmt(f.eyePosZ),
      isNaN(f.blinkId) ? '' : f.blinkId,
      f.faceConfPct != null ? f.faceConfPct : '',
    ].join(','));
  });
  return lines.join('\n');
}

export function downloadCSV(csvData, pid, group) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fn = `gaze_${pid}_${group}_${ts}.csv`;
  const url = URL.createObjectURL(new Blob([csvData], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: fn }).click();
  URL.revokeObjectURL(url);
}
