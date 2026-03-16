#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/godot"
PROJECT_FILE="$PROJECT_DIR/project.godot"

if [ ! -f "$PROJECT_FILE" ]; then
  echo "Nie znaleziono pliku projektu Godota: $PROJECT_FILE" >&2
  exit 1
fi

find_godot_bin() {
  for candidate in \
    "${GODOT_BIN:-}" \
    godot4 \
    godot \
    /Applications/Godot.app/Contents/MacOS/Godot \
    "$HOME/Applications/Godot.app/Contents/MacOS/Godot"
  do
    [ -n "$candidate" ] || continue
    if [ -f "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    resolved="$(command -v "$candidate" 2>/dev/null || true)"
    if [ -n "$resolved" ] && [ -f "$resolved" ] && [ -x "$resolved" ]; then
      printf '%s\n' "$resolved"
      return 0
    fi
  done
  return 1
}

if GODOT_BIN_PATH="$(find_godot_bin)"; then
  exec "$GODOT_BIN_PATH" --path "$PROJECT_DIR" "$@"
fi

cat >&2 <<EOF
Nie znalazlem binarki Godota.

Sprobuj jednej z opcji:
  1. Zainstaluj Godot 4 i dodaj 'godot4' albo 'godot' do PATH
  2. Ustaw recznie:
     GODOT_BIN="/sciezka/do/Godot" ./run-godot.sh
  3. Na macOS otworz projekt recznie z:
     $PROJECT_FILE
EOF
exit 1
