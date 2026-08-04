/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — AIOS screen controller
   Agent-OS layer: harness roster + stations. Roster is the SAME source of
   truth as the Work picker — window.HubCatalog (Core · Summit · Peak house
   lineup + Claude + Open) — so the two can never drift.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="aios"]');
  if (!screen) return;

  /* ── Harness roster — from HubCatalog (one source of truth). Fallback to
     the house lineup if the catalog script didn't load. ────────────────── */
  var HARNESSES = (window.HubCatalog && HubCatalog.harnesses) || [
    {
      id: 'house',
      label: 'House',
      tagline: 'RHOBEAR house lineup — Core · Summit · Peak',
      models: [
        { model: 'core',   label: 'Core',   note: 'everyday' },
        { model: 'summit', label: 'Summit', note: 'speedy' },
        { model: 'peak',   label: 'Peak',   note: 'top · think:high' },
      ],
    },
  ];

  /* ── Stations (from the reference stations-data pattern) ──────────── */
  var STATIONS = [
    { id: 'foreman',     label: 'Foreman',     mode: 'orchestrate', status: 'idle' },
    { id: 'researcher',  label: 'Researcher',  mode: 'scan',        status: 'idle' },
    { id: 'writer',      label: 'Writer',      mode: 'compose',     status: 'idle' },
    { id: 'coder',       label: 'Coder',       mode: 'build',       status: 'idle' },
    { id: 'reviewer',    label: 'Reviewer',    mode: 'audit',       status: 'idle' },
    { id: 'analyst',     label: 'Analyst',     mode: 'analyze',     status: 'idle' },
    { id: 'designer',    label: 'Designer',    mode: 'design',      status: 'idle' },
    { id: 'operator',    label: 'Operator',    mode: 'watch',       status: 'idle' },
    { id: 'librarian',   label: 'Librarian',   mode: 'index',       status: 'idle' },
  ];

  /* ── Active harness state (persisted in localStorage) ─────────────── */
  var STORAGE_KEY = 'hub.aios.activeHarness';

  function readActive() {
    try { return localStorage.getItem(STORAGE_KEY) || 'house'; } catch (e) { return 'house'; }
  }
  function writeActive(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  var harnessList = screen.querySelector('[data-harness-list]');
  var stationList = screen.querySelector('[data-station-list]');
  var harnessCount = screen.querySelector('[data-aios-harness-count]');
  var harnessAddBtn = screen.querySelector('[data-harness-add]');
  var emptyState = screen.querySelector('[data-aios-empty]');

  /* ── Render harness cards (uses existing CSS: .s-aios__harness, .is-active) ── */
  function renderHarnesses(activeId) {
    if (!harnessList) return;
    if (harnessCount) harnessCount.textContent = HARNESSES.length + ' harnesses';

    harnessList.innerHTML = HARNESSES.map(function (h) {
      var isActive = h.id === activeId;
      var modelTags = h.models.map(function (m) {
        return '<span class="chip chip--mono" style="font-size:0.72rem;padding:2px 8px">' + esc(m.label) + '</span>';
      }).join(' ');

      return '\
        <div class="s-aios__harness' + (isActive ? ' is-active' : '') + '" data-harness-id="' + esc(h.id) + '">\
          <span style="flex:1;min-width:0">\
            <span style="display:block;font-weight:600;color:var(--hub-text-primary)">' + esc(h.label) + '</span>\
            <span style="display:block;font-size:0.76rem;color:var(--hub-text-secondary);margin:2px 0 4px">' + esc(h.tagline) + '</span>\
            <span style="display:flex;flex-wrap:wrap;gap:4px">' + modelTags + '</span>\
          </span>\
          <span style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">\
            <span class="chip ' + (isActive ? 'chip--accent' : 'chip--mono') + '" style="font-size:0.72rem">\
              ' + (isActive ? 'Active' : 'Standby') + '\
            </span>\
            ' + (isActive ? '' : '<button class="hub-btn-ghost" data-harness-switch="' + esc(h.id) + '" style="font-size:0.72rem;padding:3px 10px" type="button">Switch</button>') + '\
          </span>\
        </div>';
    }).join('');

    // Wire switch buttons
    harnessList.querySelectorAll('[data-harness-switch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-harness-switch');
        writeActive(id);
        renderHarnesses(id);
        flashToast('Switched to ' + (HARNESSES.find(function (h) { return h.id === id; }) || {}).label || id);
      });
    });
  }

  /* ── Render stations ──────────────────────────────────────────────── */
  function renderStations() {
    if (!stationList) return;
    if (emptyState) emptyState.style.display = 'none';

    stationList.innerHTML = STATIONS.map(function (s) {
      return '\
        <div class="s-aios__station" data-station-id="' + esc(s.id) + '" \
             style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--hub-border);border-radius:9px;background:var(--hub-glass-bg-2)">\
          <span style="font-size:1.2rem;flex-shrink:0">🛰️</span>\
          <span style="flex:1;min-width:0">\
            <span style="display:block;font-weight:500;color:var(--hub-text-primary)">' + esc(s.label) + '</span>\
            <span style="display:block;font-size:0.76rem;color:var(--hub-text-secondary)">' + esc(s.mode) + '</span>\
          </span>\
          <span class="chip chip--mono" style="font-size:0.72rem">' + esc(s.status) + '</span>\
        </div>';
    }).join('');
  }

  /* ── Wire add-harness button ──────────────────────────────────────── */
  if (harnessAddBtn) {
    harnessAddBtn.addEventListener('click', function () {
      flashToast('Custom harnesses coming soon — the roster is fixed in this build');
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
  renderHarnesses(readActive());
  renderStations();
})();
