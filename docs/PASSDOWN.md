# Passdown — 2026-11-15

Starting point for this follow-up: `main` at `19906a1`, which merged PR #4 and commit `e7c5db7`. The station detector,
accounts and journal recall are already merged; do not open another PR for that old branch.
This file is the current operational handoff. Read it first, then `README.md` → *Setting and detection*.
`docs/HANDOFF.md` records an older revision; its test counts, hosted `/chat` advice and export commands
are historical. The briefs and execution plan retain the original design beneath their override notes.

This handoff accompanies the QA fixes being committed to `main` at the user's request. The code and
documentation are the deliverable; the hosted website has not been redeployed. Teammates must pull
`main` and rebuild the iOS app or restart their local web server to use these changes.

## What Codex did in this follow-up

| Files | Change and reason |
| --- | --- |
| `ios/CrewSafety/Features/Camera/CheckInVoice.swift` | Fixed a simulator crash when answering a check-in with speech permission denied. Audio objects are created when needed; stopping only cleans up an input tap/session that was actually started. |
| `ios/CrewSafetyTests/CrewCheckInTests.swift` | Added `testVoiceCleanupWithoutListeningIsSafeAndRepeatable`, exercising two stops before any listening begins. The complete native suite now has 54 tests. |
| `ios/CrewSafety/Features/Camera/CheckInView.swift` | Kept the Replay/Web camera source badge visible on the full-screen check-in. |
| `ios/CrewSafety/Features/Camera/CameraMonitorView.swift` | Renamed the test menu section to **Replay a pose sequence**, since the current fixtures are generated joint positions rather than recordings. |
| `web/dist/app.js` | Corrected the Safety events caption to possible-unresponsive detection. |
| README, handoff, checklist, demo, connection and data notes | Reconciled current behavior, run requirements, account-journal privacy, removed browser research features and outstanding acceptance work. Older plan/handoff content is explicitly historical. |

All 15 project Markdown files were reviewed. The QA results below come from the November 14 test
session; the November 15 handoff update adds the file summary and body-tracking clarification. No
detector thresholds, account schema, MUSE provider configuration or source-review signoffs changed.
Existing untracked duplicate files and generated Xcode workspace data are outside this changeset.

## What "pose" means here

Users do not perform or copy named poses. **Pose estimation is automatic body tracking**: Apple Vision
on iPhone and MediaPipe in the browser estimate shoulder, hip and limb positions from each frame.
The detector compares those positions relative to the torso to measure stillness while ignoring
whole-body drifting/rotation. This design was already in the merged repository before the QA work.

The optional skeleton overlay only draws the tracked points; the synthetic replays feed generated
points into the same detector. **No reliable pose** means there are not enough reliable body points
to measure movement, not that the user failed to perform an action. Camera Coach receives an explicitly
submitted numerical summary, not video, and does not decide when alerts fire. Replacing body tracking
would require a different movement detector; it was not removed during this follow-up.

## Where the product is now

CrewSafety is for crew **aboard a space station**. Fall detection is gone, because nobody falls in
microgravity. The camera now raises a *possible unresponsive* alert when a tracked crew member shows no
limb movement for 15 seconds. iOS then asks "Are you OK?" and gives 60 seconds for a response; the
standalone website immediately records an event asking a crewmate to check in, without the iOS countdown.
The website has accounts, a journal with a vector
index, and MUSE reflections that can draw on related past entries. The MUSE research tab and the
simulated heart-rate data are removed from the website.

## Merged product changes

