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
version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$repo/native/Cargo.toml" | head -1)
printf '%s\n' "$version" > "$package/VERSION"
install -m 755 "$repo/tools/launch-linux.sh" "$package/launch.sh"
install -m 755 "$repo/tools/install-linux.sh" "$package/install.sh"
for variant in cpu vulkan; do
    bundle="$inputs/omni-image-runtimes/$variant"
    digest=$(cat "$bundle/sd-server.zip.sha256")
    printf '%s  %s\n' "$digest" "$bundle/sd-server.zip" | sha256sum --check --strict
    mkdir -p "$package/omni-image-runtimes/$variant"
    install -m 644 "$bundle/sd-server.zip" "$bundle/sd-server.zip.sha256" "$package/omni-image-runtimes/$variant/"
done
cp -- "$inputs/licenses/"*.txt "$package/licenses/"
cat > "$package/README.txt" <<'README'
Omni Studio · Complete Linux x86-64 edition

Extract the whole directory and run ./install.sh for a user installation with an app menu shortcut.
For portable use run ./launch.sh. Linux needs a compatible
glibc, GTK 4.10 or later, WebKitGTK 6.0, and ffmpeg/ffprobe for video.
For GPU acceleration use a compatible Vulkan driver and adjust GPU layers
under Settings → llama.cpp.

Includes Liquid AI's LFM3-Omni-2B Q4_K_M and matching projector, pinned to
d508b88f08a5b4286f2d2805a6a8d69a0ff44c72, and llama.cpp b12202.
The weights remain in resources/omni-complete. Move the whole directory
when relocating the app. The installed runtime is cached separately in
the user's application data.

Includes the protected stable-diffusion.cpp CPU and Vulkan runtimes.
Select an image model in Settings → stable-diffusion.cpp and enable Image mode
beside the attachment button in Chat.

Source and license notices:
https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF
https://github.com/leejet/stable-diffusion.cpp/tree/a3c49b13be5a64a0b4da2b576af3a17e8ae1ccbf
https://github.com/ggml-org/llama.cpp/releases/tag/b12202
See licenses/ for the app, runtime and model licenses, and app/vendor/
for notices from the web components.
README
(
    cd -- "$package"
    find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
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
(
    cd -- "$(dirname -- "$output")"
    sha256sum -- "$(basename -- "$output")" > "$(basename -- "$output").sha256"
)
