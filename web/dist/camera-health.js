// Camera diagnostics, framing guidance and the rest-period pause. Pure logic, no DOM, so it is testable.

// MediaPipe pose landmark indices.
export const GROUPS = { shoulders: [11, 12], hips: [23, 24], arms: [13, 14, 15, 16], legs: [25, 26, 27, 28] };
export const FRAMING_SECONDS = 2;
export const REST_OPTIONS = [{ minutes: 15, label: '15 minutes' }, { minutes: 30, label: '30 minutes' }, { minutes: 60, label: '1 hour' }, { minutes: 120, label: '2 hours' }, { minutes: 240, label: '4 hours' }];

/** Lowest visibility (0 to 1) in each body group, or null when there is no pose at all. */
export function visibilityGroups(landmarks) {
  if (!landmarks) return null;
  const out = {};
  for (const [name, indexes] of Object.entries(GROUPS)) out[name] = Math.min(...indexes.map(index => landmarks[index]?.visibility ?? 0));
  return out;
}

/** Which of shoulders and hips are not reliably visible. Matches the detector's torso rule (0.3). */
export function missingTorso(groups, minimum = 0.3) {
  if (!groups) return ['shoulders', 'hips'];
  return ['shoulders', 'hips'].filter(name => groups[name] < minimum);
}

/** Says what to do once shoulders or hips have been missing for more than FRAMING_SECONDS. */
export class FramingMonitor {
  constructor(seconds = FRAMING_SECONDS) { this.seconds = seconds; this.since = null; this.missing = []; }
  reset() { this.since = null; this.missing = []; }
  update(time, groups) {
    this.missing = missingTorso(groups);
    if (!this.missing.length) { this.since = null; return null; }
    this.since ??= time;
    if (time - this.since <= this.seconds) return null;
    return `Move back so your ${this.missing.join(' and ')} are visible`;
  }
}

/** Manual rest period. While paused the monitor raises no events and shows when it ends. */
export class RestPause {
  constructor() { this.until = null; }
  start(now, minutes) { this.until = now + minutes * 60000; }
  clear() { this.until = null; }
  isPaused(now) { if (this.until !== null && now >= this.until) this.until = null; return this.until !== null; }
  remainingSeconds(now) { return this.isPaused(now) ? Math.ceil((this.until - now) / 1000) : 0; }
}

export const MODEL_CHOICES = {
  lite: { label: 'Lite (fastest)', size: '6 MB' },
  full: { label: 'Full (more accurate)', size: '9 MB' },
  heavy: { label: 'Heavy (most accurate, slow)', size: '31 MB' },
};
