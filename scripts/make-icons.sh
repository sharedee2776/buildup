#!/usr/bin/env bash
# Generate PNG icons from the SVGs.
# iOS needs a PNG apple-touch-icon; Android is happy with the SVG but PNGs don't hurt.
# Uses @resvg/resvg-js (pure prebuilt binary, no system deps). Falls back to
# rsvg-convert / ImageMagick if you have them.
set -euo pipefail
cd "$(dirname "$0")/.."

render_node() {
  node -e '
    const { Resvg } = require("@resvg/resvg-js");
    const fs = require("fs");
    const jobs = [
      ["icons/icon-apple.svg", 180, "icons/icon-180.png"],
      ["icons/icon.svg", 192, "icons/icon-192.png"],
      ["icons/icon.svg", 512, "icons/icon-512.png"],
      ["icons/icon-maskable.svg", 512, "icons/icon-maskable-512.png"],
      ["icons/icon.svg", 1024, "icons/icon-1024.png"]
    ];
    for (const [src, w, out] of jobs) {
      const r = new Resvg(fs.readFileSync(src), { fitTo: { mode: "width", value: w } });
      fs.writeFileSync(out, r.render().asPng());
      console.log("  wrote " + out + " (" + w + "px)");
    }
  '
}

render_rsvg() {
  for spec in "icon-apple.svg 180 icon-180" "icon.svg 192 icon-192" "icon.svg 512 icon-512" \
              "icon-maskable.svg 512 icon-maskable-512" "icon.svg 1024 icon-1024"; do
    set -- $spec
    rsvg-convert -w "$2" -h "$2" "icons/$1" -o "icons/$3.png" && echo "  wrote icons/$3.png"
  done
}

if node -e 'require.resolve("@resvg/resvg-js")' 2>/dev/null; then
  render_node
elif command -v rsvg-convert >/dev/null 2>&1; then
  render_rsvg
else
  echo "Installing @resvg/resvg-js locally…"
  npm i --no-save @resvg/resvg-js >/dev/null 2>&1
  render_node
fi

echo "PNG icons ready. index.html, manifest.webmanifest and sw.js already reference them."
