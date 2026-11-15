// Generated numerical inputs, not recordings or validation on people. Each replay draws a
// floating stick figure; points use image coordinates (x right, y down) in a 4:3 frame.
export const REPLAYS = {
  working: { label: 'Working', duration: 20, expected: 0 },
  resting: { label: 'Resting, small movements', duration: 20, expected: 0 },
  outOfView: { label: 'Leaves view', duration: 20, expected: 0 },
  unresponsive: { label: 'Stops moving', duration: 20, expected: 1 },
  tumbling: { label: 'Limp and tumbling', duration: 20, expected: 1 },
  walking: { label: 'Walking past, torso only', duration: 20, expected: 0, wholeBody: true },
  seatedWorking: { label: 'Seated, typing', duration: 20, expected: 0 },
  seatedStill: { label: 'Seated, slumped and still', duration: 20, expected: 1 },
};
// One body, in torso lengths around the torso centre (y down, head up).
const BODY = { 0: [0, -1.05], 11: [-0.32, -0.5], 12: [0.32, -0.5], 13: [-0.55, -0.1], 14: [0.55, -0.1], 15: [-0.62, 0.32], 16: [0.62, 0.32], 23: [-0.2, 0.5], 24: [0.2, 0.5], 25: [-0.28, 1.05], 26: [0.28, 1.05], 27: [-0.3, 1.6], 28: [0.3, 1.6] };
const pose = ({ x = 0.66, y = 0.5, turn = 0, size = 0.16, arm = 0, leg = 0 }) => {
  const cos = Math.cos(turn), sin = Math.sin(turn), points = {};
  for (const [index, [bx, by]] of Object.entries(BODY)) {
    let px = bx, py = by;
    if (index === '13' || index === '15') py -= arm * (index === '15' ? 0.9 : 0.45);   // left arm reaches up
    if (index === '14' || index === '16') px += arm * (index === '16' ? 0.5 : 0.25);
    if (index === '25' || index === '27') px -= leg * (index === '27' ? 0.5 : 0.25);
    points[index] = [x + (px * cos - py * sin) * size, y + (px * sin + py * cos) * size];
  }
  return points;
};
const move = time => ({ arm: (Math.sin(time * 2.4) + 1) / 2, leg: (Math.sin(time * 1.7) + 1) / 3 });
export function replayMeasurement(kind, time) {
  if (!REPLAYS[kind]) throw new Error('Unknown replay');
  // Walking across the frame: only the torso and head are tracked, and the whole body travels.
  if (kind === 'walking') {
    const all = pose({ x: 0.25 + time * 0.025, y: 0.5 + Math.sin(time * 6) * 0.004 }), points = {};
    for (const index of [0, 11, 12, 23, 24]) points[index] = all[index];
    return { points };
  }
  // Seated at a desk: hips hidden, so only shoulders, head and arms are tracked.
  if (kind === 'seatedWorking' || kind === 'seatedStill') {
    const typing = kind === 'seatedWorking' || time < 2.5, phase = typing ? Math.min(time, 1e9) : 2.5, sway = typing ? Math.sin(phase * 2.4) * 0.35 : Math.sin(2.5 * 2.4) * 0.35;
    const all = pose({ x: 0.5, y: 0.45, arm: (sway + 0.35) / 0.7 * 0.5 });
    const points = {}; for (const index of [0, 11, 12, 13, 14, 15, 16]) points[index] = all[index];
    return { points, upper: true };
  }
  if (kind === 'working') return { points: pose({ ...move(time), x: 0.6 + Math.sin(time * 0.3) * 0.05 }) };
  // A short reach every 6 s: enough to show the person is responsive.
  if (kind === 'resting') { const phase = time % 6; return { points: pose({ arm: phase < 1 ? Math.sin(phase * Math.PI) : 0, turn: 0.1 }) }; }
  const settled = Math.min(time, 2.5);
  const last = move(settled);
  if (kind === 'outOfView') return time >= 9 && time < 13 ? null : { points: pose(last) };
  if (kind === 'unresponsive') return { points: pose(time < 2.5 ? move(time) : last) };
  // Limbs stop at 2.5 s; the body keeps drifting and slowly rotating, as it would in microgravity.
  const drift = Math.max(0, time - 2.5);
  return { points: pose({ ...last, x: 0.66 - drift * 0.012, y: 0.5 + drift * 0.004, turn: drift * 0.09 }) };
}
