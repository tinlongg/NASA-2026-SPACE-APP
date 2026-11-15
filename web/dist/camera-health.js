// Camera diagnostics and framing guidance. Pure logic, no DOM, so it is testable.

// MediaPipe pose landmark indices.
export const GROUPS = { shoulders: [11, 12], hips: [23, 24], arms: [13, 14, 15, 16], legs: [25, 26, 27, 28] };
export const FRAMING_SECONDS = 2;

/** Lowest visibility (0 to 1) in each body group, or null when there is no pose at all. */
export function visibilityGroups(landmarks) {
  if (!landmarks) return null;
  const out = {};
  for (const [name, indexes] of Object.entries(GROUPS)) out[name] = Math.min(...indexes.map(index => landmarks[index]?.visibility ?? 0));
  return out;
}

/** Shoulders are required for any tracking; missing hips only means upper-body tracking. */
export function missingTorso(groups, minimum = 0.3) {
  if (!groups) return ['shoulders'];
  return groups.shoulders < minimum ? ['shoulders'] : [];
}

/** Says what to do once the shoulders have been missing for more than FRAMING_SECONDS. */
export class FramingMonitor {
  constructor(seconds = FRAMING_SECONDS) { this.seconds = seconds; this.since = null; this.missing = []; }
  reset() { this.since = null; this.missing = []; }
  update(time, groups) {
    this.missing = missingTorso(groups);
    if (!this.missing.length) { this.since = null; return null; }
    this.since ??= time;
    if (time - this.since <= this.seconds) return null;
    return 'Move so your shoulders are visible';
  }
}

export const MODEL_CHOICES = {
  lite: { label: 'Lite (fastest)', size: '6 MB' },
  full: { label: 'Full (more accurate)', size: '9 MB' },
  heavy: { label: 'Heavy (most accurate, slow)', size: '31 MB' },
};
