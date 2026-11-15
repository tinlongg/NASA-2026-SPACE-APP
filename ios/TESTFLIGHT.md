# CrewSafety on TestFlight (iPhone + Apple Watch)

The iPhone app includes the Apple Watch app. One upload gives testers both: TestFlight installs the
iPhone app, then offers the Watch app.

## One-time setup

### 1. Check your role in the team
App Store Connect → **Users and Access** → find your name.

| Role | What you can do |
|---|---|
| Account Holder, Admin or App Manager | Everything below |
| Developer | Upload builds (step 4). An Admin must create the app record (step 3) and give you **Access to Cloud Managed Distribution Certificate** (in your user's settings), so Xcode can sign the upload |
| Marketing, Sales, Customer Support | Not enough; ask the Account Holder to change your role |

### 2. Sign into Xcode and choose the bundle IDs
1. Xcode → **Settings → Accounts → +** → Apple ID. Select the team you were invited to and note its **Team ID** (10 letters and digits).
2. Open `ios/CrewSafety.xcodeproj`, then the **CrewSafety** project (not a target) → **Build Settings** → search `BUNDLE_ID_PREFIX`. Set it to something you own under that team, for example `com.<teamname>.crewsafety`. This one setting gives:
   - iPhone app: `<prefix>.CrewSafety`
   - Watch app: `<prefix>.CrewSafety.watchkitapp` (the Watch↔iPhone link follows automatically)
3. **Signing & Capabilities** for the **CrewSafety** and **CrewSafetyWatch** targets: tick *Automatically manage signing* and pick the team. Xcode registers both App IDs with HealthKit, which is already in the entitlements.

### 3. Create the app record (Admin or App Manager)
App Store Connect → **Apps → + → New App**:
- Platform: iOS
- Name: must be unique on the whole App Store, e.g. `CrewSafety Prototype` (the home-screen name stays "CrewSafety")
- Bundle ID: `<prefix>.CrewSafety` (it appears in the list after step 2)
- SKU: `crewsafety-proto`
- User access: Full access

## Each upload

### 4. Upload a build
From the repository root:

```bash
ios/scripts/testflight.sh <TEAM_ID>
```

Add the prefix as a second argument to override the project setting for one upload: `ios/scripts/testflight.sh AB12CD34EF com.yourteam.crewsafety`.

The script uses a new build number each time (UTC date and time), archives the iPhone and Watch apps, and uploads them using the account signed into Xcode. Logs are in `ios/build/testflight/`.

Prefer Xcode? Set the scheme to **CrewSafety** and the destination to **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App** → **TestFlight Internal Only**. Raise **Build** under the CrewSafety target's General tab before each upload.

Builds are marked for internal testing only. For external testers later, set `testFlightInternalTestingOnly` to `false` in `ios/ExportOptions.plist`. External testing also needs a Beta App Review and a privacy policy URL.

### 5. Add testers
App Store Connect → the app → **TestFlight**. Once the build finishes processing (usually 5–30 minutes; you get an email):
- **Internal Testing → +** → create a group, add yourself and teammates (they must be users of the team). No Apple review is needed.
- Export compliance is already answered: the app declares it uses no non-exempt encryption.

### 6. Install on the iPhone and Watch
1. On the iPhone, install **TestFlight** from the App Store and accept the invitation email, or open TestFlight signed in with the same Apple ID.
2. Install **CrewSafety**. On its TestFlight page, turn on **Apple Watch** (or open the iPhone's Watch app → Available Apps → CrewSafety → Install).
3. Open CrewSafety on the iPhone → Dashboard → **Start Watch monitoring**, and allow Health access on both devices.
4. To use it with the website: in the iPhone app's Settings, enter the website address and pairing code (Crew page → Create pairing session), then turn on sharing.

TestFlight builds expire after 90 days.

## Troubleshooting
- **"No profiles for … were found" or certificate errors:** you're not signed into Xcode with this team, or your role can't create distribution certificates (see step 1).
- **"No suitable application records were found":** the app record (step 3) doesn't exist, or its bundle ID differs from `<prefix>.CrewSafety`.
- **"The bundle identifier … is not available":** another team owns that ID; choose another `BUNDLE_ID_PREFIX`.
- **Watch app missing in TestFlight:** check that the iPhone and Watch have the same version and build (the script sets both), and that the Watch runs watchOS 10 or newer.
