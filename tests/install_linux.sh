#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
package="$fixture/package"
prefix="$fixture/install with spaces"
mkdir -p "$package/app/assets" "$prefix/share/omni-studio"
printf 'preserve preferences\n' > "$prefix/share/omni-studio/test-preference"
cp "$repo/tools/install-linux.sh" "$package/install.sh"
cp "$repo/tools/launch-linux.sh" "$package/launch.sh"
printf '#!/bin/sh\nprintf "fixture launched\\n"\n' > "$package/omni-app"
chmod +x "$package/omni-app"
printf '0.3.0\n' > "$package/VERSION"
printf '<!doctype html>\n' > "$package/app/index.html"
cp "$repo/assets/studio.omni.app.png" "$package/app/assets/"
(cd "$package" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
"$package/install.sh" --prefix "$prefix"
[[ $("$prefix/bin/omni-studio") == "fixture launched" ]]
test -f "$prefix/share/applications/studio.omni.app.desktop"
test -f "$prefix/share/icons/hicolor/256x256/apps/studio.omni.app.png"
old=$(readlink "$prefix/share/omni-studio/application/current")
"$package/install.sh" --prefix "$prefix"
new=$(readlink "$prefix/share/omni-studio/application/current")
[[ "$old" != "$new" && -d "$old" ]]
[[ $(cat "$prefix/share/omni-studio/test-preference") == "preserve preferences" ]]
printf 'corrupt\n' >> "$package/app/index.html"
if "$package/install.sh" --prefix "$prefix" >/dev/null 2>&1; then
    echo "Installer accepted a damaged package" >&2
    exit 1
fi
[[ $(readlink "$prefix/share/omni-studio/application/current") == "$new" ]]
echo "Linux installation, update, icon, spaces, preference preservation and corruption rejection passed"
