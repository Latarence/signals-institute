#!/usr/bin/env bash
# Public bundle guard: fails if an internal codename reaches a built landing bundle.
# Usage (after `next build`, from frontend/landing_app): bash src/components/PlayKit/check-public-bundle.sh [.next]
# Scans every client chunk plus the server-rendered HTML/RSC of the /play route. Comments are stripped at
# build time, so a hit means real shipped text.
set -euo pipefail
D="${1:-.next}"
[ -d "$D/static" ] || { echo "bundle guard: $D/static not found (run next build first)"; exit 2; }
targets=("$D/static")
for f in "$D"/server/app/play*; do [ -e "$f" ] && targets+=("$f"); done
hits=$(grep -rIlE '(^|[^A-Za-z0-9_])AHL([^A-Za-z0-9_]|$)|Anne Huntington' "${targets[@]}" 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "bundle guard: FAIL, internal codename found in:"; echo "$hits"
  for f in $hits; do grep -oE '.{0,40}(AHL|Anne Huntington).{0,40}' "$f" | head -3; done
  exit 1
fi
# The play route must also never call itself free.
fhits=$(grep -rIliE 'free (to play|game|trial|tier)|for free|play free' "$D"/server/app/play* 2>/dev/null || true)
if [ -n "$fhits" ]; then echo "bundle guard: FAIL, 'free' wording on /play:"; echo "$fhits"; exit 1; fi
echo "bundle guard: OK (no internal codename in ${#targets[@]} target(s))"
