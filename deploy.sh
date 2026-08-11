#!/usr/bin/env bash
# deploy.sh — deploy RHOBEAR Workbench web (static app) FROM this repo INTO the live docroot.
# Run ON rhobear-vps:  cd /home/slang/rhobear-workbench-web && git pull && ./deploy.sh
#
# THIS REPO IS THE SINGLE SOURCE OF TRUTH for workbench.rhobear.ai's static docroot.
# NEVER hand-edit the docroot (/var/www/rhobear-workbench-web) — hand edits silently drift and
# get reverted, which is exactly the failure this arrangement exists to prevent. Edit here, commit,
# deploy.
#
# MANAGED SCOPE:
#   The whole docroot: assets/** · lessons/ · mcp/** · models/** · preview/** · screens/** ·
#   vendor/** · and the loose root files (api.js, app.js, companion-embed-orb4.js, dictation.js,
#   harness-catalog.js, hub-strive.js, hub-theme-toggle.js, index.html, lab-old.html,
#   lessons-catalog.json, manifest.webmanifest, rho-orb-live.js, sheet-artifact.js, status,
#   stt.html, styles.css, sw.js, whisper-stt.js, whisper-test.html, and the PNG icon set).
#   --delete is scoped to directories this repo fully owns, so nothing outside the managed scope
#   is ever removed.
#
# Cache busting is AUTOMATIC: every local js/css ref in index.html is stamped (or re-stamped)
# ?v=<commit-sha> at deploy time (a new URL is always a cache miss). The workbench index.html
# historically carried a hand-bumped ?v=<date>; this script replaces whatever ?v= it finds with
# the commit sha, so a hand-bump is never required. There is NO build step — plain ES modules +
# CSS; "build" == this sync.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCROOT="${WORKBENCH_DOCROOT:-/var/www/rhobear-workbench-web}"
[ -d "$DOCROOT" ] || { echo "[deploy] ERROR: docroot $DOCROOT not found" >&2; exit 1; }
cd "$REPO"

SHA="$(git rev-parse --short HEAD)"
if git diff --quiet && git diff --cached --quiet; then DIRTY=""; else DIRTY="-dirty"; fi
STAMP="${SHA}${DIRTY}"
[ -n "$DIRTY" ] && echo "[deploy] WARNING: working tree dirty — deploying uncommitted changes as ?v=$STAMP" >&2
echo "[deploy] $REPO -> $DOCROOT   (?v=$STAMP)"

# 0. SYNTAX GATE. An inline <script> with a broken token takes the WHOLE page
#    with it — every button, the sign-in gate, the lot — while the HTML still
#    renders and a screenshot still looks fine. A page that cannot parse must
#    not reach the docroot.
if command -v node >/dev/null 2>&1; then
  for html in "$REPO"/index.html "$REPO"/lab-old.html "$REPO"/stt.html "$REPO"/whisper-test.html "$REPO"/screens/index.html "$REPO"/preview/list.html; do
    [ -f "$html" ] || continue
    node -e '
      const fs = require("fs");
      const vm = require("vm");
      const src = fs.readFileSync(process.argv[1], "utf8");
      const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
      let n = 0;
      for (const [, js] of blocks) {
        if (!js.trim()) continue;
        n++;
        try { new vm.Script(js); }
        catch (e) { console.error("[deploy] SYNTAX ERROR in " + process.argv[1] + ": " + e.message); process.exit(1); }
      }
      console.log("[deploy] script ok: " + process.argv[1] + " (" + n + " inline block" + (n === 1 ? "" : "s") + ")");
    ' "$html" || { echo "[deploy] ABORTED — refusing to publish a page whose script does not parse." >&2; exit 1; }
  done
else
  echo "[deploy] WARNING: node not found, skipping the syntax gate" >&2
fi

# 0b. COMPANION CONFIG GATE. The Rho embed stays unconfigured (permanent
#     "warming up" placeholder) unless every shipping callsite sets
#     window.RHOBEAR_COMPANION BEFORE the embed script. The syntax gate above
#     proves the scripts parse; this proves the config contract the live chat
#     depends on (both pages, parsed endpoint, real send path) — a page that
#     breaks the chat must not reach the docroot.
if command -v node >/dev/null 2>&1; then
  if ! node "$REPO/tests/companion-config.guard.js"; then
    echo "[deploy] ABORTED — refusing to publish pages whose Rho companion is not configured." >&2
    exit 1
  fi
else
  echo "[deploy] WARNING: node not found, skipping the companion config gate" >&2
fi

# 1. Directories this repo fully owns. --delete is safe here: nothing else lives in them.
for d in assets lessons mcp models preview screens vendor; do
  [ -d "$REPO/$d" ] || continue
  mkdir -p "$DOCROOT/$d"
  rsync -a --delete "$REPO/$d/" "$DOCROOT/$d/"
done

# 2. Loose root files we own by name. Copied, never --delete'd, so a file belonging to another
#    lane that happens to sit beside them is never collateral.
for f in api.js app.js companion-embed-orb4.js dictation.js harness-catalog.js hub-strive.js \
         hub-theme-toggle.js index.html lab-old.html lessons-catalog.json manifest.webmanifest \
         rho-orb-live.js sheet-artifact.js status stt.html styles.css sw.js whisper-stt.js \
         whisper-test.html icon-192.png icon-512.png icon-maskable-512.png; do
  [ -f "$REPO/$f" ] && cp -p "$REPO/$f" "$DOCROOT/$(basename "$f")"
done

# 3. index.html LAST, cache-stamped — so the new ?v only ever points at already-updated files.
#    Replaces any existing ?v= value (the historical hand-bumped date stamps) with the commit sha.
node -e '
  const fs = require("fs");
  const src = fs.readFileSync(process.argv[1], "utf8");
  const stamp = process.argv[2];
  const out = src.replace(/((?:src|href)=")([^"\s]+\.(?:js|css))(?:\?[^"]*)?(")/g, (m, pre, path, post) => {
    if (/^(https?:)?\/\//.test(path) || /^data:/.test(path) || path.startsWith("#")) return m;
    return pre + path + "?v=" + stamp + post;
  });
  fs.writeFileSync(process.argv[3], out);
' "$REPO/index.html" "$STAMP" "$DOCROOT/.index.html.new"
mv "$DOCROOT/.index.html.new" "$DOCROOT/index.html"

echo "[deploy] done — workbench.rhobear.ai now serving ?v=$STAMP"