| Area | Change |
| --- | --- |
| Camera detection (web + iOS) | Fall heuristic replaced by a no-movement check. Joints are measured relative to the torso, rotated upright and scaled by torso length, so drifting and tumbling don't count as movement. Alert when no joint moves more than 0.25 torso lengths for 15 s while in view. Losing the pose for over 2 s restarts the timer. The person must move again before another alert. Web: `web/dist/detector.js`. iOS: `ios/CrewSafety/Features/Camera/InactivityDetector.swift`. |
| Replays | Synthetic floating figures: Working, Resting (small movements), Leaves view, Stops moving, Limp and tumbling. Web: `web/dist/fixtures.js`. iOS: `SyntheticPoses` in `PoseFixture.swift`. |
| Sync contract | Event type `possibleFall` → `possibleUnresponsive` in `web/sync.mjs`, `backend/app/sync.py` and the iOS `SafetyEventType`. Old app builds will get 422 errors on sync. |
| iOS | Types renamed: `InactivityDetector`, `InactivityDetectorConfig`, `InactivityDetection`, `CrewCheckIn`. Elbows and wrists added to Vision pose tracking. The detector card shows Movement and Still for. The check-in, voice prompt and notifications say "No movement detected". Easy test mode on the web camera alerts after 8 s instead of 15. |
| Mac webcam relay (`webcam/`) | Sends elbows and wrists. New readout. **Send test stillness** replaces "Send test fall". |
| Accounts | Username and password. Salted PBKDF2 hashes; HttpOnly SameSite=Strict session cookie (7 days). Server code is `web/account.mjs`, the browser dialog is `web/dist/account.js`, and the tables are in `web/drizzle/0001_accounts.sql`. |
| Journal vector DB | Signed-in entries are stored in D1 with a 512-dimension embedding (`hashed-lexical-v1`: hashed words, word pairs, trigrams and 11 wellness-theme dimensions). Search is an exact cosine scan of that user's rows, 500 entries at most. **This embedder is not a neural model**; swap `embedText` and bump `VEC_MODEL` to change it, and old rows are re-embedded on the next recall. |
| MUSE memory (RAG) | "Send to MUSE" has a checkbox (on by default when signed in). The server attaches up to 3 of that user's related past entries (similarity ≥ 0.2) to the Meta request. The browser never supplies the history. |
| Removed from the website | The MUSE research tab, Worker `/chat`, `research.mjs`, `research-data.json`, `fallback.json`, `research-ui.js`, the research tests, and the backend `export_web.py` and parity test. **The FastAPI `/chat` still exists for the iOS app.** Also removed: the simulated heart-rate cards and chart, and the demo crew member. |
| Design | Graphite surfaces, one green accent, sentence case, 400–600 weights, lucide line icons, 8 px / 12 px radii. The sidebar has groups, quick actions, a live status panel and recent events. On narrow screens the nav becomes a top bar. The checked-in design direction is at the top of `web/dist/styles.css`; the earlier `design.md` reference belongs to another worktree and is not a file in this repo. |
| Docs | `README.md` has a *Setting and detection* section. The brief, plan and handoff open with a direction-change note. The demo script, integration checklist, connection guide, web README and webcam README are reworded. |

## QA evidence — 2026-11-14

- Web: **39/39 tests pass** with Node **22.23.5**. Node 20.11.0 cannot load `node:sqlite`; this is a
  runtime requirement, not an account-test regression. The system Node installation was not replaced.
- Backend: **31/31 tests pass** in the existing virtual environment.
- iOS: **54/54 tests pass** on Xcode 26.6, iPhone 17 / iOS 26.5, including the new repeated idle-voice
  cleanup regression. The baseline had 53 tests; the interactive run found the missing crash case.
- Browser UI: **Stops moving** completed its 20-second synthetic sequence, recorded exactly one
  `Possible unresponsive · Synthetic replay` event after 15 seconds of stillness, and acknowledgement
  reduced the open-event count to zero. A hidden tab stopped an earlier replay as designed.
- Live Mac webcam: user-authorized startup reached **8–13 fps** in the in-app browser, but no reliable
  shoulder/hip pose was acquired during the attempt. No live stillness alert was verified. Stop released
  the camera. No live camera screenshots, video recordings or provider submissions were made.
- Native UI exposed a crash after tapping **I'm OK** with speech permission denied. The crash stack
  enters `CheckInVoice.stop()` → `AVAudioEngine.inputNode` → audio I/O initialization. Cleanup must not
  create an input node. The fix creates the synthesizer/engine only when speaking/listening starts,
  retains the node with an installed tap, and releases only resources that were used. A regression exercises stopping
  before listening, twice. Apple's [input-node documentation](https://developer.apple.com/documentation/avfaudio/avaudioengine/inputnode)
  confirms that accessing this property creates the node on demand.
- Copy fixes: web Safety events now says possible-unresponsive; iOS Test says **Replay a pose sequence**,
  and the full-screen check-in retains the Replay/Web camera source badge.
