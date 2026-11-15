# CrewSafety web testing companion

The user-requested Windows/Mac companion to the primary native SwiftUI app. It uses MediaPipe Pose
Landmarker Lite, not Apple Vision. Run `npm start` here (Node 22.13+) and open
[localhost](http://127.0.0.1:4173) in Chrome/Edge. `npm test` runs the web checks; `npm run build` packages a
Worker. The public test site is [CrewSafety Connected](https://crew-safety-connected.lustrousbush32.chatgpt.site).

## Camera and local features

Camera access needs HTTPS or localhost. The browser webcam will not work over a LAN HTTP address; the paired dashboard and synthetic replay do work there. The hosted HTTPS link uses each visitor's own camera; no remote camera video is streamed. Start camera explicitly and grant access. Stop, navigating away from Monitor, hiding the tab, and closing the page release the webcam. Permission failures and model-download failures show recovery messages. Use synthetic replay to test alerts without holding still for real.

Camera frames are processed locally and never recorded. Only if you turn on the opt-in MUSE second look is one downscaled frame sent to the server and Meta when a live alert fires; it is not stored. MediaPipe JS/WASM and the model download from jsDelivr and Google. First use needs internet. Guest journal entries persist in localStorage; signed-in entries persist in the account database. Browser-generated events are session-only. Paired iPhone events persist in hosted D1 or the local backend. Any paired telemetry remains labelled Simulated.

## Paired iPhone dashboard

Start the FastAPI backend on port 8000 and open `http://COMPUTER-IP:8000/dashboard/`. In Crew dashboard, create a pairing session. Enter that backend address and code in the updated iOS app's Settings → Website connection, then enable sharing. Crew status, events and labeled telemetry sync while the app is active; website acknowledgements return to iOS. NASA research stays separate. See [the connection guide](../docs/IOS_WEB_CONNECTION.md) for setup, tests and limitations. This local connection does not require publishing to Sites.
The detector raises a *possible unresponsive* event when a tracked crew member shows no joint movement
over 0.25 torso lengths for 15 seconds. Joints are measured relative to the torso, so drifting and
tumbling in microgravity are ignored. Losing the pose for over 2 seconds restarts the timer. These are
starting thresholds, not validated performance on people; sleep or deliberate stillness triggers it.

Five **synthetic**, generated replays draw a floating figure: working, resting with small movements,
leaving the view, stopping moving, and going limp while drifting and tumbling. They drive the same
detector used by webcam measurements, and the tests run each at 10/15/30/60 FPS. No real person or
recorded video is represented.

## Historical NASA dashboard

The upstream OSDR dashboard sits in the Crew tab. It loads
`dist/data/nasa-research.json` through `research.js`, with seven selectable historical chart series,
units, sample counts, observed ranges, accessible tables, source links and five study cards. These
measurements are separate from simulated telemetry and do not drive alerts or MUSE answers. Failed
loads offer retry without disabling crew controls. See `../data/nasa-osdr/README.md` for provenance
and offline rebuilding. The Worker serves and caches the chart module, styles and data snapshot.

## Camera Coach

**Camera Coach**, inside Monitor, optionally explains a numerical pose snapshot when the visitor
clicks Explain, asks a camera question, or selects Explain in Safety events. It sends only the question,
source (live/replay), capture time, angle, hip height, and attached detector metrics to Meta through the
server. Unknown payload fields are discarded. No images, raw landmarks, journal, or crew identity are
sent. Replies identify their input source/time and do not modify deterministic alerts.

- `POST /api/coach/analyze`, `GET /api/coach/status`.
- Status indicates configuration, not verified provider access.
- 25-second upstream/30-second browser timeouts; failures leave local monitoring available.

MUSE Research (the cited NASA question-answering tab and the Worker's `/chat` route) was removed from
the website. The FastAPI research `/chat` route and source corpus have also been removed. The simulated heart-rate cards and
chart were removed too; the Crew tab shows only the paired iPhone's data and the archived NASA
measurements.

## Accounts and the journal vector index

The site opens on a short home page; every feature still works as a guest. Signing in (top right) adds an
account journal. Server code is in `account.mjs`; tables are in `drizzle/0001_accounts.sql` (`users`,
`auth_sessions`, `journal_entries`) and must be applied to the hosted D1 database before deploying.

- **Auth**: username + password. Passwords are stored as salted PBKDF2-SHA256 hashes (100,000 iterations,
  the Workers limit). The session is a random token in an `HttpOnly; SameSite=Strict` cookie (7 days); only
  its SHA-256 digest is stored. Writes require a same-origin `Origin`. Sign-in attempts are throttled per
  isolate (10/minute/IP), which is best-effort, not a lockout. There is no email, password reset, or
  account deletion yet.
- **Routes**: `GET /api/auth/me`, `POST /api/auth/register|login|logout`, `GET|POST|DELETE
  /api/journal/entries`, `DELETE /api/journal/entries/:id`, `POST /api/journal/search`.
- **Vector index**: each account entry is embedded into a 512-dimension vector and stored beside its text
  in D1; search is an exact cosine scan over that user's rows (max 500). The embedder
  (`hashed-lexical-v1`) runs inside the Worker: hashed stemmed words, word pairs and character trigrams
  plus eleven dedicated wellness-concept dimensions (sleep, workload, stress…). It matches similar
  wording and those listed themes. It is **not** a neural semantic model; unrelated vocabulary for the
  same idea will not match. Replace `embedText` and bump `VEC_MODEL` to plug in a real embedding API;
  older rows are re-embedded on the next recall.
- **MUSE reflections**: every new journal save requests collective feedback automatically, using up
  to 12 dated entries within 14 days. Selection is chronological, including positive entries, rather
  than similarity-based. Sentiment is backend-only. Saving and retrying explicitly disclose text
  sharing with CrewSafety and Meta. Entries 1–2 get a brief reflection; 3+ within 14 days unlock
  collective suggestions. Failure leaves the note saved with a retry button.
- **Astronaut demo**: Journal → Run astronaut demo presents three fictional entries and requests
  real MUSE feedback via `/api/journal/demo`. It never reads or writes personal entries or Mission
  progress. The same provider configuration is required; there is no fabricated fallback.
- **Privacy**: account entries and public reflections persist on the server in plain text; guest
  entries and public reflections persist in localStorage. Both send dated text for MUSE processing.
  Browser entries move to an account only on the move action. See [JOURNAL](../docs/JOURNAL.md).
- **Migration**: apply `drizzle/0008_journal_reflections.sql` before deploying the new Worker. The
  account API returns only public feedback; internal sentiment and provider reasoning are excluded.
- Local `npm start` keeps accounts in ignored `web/.data/local.sqlite`; set `PORT` or `CREW_DB_PATH` to
  change the port or file. The FastAPI `/dashboard/` copy has no account routes, so it stays guest-only.

### Journal photos

Signed-in users can attach one JPEG to a journal entry (file picker or a single webcam still). The browser
resizes it to at most 768 px and re-encodes it, which drops EXIF data, before upload. Photos live in the
`journal_photos` table (`drizzle/0002_journal_photos.sql`; apply it to hosted D1 before deploying) as base64,
unencrypted, capped at 60 per account and about 280 KB each. Routes: `PUT|GET|DELETE
/api/journal/entries/:id/photo`; `GET /api/journal/entries` only reports `hasPhoto`. Photo responses send
`Cache-Control: private, no-store` and are never cached by the service worker. Deleting an entry or all entries
deletes its photos. Guests cannot add photos. The Journal tab groups account entries by day with earlier/later controls.

### MUSE vision

Both routes call `muse-spark-1.3` on the Meta chat-completions endpoint with an `image_url` data URL (confirmed in the Meta media-understanding docs on 2026-11-15; not yet exercised against the live provider from this repo).

- `POST /api/journal/photos/compare` `{ entryId, consent: true }` (sign-in required). The server picks the entry's photo plus the oldest and most recent earlier photos; the browser never supplies images. Replies describe visible differences only, with the fixed line "Describes visible differences only. Not a health assessment." No weight estimate, condition or advice.
- `POST /api/coach/look` `{ source: 'live', frame }`: one JPEG of at most about 250 KB, live input only (replay is rejected). Off by default; the Monitor tab has the opt-in. The reply is attached to the event as `lookNote` beside the detector `snapshot` in the JSON export, so the team can compare MUSE with MediaPipe. It never raises, lowers, acknowledges or suppresses an alert, and the frame is not stored.
- Both use the shared per-visitor generation rate limit.

### Multi-person tracking, close-up view and readings

The Monitor tab tracks up to 4 people automatically, with nobody entered ahead of time (the limit is 4 per frame; more people is slower). `people.js` matches poses to stable ids across frames by position and gives each person their own detector, so each can raise their own event ("Person 2: …"). The overview draws a labelled box and skeleton per person (green moving, amber still, red alert); click a person to follow them.

A second view, **Close-up**, crops the video around the face of the person with an alert or who has been still for a third of the alert time (or the one you clicked). Next to it: eyes (open, closed, mixed) from MediaPipe face blendshapes, and whether the mouth is moving. These are plain readings, shown for the person watching; they do not raise or suppress alerts, and a closed eye reading does not mean anything about a person's condition. If the face model cannot load or sees nothing, the close-up falls back to the head area from the pose. All processing is in the browser; nothing is stored.

**What the monitor sees** lists, per person, plain statements generated by rules ("Still for 9 s. An alert is raised at 15 s…", "Eyes look closed."), plus the MUSE second-look description when that opt-in is on. They are not a language model's reasoning and not a diagnosis. Replays have no faces.

### Stations: phones as cameras

The **Stations** tab (signed-in accounts) links phones as cameras around a simulated station. Click a module on the rotatable 3D model of the International Space Station (drag to turn it; or use the module buttons below it), name the camera, and add it to get a one-time 6-character join code (valid 15 minutes). On the phone, open `/camera`, enter the code and allow the camera. The phone finds people on the phone (the same pose, face, movement, talking-or-blinking and "Are you OK?" logic as the main monitor) and reports a small status summary once a second; no video or joint positions are sent. The model colours each module by its worst camera status; cards list each person. Cameras can go in Zvezda, Zarya, Unity, Destiny, Columbus, Kibo, Tranquility, the Cupola and the Quest airlock; Harmony is the crew quarters, which are private, so cameras cannot be placed there. The model (`dist/iss-3d.js`, drawn on a canvas without libraries) is a simplified model based on NASA’s ISS assembly-elements reference, with an open lattice truss, eight main solar wings (paired blankets), radiator banks, module collars, Kibo’s external facility and Canadarm2. Dimensions are approximate. **Watch live video** opens the phone's camera in the browser over WebRTC: the phone makes the offer, this page answers, and the server only passes the setup messages (`/api/stations/:id/signal`, `/api/stations/signal`, 2-minute retention). There is no relay (TURN) server, so video may not connect across some networks. Tables: `stations`, `station_signals` (`drizzle/0005_stations.sql`). Up to 12 cameras per account; re-pairing a station cuts off the old phone. The server code is `stations.mjs`, the phone page `dist/camera.html` and `dist/camera.js`, the admin page `dist/stations-ui.js`.

### Circles and push

A **crew circle** is the set of people told when an alert is raised, like a family-safety circle. An account creates one circle (Circle tab), makes one-time invite codes (24 hours) and others with an account join with the code; up to 20 members. Alerts come from the owner's live monitor (when signed in) and from station cameras. Each alert is stored for 24 hours and goes to members three ways: a **Web Push** message that reaches the device even with the site closed, a feed that open pages poll every 3 seconds (banner, alert voice and a browser notification), and the owner's own page. Text is only a station or monitor name, a person number and what happened.

Push needs keys on the server: run `node scripts/generate-vapid.mjs`, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (your own `mailto:` or `https:` contact) as hosting secrets, or in the ignored `web/.env` for local use, then restart. Without them the Circle tab still works through the open-page feed and says push is not set up. Browsers need HTTPS (localhost works on the same machine); on iPhone, push only works for a site added to the Home Screen. The Web Push sender (`webpush.mjs`: VAPID signing and RFC 8291 encryption) is checked by decrypting its output in tests, but no real push service delivery has been tried. Tables: `circles`, `circle_members`, `circle_invites`, `push_subscriptions`, `circle_alerts` (`drizzle/0006_circle.sql`).

**Phone calls are not built.** Calling a phone number needs a voice provider account (for example Twilio) with a purchased number, its credentials as server secrets, and each contact's phone number sent to that provider, which also costs money per call. Add those and a clear opt-in before building it.

### Phone calls

Serious alerts also ring circle members who opted in: someone asks for help, does not answer the "Are you OK?" check-in, or (with the check-in off) has not moved for a while. Each person adds only their own number on the Circle tab (E.164, like +15551234567), ticks a consent box, and can send themselves a test call. ElevenLabs places the call through the Twilio number imported into ElevenLabs, using the agent in `ELEVENLABS_ALERT_AGENT_ID`, and the server fills `person`, `room`, `camera` and `what_happened`. Secrets: `ELEVENLABS_API_KEY`, `ELEVENLABS_ALERT_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`; table `call_contacts` and `call_log` (`drizzle/0007_calls.sql`). At most one call per person per 10 minutes and five a day. The agent script, variables and setup steps are in `docs/ALERT_CALL_AGENT.md`. Numbers are stored unencrypted and shared with ElevenLabs and Twilio.

### Walking, whole-body movement and the second view

The detector was designed for microgravity, where a limp body drifts and tumbles, so it ignored the whole body moving and only counted limbs moving relative to the torso. On Earth that makes walking past the camera with only the torso visible look like "no movement". A checkbox on the Monitor tab, "Whole-body movement counts" (on by default), makes the torso travelling more than the usual threshold, or turning about 20 degrees, count as movement. Turn it off to get the microgravity behaviour. The synthetic replays keep the microgravity behaviour except "Walking past, torso only".

The **Close-up** now sits beside the main camera as a second view and is always on: it follows the flagged person, else the one you clicked, else whoever is being tracked. "Open on another screen" opens it in its own window (drawn from the same canvas) to drag to a second monitor; the browser may ask to allow pop-ups. The pose model now defaults to Full. The Diagnostics card shows which pose model and delegate (GPU or CPU) are running and how reliably shoulders, hips and arms are seen; the model is the network that finds body joints, and Full is more accurate than Lite but slower.

### "Are you OK?" check-in (live camera)

When the detector fires for a live person, the page first plays "No movement detected. Are you OK? Say I'm okay, or say help." and shows a 30-second card for that person with I'm OK and I need help buttons (and on-device spoken answers if turned on). Saying or tapping OK, or moving or speaking again, ends it quietly with a logged "Check-in answered" entry; after OK the person gets 45 extra seconds before being asked again. Asking for help, or no answer in 30 seconds, raises the real "Possible unresponsive" event with the alert voice. Replays skip the check-in and raise events straight away, and a checkbox turns the check-in off. The state logic is in `checkin.js` (tested); the iPhone app keeps its own 60-second check-in.

### Facial activity and false alerts

A person standing still while talking used to raise an alert, because the detector only watched joints. The face model now also feeds the detector: talking (the mouth moving over a short window) or a blink (eyes open, closed, open) counts as activity and restarts that person's stillness timer, so a person who speaks or blinks at least every 15 seconds never alerts. A checkbox on the Monitor tab ("Talking or blinking counts as activity", on by default) turns this off for comparison. It only applies to live people with a visible face; in replays and when the face is too small or hidden, nothing changes. Trade-off: someone with facial movement but who cannot respond would not alert until that movement stops. The blink and mouth thresholds (0.5 blink score; 0.04 mouth spread) are starting values, untested on real people.

### Spoken answers (on-device)

An opt-in checkbox on the Monitor tab: after a live alert's voice clip finishes, the page listens for up to 30 seconds for "I'm okay" or "help" and notes it on the event ("Voice: Said they are okay", "Asked for help"). Recognition uses the browser's on-device speech recognition only (`SpeechRecognition.processLocally`, Chrome 139 or newer with the English language pack, which the page can download). If the browser cannot do it on the device, the checkbox switches itself off and says so; it never falls back to server-side recognition. The words are classified and discarded: only the meaning is stored on the event. A voice answer never closes an event, because a person must confirm and acknowledge it. `voice-answer.js` holds the matching, with tests.

### Sleep notes and photo trend

Entries can carry optional self-reported `sleepHours` (0–24, account and guest). The Journal tab shows a strip of the last eight photos with the sleep the person logged next to each. Photo comparison passes the logged hours to MUSE as context only; the prompt forbids saying sleep explains or caused anything, or that the person needs more or less of anything. No feature infers sleep, muscle or health from a photo.

### Suit check

The Suit check tab is a manual inspection record (Pass, Fail or Not checked per item, with a note). Overall state: Ready only if every item passes, Not ready if any fails, otherwise Incomplete. A failed item adds a "Manual entry" event to Safety events. Signed-in users save to `suit_checks` (`drizzle/0003_sleep_and_suit.sql`, which also adds `journal_entries.sleep_hours`; apply it to hosted D1) via `GET|POST /api/suit/checks`, keeping the newest 50 and showing five; guests keep the current check and last five in localStorage. The items are in `dist/suit-layers.js`. They are inspection areas, not NASA's final per-layer list: see `docs/SOURCES.md` (pending review). It does not sense the suit.

## Secrets and request limits

Set `META_API_KEY` as a secret in Sites runtime settings and optionally `META_MODEL` (default
`muse-spark-1.3`). Redeploy after hosted environment changes. For local use, put them in ignored `web/.env`; `npm start` and the `web` launch entry load it. Keys never go in client
JavaScript or Git. Meta uses the official chat-completions endpoint, low reasoning, 1,200 output tokens.

API bodies are limited to 8 KB. Coach, journal and account requests require a same-origin browser Origin. Both share best-effort per-isolate
limits of 5 generation calls per IP and 30 total/minute. These are neither authentication nor a durable
billing cap. Upstream response bodies/credentials are never returned on errors. The application does
not store requests or responses; Meta processes submitted inputs under its API terms.

## Offline preparation

The service worker caches the shell, detector, and replay fixtures. The
Monitor page reports whether this cache is ready. Click **Download camera model for offline use**
while online to cache the pinned MediaPipe module, both WASM variants, and the model. Success is shown
only after all resources are present. Initial loading/downloads need internet. System fonts are local.

Replay, browser events and the guest journal run locally. Accounts, pairing, Camera Coach and MUSE
journal reflections need connectivity. The website has no research tab or saved research-answer fallback.
API requests, journal entries, and
camera data never enter the service-worker cache. Cache versioning follows asset content; browser
storage eviction, clearing site data, private browsing or a new deployment can require preparation
again. Test a reload with networking disabled on the actual demo device before relying on it.

Automated tests simulate cache installation, model-download failure, and network-off asset retrieval.
This is not a completed physical-device airplane-mode test. Current browser QA verified Stops moving →
one labelled event after 15 seconds of stillness → acknowledgement. A Mac webcam startup reached 8–13 fps
but did not acquire a reliable pose, so live detection remains unverified. Windows webcam/offline use
and camera inference while disconnected remain pending. See [PASSDOWN](../docs/PASSDOWN.md) for evidence.

## Hosting

`.openai/hosting.json` retains the existing Site identity and has no static directory. `scripts/build.mjs`
embeds allowlisted browser assets plus the account/sync handlers into `dist/server/index.js`; runtime secrets
are excluded. Publish an isolated copy of this `web/` folder through the Sites source helper so the
managed Site repository does not modify the parent GitHub history. A hosted deployment does not mean
these changes have been committed/pushed to GitHub `main`.

### Publishing an update
1. `npm test`, then `npm run build`. The build writes `dist/server/index.js` (ignored by git) and gives the
   service worker a new cache version, so visitors get the new scripts instead of cached copies.
2. In ChatGPT, open the Sites project in `.openai/hosting.json` and publish this `web/` folder with the
   Sites source helper. Existing secrets (Meta key, `MISSION_ADMIN_ACCOUNT`, VAPID keys) carry over.
3. Apply any `drizzle/*.sql` migration the hosted D1 database doesn't have yet, in number order.
   Website-to-phone alerts (`POST /sync/alert`) need no migration: they live in the session's JSON state.
4. Check the live Monitor page's Session panel shows **Phone alerts**, then pair an iPhone and test.

References: [MediaPipe web pose API](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js),
[Meta chat-completions protocol](https://dev.meta.ai/docs/protocols/chat-completions).

## Journal sentiment

The MIT-licensed VADER lexicon (7,506 unique rated terms) supplies an imperfect wording hint only
inside the server. Its scores go to MUSE as internal context, never to the writer or iPhone sync.
Both web and native saves automatically request MUSE; collective suggestions require three recent
entries. No local sentiment toggle or user-facing theme summary remains. See the current
[journal contract](../docs/JOURNAL.md) and [dataset provenance](data/sentiment/README.md).
