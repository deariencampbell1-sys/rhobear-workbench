# Deploying RHOBEAR Workbench web — SOURCE OF TRUTH

**This repo is the single source of truth for the static Builds web app served at
builds.rhobear.ai.** `workbench.rhobear.ai` redirects here. The live docroot on `rhobear-vps` is
`/var/www/rhobear-builds-web` (served static by Caddy). It is NOT a git repo.

## The rule
- **Never hand-edit the docroot.** Hand edits silently drift and get reverted by the next
  deploy — the same failure this arrangement exists to prevent. Edit here → commit → deploy.
  That is the only path.

## Deploy
Deploy home on the box: `/home/slang/rhobear-workbench-web`.
```bash
ssh rhobear-vps 'cd /home/slang/rhobear-workbench-web && git pull && ./deploy.sh'
```
`deploy.sh` runs on the box and does a **targeted** sync of the whole docroot this repo owns —
`assets/**`, `lessons/`, `mcp/**`, `models/**`, `preview/**`, `screens/**`, `vendor/**`, and the
loose root files. `--delete` is scoped to the directories this repo fully owns, so nothing outside
the managed scope is ever removed. There is **no build step**; the app is plain ES modules + CSS,
so "build" == the sync.

## Cache busting — automatic, do NOT hand-bump
Browsers/edge cache `css/js` by full URL. `deploy.sh` stamps every local `.js`/`.css` ref in
`index.html` with `?v=<commit-sha>` at deploy time (index.html itself is served no-cache),
**replacing** any `?v=` value it finds — the historical hand-bumped `?v=<date>` stamps are
obsolete and get overwritten. A new commit ⇒ a new sha ⇒ a guaranteed cache miss.

## Line endings
The import commit is a **byte-faithful snapshot of the served docroot**, which carries CRLF line
endings (an artifact of how the files reached the server). Do NOT add `eol=lf` or `text=auto`
attributes to this repo — that would make the next deploy rewrite the served files' bytes and
break byte-identity with the server. `.gitattributes` marks binary types only.

## Backend (not managed here)
Auth for builds.rhobear.ai is `hermes-router` + Caddy (separate service and source). The
`status` file at the docroot root is a static status JSON, not service-written.
