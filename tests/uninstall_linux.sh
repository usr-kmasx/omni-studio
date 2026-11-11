#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
prefix="$fixture/install with spaces"
data="$prefix/share"
mkdir -p "$prefix/bin" "$data/applications" "$data/icons/hicolor/256x256/apps"     "$data/omni-studio/application/releases/0.3.0" "$data/omni-studio/models" "$data/omni-studio/history"
touch "$prefix/bin/omni-studio" "$prefix/bin/another-app"     "$data/applications/studio.omni.app.desktop" "$data/applications/another-app.desktop"     "$data/icons/hicolor/256x256/apps/studio.omni.app.png"     "$data/omni-studio/application/releases/0.3.0/omni-app"     "$data/omni-studio/models/keep.gguf" "$data/omni-studio/history/keep.json"
ln -s "$data/omni-studio/application/releases/0.3.0" "$data/omni-studio/application/current"
bash "$repo/tools/uninstall-linux.sh" --prefix "$prefix"
test ! -e "$prefix/bin/omni-studio"
test ! -e "$data/applications/studio.omni.app.desktop"
test ! -e "$data/icons/hicolor/256x256/apps/studio.omni.app.png"
test ! -e "$data/omni-studio/application"
test -f "$prefix/bin/another-app"
test -f "$data/applications/another-app.desktop"
test -f "$data/omni-studio/models/keep.gguf"
test -f "$data/omni-studio/history/keep.json"
bash "$repo/tools/uninstall-linux.sh" --prefix "$prefix"
echo "Uninstall with spaces, repeat execution, and preservation of user data and other apps passed"
