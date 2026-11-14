export class FallDetector {
  constructor() { this.reset(); }
  reset() { this.history = []; this.hold = null; this.lastDetection = -Infinity; this.lastTime = -Infinity; }
  process(time, measurement) {
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    this.history = this.history.filter(sample => time - sample.time <= 1);
    if (!measurement) {
      if (this.hold) {
        this.hold.lostSince ??= time;
        if (time - this.hold.lostSince > 1) this.hold = null;
      }
      return null;
    }
    const { hipY, angle } = measurement;
    if (this.hold) {
      if (this.hold.lostSince !== null && time - this.hold.lostSince > 1) this.hold = null;
    }
    if (this.hold) {
      this.hold.lostSince = null;
      if (angle < 60 && hipY > this.hold.reference - this.hold.drop / 2) {
        this.hold = null;
      } else {
        this.hold.angle = Math.max(this.hold.angle, angle);
        if (time - this.hold.start < 2) return null;
        const result = { drop: this.hold.drop, angle: this.hold.angle, duration: this.hold.duration, held: time - this.hold.start };
        this.hold = null;
        this.history = [];
        this.lastDetection = time;
        return result;
      }
    }
    if (angle <= 35) this.history.push({ time, hipY });
    if (angle < 60 || time - this.lastDetection < 15 || !this.history.length) return null;
    const reference = this.history.reduce((best, sample) => sample.hipY > best.hipY ? sample : best);
    const drop = reference.hipY - hipY;
    if (drop < 0.2) return null;
    this.hold = { start: time, reference: reference.hipY, drop, duration: time - reference.time, angle, lostSince: null };
    return null;
  }
}

export function measurePose(landmarks, aspect) {
  if (!landmarks || ![11, 12, 23, 24].every(index => landmarks[index] && (landmarks[index].visibility ?? 0) >= 0.3)) return null;
  const shoulder = { x: (landmarks[11].x + landmarks[12].x) / 2, y: (landmarks[11].y + landmarks[12].y) / 2 };
  const hip = { x: (landmarks[23].x + landmarks[24].x) / 2, y: (landmarks[23].y + landmarks[24].y) / 2 };
  const deltaX = (shoulder.x - hip.x) * aspect;
  const deltaY = hip.y - shoulder.y;
  if (Math.hypot(deltaX, deltaY) <= 0.02) return null;
  return { hipY: 1 - hip.y, angle: Math.atan2(Math.abs(deltaX), deltaY) * 180 / Math.PI };
}
