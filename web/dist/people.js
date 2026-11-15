// Multi-person helpers: matching poses to stable person ids across frames, and turning face
// blendshapes into plain readings (eyes open or closed, mouth moving or still). Pure functions,
// no DOM. Readings describe what the camera sees; they never say anything about a person's condition.

/** Keeps a stable id per person by matching each frame's people to the nearest person seen recently. */
export class PersonTracker {
  constructor({ maxDistance = 0.22, forgetSeconds = 4 } = {}) { this.maxDistance = maxDistance; this.forgetSeconds = forgetSeconds; this.reset(); }
  reset() { this.tracks = new Map(); this.next = 1; }
  /** centres: one [x, y] (0..1 image coordinates) per detected person. Returns an id per centre, in order. */
  update(time, centres) {
    const pairs = [];
    for (const [id, track] of this.tracks) centres.forEach((centre, index) => pairs.push({ id, index, distance: Math.hypot(centre[0] - track.centre[0], centre[1] - track.centre[1]) }));
    pairs.sort((a, b) => a.distance - b.distance);
    const ids = new Array(centres.length).fill(null), taken = new Set();
    for (const { id, index, distance } of pairs) {
      if (distance > this.maxDistance || ids[index] !== null || taken.has(id)) continue;
      ids[index] = id; taken.add(id);
    }
    centres.forEach((centre, index) => { if (ids[index] === null) ids[index] = this.next++; this.tracks.set(ids[index], { centre, seen: time }); });
    const gone = [];
    for (const [id, track] of this.tracks) if (time - track.seen > this.forgetSeconds) { this.tracks.delete(id); gone.push(id); }
    this.gone = gone;
    return ids;
  }
}

/** A person's position in the frame: the shoulder midpoint, else the nose, else null. */
export function personCentre(landmarks) {
  if (!landmarks) return null;
  const ok = index => (landmarks[index]?.visibility ?? 0) >= 0.3;
  if (ok(11) && ok(12)) return [(landmarks[11].x + landmarks[12].x) / 2, (landmarks[11].y + landmarks[12].y) / 2];
  return landmarks[0] ? [landmarks[0].x, landmarks[0].y] : null;
}

/** Index of the nearest centre to a point, within maxDistance, or -1. Used to give each face to a person. */
export function nearestIndex(point, centres, maxDistance = 0.3) {
  let best = -1, bestDistance = maxDistance;
  centres.forEach((centre, index) => { if (!centre) return; const distance = Math.hypot(point[0] - centre[0], point[1] - centre[1]); if (distance < bestDistance) { best = index; bestDistance = distance; } });
  return best;
}

/** MediaPipe blendshape categories to {name: score}. */
export const blendshapeScores = categories => Object.fromEntries((categories || []).map(category => [category.categoryName, category.score]));

export const EYE_CLOSED_SCORE = 0.55;
/** Eyes reading from blink scores: 'open', 'closed', or 'unclear' when the eyes disagree. */
export function eyeReading(scores) {
  if (!scores || scores.eyeBlinkLeft === undefined || scores.eyeBlinkRight === undefined) return { state: 'unknown', blink: null };
  const closedLeft = scores.eyeBlinkLeft >= EYE_CLOSED_SCORE, closedRight = scores.eyeBlinkRight >= EYE_CLOSED_SCORE;
  const blink = (scores.eyeBlinkLeft + scores.eyeBlinkRight) / 2;
  return { state: closedLeft && closedRight ? 'closed' : !closedLeft && !closedRight ? 'open' : 'unclear', blink };
}

/** Mouth movement over a short window: how much the jaw and lips have changed, not what is said. */
export class MouthActivity {
  constructor({ seconds = 2.5, threshold = 0.04 } = {}) { this.seconds = seconds; this.threshold = threshold; this.samples = []; }
  reset() { this.samples = []; }
  update(time, scores) {
    if (!scores || scores.jawOpen === undefined) { this.samples = []; return { state: 'unknown', spread: null }; }
    const value = (scores.jawOpen ?? 0) + (scores.mouthFunnel ?? 0) * 0.5 + (scores.mouthPucker ?? 0) * 0.5;
    this.samples.push({ time, value });
    while (this.samples.length && time - this.samples[0].time > this.seconds) this.samples.shift();
    if (this.samples.length < 4) return { state: 'unknown', spread: null };
    const values = this.samples.map(sample => sample.value), spread = Math.max(...values) - Math.min(...values);
    return { state: spread >= this.threshold ? 'moving' : 'still', spread };
  }
}

/** Inner-lip gap divided by mouth width, from face-mesh landmarks: about 0 when closed, larger when open.
 * The ratio does not change with distance from the camera. null when the lips are not in the mesh. */
export function lipAperture(landmarks) {
  const upper = landmarks?.[13], lower = landmarks?.[14], left = landmarks?.[61], right = landmarks?.[291];
  if (!upper || !lower || !left || !right) return null;
  const width = Math.hypot(left.x - right.x, left.y - right.y);
  return width < 1e-4 ? null : Math.hypot(upper.x - lower.x, upper.y - lower.y) / width;
}

/** Mouth movement from two on-device measures, sampled several times a second:
 *  - how much the lip gap opens and closes over a short window (talking, chewing, mouthing words);
 *  - how much the pixels around the lips change compared with a patch of the nose, so that moving the
 *    head or a lighting change, which affect both patches, are not counted.
 * Either one is enough. Readings describe the camera image only. */
