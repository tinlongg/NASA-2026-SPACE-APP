# Hosting handoff: what to set on the live site

For whoever manages the hosted deployment (Vercel). This lists what the latest code needs. It contains no secrets: ask Andrew for the values privately.

## 1. Environment variables (Project Settings → Environment Variables)

| Name | Needed for | Notes |
| --- | --- | --- |
| `META_API_KEY` | MUSE: journal reflections, photo descriptions, Camera Coach | Without it those buttons say MUSE is not configured. |
| `META_MODEL` | same | `muse-spark-1.3` |
| `ELEVENLABS_API_KEY` | Voice clips, alert phone calls, live voice check-in | Needs permission to start agent calls (ElevenAgents, write). |
| `ELEVENLABS_CHECKIN_AGENT_ID` | **New:** live two-way "Are you OK?" check-in | `agent_7501m7f8gfk6e7taqqf0c27mwyxt` (CrewSafety Check-in). Without it the voice agent checkbox stays off. |
| `ELEVENLABS_ALERT_AGENT_ID` | Alert phone calls | The CrewSafety Alert agent. |
| `ELEVENLABS_PHONE_NUMBER_ID` | Alert phone calls | The `phnum_…` ID ElevenLabs shows for the imported Twilio number. Not the phone number itself. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Background push notifications | Optional. `VAPID_SUBJECT` is `mailto:` plus a contact address. |

Redeploy after changing them. Set them for Production, not only Preview.

## 2. Database: apply `web/drizzle/0007_calls.sql`

Phone calls need two new tables. Run this once on the production database (all earlier migrations `0000` to `0006` must already be applied):

```sql
CREATE TABLE call_contacts (
  user_id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  consented REAL NOT NULL,
  last_called REAL
);
CREATE TABLE call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  created REAL NOT NULL,
  outcome TEXT NOT NULL
);
CREATE INDEX call_log_user ON call_log(user_id, created);
```

The `0007` file is the same SQL with `--> statement-breakpoint` lines between statements; remove those if your tool does not understand them. Nothing else changed in the schema this round.

## 3. ElevenLabs dashboard (one time)

1. Agents → CrewSafety Alert: paste the first message and system prompt from `docs/ALERT_CALL_AGENT.md`, and declare the variables `person`, `room`, `camera`, `what_happened`.
2. Agents → CrewSafety Check-in: keep prompts short ("Are you OK?"), and keep the output audio format as PCM (the website and iPhone only play `pcm_*`).

## 4. Check it works

- Open `/api/checkin/voice/status` on the live site. It should return `{"configured":true}`.
- Sign in, open the Circle tab, add a number with the consent box ticked, then press "Send me a test call".
- If the Phone calls section shows an error, the migration in step 2 has not been applied.

## Heads-up

The code is written as a Worker that talks to a D1-style database (`env.DB.prepare(...)`), and the repo has no `vercel.json` or database config. If the Vercel deployment uses an adapter or a different database, apply step 2 in that database's own tool and tell Andrew what it is, so the notes can be updated.

## What changed in the code this round

- New: opt-in live voice check-in (`POST /api/checkin/voice/session`, `GET /api/checkin/voice/status`).
- Removed: the NASA-document chat from the Python backend. MUSE now only does images and journal analysis.
