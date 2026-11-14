# CrewSafety web testing companion

Static browser version for Windows and Mac. Run `npm start` in this directory and open http://localhost:4173 in Chrome or Edge. Run detector tests with `npm test` (Node 20+).

Features: real webcam pose tracking, synthetic upright/fall replays, possible-fall alerts and JSON export, simulated heart rate, browser-local journal with keyword themes, and an explicitly offline MUSE placeholder. This does not run the Swift app or Apple's Vision model. Browser poses use MediaPipe Pose Landmarker Lite, with the native app's thresholds (20% hip drop within 1 s, 60° torso angle, 2 s hold, 15 s cooldown). A pose missing for over 1 s cancels a hold.

Camera access needs HTTPS or localhost. The browser webcam will not work over a LAN HTTP address; the paired dashboard and synthetic replay do work there. The hosted HTTPS link uses each visitor's own camera; no remote camera video is streamed. Start camera explicitly and grant access. Stop, navigating away from Monitor, hiding the tab, and closing the page release the webcam. Permission failures and model-download failures show recovery messages. Use synthetic replay rather than performing a fall.

Camera frames are processed locally and never recorded/uploaded. MediaPipe JS/WASM and the model download from jsDelivr and Google; fonts download from Google Fonts. First use needs internet. Journal entries persist in localStorage on that browser; browser-generated events are session-only. Paired iPhone events persist on the local backend. MUSE is not connected to the Python backend and does not generate answers; its source corpus is empty.

## Paired iPhone dashboard

Start the FastAPI backend on port 8000 and open `http://COMPUTER-IP:8000/dashboard/`. In Crew dashboard, create a pairing session. Enter that backend address and code in the updated iOS app's Settings → Website connection, then enable sharing. Crew status, events and labeled telemetry sync while the app is active; website acknowledgements return to iOS. NASA research stays separate. See [the connection guide](../docs/IOS_WEB_CONNECTION.md) for setup, tests and limitations. This local connection does not require publishing to Sites.

This is an experimental prototype, not a medical device. Simulated telemetry is not a measurement. Browser and native model confidence/landmarks differ: the shared thresholds are not validated for real-world falls.

Deployment: `.openai/hosting.json` identifies the Sites deployment; `dist/` contains the static assets. Publish an isolated copy of this folder with the Sites source helper so its managed Git history does not alter the parent GitHub repository.

Pose API reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

NASA research: Crew dashboard now loads dist/data/nasa-research.json through research.js. Seven selectable historical chart series include units, sample counts, observed ranges, accessible values, source links, and five study cards. Failed loads show a retry action without disabling crew controls. See ../data/nasa-osdr/README.md for provenance and offline rebuilding.
