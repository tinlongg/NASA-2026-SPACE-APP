# Integration checklist

Run on the demo iPhone before every checkpoint. “Sim” records results reported by the earlier handoff,
not rerun during this alignment pass. No item has been checked on a physical iPhone. Current Xcode
launch problems block new native runs; the browser extension does not satisfy iPhone acceptance.

## Automated
- [x] iOS unit tests pass (Sim) — command in `README.md`
- [x] Backend tests pass (27, including Python/JS ranking parity) — `cd backend && .venv/bin/python -m pytest -q`

## On device
- [ ] App launches from a cold start
- [x] Dashboard shows crew, derived status and recent events (Sim)
- [ ] First camera use prompts for permission; denying shows the Settings link
- [ ] Safe, supervised physical-device fall validation produces exactly one `Possible fall` alert (pending; current demo uses synthetic input)
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


## Browser companion — 2026-11-14 alignment pass

- [x] 29 Node tests pass: seven replay scenarios at four frame rates, low-confidence/lost pose,
  invalid input, provider failures, rate limits, citation provenance, and demo fallback.
- [x] Local UI: generated fall → one labelled event; research question → OSDR citations.
- [x] Browser shell reloaded with local server stopped; saved OSDR answer showed Demo mode and
  citations. Camera-model cache reported complete; camera inference without networking is untested.
- [x] Offline-cache simulation: shell/model retrieval with mocked networking disabled; failed model
  download does not report readiness. This is not a physical offline test.
- [x] Research wire fields and shared native Core types remain unchanged.
- [x] Published version 3: Meta generated a cited OSD-946 answer with correct ground-study scope.
- [ ] Different teammate verifies all five source records and six saved answers, signs SOURCES/manifest.
- [ ] Chrome/Edge on Windows: allow/deny permission, busy camera, unplug, hide page, return, restart.
- [ ] Actual webcam: upright/walk/sit/slow descent, loss/recovery, low light and framing limitations.
- [ ] Prepared offline reload: local camera, replay, alerts, journal, telemetry and saved MUSE questions.
- [ ] Long session on the actual test device: heat, frame rate, memory and no duplicate alerts.
- [ ] Real recorded pose fixtures and false-alert/missed-event results documented.