- Final iOS interactive recheck: **Synthetic Stops Moving → I'm OK** returned to Monitor, displayed
  the recorded OK response and raised no active alert. **Synthetic Limp And Tumbling → I need help**
  produced a critical event with a Replay-labelled banner; Acknowledge cleared the banner. Both prompts
  retained the Replay badge, and neither response crashed. The 60-second timeout remains unit-tested,
  not interactively timed in this pass.
- The web Worker build succeeds. After the preview restart, one reload updated the service worker and
  a second loaded the corrected event caption; account data was not cleared to refresh the assets.

## Run it

The web server and account/sync tests require **Node 22.13+** (`node --version`).

```bash
cd web && npm test
```

```bash
cd web && npm start
```

`npm start` serves http://127.0.0.1:4173 and loads `web/.env`. Accounts persist in the ignored file
`web/.data/local.sqlite`, including pairing sessions. The QA preview used port 4174 and a separate
database outside the repository, so it did not alter the normal local accounts.

If the Mac still has Node 20, use a scoped Node 22 runtime without changing the global installation:

```bash
cd web
npx --yes --package=node@22 node --test tests/*.test.mjs
npx --yes --package=node@22 node --env-file-if-exists=.env scripts/serve.mjs
```

```bash
cd backend && .venv/bin/python -m pytest -q
```

iOS: Xcode 26.6 and the iOS 26.5 runtime are installed on this Mac. List available destinations with
`xcrun simctl list devices available`; substitute an installed name/OS if different. From the repo root:

```bash
xcodebuild test -project ios/CrewSafety.xcodeproj -scheme CrewSafety \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' \
  -jobs 2 -parallel-testing-enabled NO ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO
```

Use **Monitor → Test → Synthetic Stops Moving** for the native replay. The Simulator cannot validate
Apple Vision on a physical iPhone camera. Keep the browser preview visible during web replay or webcam
tests; hiding it releases the camera and stops the session.

## Secrets

- Local configuration uses ignored `web/.env`: `META_API_KEY` and optional `META_MODEL=muse-spark-1.3`.
  Hosted credentials belong in runtime secrets. Never copy `.env` into a source bundle or print its value.
- The earlier pass reported a real MUSE journal reflection with memory. This QA pass used mocked provider
  calls in tests and did not make a live Meta request or rotate credentials.

## Before deploying the hosted site

1. Confirm both `web/drizzle/0000_crew_sync.sql` and `0001_accounts.sql` are applied to the hosted D1
   database. Sign-in fails without the account tables.
2. Set `META_API_KEY` (and optionally `META_MODEL`) as runtime secrets in Sites, then redeploy.
3. `npm run build` and publish `web/` as described in `web/README.md` → Hosting.
4. Exclude `.env`, `.data`, local SQLite files and test accounts from the deployment source. Publish
   schema migrations, not a copy of the development database. No deployment was performed in this pass.

## Not done / not verified

- Real-person detection remains unverified despite the webcam-startup check. 15 s and 0.25 torso
  lengths are starting values. Sleep, reading or
  deliberate stillness will trigger the alert, and hidden arms reduce visible movement.
- No email, password reset or account deletion. Login throttling is per isolate, best effort.
- Account journal entries are stored on the server in plain text; guest entries stay in localStorage.
- `docs/EXECUTION_PLAN.md` and the briefs still describe the fall design in their bodies; the note at the
  top of each overrides it.
- The FastAPI `/dashboard/` copy of the website has no account routes, so it is guest-only.
- iOS permission descriptions in `ios/CrewSafety.xcodeproj/project.pbxproj` still say "possible fall"
  for camera, microphone and speech in Debug and Release. The app lead owns that project file under
  `docs/EXECUTION_PLAN.md` §3; update those six strings before a permission-flow demo. The project file
  was not changed in this QA pass.
- Notification delivery, on-device speech, the real-iPhone checklist, Windows webcam testing and
  prepared offline camera inference remain unverified. Simulator notification and speech prompts were
  declined during the button-based checks.
- NASA sources still need an independent human reviewer; preserve the pending signoff in `SOURCES.md`.

## Suggested next steps

1. Pull `main` and rebuild iOS / restart the web preview using the commands above. Review the changes
   listed in this handoff; the earlier PR #4 merge is already complete. The 39 web, 31 backend and 54
   iOS test results cover this code; the remaining items below are not implied to be complete.
2. Repeat the live webcam test with shoulders, hips and arms reliably tracked, then run the physical
   iPhone checklist. Record observed false alerts/misses without describing synthetic tests as validation.
