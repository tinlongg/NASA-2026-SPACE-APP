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

The account API exposes the server-verified admin role at sign-in and session refresh. iOS observes the shared WebKit session and verifies this identity for its app-wide administrator banner and Settings. Simulator bots are opt-in, admin-only fictional entries. Real rankings return the top ten plus the signed-in participant’s own rank; the UI shows that rank below the table if their entry is outside the ten displayed rows.

Pip can hop on tap/keyboard activation and respond to horizontal swipe petting. These cosmetic interactions do not grant participation points. Dust is a drifting drawn cloud; the garden uses SVG plant illustrations in pots. The Mars route positions Pip riding a rocket by actual journey progress. Animations honor reduced-motion preferences.

Admin simulation also supports adding journey distance, reaching Mars, and advancing the expedition level. Tired Pip has helmet grime; needs-care Pip has grime plus the surrounding dust cloud. Taps have no cooldown; holding for 400 ms then dragging shakes Pip, with pointer capture and release/cancel cleanup.

In Crew rankings, signed-in admins can edit their own bird’s leaderboard points (whole numbers from 0 to 1,000,000,000). Changes persist to their account and update their rank among demo bots. Server authorization protects the edit; admin simulation accounts remain outside public rankings.

Both suit flows share NASA’s Spacewalk Spacesuit Basics functional groups: cooling garment (three layers), bladder, restraint, ripstop liner, multiple insulation layers, and outer covering. NASA describes up to 16 material layers rather than the proposed 14-layer screenshot grouping. The main checklist separately retains equipment checks. Source: https://www.nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/ . These are records of approved inspections, not clearance for EVA or instructions to disassemble a suit.

Newly completed daily tasks show a brief confetti celebration; reduced motion shows only the completion message. Task, game and account dialogs have sticky corner close controls. Game dismissal refunds an unfinished flight, and section close controls return to daily care.

### Illustrated games and personal settings
Bird dragging follows pointer movement immediately (5 px threshold); release resets position. Orbital docking shows station contact; memory uses illustrated planet SVGs; the salvage window has 20 selectable materials, with accuracy based on collected resources plus untouched hazards. Flight rewards remain participation-only. Bird names (1–24 characters) sync in mission state and are used on opt-in rankings; self identity is an explicit flag so duplicate names do not hide your rank. Photo check-ins require sign-in and save resized JPEGs in the existing private Journal, which supports viewing and deleting them. Meal notes include Breakfast/Lunch/Dinner/Snack. The header theme switch saves light/dark preference on this browser.

The garden has six distinct plant illustrations: mint flower clusters and serrated leaves, basil flower spikes and broad leaves, a white solar daisy, pink cosmos with feathery foliage, slender lavender stalks, and a layered orange marigold. Each has a different pot pattern and keeps its identity through growth. The cap and crown follow the bird’s curved head and move with its healthy, tired, and needs-care poses.
