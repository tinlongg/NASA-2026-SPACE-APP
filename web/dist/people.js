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
export function describePerson({ tracked, upper, motion, threshold, stillFor, stillSeconds, alerted, eyes, mouth, replay }) {
  const lines = [];
  if (!tracked) return ['Not tracked right now. Shoulders need to be visible.'];
  lines.push(upper ? 'Tracking the upper body only (hips are not visible).' : 'Tracking the full body.');
  if (alerted) lines.push(`Alert raised: no joint has moved more than ${threshold} for ${Math.round(stillFor)} s. Waiting for movement.`);
  else if (stillFor >= 1) lines.push(`Still for ${Math.floor(stillFor)} s. An alert is raised at ${stillSeconds} s without movement.`);
  else lines.push(motion == null ? 'Movement is being measured.' : `Moving: largest joint change ${motion.toFixed(2)}.`);
  if (replay) lines.push('Face readings are not available in synthetic replays.');
  else {
    lines.push(eyes?.state === 'open' ? 'Eyes look open.' : eyes?.state === 'closed' ? 'Eyes look closed.' : eyes?.state === 'unclear' ? 'The eyes give mixed readings.' : 'No clear view of the eyes.');
    lines.push(mouth?.state === 'moving' ? 'The mouth is moving.' : mouth?.state === 'still' ? 'The mouth is still.' : 'Mouth movement is not known yet.');
  }
  return lines;
}
