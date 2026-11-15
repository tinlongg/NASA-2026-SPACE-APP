// Generated numerical inputs, not recordings or validation on people.
export const REPLAYS = {
  upright: { label: 'Stand', duration: 6, expected: 0 },
  walk: { label: 'Walk', duration: 6, expected: 0 },
  sit: { label: 'Sit down', duration: 6, expected: 0 },
  slow: { label: 'Lie down slowly', duration: 8, expected: 0 },
  fall: { label: 'Possible fall', duration: 6, expected: 1 },
  pair5: { label: 'Two falls · 5 s apart', duration: 12, expected: 1 },
  pair20: { label: 'Two falls · 20 s apart', duration: 27, expected: 2 },
};
const clamp = x => Math.min(1, Math.max(0, x));
export function replayMeasurement(kind, time) {
  if (!REPLAYS[kind]) throw new Error('Unknown replay');
  if (kind === 'walk') return { angle: 8 + Math.sin(time * 5) * 6, hipY: 0.5 + Math.sin(time * 5) * 0.025 };
  if (kind === 'sit') return { angle: 20 * clamp((time - 1.5) / 0.5), hipY: 0.5 - 0.25 * clamp((time - 1.5) / 0.5) };
  let localTime = time;
  if (kind === 'pair5' || kind === 'pair20') {
    const separation = kind === 'pair5' ? 5 : 20;
    if (time >= 4.5 && time < separation) return { angle: 0, hipY: 0.5 };
    if (time >= separation) localTime -= separation;
  }
  const progress = kind === 'upright' ? 0 : clamp((localTime - 1.5) / (kind === 'slow' ? 4 : 0.5));
  return { angle: progress * 85, hipY: 0.5 - progress * 0.28 };
}
