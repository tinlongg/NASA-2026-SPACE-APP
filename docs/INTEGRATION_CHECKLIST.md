# Integration checklist

Current journal acceptance supersedes older local-summary checks: see [JOURNAL](JOURNAL.md).
- [ ] Deploy the Worker with migration 0008 and configured Meta access before distributing the new iPhone build.
- [ ] On both clients, save several synthetic entries with mixed feelings; verify automatic collective feedback and no visible sentiment/summary panel.
- [ ] Disconnect networking; verify the note stays saved and its MUSE reflection offers retry.
- [ ] Verify a live Meta response after deployment; mocks do not establish provider availability.

Updated 2026-11-14 against `main` at `19906a1` plus the local QA fixes described in
[PASSDOWN](PASSDOWN.md). Checked items below were verified in this pass. Physical iPhone and Windows
acceptance remain pending; synthetic replays do not validate real-person detection.

## Automated and build checks

- [x] Web: 39 tests pass on Node 22.23.5, including detector fixtures, account isolation, journal recall,
  provider mocks, offline-cache simulations and pairing/sync. Node 20 cannot load `node:sqlite`.
- [x] Backend: 31 tests pass — `cd backend && .venv/bin/python -m pytest -q`.
- [x] iOS: 62 tests pass on Xcode 26.6, iPhone 17 / iOS 26.5 Simulator using the iPhone-only
  `CrewSafety-iOSOnly` scheme, including repeated voice cleanup before listening. The 60-second
  check-in timeout is unit-tested. The shipping `CrewSafety` scheme also embeds the Watch app and
  needs the watchOS 26.5 simulator runtime; see `ios/scripts/test-ios-only.sh`.
- [x] Web Worker build succeeds. Commands and runtime requirements are in [PASSDOWN](PASSDOWN.md).

## Interactive checks completed

- [x] Browser: Stops moving runs to completion, creates exactly one `Possible unresponsive · Synthetic
  replay` event after 15 seconds of stillness, and acknowledgement clears the open-event count.
- [x] Browser: Safety events caption uses possible-unresponsive wording after asset refresh.
- [x] Mac webcam starts at 8–13 fps; Stop releases it. **No reliable pose was acquired**, so this does
  not verify the live detector or a live stillness alert.
- [x] iOS: Monitor → Test → Synthetic Stops Moving opens a Replay-labelled check-in. **I'm OK** logs
  the response, returns to Monitor without an active alert, and does not crash.
- [x] iOS: Synthetic Limp And Tumbling → **I need help** raises a critical Replay-labelled banner.
  Acknowledge clears it. The source badge is visible on both full-screen check-in prompts.

Notification and speech permissions were declined during the simulator button checks. On-device voice
and notification delivery were not tested. Provider calls in automated tests were mocked; this pass
did not reverify a live Meta response or the hosted deployment.

## Physical iPhone acceptance — pending

- [ ] Cold launch, camera permission allow/deny, recovery via Settings, and camera release on Stop.
- [ ] Update the six camera/microphone/speech permission descriptions in `project.pbxproj` from the
  historical fall wording before the permission-flow demo (app-lead ownership in EXECUTION_PLAN §3).
- [ ] With shoulders, hips and arms reliably visible, holding still for 15 seconds opens one check-in.
- [ ] Ordinary limb movement does not trigger; body drift/rotation alone does not count as limb movement.
- [ ] Pose loss for over two seconds resets the timer; reacquisition starts a fresh observation window.
- [ ] Continued stillness does not cause duplicate alerts; movement rearms detection.
- [ ] Repeat both response-button paths on device; wait through the complete 60-second timeout.
- [ ] Verify speech allow/deny, spoken response handling, notification allow/deny and actual delivery.
- [ ] Native MUSE citations open the claimed real documents; irrelevant questions and backend loss
  show the documented fallback states with Demo mode labelled where applicable.
- [ ] Native journal survives relaunch; local dashboard, monitoring, alerts and journal work offline.
- [ ] Ten minutes of monitoring: acceptable frame rate, heat, memory, no crash or unexpected lock.
- [ ] Run the complete demo script twice.

## Browser and deployment acceptance — pending

- [ ] Repeat the Mac live-person test with reliable framing: movement, 15-second stillness, pose
  loss/recovery, low light, acknowledgement and rearming. Record false alerts and missed events.
- [ ] Chrome/Edge on Windows: permission allow/deny, busy camera, unplug, hide/return and restart.
- [ ] Prepared offline reload: browser replay, events, guest journal and camera inference. Mocked
  cache tests do not establish that MediaPipe inference works without networking on the demo device.
- [ ] Long session on the actual laptop: frame rate, heat, memory and no duplicate alerts.
- [ ] Apply and verify both hosted D1 migrations, account login/storage and runtime Meta credentials
  before publishing. No deployment was performed in this pass.
- [ ] A different teammate verifies the NASA source records and saved native answers, then signs the
  pending review fields in `SOURCES.md` and the source manifest.

## Limits to explain during the demo

This is a one-person, camera-dependent no-movement heuristic, not a diagnosis or a probability of
unresponsiveness. Sleep, reading and deliberate stillness can trigger it; hidden arms reduce visible
movement. The native app offers a 60-second check-in, while the standalone browser immediately records
an event asking a crewmate to check in. Paired telemetry is simulated. Account journals are server-stored;
guest journals stay in browser storage. MUSE reflections send selected text and optional related account
entries to Meta. The website no longer has the native research chat or saved research-answer fallback.
