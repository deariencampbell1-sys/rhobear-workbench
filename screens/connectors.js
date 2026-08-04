/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Connectors screen controller
   Connected external services. Renders the REAL external-connector subset
   of /mcp/catalog (GitHub, Slack, Notion, Linear, Stripe, Telegram, Google
   Drive, Figma — the services a crew actually connects to, not low-level
   dev tools). Enable/disable state is persisted in localStorage; there is
   no cloud "connect this service" endpoint yet, so Enable is an honest
   local preference, not a fake OAuth.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="connectors"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Emoji glyph per known connector id — keeps the existing card look
     without inventing new CSS classes (partner owns the styling). */
  var GLYPH = {
    github: '🐙', slack: '💬', notion: '📝', linear: '📐',
    stripe: '💳', telegram: '✈️', 'google-drive': '📁', figma: '🎨'
  };
  function glyph(id) { return GLYPH[id] || '🔗'; }

  /* ── DOM refs (all exist in the section markup) ──────────────────── */
  var grid = screen.querySelector('[data-connectors-grid]');
  var count = screen.querySelector('[data-connector-count]');
  var addBtn = screen.querySelector('[data-connector-add]');
  var empty = screen.querySelector('[data-connectors-empty]');

  /* ── localStorage enable/disable state ────────────────────────────── */
  var STORAGE_KEY = 'hub.connectors.enabled';

  function readEnabled() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeEnabled(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (e) {}
  }

  /* ── Filter the catalog down to external-service connectors ─────────
     RHOBEAR fleet entries (source==='rhobear') and low-level dev tools
     (filesystem, git, sqlite, etc.) are MCPs, not connectors. */
  var DEV_TOOL_IDS = [
    'filesystem', 'git', 'sqlite', 'postgres', 'memory',
    'puppeteer', 'fetch', 'brave-search'
  ];
  var CONNECTOR_CATS = ['productivity', 'messaging', 'finance', 'docs', 'design'];

  function isConnector(e) {
    if (!e || !e.id) return false;
    if (DEV_TOOL_IDS.indexOf(e.id) >= 0) return false;
    if (e.source === 'rhobear') return false;
    var cats = ((e.categories || []).join(',')).toLowerCase();
    return CONNECTOR_CATS.some(function (c) { return cats.indexOf(c) >= 0; });
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  function renderConnectors(connectors, enabled) {
    if (!grid) return;
    var hasRows = connectors.length > 0;

    if (empty) empty.style.display = hasRows ? 'none' : '';
    if (count) {
      var connected = Object.keys(enabled).filter(function (k) { return enabled[k]; }).length;
      count.textContent = connected + (connected === 1 ? ' connected' : ' connected');
    }

    if (!hasRows) { grid.innerHTML = ''; return; }

    grid.innerHTML = connectors.map(function (c) {
      var on = !!enabled[c.id];
      return '\
        <div class="s-connectors__card" data-connector-id="' + esc(c.id) + '">\
          <span class="logo" style="display:grid;place-items:center;font-size:1rem">' +
            esc(glyph(c.id)) +
          '</span>\
          <span style="flex:1;min-width:0">\
            <span style="display:block;font-weight:500;color:var(--hub-text-primary)">' +
              esc(c.name || '') +
            '</span>\
            <span style="display:block;font-size:0.76rem;color:var(--hub-text-secondary)">' +
              esc(c.description || c.hint || '') +
            '</span>\
          </span>\
          <button class="hub-btn-ghost" data-connector-toggle="' + esc(c.id) + '" \
                  style="flex-shrink:0;font-size:0.72rem;padding:4px 10px" type="button">' +
            (on ? 'Disable' : 'Enable') +
          '</button>\
        </div>';
    }).join('');

    /* Wire toggle buttons (re-attached each render since grid.innerHTML
       replaces them) */
    grid.querySelectorAll('[data-connector-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-connector-toggle');
        var en = readEnabled();
        en[id] = !en[id];
        writeEnabled(en);
        renderConnectors(connectors, en);
      });
    });
  }

  /* ── Load the real catalog and filter to connectors ───────────────── */
  function loadConnectors() {
    fetch('/mcp/catalog', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad-status:' + res.status);
        return res.json();
      })
      .then(function (data) {
        var entries = (data && data.entries) || (Array.isArray(data) ? data : []);
        var connectors = entries.filter(isConnector);
        renderConnectors(connectors, readEnabled());
      })
      .catch(function () {
        /* Honest empty state — the markup's [data-connectors-empty] shows */
        renderConnectors([], readEnabled());
      });
  }

  /* ── Wire add-connector button ──────────────────────────────────────
     This used to say "Connector marketplace coming soon". The marketplace is
     the MCPs screen — it lists the live registry and installs through
     /api/mcp/install — so send them there instead of to a dead toast. */
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var nav = document.querySelector('[data-screen="mcps"]:not(section)');
      if (nav) { nav.click(); return; }
      flashToast('Open the MCPs screen to browse and install connectors');
    });
  }

  /* ── Toast helper ─────────────────────────────────────────────────── */
  var _toastTimer;
  function flashToast(msg, tone) {
    tone = tone || '';
    var t = document.getElementById('rhoToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rhoToast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    var borderColor = tone === 'error' ? 'var(--hub-offline)' : 'var(--hub-border)';
    t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:90;' +
      'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid ' + borderColor + ';' +
      'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.84rem;font-weight:600;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 24px rgba(42,143,168,0.3);opacity:0;transition:opacity 200ms ease;';
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  loadConnectors();
})();
