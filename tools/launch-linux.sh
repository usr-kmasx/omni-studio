#!/usr/bin/env bash
set -euo pipefail
script=$(readlink -f -- "${BASH_SOURCE[0]}")
package=$(cd -- "$(dirname -- "$script")" && pwd)
export OMNI_SITE_ROOT="$package/app"
exec "$package/omni-app" "$@"
