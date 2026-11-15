// Possible-unresponsive heuristic for crew in microgravity. A floating crew member cannot
// fall, so the signal is the absence of body movement while they are tracked in view.
//
// Movement is measured on the body's own shape: each joint relative to the torso centre,
// rotated so the torso is upright and scaled by torso length. Drifting across the frame or
// tumbling of a limp body is therefore not mistaken for activity. A tracked person whose
// joints all stay within MOVE_THRESHOLD of the last moving pose for STILL_SECONDS raises one possible-unresponsive
// event. They must move again before another event can fire. Starting thresholds only,
// not validated on people. Sleep, focused reading or a crew member holding still on purpose
// can trigger it.
export const STILL_SECONDS = 15;
export const MOVE_THRESHOLD = 0.25; // largest single-joint displacement, in torso lengths
export const POSE_LOSS_SECONDS = 2;
const TORSO = [11, 12, 23, 24];
export const LIMBS = [0, 13, 14, 15, 16, 25, 26, 27, 28];

export function bodyShape(points) {
  if (!points || !TORSO.every(index => points[index])) return null;
  const [ls, rs, lh, rh] = TORSO.map(index => points[index]);
  const shoulder = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2], hip = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2];
  const scale = Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]);
  if (scale < 0.02) return null;
  const centre = [(shoulder[0] + hip[0]) / 2, (shoulder[1] + hip[1]) / 2];
  // Rotate so hip-to-shoulder points straight up; in microgravity there is no "up" to keep.
  const turn = Math.atan2(shoulder[0] - hip[0], hip[1] - shoulder[1]), cos = Math.cos(-turn), sin = Math.sin(-turn);
  const shape = {};
  for (const [index, point] of Object.entries(points)) {
    const x = (point[0] - centre[0]) / scale, y = (point[1] - centre[1]) / scale;
    shape[index] = [x * cos - y * sin, x * sin + y * cos];
  }
  return shape;
}

/** Largest displacement of any joint visible in both shapes, in torso lengths. */
export function shapeChange(a, b) {
  let largest = 0;
  for (const index of Object.keys(a)) if (b[index]) largest = Math.max(largest, Math.hypot(a[index][0] - b[index][0], a[index][1] - b[index][1]));
  return largest;
}

export class InactivityDetector {
  constructor({ stillSeconds = STILL_SECONDS, threshold = MOVE_THRESHOLD } = {}) { this.stillSeconds = stillSeconds; this.threshold = threshold; this.reset(); }
  reset() { this.anchor = null; this.stillSince = null; this.lostSince = null; this.lastTime = -Infinity; this.alerted = false; this.motion = null; }
  /** Seconds the tracked person has held still, or 0 when nobody is tracked. */
  stillFor(time) { return this.stillSince == null ? 0 : Math.max(0, time - this.stillSince); }
  process(time, measurement) {
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    const shape = measurement && bodyShape(measurement.points);
    if (!shape) {
      // Out of view is not unresponsive. A short gap keeps the timer; a longer one resets it.
      this.lostSince ??= time; this.motion = null;
      if (time - this.lostSince > POSE_LOSS_SECONDS) { this.anchor = null; this.stillSince = null; this.alerted = false; }
      return null;
    }
    this.lostSince = null;
    if (!this.anchor) { this.anchor = shape; this.stillSince = time; this.motion = 0; return null; }
    this.motion = shapeChange(shape, this.anchor);
    if (this.motion > this.threshold) { this.anchor = shape; this.stillSince = time; this.alerted = false; return null; }
    const still = time - this.stillSince;
    if (this.alerted || still < this.stillSeconds) return null;
    this.alerted = true;
    return { stillFor: still, threshold: this.threshold };
  }
}

const KEEP = [...TORSO, ...LIMBS];
/** MediaPipe landmarks to {index: [x, y]}, with x scaled by aspect so distances are isotropic. */
export function measurePose(landmarks, aspect) {
  if (!landmarks || !TORSO.every(index => (landmarks[index]?.visibility ?? 0) >= 0.3)) return null;
  const points = {};
  for (const index of KEEP) {
    const landmark = landmarks[index];
    if (landmark && (landmark.visibility ?? 0) >= (TORSO.includes(index) ? 0.3 : 0.5)) points[index] = [landmark.x * aspect, landmark.y];
  }
  return bodyShape(points) ? { points } : null;
}