3. Decide with the team whether sleep periods should pause monitoring; no automatic sleep suppression
   was added. Use Stop for a deliberate pause in the current prototype.
4. Apply and verify hosted migrations/secrets before a separate deployment; a GitHub pull does not
   update the hosted site or the installed simulator app.
5. A neural embedding API is optional follow-up, not a dependency of the present journal recall.

## Roadmap progress — 2026-11-15 (branch `claude/muse-agent-features-7801dc`)

Plan: `docs/ROADMAP_PLAN.md` (in worktree `crewsafety-roadmap-9c2217`, not yet committed).

- **Phase 0 done.** The six `pbxproj` usage strings no longer say "possible fall". The iOS suite was not rerun for this string-only change.
- **Phase 2 done (web).** Journal photos: migration `0002_journal_photos.sql`, photo routes in `web/account.mjs`, `web/dist/journal-photo.js`, a day-by-day history in the Journal tab, and `web/tests/journal-photo.test.mjs`. Web suite is now 46/46 on Node 22. Checked in the local browser with a synthetic image: upload, thumbnail and day navigation. Not verified: webcam still capture, hosted D1 migration, mobile camera capture.
- **Not started:** Phase 1 (needs a live camera test with the user), Phase 3 (D1: confirm the Meta model accepts images first), Phase 4 (needs `ELEVENLABS_API_KEY`), Phase 5 (needs a NASA source for the suit layers, D6), Phase 6, Phase 7 (needs sensor hardware).
- The Raspberry Pi 4 could not be found on the LAN (no mDNS name, no open SSH port) and no green activity LED was reported; likely not booting.

### Phase 3 — MUSE vision (2026-11-15)

