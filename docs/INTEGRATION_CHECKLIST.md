# Integration checklist

Run on the demo iPhone before every checkpoint. "Sim" marks items already checked in the iOS
Simulator on 2026-11-14; none have been checked on a physical device.

## Automated
- [x] iOS unit tests pass (Sim) — command in `README.md`
- [x] Backend tests pass — `cd backend && .venv/bin/python -m pytest -q`

## On device
- [ ] App launches from a cold start
- [x] Dashboard shows crew, derived status and recent events (Sim)
- [ ] First camera use prompts for permission; denying shows the Settings link
- [ ] Safe simulated fall onto a mat produces exactly one `Possible fall` alert
- [x] Replay → Synthetic Fall produces one alert labelled `Replay` (Sim)
- [ ] Replay → Synthetic Sit Down and Lie Down Slowly produce no alert
- [ ] Really sitting down and lying down slowly produce no alert (3 tries each)
- [ ] A second fall within 15 s does not raise a second alert
- [x] Banner shows source and time; Acknowledge clears it; status returns to Nominal (Sim)
- [x] MUSE Live returns an answer with a tappable source (Sim, artificial test corpus only)
- [ ] MUSE Live with the real corpus: every citation opens the claimed document
- [ ] Irrelevant question shows "No supporting source found"
- [ ] Backend stopped: chat shows the "can't reach" state and does not crash
- [ ] Demo mode shows the "Demo mode" badge on every answer
- [x] Journal entry saves and shows an on-device summary (Sim)
- [ ] Journal entry is still there after quitting and reopening the app
- [ ] Airplane mode: dashboard, camera, alerts, journal and telemetry all work
- [x] Heart-rate card shows `Simulated` (Sim)
- [ ] Ten minutes of monitoring: no crash, phone does not lock or overheat
- [ ] Full demo script runs twice in a row

## Known limits to say out loud
The fall heuristic assumes gravity, one person, a fixed upright phone and decent light. It misses
falls toward or away from the camera and will sometimes flag non-falls. The heuristic score is not a
probability. Telemetry is simulated. MUSE only knows the documents the team gave it.
