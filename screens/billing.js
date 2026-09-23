/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Plan, credits and billing

   Every number here is read from the server. Prices come from
   /api/billing/plans, which reads them out of Stripe — the only system that
   knows what we actually charge. Nothing on this screen is allowed to quote
   a figure the checkout would not honour.

   WHY THIS FILE EXISTS. The whole buy path was missing. cw-api has had
   /stripe/checkout/tier, /stripe/checkout/payg and /stripe/card-setup the
   entire time; not one line of the Hub called any of them. Meanwhile the
   router meters every chat turn and blocks at zero with "You're out of
   credits. Top up to keep the crew working." — pointing at /billing, which
   was not a route. A customer could be stopped from working and have no
   door out. That is the bug this closes.

   Endpoints used, all live before this file was written:
     GET  /api/billing/plans        live ladder + credit pack (router → Stripe)
     GET  /api/credits/summary      balance + included runs + renewal
     GET  /api/credits/usage        5h / week / month rolling meters
     GET  /api/billing/subscription tier + status + period end
     POST /api/stripe/checkout/tier    → Stripe Checkout url
     POST /api/stripe/checkout/payg    → Stripe Checkout url (credit pack)
     POST /api/stripe/card-setup       → $0 card authorization
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.querySelector('[data-screen="settings"]');
  if (!root) return;

  var state = { plans: null, summary: null, usage: null, sub: null, me: null, loaded: false };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function money(cents, currency) {
    if (typeof cents !== 'number') return '';
    var v = cents / 100;
    var s = v % 1 === 0 ? String(v) : v.toFixed(2);
    return (currency === 'USD' || !currency ? '$' : '') + s;
  }

  function get(path) {
    return fetch(path, { credentials: 'include' }).then(function (r) {
      return r.json().catch(function () { return null; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }

  function post(path, body) {
    return fetch(path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return null; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }

  /* Every checkout route answers with a Stripe-hosted url. Send them there
     rather than collecting card details ourselves. */
  function goToCheckout(res, btn, original) {
    var url = res.data && (res.data.url || res.data.checkoutUrl);
    if (res.ok && url) { window.location.href = url; return; }
    var why = (res.data && (res.data.error || res.data.message)) || ('checkout ' + res.status);
    btn.disabled = false;
    btn.textContent = String(why).slice(0, 40);
    setTimeout(function () { btn.textContent = original; }, 3500);
  }

  function buy(btn, path, body) {
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Opening checkout…';
    post(path, body).then(function (res) { goToCheckout(res, btn, original); })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Could not reach checkout';
        setTimeout(function () { btn.textContent = original; }, 3500);
      });
  }

  /* ── current plan header ─────────────────────────────────────────── */
  function renderHeader() {
    var nameEl = root.querySelector('.s-settings__plan-name');
    var priceEl = root.querySelector('.s-settings__plan-price');
    var actions = root.querySelector('[data-billing-actions]');
    if (!nameEl || !priceEl) return;

    var tier = state.sub && state.sub.tier ? String(state.sub.tier).toLowerCase() : 'none';
    var status = state.sub && state.sub.status;
    var plan = findPlan(tier);

    nameEl.textContent = plan ? plan.label : (tier === 'none' || !tier ? 'No plan' : tier);

    var bits = [];
    if (plan) bits.push(money(plan.amountCents, plan.currency) + '/' + plan.interval);
    if (status && status !== 'active') bits.push(status);
    if (state.summary && state.summary.renewsAt) {
      try { bits.push('renews ' + new Date(state.summary.renewsAt).toLocaleDateString()); }
      catch (e) { /* leave it out rather than print an Invalid Date */ }
    }
    priceEl.textContent = bits.length ? bits.join(' · ')
      : (tier === 'none' ? 'No subscription — free door, card-verified gift only' : '');

    if (actions) {
      actions.innerHTML = '<button class="hub-btn-ghost" type="button" data-billing-manage>Manage billing</button>';
    }
  }

  function findPlan(tier) {
    if (!state.plans || !state.plans.tiers) return null;
    for (var i = 0; i < state.plans.tiers.length; i++) {
      if (state.plans.tiers[i].tier === tier) return state.plans.tiers[i];
    }
    return null;
  }

  /* ── credits + the meters the router actually enforces ───────────── */
  function renderCredits() {
    var balEl = root.querySelector('[data-credits-balance]');
    var subEl = root.querySelector('[data-credits-sub]');
    var meters = root.querySelector('[data-credits-meters]');
    var note = root.querySelector('[data-credits-note]');
    var topup = root.querySelector('[data-credits-topup]');

    if (balEl) {
      balEl.textContent = state.summary && typeof state.summary.runsRemaining === 'number'
        ? String(state.summary.runsRemaining) : '—';
    }
    if (subEl) {
      subEl.textContent = state.summary && state.summary.runsRemaining === 1
        ? 'credit left' : 'credits left';
    }

    var pack = state.plans && state.plans.credits;
    if (topup) {
      topup.hidden = !pack;
      if (pack) topup.textContent = 'Top up — ' + pack.credits + ' credits for ' + money(pack.amountCents, pack.currency);
    }

    if (meters) {
      var w = state.usage && state.usage.windows;
      if (!w) { meters.innerHTML = ''; }
      else {
        var rows = [
          { label: 'This month', d: w.month },
          { label: 'Last 5 hours', d: w['5h'] },
          { label: 'This week', d: w.week }
        ];
        meters.innerHTML = rows.map(function (r) {
          if (!r.d) return '';
          var pct = r.d.cap > 0 ? Math.min(100, Math.round((r.d.used / r.d.cap) * 100)) : 0;
          return '<div class="s-settings__usage-row">' +
            '<div class="between mb8"><span class="s-settings__label">' + esc(r.label) + '</span>' +
            '<span class="mono muted">' + r.d.used + ' / ' + r.d.cap + '</span></div>' +
            '<div class="s-settings__bar"><div class="s-settings__bar-fill" style="width:' + pct + '%"></div></div>' +
            '</div>';
        }).join('');
      }
    }

    if (note) {
      /* Say what a credit IS. It is the product's pricing idea and the reason
         the meter does not mention tokens. */
      var pieces = ['One credit is one run — a chat turn, a build, a diagram. Never a token count.'];
      if (state.usage && state.usage.windows && state.usage.windows['5h']) {
        pieces.push('The 5-hour and weekly meters are burst limits on top of the monthly allowance; ' +
                    'whichever fills first pauses new runs until it rolls off.');
      }
      note.textContent = pieces.join(' ');
    }
  }

  /* ── the ladder ──────────────────────────────────────────────────── */
  function renderLadder() {
    var host = root.querySelector('[data-plan-ladder]');
    if (!host) return;

    if (!state.plans) {
      host.innerHTML = '<p class="muted">Couldn’t load current prices just now — nothing is quoted rather than guessing at one.</p>';
      return;
    }

    var current = state.sub && state.sub.tier ? String(state.sub.tier).toLowerCase() : 'none';
    /* Keep in step with TIER_ORDER in rhobear-workbench-router:hermes-router.py.
       'basic' is the bottom rung of the ladder that replaced
       starter/pro/business/enterprise; a tier missing from this list indexes to
       -1, so it renders 'Upgrade' where it means 'Switch' and vice versa. */
    var order = ['basic', 'starter', 'pro', 'business', 'enterprise'];
    var currentIdx = order.indexOf(current);

    host.innerHTML = state.plans.tiers.map(function (p) {
      var isCurrent = p.tier === current;
      var idx = order.indexOf(p.tier);
      var verb = isCurrent ? 'Current plan' : (currentIdx >= 0 && idx < currentIdx ? 'Switch' : 'Upgrade');
      /* Entitlements are optional: the live catalog carries no per-plan
         allowances, so these arrive as null — or as 0 if the catalog is
         ever edited to state one. Both read as "the server does not state
         this": 0 runs/mo is a figure checkout would not honour (the router
         normalizes "the catalog does not say" to null in _meta_int, and a
         stated-but-zero figure is declined here for the same reason), so
         print nothing rather than a false figure. Reading
         .toLocaleString() off null also threw here, which emptied the whole
         ladder. */
      var facts = [];
      if (typeof p.includedRuns === 'number' && p.includedRuns > 0) {
        facts.push(p.includedRuns.toLocaleString() + ' runs/mo');
      }
      if (typeof p.includedStorageGb === 'number' && p.includedStorageGb > 0) {
        facts.push(p.includedStorageGb + ' GB storage');
      }
      if (typeof p.bundledReviews === 'number' && p.bundledReviews > 0) {
        facts.push(p.bundledReviews + ' Reviews/mo');
      }
      return '<div class="hub-card s-settings__plan-tile' + (isCurrent ? ' is-current' : '') + '">' +
        '<div class="between wrap">' +
          '<div class="stack" style="gap:2px">' +
            '<span class="s-settings__label">' + esc(p.label) + '</span>' +
            '<span class="mono s-settings__tile-price">' + money(p.amountCents, p.currency) +
              '<span class="muted">/' + esc(p.interval) + '</span></span>' +
          '</div>' +
          (p.trialDays > 0 && !isCurrent
            ? '<span class="chip chip--accent chip--mono">' + p.trialDays + '-day trial</span>' : '') +
        '</div>' +
        '<p class="muted mt8" style="font-size:0.78rem">' + esc(facts.join(' · ')) + '</p>' +
        '<button class="' + (isCurrent ? 'hub-btn-ghost' : 'hub-btn-primary') + ' mt8" type="button"' +
          (isCurrent ? ' disabled' : ' data-buy-tier="' + esc(p.tier) + '"') + '>' + verb + '</button>' +
      '</div>';
    }).join('');
  }

  /* ── payment method ──────────────────────────────────────────────── */
  function renderCard() {
    var title = root.querySelector('[data-card-title]');
    var sub = root.querySelector('[data-card-sub]');
    var actions = root.querySelector('[data-card-actions]');
    if (!title || !sub || !actions) return;

    var billing = (state.me && state.me.billing) || {};
    var verified = !!billing.cardVerified;

    title.textContent = verified ? 'Card on file' : 'No card on file';
    sub.textContent = verified
      ? 'Used for your subscription and any credit top-ups.'
      : 'Adding a card authorizes $0 — it is not charged, and it opens the free-door credit gift.';

    actions.innerHTML = verified
      ? '<button class="hub-btn-ghost" type="button" data-billing-manage>Manage billing</button>'
      : '<button class="hub-btn-primary" type="button" data-card-add>Add a card</button>';
  }

  /* ── load ────────────────────────────────────────────────────────── */
  function load() {
    return Promise.all([
      get('/api/billing/plans'),
      get('/api/credits/summary'),
      get('/api/credits/usage'),
      get('/api/billing/subscription'),
      get('/api/me')
    ]).then(function (r) {
      state.plans = r[0].ok && r[0].data && r[0].data.ok ? r[0].data : null;
      state.summary = r[1].ok ? r[1].data : null;
      state.usage = r[2].ok ? r[2].data : null;
      state.sub = r[3].ok ? r[3].data : null;
      state.me = r[4].ok ? r[4].data : null;
      state.loaded = true;
      renderHeader(); renderCredits(); renderLadder(); renderCard();
    });
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  root.addEventListener('click', function (e) {
    var tierBtn = e.target.closest('[data-buy-tier]');
    if (tierBtn) {
      return buy(tierBtn, '/api/stripe/checkout/tier', { tier: tierBtn.getAttribute('data-buy-tier') });
    }
    if (e.target.closest('[data-credits-topup]')) {
      return buy(e.target.closest('button'), '/api/stripe/checkout/payg');
    }
    if (e.target.closest('[data-card-add]')) {
      return buy(e.target.closest('button'), '/api/stripe/card-setup');
    }
    if (e.target.closest('[data-billing-manage]')) {
      return buy(e.target.closest('button'), '/api/billing/portal');
    }
  });

  /* Stripe sends the customer back to /billing?status=… . That path serves
     this SPA, but nothing read the result, so a completed payment landed on
     Home with no acknowledgement at all. */
  function handleReturn() {
    var m = /[?&]status=([a-z_]+)/.exec(window.location.search);
    if (!m || window.location.pathname.indexOf('/billing') !== 0) return;
    var status = m[1];
    var MSG = {
      ok: 'Payment received — your plan and credits are updated.',
      cancel: 'Checkout cancelled. Nothing was charged.',
      card_ok: 'Card saved. It has not been charged.',
      card_cancel: 'Card setup cancelled.'
    };
    var nav = document.querySelector('[data-nav-item="settings"]');
    if (nav) nav.click();
    var tab = root.querySelector('[data-settings-tab="plan"]');
    if (tab) tab.click();
    if (MSG[status] && window.flashRho) window.flashRho(MSG[status]);
    else if (MSG[status]) {
      var t = document.createElement('div');
      t.textContent = MSG[status];
      t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:90;' +
        'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid var(--hub-border);' +
        'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.86rem;font-weight:600;';
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, 6000);
    }
    /* Drop the query so a refresh does not re-announce a payment. */
    try { history.replaceState({}, '', '/'); } catch (e) {}
  }

  load().then(handleReturn);
  document.addEventListener('hub:screen', function (e) {
    if (e.detail && e.detail.name === 'settings') load();
  });

  /* The router answers a spent-out chat turn with 402 + this shape. Give that
     message somewhere to go. */
  window.HubBilling = {
    reload: load,
    openPlan: function () {
      var nav = document.querySelector('[data-nav-item="settings"]');
      if (nav) nav.click();
      var tab = root.querySelector('[data-settings-tab="plan"]');
      if (tab) tab.click();
    }
  };
})();
