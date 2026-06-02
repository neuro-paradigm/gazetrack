/**
 * GazeTrack Web Worker
 * Runs MediaPipe FaceLandmarker detection entirely off the main thread.
 * Communicates via postMessage:
 *   IN:  { type: 'init', delegate }
 *        { type: 'detect', bitmap, timestamp }
 *        { type: 'destroy' }
 *   OUT: { type: 'ready' }
 *        { type: 'result', landmarks, matrices, timestamp }
 *        { type: 'error', message }
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let lastTs = -1;

function monoTs(ts) {
  if (ts > lastTs + 0.5) {
    lastTs = ts;
  } else {
    lastTs = Math.floor(lastTs) + 1;
  }
  return lastTs;
}

async function init(delegate) {
  try {
    const resolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    ); // wasm files still loaded from CDN (binary assets, not JS modules)
    faceLandmarker = await FaceLandmarker.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      outputIrisLandmarks: true,
    });
    self.postMessage({ type: 'ready' });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === 'init') {
    await init(e.data.delegate);
    return;
  }

  if (type === 'detect') {
    if (!faceLandmarker) return;
    try {
      const { bitmap, timestamp } = e.data;
      const ts = monoTs(timestamp);
      const result = faceLandmarker.detectForVideo(bitmap, ts);
      // Transfer landmarks & matrices — these are plain JS objects, safe to clone
      self.postMessage({
        type: 'result',
        landmarks: result.faceLandmarks,
        matrices: result.facialTransformationMatrixes,
        timestamp: ts,
      });
      bitmap.close(); // free the ImageBitmap memory
    } catch {
      // Timestamp collision or graph error — skip frame silently
    }
    return;
  }

  if (type === 'destroy') {
    if (faceLandmarker) {
      faceLandmarker.close?.();
      faceLandmarker = null;
    }
  }
};
