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
// With wholeBody on (the default for anything on Earth) the whole body travelling or turning counts as
// movement, so walking past the camera is activity. With it off (microgravity) drifting and tumbling
// are ignored and only limbs moving relative to the torso count.
export const TURN_THRESHOLD = 0.35; // radians, about 20 degrees
const angleGap = (a, b) => { let gap = a - b; while (gap > Math.PI) gap -= 2 * Math.PI; while (gap < -Math.PI) gap += 2 * Math.PI; return Math.abs(gap); };
// Seated or desk-bound crew show shoulders but not hips. Rather than treat that as "out of view",
// the upper body is tracked on its own: scaled by shoulder width, which is smaller than a torso
// length, so the movement threshold is scaled up to match (about 1.4 shoulder widths per torso).
export const MOVE_THRESHOLD_UPPER = 0.35;
const UPPER_KEEP = [0, 7, 8, 11, 12, 13, 14, 15, 16];
const TORSO = [11, 12, 23, 24];
export const LIMBS = [0, 13, 14, 15, 16, 25, 26, 27, 28];

/** Upper-body shape: shoulder midpoint as centre, shoulder width as scale, shoulder line as horizontal. */
export function upperBodyShape(points) {
  if (!points || !points[11] || !points[12]) return null;
  const [ls, rs] = [points[11], points[12]], scale = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);
  if (scale < 0.02) return null;
  const centre = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2], turn = Math.atan2(rs[1] - ls[1], rs[0] - ls[0]), cos = Math.cos(-turn), sin = Math.sin(-turn);
  const shape = {};
  for (const [index, point] of Object.entries(points)) {
    const x = (point[0] - centre[0]) / scale, y = (point[1] - centre[1]) / scale;
    shape[index] = [x * cos - y * sin, x * sin + y * cos];
  }
  Object.defineProperties(shape, { upper: { value: true }, centre: { value: centre }, scale: { value: scale }, turn: { value: turn } });
  return shape;
}

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
  Object.defineProperties(shape, { centre: { value: centre }, scale: { value: scale }, turn: { value: turn } });
  return shape;
}

/** Largest displacement of any joint visible in both shapes, in torso lengths. */
export function shapeChange(a, b) {
  let largest = 0;
  for (const index of Object.keys(a)) if (b[index]) largest = Math.max(largest, Math.hypot(a[index][0] - b[index][0], a[index][1] - b[index][1]));
  return largest;
}

export class InactivityDetector {
  constructor({ stillSeconds = STILL_SECONDS, threshold = MOVE_THRESHOLD, wholeBody = false } = {}) { this.stillSeconds = stillSeconds; this.threshold = threshold; this.wholeBody = wholeBody; this.reset(); }
  reset() { this.anchor = null; this.stillSince = null; this.lostSince = null; this.lastTime = -Infinity; this.alerted = false; this.motion = null; }
  /** Something other than a joint moved (talking, blinking): restart the stillness timer without changing the shape. */
  noteActivity(time) { if (!this.anchor) return; this.stillSince = time; this.alerted = false; }
  /** Seconds the tracked person has held still, or 0 when nobody is tracked. */
  stillFor(time) { return this.stillSince == null ? 0 : Math.max(0, time - this.stillSince); }
  process(time, measurement) {
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    const shape = measurement && (measurement.upper ? upperBodyShape(measurement.points) : bodyShape(measurement.points));
    if (!shape) {
      // Out of view is not unresponsive. A short gap keeps the timer; a longer one resets it.
      this.lostSince ??= time; this.motion = null;
      if (time - this.lostSince > POSE_LOSS_SECONDS) { this.anchor = null; this.stillSince = null; this.alerted = false; }
      return null;
    }
    this.lostSince = null;
    // Changing between full-body and upper-body tracking means the person moved (sat down or stood up).
    if (!this.anchor || Boolean(this.anchor.upper) !== Boolean(shape.upper)) { this.anchor = shape; this.stillSince = time; this.motion = 0; this.alerted = false; return null; }
    this.motion = shapeChange(shape, this.anchor);
    const threshold = shape.upper ? this.threshold * (MOVE_THRESHOLD_UPPER / MOVE_THRESHOLD) : this.threshold;
    let moved = this.motion > threshold;
    if (this.wholeBody && !moved && this.anchor.centre && shape.centre) {
      const travel = Math.hypot(shape.centre[0] - this.anchor.centre[0], shape.centre[1] - this.anchor.centre[1]) / this.anchor.scale;
      this.motion = Math.max(this.motion, travel);
      moved = travel > threshold || angleGap(shape.turn, this.anchor.turn) > TURN_THRESHOLD;
    }
    if (moved) { this.anchor = shape; this.stillSince = time; this.alerted = false; return null; }
    const still = time - this.stillSince;
    if (this.alerted || still < this.stillSeconds) return null;
    this.alerted = true;
    return { stillFor: still, threshold: this.threshold, ...(shape.upper ? { upper: true } : {}) };
  }
}

const KEEP = [...TORSO, ...LIMBS];
/** MediaPipe landmarks to {index: [x, y]}, with x scaled by aspect so distances are isotropic. */
export function measurePose(landmarks, aspect) {
  if (!landmarks) return null;
  const seen = index => (landmarks[index]?.visibility ?? 0);
  if (!TORSO.every(index => seen(index) >= 0.3)) {
    // No hips: track the upper body if both shoulders are visible (seated at a desk, for example).
    if (seen(11) < 0.3 || seen(12) < 0.3) return null;
    const upper = {};
    for (const index of UPPER_KEEP) if (seen(index) >= (index === 11 || index === 12 ? 0.3 : 0.5)) upper[index] = [landmarks[index].x * aspect, landmarks[index].y];
    return upperBodyShape(upper) ? { points: upper, upper: true } : null;
  }
  const points = {};
  for (const index of KEEP) {
    const landmark = landmarks[index];
    if (landmark && (landmark.visibility ?? 0) >= (TORSO.includes(index) ? 0.3 : 0.5)) points[index] = [landmark.x * aspect, landmark.y];
  }
  return bodyShape(points) ? { points } : null;
}
