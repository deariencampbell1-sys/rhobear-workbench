#!/usr/bin/env node
/* RHOBEAR Hub — plan-ladder rendering test (settings screen, screens/billing.js).
 *
 * The pricing ladder used to die outright: the live catalog carries no per-plan
 * allowances, so the router serves `null` for the three entitlement fields and
 * renderLadder() dereferenced them unconditionally — `null.toLocaleString()`
 * threw inside the `.map()` callback and emptied the whole ladder (no tiers,
 * no buy buttons, nothing). This file pins the fixes:
 *
 *   1. all-null entitlements render every rung and never throw,
 *   2. `0` is declined exactly like `null` — "0 runs/mo" is a figure checkout
 *      would not honour (the router's _meta_int normalizes "the catalog does
 *      not say" to null; a stated-but-zero figure is declined here too),
 *   3. stated allowances still print, and
 *   4. 'basic' sits at the bottom of the order list, so lower rungs read
 *      Switch rather than Upgrade.
 *
 * Network is never hit: fetch is stubbed per endpoint.
 *
 * Run: node --test test/   (from repo root; needs `npm install` for jsdom)
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('jsdom is not installed — run `npm install` from the repo root first.');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const BILLING_JS = fs.readFileSync(path.join(ROOT, 'screens', 'billing.js'), 'utf8');

/* Entitlement shape matching what the router serves: the three allowance
   fields are present-and-null on the live catalog, ints on the retired one. */
function tier(name, label, cents, extra) {
  return Object.assign({
    priceId: 'price_' + name, tier: name, label: label,
    amountCents: cents, currency: 'USD', interval: 'month',
    includedRuns: null, includedStorageGb: null, bundledReviews: null,
    trialDays: 0
  }, extra || {});
}

/* The live catalog shape this surface is served: five rungs, no stated
   allowances anywhere. */
const LIVE_LADDER = {
  ok: true,
  tiers: [
    tier('basic', 'RHOBEAR Basic', 2900),
    tier('starter', 'RHOBEAR Starter', 4900),
    tier('pro', 'RHOBEAR Pro', 7900),
    tier('business', 'RHOBEAR Business', 19900),
    tier('enterprise', 'RHOBEAR Enterprise', 49900)
  ],
  credits: { priceId: 'price_pack', amountCents: 1000, currency: 'USD',
             label: 'Credit pack', credits: 330, creditsPerUsd: 33 }
};

/* A catalog edited to state a zero allowance must render nothing for it. */
const ZERO_LADDER = {
  ok: true,
  tiers: [tier('pro', 'RHOBEAR Pro', 7900,
               { includedRuns: 0, includedStorageGb: 0, bundledReviews: 0 })],
  credits: null
};

/* Per-field independence: a stated allowance prints, a zeroed sibling does not. */
const MIXED_LADDER = {
  ok: true,
  tiers: [tier('pro', 'RHOBEAR Pro', 7900,
               { includedRuns: 0, includedStorageGb: 50, bundledReviews: 0 })],
  credits: null
};

/* The retired metadata catalog still carries full entitlement figures. */
const OLD_LADDER = {
  ok: true,
  tiers: [
    tier('starter', 'Starter', 1700,
         { includedRuns: 500, includedStorageGb: 10, bundledReviews: 25, trialDays: 14 })
  ],
  credits: null
};

const SHELL = `<!doctype html><html><body>
  <div data-screen="settings">
    <div data-plan-ladder></div>
  </div>
</body></html>`;

