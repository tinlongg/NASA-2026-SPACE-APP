# CrewSafety

**NASA Space Apps Challenge 2026.** A safety and wellness companion for a crew living in microgravity. It watches for a crew member who stops moving, checks in with them by voice, calls for help when they do not answer, and gives the crew a private journal with supportive feedback.

> **Not a medical device.** An alert means someone *stopped moving* according to a simple heuristic. Heart-rate and other crew telemetry in the demo is simulated and labelled. Journal feedback reflects the person's own words and never diagnoses anything. All demo replays are synthetic.

- Live site: <https://crew-safety.vercel.app>
- Demo walkthrough: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)

## What it does

| Feature | How it works |
| --- | --- |
| **Stops-moving detection** | Pose tracking (Apple Vision on iPhone, MediaPipe in the browser) measures each joint against the torso, so drifting or tumbling in microgravity is not mistaken for movement. If nothing moves for 15 seconds, it raises a *possible unresponsive* event. |
| **"Are you OK?" check-in** | Asks out loud and listens for "I'm okay" or "help". A person has 60 seconds to answer before a critical alert. An opt-in live two-way voice agent (ElevenLabs) can hold the conversation instead of a recorded question. |
| **Alert phone calls** | Members of a circle can add a phone number (with consent). When an alert goes out, the circle is called by an ElevenLabs voice agent. |
| **Circle and Mission** | Crew members, status, acknowledgements and public mission rankings. |
| **Journal with MUSE** | A wellness journal. MUSE (Meta) reflects on each entry and, after three entries in 14 days, offers gentle collective suggestions. MUSE only does journal analysis and image descriptions. |
| **Camera Coach** | Optional explanations of a pose snapshot. Sends numbers only, never video. |
| **iPhone + Apple Watch** | Native SwiftUI app. It syncs crew status, events and telemetry to the website. An opt-in summary of Watch health data (five daily averages and ranges, no ECG) can be shared too. |

### Privacy

- Camera frames are processed on the device and are never recorded or uploaded. The only exception is the opt-in MUSE second look, which sends one downscaled frame when a live alert fires and does not store it.
- The live voice agent is opt-in. While it is on, microphone audio goes to ElevenLabs.
- Journal text is sent through the server to Meta for reflections, and saving says so first.
- API keys stay on the server. Browsers and the app only ever receive short-lived links.

## How detection works

A crew member counts as unresponsive when no tracked joint moves more than **0.25 torso lengths for 15 seconds** while the shoulders and hips are visible. Joints are measured relative to the torso centre, rotated so the torso points up and scaled by torso length. Leaving the view for over 2 seconds restarts the timer, and the person must move again before another event is raised.

Known limits: sleep, reading or holding still on purpose will trigger it, it tracks one person with a fixed camera, and the thresholds are starting values that have not been validated on people. The same rules live in [`InactivityDetector.swift`](ios/CrewSafety/Features/Camera/InactivityDetector.swift) and [`web/dist/detector.js`](web/dist/detector.js).

## Repository layout

| Path | What |
| --- | --- |
| [`ios/`](ios) | SwiftUI iPhone and Apple Watch app, shared code and unit tests |
| [`web/`](web) | Website and API: Node server code, browser app in `dist/`, Drizzle migrations, tests. See [web/README.md](web/README.md) |
| [`backend/`](backend) | Small FastAPI service for local crew sync and the local dashboard. See [backend/README.md](backend/README.md) |
| [`webcam/`](webcam) | Standalone webcam experiment |
| [`data/`](data) | NASA reference data used for background |
| [`docs/`](docs) | Guides, listed below |

## Quick start

### Website

Requires Node 22.13 or newer.

```bash
cp .env.example .env     # then fill in the keys you have; every feature degrades gracefully without them
cd web && npm install && npm start
```

Open <http://127.0.0.1:4173> in Chrome or Edge. The camera needs HTTPS or localhost. Use the synthetic replays to try alerts without holding still.

```bash
cd web && npm test       # web checks
```

### iPhone app

Open `ios/CrewSafety.xcodeproj` in Xcode 16 or later, set your team and bundle identifier under Signing & Capabilities, and run on an iPhone (iOS 17+). The Simulator works for everything except the live camera: use **Monitor → Test → Synthetic Stops Moving**.

For tests without the watchOS runtime:

```bash
ios/scripts/test-ios-only.sh
```

### Connect the app to the website

In the website's Crew dashboard, create a pairing session, then enter the address and code in the app under **Settings → Website connection**. Full steps are in [docs/IOS_WEB_CONNECTION.md](docs/IOS_WEB_CONNECTION.md).

### Local backend (optional)

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The local dashboard is at `http://COMPUTER-IP:8000/dashboard/`.

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Never commit real values.

| Variable | Used for |
| --- | --- |
| `META_API_KEY`, `META_MODEL` | MUSE journal reflections, photo descriptions, Camera Coach |
| `ELEVENLABS_API_KEY` | Voice clips, alert calls, live check-in |
| `ELEVENLABS_CHECKIN_AGENT_ID` | Live two-way "Are you OK?" agent |
| `ELEVENLABS_ALERT_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID` | Alert phone calls |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Background push notifications (optional) |

## Deployment

The live site runs on **Vercel** with a **Turso** database. Database migrations in `web/drizzle/` apply themselves on the first request after a deploy. Set the environment variables above for Production and redeploy. Step-by-step instructions, including the ElevenLabs dashboard setup, are in [docs/HOSTING_HANDOFF.md](docs/HOSTING_HANDOFF.md).

## Docs

| Doc | Read it for |
| --- | --- |
| [docs/PASSDOWN.md](docs/PASSDOWN.md) | **Start here.** Current state, verified results and what is still unchecked |
| [docs/HOSTING_HANDOFF.md](docs/HOSTING_HANDOFF.md) | Deploying and configuring the live site |
| [docs/ALERT_CALL_AGENT.md](docs/ALERT_CALL_AGENT.md) | Prompt and variables for the alert call agent |
| [docs/JOURNAL.md](docs/JOURNAL.md) | Journal and MUSE privacy, API and migrations |
| [docs/IOS_WEB_CONNECTION.md](docs/IOS_WEB_CONNECTION.md) | Pairing the iPhone with the website |
| [docs/INTEGRATION_CHECKLIST.md](docs/INTEGRATION_CHECKLIST.md) | What to check on a demo iPhone |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | The 2 to 3 minute demo, with fallbacks |
| [docs/SOURCES.md](docs/SOURCES.md) | NASA sources and provenance |
| [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md), [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md), [docs/HANDOFF.md](docs/HANDOFF.md) | Original brief, architecture and earlier status |

## Status and known gaps

- Web tests pass. A real-microphone run of the live voice check-in, a real alert phone call and a physical-device pass of the iPhone app are still outstanding.
- Calls are not rate limited, so each alert places a real call. Keep that in mind when testing with real numbers.
- The iPhone app ends the voice agent as soon as someone says "help", while the website lets the agent finish its sentence.

## Team

Built for NASA Space Apps 2026 by Andrew Ha, Henry Luu, Tin Luong, Al Hoang, Leon Nguyen and teammates.
