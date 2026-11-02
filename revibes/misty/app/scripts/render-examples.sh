#!/bin/sh
# Renders examples-src/*.html to public/examples/*.png with headless Chrome at 2x.
cd "$(dirname "$0")/.." || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
render() { # name height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=390,"$2" --screenshot="public/examples/$1.png" "file://$PWD/examples-src/$1.html" 2>/dev/null
  echo "rendered public/examples/$1.png"
}
render health-categories 430
render music-profile 600
render apple-store 720
