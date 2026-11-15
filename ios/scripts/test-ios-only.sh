#!/usr/bin/env bash
# Runs the iPhone app's unit tests without building the embedded Apple Watch app.
# The shipping CrewSafety.xcodeproj still owns the Watch app and TestFlight archive.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/ios"

DESTINATION="${1:-platform=iOS Simulator,name=iPhone 17,OS=26.5}"

# Regenerate when xcodegen is available so new source files are picked up.
# The generated project is committed, so this step is optional for teammates.
if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate --spec project-ios-only.yml --project . --project-root . >/dev/null
fi

xcodebuild test \
  -project CrewSafetyIOSOnly.xcodeproj \
  -scheme CrewSafety-iOSOnly \
  -destination "$DESTINATION" \
  CODE_SIGNING_ALLOWED=NO
