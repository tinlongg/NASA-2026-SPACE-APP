# Demo script

About 2 minutes 45 seconds. Use the native iPhone app when a working Xcode/signing setup is available.
The web companion is the cross-platform testing fallback. Current fixtures are generated poses, so
the default demonstration uses synthetic replay and says so explicitly. Real camera/phone validation
remains pending; use the synthetic replays rather than relying on a live stillness test.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Problem slide | “On a space station nobody falls, but a crew member can stop responding. This prototype notices when someone in view stops moving and checks in. It is not a medical device.” |
| 0:20 | Dashboard | “This is a simulated crew. The heart-rate values are generated, not wearable readings.” |
| 0:35 | Monitor → Test → *Synthetic Limp And Tumbling* (web: *Stops moving* or *Limp and tumbling*) | “This is a generated floating figure, not a recording of a person. It keeps drifting, but its limbs stop, which is what the detector measures.” |
| 0:55 | Native check-in → **I need help** (synthetic demo) → Alerts | “After 15 seconds without limb movement, iOS asks ‘Are you OK?’. Asking for help or not answering for 60 seconds creates a critical event. The browser records an immediate event instead of this countdown. Sleep or holding still can trigger either path; this is not a diagnosis.” |
| 1:10 | Acknowledge | “Acknowledging clears the active event. Working, resting with small movements, and leaving-view replays do not alert. Real-person detection still needs validation.” |
| 1:25 | Journal → **Run astronaut demo** | “This fictional astronaut feels increasingly low over three entries. The third unlocks collective suggestions from live MUSE. Nothing is added to our journal; internal sentiment stays on the server.” |
| 1:45 | Watch comparison → source links | “These published figures provide context, not health assessments. The comparisons are separate from journal reflections and still need independent source review.” |
| 2:00 | Journal → return to real journal | “MUSE reviews every save. Entries one and two get a short reflection; three recent entries unlock suggestions. Three is our product rule, not a clinical threshold.” |
| 2:20 | Limitations slide | “The camera heuristic assumes one person and fixed framing with visible shoulders, hips and limbs. It ignores drifting and tumbling. Sleep and deliberate stillness can trigger it. Native telemetry is simulated, and real-person detection and offline camera tests remain incomplete.” |

## Fallbacks

| Failure | Action | Accurate wording |
| --- | --- | --- |
| Webcam/phone camera unavailable | Use generated replay | “This is synthetic input through the same detector.” |
| MUSE fails or network is unavailable | Keep fictional story visible and use Retry demo reflection | “The preset story is local, but this reflection requires live MUSE. No AI result is being substituted.” |
| Journal server unavailable | Check Settings → Website connection on iPhone; use the updated Node/Worker website | “The new journal endpoint must be deployed and configured. The old research service does not provide it.” |
| App or phone fails | Open the web companion online | “This is the browser testing companion, using MediaPipe instead of Apple Vision.” |
| Network unavailable | Use a previously prepared browser cache or native demo | “These features are local; external source pages and live AI may be unavailable.” |

No backup recording exists yet. Do not claim to play a recording unless someone has actually recorded
and checked it. Before relying on browser offline mode, cache the shell/model and test a disconnected
reload on the actual device. Never describe replay, precomputed answers, or generated telemetry as live.
