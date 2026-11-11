#!/usr/bin/env bash
set -euo pipefail

prefix=""
if [[ ${1:-} == --prefix && $# == 2 ]]; then
    prefix=$(realpath -m -- "$2")
elif [[ ${1:-} == --help && $# == 1 ]]; then
    echo "Usage: ./uninstall.sh [--prefix DIRECTORY]"
    echo "Removes the installed application, menu shortcut and icon. Keeps user data."
    exit 0
elif [[ $# != 0 ]]; then
    echo "Usage: ./uninstall.sh [--prefix DIRECTORY]" >&2
    exit 2
fi
if [[ -n "$prefix" ]]; then
    data="$prefix/share"
    bindir="$prefix/bin"
else
    data="${XDG_DATA_HOME:-$HOME/.local/share}"
    bindir="$HOME/.local/bin"
fi
rm -f -- "$bindir/omni-studio"
rm -f -- "$data/applications/studio.omni.app.desktop"
rm -f -- "$data/icons/hicolor/256x256/apps/studio.omni.app.png"
rm -rf -- "$data/omni-studio/application"
if command -v update-desktop-database >/dev/null && [[ -d "$data/applications" ]]; then
    update-desktop-database "$data/applications" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null && [[ -d "$data/icons/hicolor" ]]; then
    gtk-update-icon-cache -t "$data/icons/hicolor" >/dev/null 2>&1 || true
fi
echo "Omni Studio uninstalled. User conversations, preferences and separately stored models are preserved."
