#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 3 ]]; then
    echo "Usage: $0 <clean-upstream-checkout> <build-directory> <output-directory>" >&2
    exit 2
fi
patch_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
source_dir="$(realpath "$1")"
build_dir="$(realpath -m "$2")"
output_dir="$(realpath -m "$3")"
revision=a3c49b13be5a64a0b4da2b576af3a17e8ae1ccbf
[[ "$(git -C "$source_dir" rev-parse HEAD)" == "$revision" ]]
git -C "$source_dir" submodule update --init --recursive
apply_patch() {
    local repo="$1" patch="$2"
    if ! git -C "$repo" apply --reverse --check "$patch" 2>/dev/null; then
        git -C "$repo" apply --check "$patch"
        git -C "$repo" apply "$patch"
    fi
}
apply_patch "$source_dir" "$patch_dir/memory-budget.patch"
apply_patch "$source_dir/ggml" "$patch_dir/vulkan-heap-budget.patch"

mkdir -p "$build_dir"
"${CXX:-c++}" -std=c++17 -I"$source_dir/src" -I"$source_dir/include" -I"$source_dir/ggml/include" \
    "$patch_dir/memory-budget-test.cpp" -o "$build_dir/memory-budget-test"
"$build_dir/memory-budget-test"

for variant in cpu vulkan; do
    vulkan=OFF
    if [[ "$variant" == vulkan ]]; then vulkan=ON; fi
    cmake -S "$source_dir" -B "$build_dir/$variant" -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DSD_SERVER_BUILD_FRONTEND=OFF \
        -DSD_WEBM=OFF -DSD_WEBP=OFF -DSD_VULKAN="$vulkan"
    cmake --build "$build_dir/$variant" --target sd-server -j "${OMNI_SD_BUILD_JOBS:-4}"
    server="$build_dir/$variant/bin/sd-server"
    [[ "$("$server" --omni-memory-protection)" == omni-memory-v2 ]]
    mkdir -p "$output_dir/$variant"
    python3 - "$server" "$source_dir/LICENSE" "$output_dir/$variant" <<'PY'
import hashlib
from pathlib import Path
import sys
import zipfile

server, license_file, out = map(Path, sys.argv[1:])
archive = out / "sd-server.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
    package.write(server, "sd-server")
    package.write(license_file, "LICENSE")
with archive.open("rb") as data:
    digest = hashlib.file_digest(data, "sha256").hexdigest()
(out / "sd-server.zip.sha256").write_text(digest + "\n")
PY
done
