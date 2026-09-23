# test/

JSDOM-based tests for screens/billing.js — pinned to this repo so the billing-ladder
null-deref fix has CI coverage.

## Scope note

This test directory was added alongside `screens/billing.js` changes in PR #4.
The PR title/body mentions the billing screen fix; this directory provides the
regression tests that the review identified as missing.

## Run

```bash
npm install   # once, installs jsdom
npm run test
```

## Files

* billing-ladder.test.js — 15 assertions covering live catalog shapes,
  zero-entitlement handling, mixed entitlement fields, tier ordering, and
  failure modes.
