# Demo script

About 2 minutes 45 seconds. Use the native iPhone app when a working Xcode/signing setup is available.
The web companion is the cross-platform testing fallback. Current fixtures are generated poses, so
the default demonstration uses synthetic replay and says so explicitly. Real camera/phone validation
remains pending; use the synthetic replays rather than relying on a live stillness test.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Problem slide | “On a space station nobody falls, but a crew member can stop responding. This prototype notices when someone in view stops moving and checks in. It is not a medical device.” |
| 0:20 | Dashboard | “This is a simulated crew. The heart-rate values are generated, not wearable readings.” |
| 0:35 | Monitor → Synthetic replay *Limp and tumbling* (web: *Stops moving* or *Limp and tumbling*) | “This is a generated floating figure, not a recording of a person. It keeps drifting, but its limbs stop, which is what the detector measures.” |
| 0:55 | Event banner → Safety events | “After 15 seconds without limb movement it raised a possible-unresponsive event and asked ‘Are you OK?’. Sleep or holding still can trigger it, so it is a prompt to check in, not a diagnosis.” |
| 1:10 | Acknowledge | “Acknowledging clears this event. Synthetic sit and slow-descent tests do not alert; real-device behavior still needs validation.” |
| 1:25 | MUSE Research → a prepared question | “MUSE retrieves passages from our small NASA corpus. Camera Coach is a separate optional explanation of numerical camera data.” |
| 1:45 | Source links | “These links identify the documents and sections. OSDR study OSD-946 is a ground bed-rest study; this app does not analyze its raw data. Independent source review is pending.” |
| 2:00 | Journal → save a sample note | “The journal stays on this device. Its summary describes written themes without scoring mood or diagnosing.” |
| 2:20 | Limitations slide | “The camera heuristic assumes one person, gravity and fixed framing. Telemetry is simulated, the corpus is small, and real-world camera/offline tests remain to be completed.” |

## Fallbacks

| Failure | Action | Accurate wording |
| --- | --- | --- |
| Webcam/phone camera unavailable | Use generated replay | “This is synthetic input through the same detector.” |
| Model fails | Show extractive answer | “Generation is unavailable, so these are unedited retrieved passages.” |
| Backend unreachable | Native: settings → MUSE Demo; web: Demo mode and a prepared question | “This is a saved answer exported from the same research service, labelled Demo mode.” |
| App or phone fails | Open the web companion online | “This is the browser testing companion, using MediaPipe instead of Apple Vision.” |
| Network unavailable | Use a previously prepared browser cache or native demo | “These features are local; external source pages and live AI may be unavailable.” |

No backup recording exists yet. Do not claim to play a recording unless someone has actually recorded
and checked it. Before relying on browser offline mode, cache the shell/model and test a disconnected
reload on the actual device. Never describe replay, precomputed answers, or generated telemetry as live.
