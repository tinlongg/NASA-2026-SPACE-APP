# Connect the iPhone app and dashboard

## Hosted connection — no local server required

Open https://crew-safety-connected.lustrousbush32.chatgpt.site and select **Crew dashboard → Create pairing session**. Pull the latest `main` and rebuild iOS in Xcode. In **Dashboard → Settings → Website connection**, the hosted backend URL is prefilled; enter the website's pairing code and enable sharing. Keep the app open. The phone can use Wi-Fi or cellular; it no longer needs the computer's network.

The website is public, but each session's crew data requires its random pairing code. Sessions expire after 24 hours and can be revoked with **End shared session**. Hosted snapshots use D1; session tokens are stored hashed. Concurrent updates use revision checks so a stale phone upload cannot overwrite a browser acknowledgment. Camera frames, journals and chat are not part of sync. `web/sync.mjs` implements the same wire contract as FastAPI, with migrations in `web/drizzle`. The website serves `/sync/*` on its own HTTPS origin.

The standalone Node preview (`npm start` in `web`, Node 22.13+) uses an in-memory SQLite adapter and loses its test sessions when stopped. Hosted D1 and local FastAPI storage persist across server restarts.

The published API was verified using synthetic crew data: create, upload, acknowledge, retry, read and revoke. A physical iPhone/Xcode build still requires Mac verification.

## Optional local connection

The existing FastAPI backend now serves the website at `/dashboard/` and provides paired crew sync at `/sync/`. You do not need a cloud account. The public Sites deployment is a separate copy: it is not updated or connected by starting this local server.

## Start on your computer

From `backend/`, with its Python virtual environment activated:

```sh
python -m pip install fastapi uvicorn pytest httpx
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Windows without activation: use `.venv\Scripts\python.exe` instead of `python`.
macOS: use `.venv/bin/python`. Create the environment first with `python3 -m venv .venv` if needed.
These are the sync/extractive-MUSE dependencies. The optional generated MUSE mode additionally needs the SDK and credentials described in the backend README.

1. Find your computer's Wi-Fi IPv4 address (`ipconfig` on Windows; network settings on macOS).
2. Open `http://COMPUTER-IP:8000/dashboard/` on the computer. Select **Crew dashboard**.
3. Click **Create pairing session**. The backend address and 32-character pairing code appear in the form.
4. Build and run the updated iOS project in Xcode. On the phone, open **Dashboard → gear → Website connection**.
5. Enter the exact backend address `http://COMPUTER-IP:8000` (without `/dashboard/`) and pairing code. Turn on **Share with website dashboard**.
6. Keep the app open. The website replaces its browser-demo cards with the iPhone's crew, telemetry and events. NASA research remains available underneath.
7. Run **Monitor → Replay** in iOS. A possible-unresponsive event should appear on the website within roughly six seconds under normal LAN conditions. Choose **Acknowledge on all devices** on the website; the app should acknowledge it on its next sync.

Do not enter `localhost` on the physical iPhone: it means the phone itself. Both devices must use the same Wi-Fi or hotspot. Guest/campus Wi-Fi may block device-to-device traffic. If prompted, allow iOS Local Network access and allow the backend through the computer's private-network firewall. No firewall rules are changed automatically. Use an appropriate trusted local network for this HTTP prototype; use HTTPS before hosting remotely.

## What is shared

- Crew IDs, display names, roles, base status and monitored crew member.
- Up to 500 safety events with time, severity, source, explanation and acknowledgement.
- The iOS telemetry provider's last 30 minutes of samples, preserving `simulated` / `healthKit` source labels. The current provider is simulated.
- No camera frames, recordings, journal entries or MUSE messages. These fields are rejected by the sync schema.

One session accepts one publishing iPhone. Its code allows other browsers to view the session and acknowledge events. Keep it with your team. Codes are generated randomly, stored only as hashes on the backend, and expire after 24 hours. The phone and browser keep the code in memory for this run; re-enter/re-pair after closing them.

**Disconnect browser** stops viewing but does not revoke the phone's access. **End shared session** deletes that session from the backend and revokes its code. Disable the iOS sharing toggle to stop uploads. Sharing also pauses while the app is backgrounded. Local fall detection does not depend on network access.

## Reliability and limits

The phone sends snapshots every three seconds while active; the browser polls every three seconds. Requests have timeouts. Disconnected clients show their last state as stale. The website marks phone data stale after 15 seconds without an upload. A successful browser acknowledgement does not update the phone's last-upload time.

Events merge by ID. Acknowledgements are monotonic: retrying an older phone snapshot cannot undo an acknowledgement. New local events remain in the iOS store during a network outage and upload when connectivity returns. Local event storage is still in-memory: events not synced before the iOS process is terminated are not guaranteed to survive. This is a demo sync system, not background emergency monitoring.

SQLite persists synced snapshots across backend restarts at `backend/runtime/crew-sync.sqlite3`, excluded from Git. Override with `CREW_SYNC_DB`. Expired sessions are inaccessible and purged when a new session is created. Session data is limited to 500 most recent events and 200 telemetry samples; older retained events can be dropped. At most 1,000 unexpired sessions are allowed.

## API contract

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/sync/sessions` | Create session; returns `pairingCode`, `expiresAt` |
| PUT | `/sync/state` | iPhone publishes crew/events/telemetry; response contains merged `snapshot` |
| GET | `/sync/state` | Browser reads snapshot, or `null` while waiting for phone |
| POST | `/sync/events/{uuid}/acknowledge` | Acknowledge an event idempotently |
| DELETE | `/sync/session` | Revoke and delete paired session |

All except creation require `Authorization: Bearer PAIRING_CODE`. JSON uses the existing Swift model field names and UUID strings; all dates are **Unix milliseconds**, including `receivedAt` added by the server. Snapshots require `deviceID`, `crew`, `monitoredCrewMemberID`, `events`, `telemetry`. Unknown fields and invalid references return 422. Missing/expired credentials return 401; another publishing device returns 409.

Serving at `/dashboard/` uses the same origin and needs no CORS configuration. The standalone Node development website on ports 4173 is allowed by default. Override `CREW_WEB_ORIGINS` with exact comma-separated origins if required; no wildcard credentials are enabled. An HTTPS hosted website cannot fetch an HTTP LAN backend: use the local dashboard URL for this demo.

## Verification

`cd backend && python -m pytest -q` covers pairing, session isolation, device binding, repeated uploads, two-way acknowledgements, persistence, expiry, revocation, schema validation, static assets and CORS, plus existing MUSE tests.

New XCTest cases cover acknowledgement merging and Unix-millisecond encoding. Run the iOS test suite and the real-device flow above in Xcode on a Mac. Windows cannot build SwiftUI or validate iPhone networking, local-network permission prompts or foreground/background transitions.
