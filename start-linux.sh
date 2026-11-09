#!/usr/bin/env bash
# Docly launcher for Linux. First start: downloads the app engine (Electron) into runtime/linux.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

# ---- Engine (Electron) used by Docly. To change it: delete runtime/linux and edit these two lines. ----
EV="45.2.3"
ESHA="a87fe741f6d121285117e574da6c9a2e65210d410123bbc04713b099add0263b"
RT="$DIR/runtime/linux"
URL="https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-linux-x64.zip"

fail() { echo; echo "  $1"; echo; read -r -p "  Press Enter to close..." _ 2>/dev/null; exit 1; }

if [ ! -x "$RT/Docly" ]; then
  echo
  echo "  Docly - first start: downloading the app engine (Electron $EV)."
  echo "  This happens only once; afterwards Docly starts in a second and works offline."
  echo
  TMP="$(mktemp -d)"; ZIP="$TMP/electron.zip"
  trap 'rm -rf "$TMP"' EXIT
  if command -v curl >/dev/null 2>&1; then
    TOTAL="$(curl -sIL "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{n=$2} END{print n+0}')"
    curl -sSL -o "$ZIP" "$URL" & PID=$!
  elif command -v wget >/dev/null 2>&1; then
    TOTAL="$(wget --spider -S "$URL" 2>&1 | awk 'tolower($1)=="content-length:"{n=$2} END{print n+0}')"
    wget -q -O "$ZIP" "$URL" & PID=$!
  else
    fail "curl or wget is needed for the first start."
  fi
  while kill -0 "$PID" 2>/dev/null; do
    if [ "${TOTAL:-0}" -gt 0 ] && [ -f "$ZIP" ]; then
      printf '\r  Downloading... %d%%   ' $(( $(stat -c %s "$ZIP") * 100 / TOTAL ))
    fi
    sleep 0.3
  done
  wait "$PID" || fail "Download failed. Check your Internet connection and try again."
  printf '\r  Downloading... 100%%   \n'

  printf '  Verifying... '
  SUM="$(sha256sum "$ZIP" | awk '{print $1}')"
  [ "$SUM" = "$ESHA" ] || fail "SHA-256 does not match (got $SUM). The download was discarded."
  echo "OK"

  rm -rf "$RT"; mkdir -p "$RT"
  if command -v unzip >/dev/null 2>&1; then
    N="$(unzip -Z1 "$ZIP" | wc -l)"
    unzip -o "$ZIP" -d "$RT" | awk -v n="$N" '{ i++; printf "\r  Extracting... %d%%   ", (i*100/n > 100 ? 100 : i*100/n) } END { printf "\r  Extracting... 100%%   \n" }'
  elif command -v bsdtar >/dev/null 2>&1; then
    echo "  Extracting..."; bsdtar -xf "$ZIP" -C "$RT" || fail "Extraction failed."
  else
    fail "unzip is needed for the first start (e.g. sudo apt install unzip)."
  fi
  [ -f "$RT/electron" ] || { rm -rf "$RT"; fail "The downloaded engine looks incomplete."; }
  mv "$RT/electron" "$RT/Docly"; chmod +x "$RT/Docly"
  echo "  Done."
fi

# Applications menu entry + window icon (the only file written outside the Docly folder; refreshed every start)
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
if mkdir -p "$APPS" 2>/dev/null; then
  cat > "$APPS/Docly.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Docly
Comment=Private offline document editor
Exec="$RT/Docly" "$DIR" --class=Docly --no-sandbox
Icon=$DIR/static/icon.png
Terminal=false
Categories=Office;WordProcessor;
StartupWMClass=Docly
DESK
  update-desktop-database "$APPS" >/dev/null 2>&1 || true
fi

nohup "$RT/Docly" "$DIR" --class=Docly --no-sandbox "$@" >/dev/null 2>&1 &
disown 2>/dev/null
exit 0