export class MouthMotion {
  constructor({ seconds = 1.5, spread = 0.05, recent = 8, hits = 5, ratio = 3.5, floor = 0.015 } = {}) {
    Object.assign(this, { seconds, spreadThreshold: spread, recent, hits, ratio, floor }); this.reset();
  }
  reset() { this.samples = []; this.baseline = null; }
  /** aperture from lipAperture (or null); patchDiff = lip-patch change minus nose-patch change, 0..1 (or null). */
  update(time, aperture, patchDiff) {
    if (aperture == null && patchDiff == null) { this.samples = []; return { state: 'unknown', spread: null, hits: 0 }; }
    let elevated = false;
    if (patchDiff != null) {
      if (this.baseline == null) this.baseline = patchDiff;
      elevated = patchDiff > this.baseline * this.ratio + this.floor;
      // Learn the resting level only from calm samples, so a long sentence does not raise it.
      if (!elevated) this.baseline += (patchDiff - this.baseline) * 0.1;
    }
    this.samples.push({ time, aperture, elevated });
    while (this.samples.length && time - this.samples[0].time > this.seconds) this.samples.shift();
    if (this.samples.length < 4) return { state: 'unknown', spread: null, hits: 0 };
    const apertures = this.samples.map(sample => sample.aperture).filter(value => value != null);
    const spread = apertures.length >= 4 ? Math.max(...apertures) - Math.min(...apertures) : null;
    const hits = this.samples.slice(-this.recent).filter(sample => sample.elevated).length;
    return { state: (spread != null && spread >= this.spreadThreshold) || hits >= this.hits ? 'moving' : 'still', spread, hits };
  }
}

/** Counts a blink when the eyes go open, then closed, then open again (scores sampled a few times a second). */
export class BlinkDetector {
  constructor({ closed = 0.5, open = 0.3 } = {}) { this.closed = closed; this.open = open; this.state = 'unknown'; }
  reset() { this.state = 'unknown'; }
  /** Returns true on the sample where a blink completes. */
  update(scores) {
    if (!scores || scores.eyeBlinkLeft === undefined || scores.eyeBlinkRight === undefined) { this.state = 'unknown'; return false; }
    const value = (scores.eyeBlinkLeft + scores.eyeBlinkRight) / 2;
    if (value < this.open) { const blinked = this.state === 'closed'; this.state = 'open'; return blinked; }
    if (value >= this.closed && this.state === 'open') this.state = 'closed';
    return false;
  }
}

/** Bounding box (0..1) of a face mesh, grown by a margin, for the close-up crop. */
export function faceBox(landmarks, margin = 0.6) {
  if (!landmarks?.length) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const point of landmarks) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  const width = maxX - minX, height = maxY - minY;
  return { x: minX - width * margin / 2, y: minY - height * margin / 2, width: width * (1 + margin), height: height * (1 + margin) };
}

/** Crop rectangle in video pixels for a face box, expanded to the output aspect ratio and kept inside the frame. */
export function cropRect(box, videoWidth, videoHeight, aspect = 4 / 3) {
  let width = box.width * videoWidth, height = box.height * videoHeight;
  if (width / height < aspect) width = height * aspect; else height = width / aspect;
  width = Math.min(width, videoWidth); height = Math.min(height, videoHeight);
  if (width / height > aspect) width = height * aspect; else height = width / aspect;
  const cx = (box.x + box.width / 2) * videoWidth, cy = (box.y + box.height / 2) * videoHeight;
  return { x: Math.min(Math.max(0, cx - width / 2), videoWidth - width), y: Math.min(Math.max(0, cy - height / 2), videoHeight - height), width, height };
}

/** Plain-language readings for one person, from the rule-based detector and the face blendshapes. */
export function describePerson({ tracked, upper, motion, threshold, stillFor, stillSeconds, alerted, eyes, mouth, museMouth, replay, faceActiveAgo, activeReason, watch }) {
  const lines = [];
  if (!tracked) return ['Not tracked right now. Shoulders need to be visible.'];
  lines.push(upper ? 'Tracking the upper body only (hips are not visible).' : 'Tracking the full body.');
  if (alerted) lines.push(`Alert raised: no joint has moved more than ${threshold} for ${Math.round(stillFor)} s. Waiting for movement.`);
  else if (stillFor >= 1) lines.push(`Still for ${Math.floor(stillFor)} s. An alert is raised at ${stillSeconds} s without movement.`);
  else lines.push(motion == null ? 'Movement is being measured.' : `Moving: largest joint change ${motion.toFixed(2)}.`);
  if (replay) lines.push('Face readings are not available in synthetic replays.');
  else {
    lines.push(eyes?.state === 'open' ? 'Eyes look open.' : eyes?.state === 'closed' ? 'Eyes look closed.' : eyes?.state === 'unclear' ? 'The eyes give mixed readings.' : 'No clear view of the eyes.');
    lines.push(mouth?.state === 'moving' ? 'The mouth is moving (on device).' : mouth?.state === 'still' ? 'The mouth is still (on device).' : 'Mouth movement is not known yet.');
    if (watch) lines.push(`Apple Watch: ${watch.bpm != null ? `${Math.round(watch.bpm)} BPM` : 'no heart rate yet'}${watch.wristAgo != null ? `, wrist moved ${Math.round(watch.wristAgo)} s ago` : ''}.`);
    if (museMouth) lines.push(museMouth.state === 'moving' ? 'MUSE saw the mouth move.' : 'MUSE saw no mouth movement.');
    if (faceActiveAgo != null && faceActiveAgo < stillSeconds) lines.push(`${activeReason ?? 'Facial activity'} ${Math.max(0, Math.round(faceActiveAgo))} s ago. It counts as activity and restarts the stillness timer.`);
  }
  return lines;
}
