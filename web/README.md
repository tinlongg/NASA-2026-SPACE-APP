# CrewSafety web testing companion

The user-requested Windows/Mac companion to the primary native SwiftUI app. It uses MediaPipe Pose
Landmarker Lite, not Apple Vision. Run `npm start` here (Node 22.13+) and open
[localhost](http://127.0.0.1:4173) in Chrome/Edge. `npm test` runs 39 checks; `npm run build` packages a
Worker. The public test site is [CrewSafety Connected](https://crew-safety-connected.lustrousbush32.chatgpt.site).

## Camera and local features

Camera access needs HTTPS or localhost. The browser webcam will not work over a LAN HTTP address; the paired dashboard and synthetic replay do work there. The hosted HTTPS link uses each visitor's own camera; no remote camera video is streamed. Start camera explicitly and grant access. Stop, navigating away from Monitor, hiding the tab, and closing the page release the webcam. Permission failures and model-download failures show recovery messages. Use synthetic replay to test alerts without holding still for real.

Camera frames are processed locally and never recorded/uploaded. MediaPipe JS/WASM and the model download from jsDelivr and Google. First use needs internet. Guest journal entries persist in localStorage; signed-in entries persist in the account database. Browser-generated events are session-only. Paired iPhone events persist in hosted D1 or the local backend. Any paired telemetry remains labelled Simulated.

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
the website. The FastAPI backend still serves `/chat` for the iOS app. The simulated heart-rate cards and
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
- **MUSE memory (RAG)**: signed-in users see a per-entry checkbox, on by default, labelled on the button
  itself. When ticked, `/api/journal/analyze` receives `memory:true`, the server retrieves up to three
  related entries (similarity ≥ 0.2, never the entry itself, never another user's) and sends them to
  Meta with the chosen entry. The reply lists which dated entries were attached. The browser cannot
  supply history itself. Guests and unticked requests send one entry, as before.
- **Privacy change**: account entries are stored on the server in plain text, unlike guest entries, which
  stay in localStorage. Browser entries move to the account only when the user clicks the move link.
- Local `npm start` keeps accounts in ignored `web/.data/local.sqlite`; set `PORT` or `CREW_DB_PATH` to
  change the port or file. The FastAPI `/dashboard/` copy has no account routes, so it stays guest-only.

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

References: [MediaPipe web pose API](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js),
[Meta chat-completions protocol](https://dev.meta.ai/docs/protocols/chat-completions).

## Journal sentiment

The website journal uses the MIT-licensed VADER lexicon (7,506 unique rated terms) with a custom local wording heuristic. Guest entries stay in browser storage; account entries are server-stored. Sentiment analysis runs locally and its scores are not sent to Meta or iPhone sync. The optional MUSE action sends the selected entry and, when enabled for a signed-in user, up to three related account entries. Toggle local analysis on or off and expand the explanation for matched words. It is not the full VADER algorithm and does not assess mood, health or risk. See [dataset provenance](data/sentiment/README.md). The iOS journal remains a separate on-device theme summarizer.
