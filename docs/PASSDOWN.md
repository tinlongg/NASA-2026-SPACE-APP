# Passdown — 2026-11-14

Branch `claude/design-auth-vector-db-75f976`, on top of `0bf205e`. **Nothing from this session is
committed yet.** Read this first, then `README.md` → *Setting and detection*. `docs/HANDOFF.md` is the
older, longer status file.

## Where the product is now

CrewSafety is for crew **aboard a space station**. Fall detection is gone, because nobody falls in
microgravity. The camera now raises a *possible unresponsive* alert when a tracked crew member shows no
limb movement for 15 seconds, then asks "Are you OK?". The website has accounts, a journal with a vector
index, and MUSE reflections that can draw on related past entries. The MUSE research tab and the
simulated heart-rate data are removed from the website.

## What changed this session

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
| Design | Follows the unslop guide (`design.md`, in another worktree): graphite surfaces, one green accent, sentence case, 400–600 weights, lucide line icons, 8 px / 12 px radii. The sidebar has groups, quick actions, a live status panel (camera, iPhone, MUSE, offline cache) and recent events. On narrow screens the nav becomes a top bar where items share the width. The design direction is at the top of `web/dist/styles.css`. |
| Docs | `README.md` has a *Setting and detection* section. The brief, plan and handoff open with a direction-change note. The demo script, integration checklist, connection guide, web README and webcam README are reworded. |

## Run it

```bash
cd web && npm test
```

```bash
cd web && npm start
```

`npm start` serves http://127.0.0.1:4173 and loads `web/.env`. Accounts persist in the ignored file
`web/.data/local.sqlite`.

```bash
cd backend && .venv/bin/python -m pytest -q
```

iOS: in the Simulator destination list Xcode shows only a placeholder, so target a simulator by id:

```bash
cd ios && xcodebuild test -project CrewSafety.xcodeproj -scheme CrewSafety -destination 'id=C19397A3-26BB-44AB-849D-CB87C0588C66' CODE_SIGNING_ALLOWED=NO
```

Last results: **web 39/39, backend 31/31, iOS 53/53** (iPhone 17 Pro, iOS 26.5 simulator).

## Secrets

- The Meta key is in `web/.env` (git-ignored) as `META_API_KEY`, with `META_MODEL=muse-spark-1.3`. It was
  pasted in a chat session, so **rotate it** in Meta's dashboard.
- A real MUSE journal reflection with memory was confirmed locally with this key.

## Before deploying the hosted site

1. Apply `web/drizzle/0001_accounts.sql` to the hosted D1 database. Sign-in fails without it.
2. Set `META_API_KEY` (and optionally `META_MODEL`) as runtime secrets in Sites, then redeploy.
3. `npm run build` and publish `web/` as described in `web/README.md` → Hosting.
4. Delete the throwaway test accounts in your local `web/.data/local.sqlite` if you plan to copy it anywhere.

## Not done / not verified

- **The web replays were not watched in the browser** after the detector change. They are covered by
  unit tests at 10, 15, 30 and 60 fps. Run **Camera monitor → Stops moving** once and confirm one event
  after about 15 s.
- **iOS was not run interactively** (only unit tests). The iOS app was paused on purpose to save usage;
  its code is finished and consistent with the website and backend.
- No real person has been tested. 15 s and 0.25 torso lengths are starting values. Sleep, reading or
  deliberate stillness will trigger the alert, and hidden arms reduce visible movement.
- No email, password reset or account deletion. Login throttling is per isolate, best effort.
- Account journal entries are stored on the server in plain text; guest entries stay in localStorage.
- `docs/EXECUTION_PLAN.md` and the briefs still describe the fall design in their bodies; the note at the
  top of each overrides it.
- The FastAPI `/dashboard/` copy of the website has no account routes, so it is guest-only.

## Suggested next steps

1. Commit this branch and open a PR to `main`.
2. Watch one web replay and one live webcam session to confirm the 15 s alert feels right.
3. Decide whether sleep periods should pause monitoring (the most likely false alarm on a station).
4. Optionally replace `hashed-lexical-v1` with a real embedding API for better journal recall.
