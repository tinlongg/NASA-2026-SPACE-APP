// "Are you OK?" check-in bookkeeping, separate from the page so it can be tested. A check-in starts when
// the detector fires. It ends as 'ok' (answered okay), 'help' (asked for help), 'moved' (the detector
// stopped being alerted: the person moved or spoke) or 'timeout' (no answer in time). Only 'help' and
// 'timeout' lead to an alert.
export const CHECKIN_SECONDS = 30, GRACE_SECONDS = 45;
export const RAISES_ALERT = { help: true, timeout: true, ok: false, moved: false };

export class CheckIns {
  constructor({ seconds = CHECKIN_SECONDS } = {}) { this.seconds = seconds; this.active = new Map(); }
  has(id) { return this.active.has(id); }
  get size() { return this.active.size; }
  start(id, info, now) { if (this.active.has(id)) return false; this.active.set(id, { info, endsAt: now + this.seconds * 1000 }); return true; }
  remaining(id, now) { const entry = this.active.get(id); return entry ? Math.max(0, Math.ceil((entry.endsAt - now) / 1000)) : 0; }
  secondsLeft(id, now) { const entry = this.active.get(id); return entry ? Math.max(0.001, (entry.endsAt - now) / 1000) : 0; }
  #end(id, outcome) { const entry = this.active.get(id); if (!entry) return null; this.active.delete(id); return { id, outcome, info: entry.info }; }
  /** A person or the microphone answered. Returns the resolution, or null if that check-in is not open. */
  answer(id, kind) { return kind === 'ok' || kind === 'help' ? this.#end(id, kind) : null; }
  /** Advance time. stillAlerted(id) says whether that person's detector is still in its alert state. */
  tick(now, stillAlerted) {
    const ended = [];
    for (const [id, entry] of [...this.active]) {
      const outcome = !stillAlerted(id) ? 'moved' : now >= entry.endsAt ? 'timeout' : null;
      if (outcome) ended.push(this.#end(id, outcome));
    }
    return ended;
  }
  cancelAll() { const infos = [...this.active.values()].map(entry => entry.info); this.active.clear(); return infos; }
}
