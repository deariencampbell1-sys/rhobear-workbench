/* ════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Settings screen
   IIFE scoped to [data-screen="settings"]. Owns:
     1. sub-nav active state + pane swap
     2. toggle switches (aria-pressed + is-on)
     3. load REAL account data from /api/me
     4. theme toggle that persists server-side via PATCH /api/me
     5. identity save / discard
   ════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.querySelector('[data-screen="settings"]');
  if (!root) return;

  /* ── cached account data for discard/restore ───────────────────── */
  var _me = null;  // raw data from /api/me

  /* ── Section meta ──────────────────────────────────────────────── */
  var META = {
    identity:      { title: "Identity",       sub: "How your workspace shows up across RHOBEAR.", chip: "workspace" },
    plan:          { title: "Plan",           sub: "Subscription, usage and upgrades.",           chip: "billing"   },
    models:        { title: "Models",         sub: "Default model for new runs.",                 chip: "models"    },
    appearance:    { title: "Appearance",      sub: "Theme and display preferences.",             chip: "display"   },
    crew:          { title: "Crew defaults",  sub: "How Rho recruits and runs your crew.",        chip: "crew"      },
    notifications: { title: "Notifications",  sub: "What RHOBEAR pings you about, and where.",    chip: "alerts"    },
    apikeys:       { title: "Model key",      sub: "Run on our key, or bring your own.",          chip: "secrets"   },
    billing:       { title: "Billing",        sub: "Payment method and invoices.",                chip: "billing"   }
  };

  var subitems   = Array.from(root.querySelectorAll('[data-settings-tab]'));
  var titleEl    = root.querySelector('[data-settings-pane-title]');
  var subEl      = root.querySelector('[data-settings-pane-sub]');
  var chipEl     = root.querySelector('[data-settings-pane-chip]');
  var sections   = Array.from(root.querySelectorAll('[data-settings-section]'));

  function activate(tab) {
    if (!META[tab]) return;
    subitems.forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.settingsTab === tab); });
    titleEl.textContent = META[tab].title;
    subEl.textContent   = META[tab].sub;
    chipEl.textContent  = META[tab].chip;
    sections.forEach(function (sec) {
      var match = sec.dataset.settingsSection === tab;
      if (match) {
        sec.hidden = false;
        sec.style.animation = 'none';
        void sec.offsetWidth;
        sec.style.animation = '';
      } else {
        sec.hidden = true;
      }
    });
  }

  subitems.forEach(function (btn) {
    btn.addEventListener('click', function () { activate(btn.dataset.settingsTab); });
  });

  /* ── find a form field by its <span class="s-settings__label"> text ── */
  function findField(labelText) {
    var labels = root.querySelectorAll('.s-settings__label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.trim() === labelText) {
        var field = labels[i].closest('.s-settings__field');
        if (!field) return null;
        return field.querySelector('input, select');
      }
    }
    return null;
  }

  /* ── Populate identity fields from account data ────────────────── */
  function populateIdentity(me) {
    var nameEl   = findField('Full name');
    var emailEl   = findField('Email');
    var wsEl     = findField('Workspace name');
    var dispEl   = findField('Display name');
    if (nameEl)  nameEl.value   = me.name || '';
    if (emailEl) emailEl.value   = me.email || '';
    if (wsEl)    wsEl.value     = me.workspaceName || me.name || '';
    if (dispEl)  dispEl.value   = me.displayName || me.name || '';

    // Avatar initials
    var avatar = root.querySelector('.s-settings__avatar');
    if (avatar) avatar.textContent = (me.name || me.email || '?').charAt(0).toUpperCase();
  }

  /* Plan, credits and billing moved to screens/billing.js — it reads the live
     Stripe ladder instead of a hardcoded price map, and it owns the same
     elements this used to write. Two writers on one panel is how a screen ends
     up quoting two different prices. */

  /* ── Theme ─────────────────────────────────────────────────────── */
  function applyTheme(theme) {
    var isDark = theme !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? '' : 'light');
    var toggle = root.querySelector('[data-settings-toggle="theme"]');
    if (toggle) {
      toggle.classList.toggle('is-on', isDark);
      toggle.setAttribute('aria-pressed', String(isDark));
    }
  }

  function getCurrentTheme() {
    var toggle = root.querySelector('[data-settings-toggle="theme"]');
    if (!toggle) return 'dark';
    // is-on = dark (default), off = light
    return toggle.classList.contains('is-on') ? 'dark' : 'light';
  }

  /* ── Save identity fields ──────────────────────────────────────── */
  function saveIdentity() {
    if (typeof HubAPI === 'undefined' || !HubAPI.settings || !HubAPI.settings.save) return;

    var nameEl  = findField('Full name');
    var wsEl    = findField('Workspace name');
    var dispEl  = findField('Display name');

    var body = {};
    if (nameEl)  body.name          = nameEl.value.trim();
    if (wsEl)    body.workspaceName = wsEl.value.trim();
    if (dispEl)  body.displayName   = dispEl.value.trim();

    // Include current theme
    body.settings = { theme: getCurrentTheme() };

    HubAPI.settings.save(body).then(function (result) {
      if (result.ok) {
        flashNotice('Changes saved');
        // Re-load account data to keep _me fresh
        loadMe();
      } else {
        flashNotice('Save failed' + (result.status ? ' (HTTP ' + result.status + ')' : ''));
      }
    });
  }

  /* ── Discard identity changes (revert to _me) ──────────────────── */
  function discardIdentity() {
    if (!_me) return;
    var nameEl  = findField('Full name');
    var wsEl    = findField('Workspace name');
    var dispEl  = findField('Display name');
    if (nameEl)  nameEl.value   = _me.name || '';
    if (wsEl)    wsEl.value     = _me.workspaceName || _me.name || '';
    if (dispEl)  dispEl.value   = _me.displayName || _me.name || '';
    flashNotice('Changes discarded');
  }

  /* ── Load /api/me ──────────────────────────────────────────────── */
  function loadMe() {
    if (typeof HubAPI === 'undefined' || !HubAPI.me) return;
    HubAPI.me().then(function (result) {
      if (result.ok && result.data) {
        _me = result.data;
        populateIdentity(_me);

        // Apply theme from server-side settings
        var theme = (_me.settings && _me.settings.theme) || 'dark';
        applyTheme(theme);
      }
    });
  }

  /* ── Toast helper (reuse flashRho pattern from app.js) ─────────── */
  var _toastTimer;
  function flashNotice(msg) {
    var t = document.getElementById('rhoToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rhoToast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:90;' +
      'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid var(--hub-border);' +
      'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.84rem;font-weight:600;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 24px rgba(42,143,168,0.3);opacity:0;transition:opacity 200ms ease;';
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ── Wire buttons ──────────────────────────────────────────────── */

  // Save changes button in identity section
  var saveBtn = root.querySelector('.s-settings__section[data-settings-section="identity"] .hub-btn-primary');
  if (saveBtn) saveBtn.addEventListener('click', saveIdentity);

  // Discard button in identity section (footer area)
  var discardBtn = root.querySelector('.s-settings__section[data-settings-section="identity"] .s-settings__footer .hub-btn-ghost');
  if (discardBtn) discardBtn.addEventListener('click', discardIdentity);

  // Theme toggle: toggle CSS data-theme + persist server-side
  var themeToggle = root.querySelector('[data-settings-toggle="theme"]');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var onNow = themeToggle.classList.contains('is-on');
      var newTheme = onNow ? 'light' : 'dark';
      applyTheme(newTheme);

      // Persist server-side
      if (typeof HubAPI !== 'undefined' && HubAPI.settings && HubAPI.settings.save) {
        HubAPI.settings.save({ settings: { theme: newTheme } }).then(function (result) {
          if (result.ok) {
            flashNotice('Theme saved');
            loadMe();
          } else {
            flashNotice('Theme save failed');
            // Rollback on failure
            applyTheme(onNow ? 'dark' : 'light');
          }
        });
      }
    });
  }

  /* ── Model key — GET /api/keys/active, POST /api/keys/byo ────────────
     Both routes have been live on cw-api since the spine went in and no
     screen ever called them. What this section used to show instead was two
     invented keys with Copy / Revoke buttons wired to nothing.

     The secret is write-only by design: /keys/active returns the MODE and the
     cap, never the key, and /keys/byo answers { ok: true } without echoing
     what it stored. So this reads the vault's state and offers to replace it —
     it can never show a key, and it never tries. */
  var keyModeEl   = root.querySelector('[data-key-mode]');
  var keySubEl    = root.querySelector('[data-key-sub]');
  var keyForm     = root.querySelector('[data-key-form]');
  var keyOpenBtn  = root.querySelector('[data-key-form-open]');
  var keyCancel   = root.querySelector('[data-key-form-cancel]');
  var keyMsg      = root.querySelector('[data-key-msg]');
  var keySaveBtn  = root.querySelector('[data-key-save]');

  var KEY_HINT = 'Checked against OpenRouter before it is stored, and encrypted ' +
                 'at rest. It is never shown again — not here, not anywhere.';

  function renderKeyStatus(data) {
    if (!keyModeEl || !keySubEl) return;
    var mode = data && data.mode;
    var cap = data && data.monthlyCapUsd;

    if (mode === 'byo') {
      keyModeEl.textContent = 'Your own key';
      keySubEl.textContent = 'Runs go through the OpenRouter key you supplied. ' +
                             'Your bill, not your RHOBEAR credits.';
      if (keyOpenBtn) keyOpenBtn.textContent = 'Replace key';
    } else if (mode === 'managed') {
      keyModeEl.textContent = 'RHOBEAR key';
      keySubEl.textContent = 'Runs go through our key and cost credits' +
                             (cap ? ' — capped at $' + cap + ' a month.' : '.');
      if (keyOpenBtn) keyOpenBtn.textContent = 'Use my own key';
    } else {
      keyModeEl.textContent = 'No key yet';
      keySubEl.textContent = 'Add your own OpenRouter key, or pick a plan and run on ours.';
      if (keyOpenBtn) keyOpenBtn.textContent = 'Use my own key';
    }
  }

  function loadKeyStatus() {
    if (!keyModeEl) return;
    fetch('/api/keys/active', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(renderKeyStatus)
      .catch(function () {
        keyModeEl.textContent = 'Key vault unreachable';
        keySubEl.textContent = 'Could not read your key setting just now.';
      });
  }

  if (keyOpenBtn && keyForm) {
    keyOpenBtn.addEventListener('click', function () {
      keyForm.hidden = false;
      if (keyMsg) keyMsg.textContent = KEY_HINT;
      var input = keyForm.querySelector('input[name="key"]');
      if (input) { input.value = ''; input.focus(); }
    });
  }
  if (keyCancel && keyForm) {
    keyCancel.addEventListener('click', function () { keyForm.hidden = true; });
  }

  if (keyForm) {
    keyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = keyForm.querySelector('input[name="key"]');
      var value = input ? input.value.trim() : '';
      if (!value) { if (keyMsg) keyMsg.textContent = 'Paste a key first.'; return; }

      if (keySaveBtn) { keySaveBtn.disabled = true; keySaveBtn.textContent = 'Checking…'; }
      if (keyMsg) keyMsg.textContent = 'Validating against OpenRouter…';

      fetch('/api/keys/byo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: value })
      })
        .then(function (res) {
          return res.json().catch(function () { return null; })
            .then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (r.ok) {
            // The field held a secret; empty it before anything else.
            if (input) input.value = '';
            keyForm.hidden = true;
            flashNotice('Key saved');
            loadKeyStatus();
            return;
          }
          // Say what the server said — it names the actual problem (rejected by
          // OpenRouter / vault unavailable), and guessing would be worse.
          if (keyMsg) keyMsg.textContent = (r.data && r.data.error) || 'Could not save that key.';
        })
        .catch(function () {
          if (keyMsg) keyMsg.textContent = 'Could not reach the key vault.';
        })
        .then(function () {
          if (keySaveBtn) { keySaveBtn.disabled = false; keySaveBtn.textContent = 'Save key'; }
        });
    });
  }

  /* ── Load data on init ─────────────────────────────────────────── */
  loadMe();
  loadKeyStatus();

  /* ── Toggles: click flips is-on + aria-pressed (for non-theme toggles) ──── */
  root.querySelectorAll('[data-settings-toggle]:not([data-settings-toggle="theme"])').forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var on = toggle.classList.toggle('is-on');
      toggle.setAttribute('aria-pressed', String(on));
      // These crew/notif toggles are local-only for now — no server endpoint
    });
  });

  /* initial state is identity (matches .is-active in markup) */
  activate('identity');
})();