/* Mount screens/billing.js against stubbed endpoints and let load() settle. */
async function mount(plansResponse, subscription) {
  const dom = new JSDOM(SHELL, { url: 'https://workbench.rhobear.ai/', runScripts: 'outside-only' });
  const win = dom.window;

  const ROUTES = {
    '/api/billing/plans': plansResponse,
    '/api/credits/summary': null,
    '/api/credits/usage': null,
    '/api/billing/subscription': subscription || null,
    '/api/me': null
  };

  win.fetch = function (url) {
    const key = Object.keys(ROUTES).find((r) => String(url).startsWith(r));
    const body = key ? ROUTES[key] : null;
    // plans answering ok:false is a 503 on the wire; everything else is a 200.
    const httpOk = !(key === '/api/billing/plans' && body && body.ok === false);
    return Promise.resolve({
      ok: httpOk, status: httpOk ? 200 : 503,
      json: () => Promise.resolve(body)
    });
  };

  win.eval(BILLING_JS);

  const host = win.document.querySelector('[data-plan-ladder]');
  for (let i = 0; i < 50 && host.innerHTML === ''; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
  return { win, host, text: host.textContent, html: host.innerHTML };
}

describe('plan ladder — the live catalog with no stated allowances', () => {
  test('renders a tile per rung instead of a blank panel', async () => {
    const { html } = await mount(LIVE_LADDER);
    assert.notEqual(html, '', 'the pricing panel rendered blank');
    assert.equal((html.match(/s-settings__plan-tile/g) || []).length, 5);
  });

  test('a null allowance does not throw and empty the ladder', async () => {
    const { html } = await mount(LIVE_LADDER);
    assert.ok(html.includes('RHOBEAR Enterprise'),
      'render threw partway: reading .toLocaleString() off null');
  });

  test('no literal "null" in the rendered HTML', async () => {
    const { html } = await mount(LIVE_LADDER);
    assert.ok(!html.includes('null'), 'stringified a null entitlement');
  });

  test('no literal "undefined" in the rendered HTML', async () => {
    const { html } = await mount(LIVE_LADDER);
    assert.ok(!html.includes('undefined'));
  });

  test('absent entitlements print nothing, never "0 runs/mo"', async () => {
    const { text } = await mount(LIVE_LADDER);
    assert.ok(!/\b0 runs\/mo/.test(text), 'quoted an allowance the catalog does not state');
    assert.ok(!/\b0 GB storage/.test(text));
    assert.ok(!/\b0 Reviews\/mo/.test(text));
  });

  test('prices render from the server, not from a hardcoded table', async () => {
    const { text } = await mount(LIVE_LADDER);
    for (const p of ['$29', '$49', '$79', '$199', '$499']) assert.ok(text.includes(p), p);
  });
});

describe('plan ladder — a stated zero is declined like null', () => {
  /* The guard is `typeof === 'number' && > 0`: the router normalizes "the
     catalog does not say" to null, and if the catalog ever states 0
     directly, this surface must still not quote a figure checkout would
     not honour. */
  test('zero entitlements print nothing', async () => {
    const { text } = await mount(ZERO_LADDER);
    assert.ok(!/\b0 runs\/mo/.test(text));
    assert.ok(!/\b0 GB storage/.test(text));
    assert.ok(!/\b0 Reviews\/mo/.test(text));
    assert.ok(!text.includes('null'), 'stringified a zero entitlement');
    assert.ok(text.includes('RHOBEAR Pro'), 'the tile itself must still render');
  });

  test('declining a zero does not silence a stated sibling', async () => {
    const { text } = await mount(MIXED_LADDER);
    assert.ok(text.includes('50 GB storage'), 'stated allowance must print');
    assert.ok(!/\b0 runs\/mo/.test(text));
    assert.ok(!/\b0 Reviews\/mo/.test(text));
  });
});

describe('plan ladder — stated allowances still print', () => {
  test('the retired catalog renders its own figures', async () => {
    const { text } = await mount(OLD_LADDER);
    assert.ok(text.includes('500 runs/mo'));
    assert.ok(text.includes('10 GB storage'));
    assert.ok(text.includes('25 Reviews/mo'));
  });

  test('a trial offer still surfaces', async () => {
    const { text } = await mount(OLD_LADDER);
    assert.ok(text.includes('14-day trial'));
  });
});

describe('plan ladder — rung order', () => {
  test('rungs below the current plan say Switch, above say Upgrade', async () => {
    const { html } = await mount(LIVE_LADDER, { tier: 'pro', status: 'active' });
    const verb = (t) => {
      const seg = html.split('data-buy-tier="' + t + '"')[1] || '';
      return seg.slice(0, 60);
    };
    assert.ok(verb('basic').includes('Switch'),
      "'basic' must read Switch — it is missing from the order list");
    assert.ok(verb('starter').includes('Switch'));
    assert.ok(verb('business').includes('Upgrade'));
    assert.ok(verb('enterprise').includes('Upgrade'));
  });

  test('the current plan is shown as current and cannot be re-bought', async () => {
    const { html } = await mount(LIVE_LADDER, { tier: 'pro', status: 'active' });
    assert.ok(html.includes('Current plan'));
    assert.ok(!html.includes('data-buy-tier="pro"'), 'current plan must not be buyable');
  });
});

describe('plan ladder — the honest failure', () => {
  test('ok:false renders the "could not load prices" copy', async () => {
    const { text } = await mount({ ok: false, error: 'no plan tiers matched in the stripe catalog' });
    assert.match(text, /load current prices/i);
  });

  test('the failure state never invents a price', async () => {
    const { text } = await mount({ ok: false, error: 'stripe 500' });
    assert.ok(!/\$\d/.test(text), 'quoted a figure on the failure path');
  });

  test('zero tiers must not reach this screen as ok:true', async () => {
    /* If the router ever regresses to ok:true with an empty ladder, this is
       a blank panel — assert the shape is recognisably broken. */
    const { html } = await mount({ ok: true, tiers: [], credits: null });
    assert.equal(html, '', 'ok:true + zero tiers still renders blank — fix belongs in the router');
  });
});
