#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "Usage: $0 INPUT_DIRECTORY RELEASE_BINARY OUTPUT.tar.gz" >&2
    exit 2
fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
inputs=$(realpath -- "$1")
binary=$(realpath -- "$2")
output=$(realpath -m -- "$3")
runtime=llama-b12202-bin-ubuntu-vulkan-x64.tar.gz
model=LFM3-Omni-2B-Q4_K_M.gguf
projector=mmproj-LFM3-Omni-2B-Q4_K_M.gguf

(
    cd -- "$inputs"
    sha256sum --check --strict <<SUMS
9f8d30e9d4fd7a9349d586e077988229b3ca0a0e4ad730897563d1eccc9893e2  $model
0a746c0794782a16d4456b230c2a0b5888a2d94a6677211edbed7d7a4177a39a  $projector
c1eaf8fcaf0b17c1fe9097f7ff08bad484cd451533e7f2075381d18d220694e7  $runtime
4d28ca14dedc0b3d0fcc2b3339f0e79931faa33874f3d24f522183a8fc70068c  LICENSE-LFM
SUMS
)

[[ -x "$binary" && $(uname -m) == x86_64 ]]
mkdir -p -- "$(dirname -- "$output")"
staging=$(mktemp -d -- "$(dirname -- "$output")/.omni-package.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT
package="$staging/omni-studio-linux-x86_64"
resources="$package/resources/omni-complete"
mkdir -p "$package/app" "$resources" "$package/licenses"
cp -a -- "$repo/index.html" "$repo/assets" "$repo/css" "$repo/js" "$repo/vendor" "$package/app/"
install -m 755 -- "$binary" "$package/omni-app"
cp --reflink=auto -- "$inputs/$model" "$inputs/$projector" "$inputs/$runtime" "$resources/"
cp -- "$repo/LICENSE" "$package/licenses/Omni-Studio-MIT.txt"
cp -- "$inputs/LICENSE-LFM" "$package/licenses/Liquid-AI-LFM-Open-License.txt"
tar -xOzf "$inputs/$runtime" llama-b12202/LICENSE > "$package/licenses/llama.cpp-LICENSE.txt"
cat > "$package/launch.sh" <<'LAUNCH'
#!/bin/sh
set -eu
package=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
export OMNI_SITE_ROOT="$package/app"
exec "$package/omni-app" "$@"
LAUNCH
chmod +x "$package/launch.sh"
cat > "$package/README.txt" <<'README'
Omni Studio · Complete Linux x86-64 edition

Extract the whole directory and run ./launch.sh. Linux needs a compatible
glibc, GTK 4.10 or later, WebKitGTK 6.0, and ffmpeg/ffprobe for video.
For GPU acceleration use a compatible Vulkan driver and adjust GPU layers
under Settings → Models and server → Local.

Includes Liquid AI's LFM3-Omni-2B Q4_K_M and matching projector, pinned to
d508b88f08a5b4286f2d2805a6a8d69a0ff44c72, and llama.cpp b12202.
The weights remain in resources/omni-complete. Move the whole directory
when relocating the app. The installed runtime is cached separately in
the user's application data.

Source and license notices:
https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF
https://github.com/ggml-org/llama.cpp/releases/tag/b12202
See licenses/ for the app, runtime and model licenses, and app/vendor/
for notices from the web components.
README
tar --sort=name --owner=0 --group=0 --numeric-owner -C "$staging" -cf - omni-studio-linux-x86_64 |
    gzip -n -1 > "$staging/complete.tar.gz"
bytes=$(stat --format=%s "$staging/complete.tar.gz")
if (( bytes >= 2147483648 )); then
    echo "Release asset is $bytes bytes and must be smaller than 2 GiB." >&2
    exit 1
fi
mv -- "$staging/complete.tar.gz" "$output"
printf '%s bytes\n' "$bytes"
sha256sum -- "$output"
