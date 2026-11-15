# Web camera for testing

Test fall detection with your Mac's webcam instead of a phone. Pose tracking runs in the browser
(MediaPipe Pose Landmarker), and only joint positions go to the CrewSafety app. The app's own
fall detector and "Are you OK?" check-in run on them, exactly as with the iPhone camera.

```
browser page (webcam + pose)  ──joints──▶  relay (node)  ──▶  CrewSafety app (Simulator)
                              ◀─check-in state / answers─
```

## Run it

1. Start the relay. It needs only Node, with no installs:
   ```bash
   node webcam/server.js
   ```
2. Open <http://localhost:8765> in **Chrome or Safari** and click **Start camera**. Allow camera access.
   The first start downloads the pose model (about 5 MB) from Google's CDN.
3. In the app (Simulator), go to **Monitor › Test › Web camera on this Mac**.
   The page should say "Connected to the CrewSafety app".
4. Stand back so your whole body is in view. Then fall, or drop quickly to the floor and lie still for
   2 seconds. The check-in appears in the app **and** on the web page. Answer from either, or say
   "I'm okay" (the Simulator uses the Mac's microphone). With no answer for 60 seconds, a critical alert is raised.

Events from this path are labelled **Web camera** in the app so they are never mistaken for live iPhone data.

## What you see

- **Bounding box** around the person, labelled with the pose model's confidence (`Person 94%`). Blue while
  tracking, amber while the detector is counting a low posture, red during a check-in. The app draws the
  same box on its Monitor tab, including over the live iPhone camera.
- **Detector panel** (on the page and in the app): pose confidence, torso angle, hip drop and time held low,
  each against the threshold that rule needs. The heuristic score after a detection is not a probability.

## Voice with ElevenLabs (optional)

The page can transcribe your answer with ElevenLabs speech-to-text, which is more accurate than the
Simulator's recognizer with background noise or accents.

1. Put your key in `webcam/.env` (gitignored) or the environment, then restart the relay:
   ```
   ELEVENLABS_API_KEY=your-key
   ```
2. Start the camera on the page and allow the microphone when asked.

During a check-in, after the app has finished asking "Are you OK?", the page records short clips while
you speak and sends them through the relay to ElevenLabs. The transcript goes to the app, which decides
"OK" or "help" with the same rules as every other voice path. The key stays in the relay; it never reaches
the browser or the app, and the relay only accepts `/stt` requests from this machine. Without a key, the
page says "Voice off" and the buttons still work. The iPhone app's own voice recognition stays on-device.

## Notes

- Keep the camera page in a visible window while testing. Browsers pause or slow down pages in background
  tabs, which stops the camera loop and makes "Send test fall" play in slow motion.
- Keep only one camera page open. The app follows one page at a time and ignores the others until it goes quiet.

- Place the laptop so the camera sees you from the side or at an angle. Falling straight toward or away
  from the camera is hard for the detector, just as with the phone.
- A physical iPhone can use it too: run the relay on the Mac, then set the `WEBCAM_URL` key in
  `ios/CrewSafety-Info.plist` to `ws://<Mac LAN IP>:8765/ws/app`.
- `GET /health` on the relay shows how many camera pages and apps are connected.
