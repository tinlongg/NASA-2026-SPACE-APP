# Pip's mission

Open the Mission tab or `/?mission=1`. Guest progress stays in this browser. Sign in with the same website account on another device to share the account mission. Guest practice is separate and is not imported into ranked accounts. The iOS Mission tab embeds this same website with persistent WebKit storage; it does not use the pairing code as an account credential. Native Journal records outside that tab remain separate.

Each task awards fuel once per UTC day: health 60, suit 50, mood 40, movement/recovery 30, meal 25, photo 15, journal 10. The website Journal and completed Suit check also award their corresponding mission task. Every honest response counts, including concerns, low moods and planned recovery. Mission answers are device-local notes; only completion is synced. Mission photo selection previews an image without retaining it; the website Journal provides actual photo storage.

Three distinct daily tasks grow the garden. Any task starts/continues the mission streak. Missed days add cosmetic visor dust without taking away points or garden growth. Care fuel also moves the ship toward Mars (1,000 distance); landing resets distance, retains rewards and adds 5% travel speed per prestige, capped at 25%.

Docking, planet-pair memory and mineral collection cost 10 fuel. Leaving an unfinished flight refunds it. Every completed flight earns exactly 15 shop stars and 20 ranking points, regardless of score, with six rewarded flights per UTC day. Scores and timing/accuracy are practice statistics, not health or cognitive assessments. Baseline means the last ten runs; best score is retained permanently. Detailed history retains 90 runs.

Ranking is opt-in and displays a generated bird alias and participation points. Account actions are authenticated, same-origin, validated by shared server rules and applied with revision-based concurrency control. No answers, journal text or photos go into the leaderboard. This is an honor-system prototype: self-reported participation and game scores are not anti-cheat verified. Stars have no monetary value.

The shop offers a cap, crown, scarf, sample pack and garden light. The garden light only adds garden growth; prestige only changes journey distance. Neither changes health tracking or game performance.

Validation: `npm test` and `npm run build`. Local launch: `npm start` (Node with `node:sqlite` support). Local credentials belong in ignored `web/.env`; production credentials belong in hosting environment settings. Never embed provider keys in browser assets or the iOS app. iOS requires an Xcode build and device check on macOS; it cannot be built from the Windows development environment.

## Admin demonstrations

A deployment can provision one mission admin through the secret `MISSION_ADMIN_ACCOUNT` JSON value (`id`, `username`, PBKDF2-SHA256 `salt` and `hash`, 100,000 iterations). Login creates the account if absent; an existing conflicting username is never overwritten. Authorization matches the immutable account ID, not a client flag or username alone. The secret must stay outside source control.

The admin panel selects automatic, healthy, tired or needs-care bird appearance and garden growth presets. Shop purchases are free for that account. Admin simulation accounts cannot join the public leaderboard. The stages describe a fictional pet and never infer the crew member’s health. Native iOS Mission uses the same hosted account and controls.
