#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v xcodebuild >/dev/null; then
  echo 'Instala Xcode y selecciona Xcode > Settings > Locations > Command Line Tools.' >&2
  exit 1
fi
plutil -lint Picks777/Info.plist Picks777/PrivacyInfo.xcprivacy Picks777.xcodeproj/project.pbxproj
xcodebuild -project Picks777.xcodeproj -scheme Picks777 -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
open Picks777.xcodeproj