- D1 resolved from Meta's media-understanding and models docs: `muse-spark-1.3` accepts images on chat-completions as `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}` in a `user` message.
- Built: `POST /api/journal/photos/compare` (3a) and `POST /api/coach/look` (3b) in `web/worker.mjs`, `journalPhotosForCompare` in `web/account.mjs`, a compare control per photo entry, and the opt-in "second look" in the Monitor tab. The reply is stored on the event as `lookNote`, next to `snapshot`, so the JSON export shows detector metrics and MUSE side by side. Web suite: 51/51 (Node 22).
- **Live provider check, 2026-11-15:** with the real `META_API_KEY` (copied from the design-auth worktree's ignored `web/.env`), both routes returned 200 from `muse-spark-1.3` for synthetic solid-colour JPEGs, and described them neutrally as having no person. Not yet tried with a real face photo or a real webcam alert.
- Camera copy changed from "never uploaded" to "stays on this device unless you turn on the second look".
- The weight idea is not implemented: a photo cannot measure weight. A manual number field on the entry is the suggested route.

### Phase 4 — ElevenLabs check-in voice (2026-11-15)

- `backend/scripts/generate_voice.py` reads `ios/CrewSafety/Resources/Voice/phrases.json` and writes one mp3 per phrase with ElevenLabs (default voice Eric (the CrewSafety Check-in agent's voice; first generated with Sarah by mistake), `eleven_multilingual_v2`). The key comes from `ELEVENLABS_API_KEY` or the git-ignored `backend/.env`; only the clip is committed. Re-run with `--force` to change voice or wording.
- `CheckInVoice.speak` plays the bundled clip for an exact phrase match with `AVAudioPlayer`, and falls back to `AVSpeechSynthesizer` for any other phrase or a playback failure. Listening is still on-device. The lazy-creation and repeated-`stop()` behaviour is unchanged.
- iOS suite: 56/56 on iPhone 17 / iOS 26.5 (two new clip-lookup tests). Verified by ear in the iPhone 17 simulator (Synthetic Stops Moving): the ElevenLabs clip played and the 60-second countdown ran, with speech and notification permission declined. Not verified: a physical iPhone, or listening after the clip with speech permission granted.
- The ElevenLabs key was pasted in chat; rotate it in the ElevenLabs dashboard and update `backend/.env`.

### Sleep notes, photo trend and suit check (2026-11-15)

- Decision with the user: no feature judges health from photos ("needs more sleep or muscle"). Instead entries take self-reported sleep hours, the Journal tab shows recent photos beside those numbers, and photo comparison gets the numbers as context only.
- Suit check tab built (`web/dist/suit-layers.js`, `/api/suit/checks`, migration `0003_sleep_and_suit.sql`). **The items are grouped inspection areas, not NASA's 14 layers**: the sources found disagree on the split and the primary PDFs could not be read. A reviewer must read the NASA text and itemise the layers; then edit `suit-layers.js` and the entries in `docs/SOURCES.md`. Helmet/glove and leak-check items come from general knowledge and are also pending review.
- Web suite 56/56 (Node 22). Checked in the local browser: suit save with a failed item produced a Manual entry event and history row; sleep logging and the photo-trend strip rendered. Not verified: hosted D1 migration, guest-mode suit history across reloads, iOS suit badge (not built).

### Fixes and restyle (2026-11-15)

- **Camera Coach "did not return a complete explanation":** reproduced with the real key. `muse-spark-1.3` spent all 1,200 `max_completion_tokens` on reasoning (1,198 reasoning tokens, no answer). The limit is now 4,000 for the coach, journal reflection and vision routes; the coach then answered normally (about 930 reasoning tokens). The error text still says "try a shorter question", which is misleading for this cause.
- **Suit check controls:** the global `input:not([type=checkbox])` style gave radios full width. They are now a segmented Pass / Fail / Not checked control.
- **Journal calendar (web):** month grid above the entries; days with entries are marked, a ring marks a photo; account users see one selected day, guests can click a day to filter and "Show all". Not built on iOS.
- **iOS restyle:** `Theme.swift` now uses the website's graphite palette with indicator green, amber for the Simulated badge, 12 px cards, dark-only (`preferredColorScheme(.dark)`), and a graphite tab bar. The Space Apps blue/yellow palette is gone. Checked on the Dashboard only; other screens were not reviewed visually. iOS suite 56/56.

### iOS: MUSE chat removed, journal calendar added (2026-11-15)

- Removed the MUSE chat tab and everything behind it: `Features/MuseChat`, `MuseService`, the MUSE settings section, `MUSE_BASE_URL`, the bundled fallback answers and their tests. The FastAPI `/chat` route is untouched but nothing in the iOS app calls it now. `docs/EXECUTION_PLAN.md` and `docs/IOS_WEB_CONNECTION.md` still describe the chat in their bodies.
- Added a month calendar to the iOS Journal tab (`JournalCalendarView.swift`): days with entries are marked, tapping one filters History to that day, "Show all" clears it. iOS suite is now 43 tests (the removed MUSE tests were 16, the new calendar tests 3), all passing. Checked in the simulator that the calendar renders with the marked day; tapping a day to filter was not confirmed visually.

### Phase 1 — camera diagnostics, model choice and rest pause (2026-11-15)

Built without the live test (that still needs a person in front of the camera; see step 6 of `docs/ROADMAP_PLAN.md`).
- **Web (`web/dist/camera-health.js`, `app.js`, `offline-config.js`):** the Monitor tab shows model, delegate (GPU tried first, CPU fallback), video size and per-group visibility for shoulders, hips and arms. A model selector offers Lite, Full and Heavy (5.8, 9.4 and 30.7 MB). The offline download prepares Lite and Full; Heavy is cached the first time it is used online. After more than 2 seconds without both shoulders and hips, the page says "Move back so your hips are visible" (or shoulders, or both). The existing detector, 15 s and 0.25 thresholds are untouched.
- **Rest period (D7):** a manual pause of 15 min to 4 h, web and iOS (`RestPause.swift`, a card on the Monitor screen). Paused monitors raise no events, show the end time, and restart the timer when the pause ends. There is no automatic sleep detection.
- Tests: web 61/61, iOS 47/47. In the local browser the diagnostics panel, model list and rest pause rendered, and a "Stops moving" replay raised no event while paused. **Not re-verified:** the replay alert after resuming (the browser pane was hidden and the app stops a session in a hidden tab), GPU delegate behaviour, and anything with a real camera.
- **Still to do for Phase 1:** run the live test (ordinary movement, 15 s still, leaving view, returning), record fps, model, delegate and any false alerts or misses here, and only then consider changing thresholds.

### Spoken alert on the website (2026-11-15)

- The ElevenLabs voice had only been added to the iOS check-in. The website now plays a recorded clip ("Alert. Possible unresponsive crew member. Please check on them now.") when a possible-unresponsive event is raised, live or replay, with a "Spoken alert" checkbox (on by default). `backend/scripts/generate_voice.py` writes phrases named `web-*` to `web/dist/voice/`; the Worker embeds the mp3 as base64. Web suite 62/62.
- Not verified in a browser: browsers may block audio until the page has been used, and the Worker build now embeds a binary asset (a hosted deploy has not been tried). The written banner remains the primary alert.
- **Voice correction:** the first clips used Sarah (a female premade voice) because the script defaulted to it; the user's ElevenLabs agent "CrewSafety Check-in" is set to Eric (`cjVigY5qzO86Huf0OWal`). Both clips were regenerated with Eric and the script default changed. Clips come from the text-to-speech API, so changing the agent's voice in the dashboard does not change them: re-run `python3 backend/scripts/generate_voice.py --force` (set `ELEVENLABS_VOICE_ID` for another voice).

### Seated / upper-body tracking (2026-11-15)

- **False negative fixed on the web:** the detector needed shoulders and hips, so a person seated at a desk (hips hidden) counted as "out of view" and the timer reset: a slumped person would never alert. `measurePose` now falls back to an upper-body measurement (shoulders required; nose, ears, elbows, wrists optional) scaled by shoulder width, with the movement threshold scaled to match (0.35 shoulder widths, about 0.25 torso lengths). Switching between full-body and upper-body tracking counts as movement. Events say "upper body only". Only missing shoulders now produce the framing hint.
- New synthetic replays: "Seated, typing" (0 events) and "Seated, slumped and still" (1 event). Web suite 67/67. These are generated numbers, not validation on people.
- **Not done:** the iOS detector (`InactivityDetector.swift`) still needs shoulders and hips; it has the same false negative. Eyes are not used by any detector.
- Likely cause of "no sound" in the live test: the local server loads assets once at startup, so a server started before the voice change serves no clip. Restart `npm start` and hard-reload (the service worker also caches the old page).

### Multi-person tracking, close-up view, readings (2026-11-15)

- Web only. People are found automatically (nothing entered ahead of time; up to 4 per frame) and tracked with stable ids (`web/dist/people.js`), a detector per person, per-person events, labelled boxes on the overview, click to follow someone. A **Close-up** second view zooms on the face of the flagged or clicked person with eyes (open/closed/mixed) and mouth (moving/still) readings from MediaPipe `FaceLandmarker` blendshapes (new 3.7 MB model, added to the offline download). A **What the monitor sees** panel lists rule-generated plain-language statements per person.
- Eye and mouth readings are **information for the person watching only**; no alert depends on them (decision: info only; closed eyes cannot tell sleep from a problem). They are recorded on each event as `eyes` and `mouth`.
- Tests: web 75/75, including a guard that every imported browser module is served by the Worker and cached by the shell (a missing allowlist entry had broken the whole page once during this work).
- **Not verified:** anything with a real camera. Multi-person tracking, face matching to people, blink and mouth thresholds (0.55 blink score, 0.04 jaw spread) and the crop framing are untested on real people. The tracker matches by position only, so people who cross paths can swap ids. Not done: iOS multi-person, the iOS upper-body fallback, and a layout check at narrow widths (the toolbar overflowed sideways in the narrow browser pane).

### Rest period removed (2026-11-15)

- The manual rest-period pause (web panel, iOS Monitor card, `RestPause`, tests) was removed at the user's request: crew sleep in private areas that the cameras do not cover, so no pause is needed. This reverses roadmap decision D7 and the "Rest period" notes in the Phase 1 section above. Sleep or deliberate stillness in a monitored area can still raise an alert. Web suite 74/74, iOS 43/43.

### Spoken answers on the website (2026-11-15)

- Opt-in checkbox, on-device recognition only (`web/dist/voice-answer.js`; Chrome's `processLocally`; refuses to run if the browser would use a server). After a live alert's clip, it listens up to 30 s for okay or help; only the classification is stored on the event, and the event is never auto-acknowledged. Web suite 76/76.
- **Not verified with real speech.** In the in-app browser the API reported on-device English as `unavailable`, so the checkbox correctly refuses to turn on there. It needs desktop Chrome 139+ with the language pack, plus microphone permission. The words matched (okay/fine/yes vs help/not okay) are a first list.

### Voice follows the ElevenLabs agent; facial activity prevents false alerts (2026-11-15)

- `backend/scripts/generate_voice.py` now looks up the voice set on the CrewSafety Check-in agent through the API (falls back to Eric) and prints it. After the user changed the agent's voice, both clips were regenerated with "Hope" (`WAhoMTNdLdMoq1j3wf3I`). The clips are recordings, so any later change to the agent's voice needs `python3 backend/scripts/generate_voice.py --force`, an iOS rebuild and a web server restart.
- Live test report: a person talking while standing still still raised an alert. Fix: talking (mouth movement) and blinks now count as activity and restart the stillness timer (`InactivityDetector.noteActivity`, `BlinkDetector`, `MouthActivity`), behind a default-on checkbox. Web suite 78/78. Not verified with real people; thresholds are starting values. This reverses the earlier "info only" decision for the face readings at the user's request. Known trade-off: facial movement without the ability to respond would delay an alert.

### "Are you OK?" check-in on the website (2026-11-15)

- Live detections now start a 30 s check-in (new clip `web/dist/voice/web-checkin.mp3`, voice Hope; `web/dist/checkin.js`) before the alert: OK or movement ends it quietly, help or silence raises the event. Replays and the unchecked setting skip it. The check-in length (30 s vs iOS 60 s) and the 45 s grace after OK are untested guesses. Web suite 81/81.
- Not verified with a live camera or real speech: the countdown card, the spoken prompt followed by listening, and that talking during the check-in ends it. If a person says OK but stays still, they are asked again after about a minute.

### Walking false alert, second view, Full model default (2026-11-15)

- Live report: an alert fired while the user was walking. Likely cause (not reproduced with a camera): the microgravity design ignores the whole body travelling, so with limbs not tracked a walking torso looks still. Added `wholeBody` to `InactivityDetector` (torso travel or ~20° turn counts as movement) and a default-on page checkbox; tests cover walking past (alert only in space mode), turning in place, and still standing. Web suite 85/85. The UI replays remain microgravity unless a fixture says otherwise ("Walking past, torso only" is Earth mode).
- The close-up is now an always-on second view beside the main camera, with a pop-out window ("Open on another screen"). Pose model now defaults to Full.
- Not verified with a camera: walking in front of a real webcam, the pop-out window (browsers may block it), and the layout below 980 px width (stacked).
- Open question for the product: Earth mode is the default because every test so far is on Earth; the space-station behaviour is the checkbox off.

### Stations: phones as cameras (2026-11-15, branch `claude/stations-circle-push`)

- Built: the Stations tab, `/camera` phone page, pairing by one-time code, status reports, a simulated deck plan, and live video signalling (WebRTC). Migration `0005_stations.sql` must be applied to hosted D1. Web tests 96/96 (server routes, pairing, isolation, signalling).
- **Not verified:** a real phone running `/camera` (pose and face models on a phone, check-in, audio), and WebRTC video end to end (only the signalling is tested; the browser pane could not run a second device). No TURN server, so video may fail on some networks. A phone needs HTTPS for camera access (localhost is fine only on the same machine): use the hosted site or a tunnel for real phones.
- Still to build on this branch: the notification circle and real push, and phone calls.

### Crew circle and push (2026-11-15, branch `claude/stations-circle-push`)

- Built: circles with one-time invites (`web/circle.mjs`, Circle tab), alert feed for open pages, Web Push sender (`web/webpush.mjs`: VAPID ES256 + aes128gcm, verified by decrypting in tests), push subscription routes, a service-worker push handler, `scripts/generate-vapid.mjs`, and hooks so live monitor alerts and station alerts notify the circle. Migration `0006_circle.sql` (and `0005_stations.sql`) must be applied to hosted D1. Web suite 104/104.
- **Not verified:** a real push delivery (needs VAPID secrets on a hosted HTTPS site and a real subscribed browser or iPhone Home Screen app), and the Circle tab with two real accounts on two devices.
- **Phone calls are not built.** They need a voice provider account (e.g. Twilio), a number, secrets, contacts' phone numbers (personal data sent to the provider) and a per-call cost. Waiting on the user's decision and credentials.
- The ElevenLabs conversational agent is also not wired in: agent ID `agent_7501m7f8gfk6e7taqqf0c27mwyxt` (CrewSafety Check-in). It would need an opt-in, the user's wording on audio sent to ElevenLabs, and a live connection.
