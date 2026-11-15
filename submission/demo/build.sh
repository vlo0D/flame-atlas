#!/usr/bin/env bash
# Prints submission/demo/slides.html to a PDF, one slide per page.
# The PDF goes to apps/web/public/demo/, so GitHub Pages serves it next to the app:
#   https://vlo0d.github.io/flame-atlas/demo/flame-atlas-demo.pdf
# Needs Google Chrome (set CHROME to its binary on Linux or Windows) and a network connection for the font.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$root/apps/web/public/demo/flame-atlas-demo.pdf"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

mkdir -p "$(dirname "$out")"
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=8000 --run-all-compositor-stages-before-draw \
  --print-to-pdf="$out" "file://$here/slides.html" 2>/dev/null

echo "Wrote $out"
