# Demo script

About 2 minutes 45 seconds. One presenter talks, one operates the phone, one performs the fall onto a mat. Phone on a stand, mirrored to the projector.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Slide: problem | "Crews in isolated habitats have limited medical support and long stretches alone. We built a prototype that watches for a possible fall and puts NASA wellness research one question away. This is a hackathon prototype, not a medical device." |
| 0:20 | Dashboard | "This is a simulated crew. The heart-rate chart is simulated data and is labelled that way. Status is nominal." |
| 0:35 | Monitor tab, Start monitoring | "Pose estimation runs on the phone with Apple's Vision framework. No video is stored or sent." |
| 0:50 | Teammate falls onto the mat and stays down | "Our heuristic looks for a fast drop followed by staying low. It flags a *possible* fall." |
| 1:00 | Banner appears; open the alert | "Here is the alert: timestamp, the reason the heuristic fired, and a heuristic score, which is not a probability. Sitting or lying down slowly does not trigger it." |
| 1:15 | Acknowledge; back to dashboard | "A crewmate acknowledges it and the status clears." |
| 1:25 | MUSE tab; ask a prepared question on exercise or isolation | "MUSE retrieves passages from a small set of NASA documents we curated and answers only from those." |
| 1:45 | Answer with citations; tap one | "Every answer shows its sources, and they open the real document. If nothing relevant is found, it says so." |
| 2:00 | Journal tab; type a short note; save | "The journal stays on the device. The summary lists themes the person wrote about. It does not score mood or diagnose anything." |
| 2:20 | Slide: limitations and next steps | "Limits: the fall heuristic assumes gravity, one person and a fixed camera, and it will make mistakes. Vital signs are simulated. Next: validated sensors, a larger corpus, testing in an analog habitat." |

**If something fails live**

| Failure | Fallback | What to say |
| --- | --- | --- |
| Live detection does not fire | Use the Replay control | "This is a replay of a fall we recorded earlier, running through the same detector." |
| Backend unreachable | Switch MUSE to demo mode in settings | "We're offline, so this is a precomputed answer from the same system. It's labelled Demo mode." |
| App or phone fails | Play the backup recording | "This is a recording of the app from earlier today." |

Never describe a replay, a precomputed answer or the simulated chart as live or real.

In the app the fallback controls are: **Monitor → Replay → Synthetic Fall**, and **Dashboard → gear → MUSE mode → Demo**.
