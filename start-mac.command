#!/bin/bash
# Docly launcher for macOS (Intel and Apple Silicon). First start: downloads the app engine (Electron).
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

# ---- Engine (Electron) used by Docly. To change it: delete the runtime/mac-* folder and edit these lines. ----
EV="45.2.3"
if [ "$(uname -m)" = "arm64" ]; then
  ARCH="arm64"; ESHA="4d7c429064087a47b855d9bd06c76ead4819b7f02b385de232d4a5c37ecef55f"
else
  ARCH="x64";   ESHA="d87323533cc8750ef177e5b48058f7a8b381f677d4e103cc63360006c08829c2"
fi
RT="$DIR/runtime/mac-$ARCH"
APP="$RT/Docly.app"
URL="https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-darwin-$ARCH.zip"

fail() { echo; echo "  $1"; echo; read -r -p "  Press Enter to close..." _; exit 1; }

# The folder came from the Internet: remove the quarantine flag so Docly can start and save next to itself
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null

if [ ! -d "$APP" ]; then
  echo
  echo "  Docly - first start: downloading the app engine (Electron $EV, $ARCH)."
  echo "  This happens only once; afterwards Docly starts in a second and works offline."
  echo
  TMP="$(mktemp -d)"; ZIP="$TMP/electron.zip"
  trap 'rm -rf "$TMP"' EXIT
  TOTAL="$(curl -sIL "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{n=$2} END{print n+0}')"
  curl -sSL -o "$ZIP" "$URL" & PID=$!
  while kill -0 "$PID" 2>/dev/null; do
    if [ "${TOTAL:-0}" -gt 0 ] && [ -f "$ZIP" ]; then
      printf '\r  Downloading... %d%%   ' $(( $(stat -f %z "$ZIP") * 100 / TOTAL ))
    fi
    sleep 0.3
  done
  wait "$PID" || fail "Download failed. Check your Internet connection and try again."
  printf '\r  Downloading... 100%%   \n'

  printf '  Verifying... '
  SUM="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
  [ "$SUM" = "$ESHA" ] || fail "SHA-256 does not match (got $SUM). The download was discarded."
  echo "OK"

  rm -rf "$RT"; mkdir -p "$RT"
  N="$(unzip -Z1 "$ZIP" | wc -l | tr -d ' ')"
  unzip -o "$ZIP" -d "$RT" | awk -v n="$N" '{ i++; printf "\r  Extracting... %d%%   ", (i*100/n > 100 ? 100 : i*100/n) } END { printf "\r  Extracting... 100%%   \n" }'
  [ -d "$RT/Electron.app" ] || { rm -rf "$RT"; fail "The downloaded engine looks incomplete."; }

  # Make the engine look like Docly: name, identifier, Dock / menu bar icon
  mv "$RT/Electron.app" "$APP"
  mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/Docly"
  PL="$APP/Contents/Info.plist"
  for kv in "CFBundleName:Docly" "CFBundleDisplayName:Docly" "CFBundleExecutable:Docly" "CFBundleIdentifier:com.docly.app" "CFBundleIconFile:docly.icns"; do
    k="${kv%%:*}"; v="${kv#*:}"
    /usr/libexec/PlistBuddy -c "Set :$k $v" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$k string $v" "$PL"
  done
  cp "$DIR/static/icon.icns" "$APP/Contents/Resources/docly.icns"
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1    # the edited bundle needs a (local) signature to start
  echo "  Done."
fi

open "$APP" --args "$DIR"
exit 0
