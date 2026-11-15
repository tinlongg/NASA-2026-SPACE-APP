#!/usr/bin/env bash
# Archives CrewSafety (iPhone app with its embedded Apple Watch app) and uploads it to TestFlight.
# Uses the Apple ID signed into Xcode (Xcode > Settings > Accounts). See ios/TESTFLIGHT.md first.
#
#   ios/scripts/testflight.sh <TEAM_ID> [BUNDLE_ID_PREFIX]
#
# TEAM_ID: the 10-character team ID (developer.apple.com > Membership details, or Xcode > Settings > Accounts).
# BUNDLE_ID_PREFIX: overrides the prefix in the project for this upload, e.g. com.yourteam.
set -euo pipefail

TEAM_ID="${1:-}"
PREFIX="${2:-}"
if [[ ! "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Usage: $0 <TEAM_ID> [BUNDLE_ID_PREFIX]   (TEAM_ID is 10 letters and digits, e.g. AB12CD34EF)" >&2
  exit 64
fi

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$IOS_DIR/build/testflight"
ARCHIVE="$BUILD_DIR/CrewSafety.xcarchive"
# Each upload needs a new, larger build number; the iPhone and Watch apps share it.
BUILD_NUMBER="$(date -u +%Y%m%d%H%M)"

overrides=(DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
[[ -n "$PREFIX" ]] && overrides+=(BUNDLE_ID_PREFIX="$PREFIX")

rm -rf "$BUILD_DIR"; mkdir -p "$BUILD_DIR"
echo "Archiving build $BUILD_NUMBER for team $TEAM_ID${PREFIX:+, bundle prefix $PREFIX}…"
if ! xcodebuild archive \
    -project "$IOS_DIR/CrewSafety.xcodeproj" -scheme CrewSafety -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    -allowProvisioningUpdates "${overrides[@]}" | tee "$BUILD_DIR/archive.log" | grep -E 'error:|warning: .*(sign|provision)|ARCHIVE (SUCCEEDED|FAILED)'; then
  :
fi
if [[ ! -d "$ARCHIVE" ]]; then
  echo "Archive failed. Full log: $BUILD_DIR/archive.log" >&2
  echo "Common causes: not signed into Xcode with this team; no permission to create signing certificates" >&2
  echo "(ask an Admin for 'Access to Cloud Managed Distribution Certificate'); the bundle ID belongs to another team." >&2
  exit 1
fi

OPTIONS="$BUILD_DIR/ExportOptions.plist"
cp "$IOS_DIR/ExportOptions.plist" "$OPTIONS"
/usr/libexec/PlistBuddy -c "Add :teamID string $TEAM_ID" "$OPTIONS"

echo "Uploading to App Store Connect…"
if ! xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OPTIONS" \
    -exportPath "$BUILD_DIR/export" -allowProvisioningUpdates "${overrides[@]}" > "$BUILD_DIR/upload.log" 2>&1; then
  grep -E 'error|Error' "$BUILD_DIR/upload.log" | head -20 >&2
  echo "Upload failed. Full log: $BUILD_DIR/upload.log" >&2
  echo "Common causes: no app record with this bundle ID in App Store Connect yet; your role cannot upload builds." >&2
  exit 1
fi
echo "Uploaded build $BUILD_NUMBER. It appears in App Store Connect > TestFlight after processing (usually 5–30 minutes)."
