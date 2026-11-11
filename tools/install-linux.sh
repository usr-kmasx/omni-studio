#!/usr/bin/env bash
set -euo pipefail

package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
prefix=""
if [[ ${1:-} == --prefix && $# == 2 ]]; then
    prefix=$(realpath -m -- "$2")
elif [[ $# != 0 ]]; then
    echo "Usage: ./install.sh [--prefix DIRECTORY]" >&2
    exit 2
fi
if [[ $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
    echo "This package requires Linux x86-64." >&2
    exit 1
fi
for file in omni-app launch.sh VERSION app/index.html app/assets/studio.omni.app.png SHA256SUMS; do
    [[ -f "$package/$file" ]] || { echo "Missing package file: $file" >&2; exit 1; }
done
(cd -- "$package" && sha256sum --check --strict --quiet SHA256SUMS)
version=$(cat -- "$package/VERSION")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid package version." >&2; exit 1; }
if [[ -n "$prefix" ]]; then
    data="$prefix/share"
    bindir="$prefix/bin"
else
    data="${XDG_DATA_HOME:-$HOME/.local/share}"
    bindir="$HOME/.local/bin"
fi
root="$data/omni-studio/application"
applications="$data/applications"
icons="$data/icons/hicolor/256x256/apps"
case "$root/" in
    "$package/"*) echo "Choose an installation directory outside the extracted package." >&2; exit 1 ;;
esac
mkdir -p -- "$root/releases" "$bindir" "$applications" "$icons"
if [[ -e "$root/current" && ! -L "$root/current" ]]; then
    echo "Installation path is occupied: $root/current" >&2
    exit 1
fi
staging=$(mktemp -d -- "$root/releases/.$version.XXXXXX")
cleanup() { [[ -z "${staging:-}" ]] || rm -rf -- "$staging"; }
trap cleanup EXIT
cp -a --reflink=auto -- "$package/." "$staging/"
chmod +x -- "$staging/omni-app" "$staging/launch.sh"
release="$root/releases/$version-${staging##*.}"
mv -- "$staging" "$release"
staging=""
link=$(mktemp -u -- "$root/.current.XXXXXX")
ln -s -- "$release" "$link"
mv -fT -- "$link" "$root/current"
launcher=$(mktemp -- "$bindir/.omni-studio.XXXXXX")
{
    echo '#!/usr/bin/env bash'
    printf 'exec %q "$@"\n' "$root/current/launch.sh"
} > "$launcher"
chmod 755 -- "$launcher"
mv -fT -- "$launcher" "$bindir/omni-studio"
icon="$icons/studio.omni.app.png"
install -m 644 -- "$release/app/assets/studio.omni.app.png" "$icon"
desktop=$(mktemp -- "$applications/.studio.omni.app.XXXXXX")
escape_desktop() { sed 's/%/%%/g; s/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g' <<< "$1"; }
launcher_exec=$(escape_desktop "$bindir/omni-studio")
cat > "$desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Omni Studio
Comment=Local chat, voice and image generation
Exec="$launcher_exec"
Icon=studio.omni.app
Terminal=false
Categories=Utility;Graphics;Chat;
StartupNotify=true
StartupWMClass=studio.omni.app
DESKTOP
chmod 644 -- "$desktop"
mv -fT -- "$desktop" "$applications/studio.omni.app.desktop"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$applications" >/dev/null 2>&1 || true; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -t "$data/icons/hicolor" >/dev/null 2>&1 || true; fi
printf 'Installed Omni Studio %s\nLaunch from your applications menu or run %s\n' "$version" "$bindir/omni-studio"
echo 'System requirements: compatible glibc, GTK 4.10+, WebKitGTK 6.0, and ffmpeg for video.'
