/* ══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — MCPs screen JS

   Renders the LIVE MCP registry from /api/mcp/list and installs/toggles
   through the real endpoints:
     GET  /api/mcp/list?category=&q=&limit=   -> { entries, total }
     GET  /api/mcp/installed                  -> { installed:[...] }
     POST /api/mcp/install    {mcpId}
     POST /api/mcp/uninstall  {mcpId}
     POST /api/mcp/toggle     {mcpId, enabled}

   This screen used to read a static 23-entry file from the docroot
   (/mcp/catalog) and said per-card connect "stays a local-workbench action —
   there is no cloud connect-MCP endpoint, and faking one would be dishonest."
   The endpoints above have been live on cw-api the whole time, and the old Hub
   called every one of them. The registry has 1,300+ servers in it; the screen
   was showing 23 of them and refusing to install any.

   The static file stays as the offline fallback, so a registry outage degrades
   to what this screen used to do instead of an empty page.

   IIFE scoped to [data-screen="mcps"]. Exposes nothing global.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="mcps"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initials(name) {
    if (!name) return '?';
    var p = String(name).trim().split(/\s+/);
    return ((p[0] && p[0][0]) || '').toUpperCase() +
           ((p[1] && p[1][0]) || '').toUpperCase() || '?';
  }

  /* ── State ────────────────────────────────────────────────────────── */
  var allEntries = [];
  var activeFilter = 'all';
  var liveRegistry = false;
  var RENDER_CAP = 60;   // 1,300+ cards at once locks the tab up

  var emptyCard = screen.querySelector('.s-mcps__empty-card');

  var grid = document.createElement('div');
  grid.className = 's-mcps__grid';
  grid.setAttribute('role', 'list');
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;';
  if (emptyCard && emptyCard.parentNode) {
    emptyCard.parentNode.insertBefore(grid, emptyCard);
  }

  /* A count line under the filter strip, so "60 of 1324" is honest about the
     cap rather than silently truncating. */
  var countLine = document.createElement('div');
  countLine.className = 'muted mono';
  countLine.style.cssText = 'font-size:0.74rem;margin:0 0 10px;';
  if (grid.parentNode) grid.parentNode.insertBefore(countLine, grid);

  /* ── Normalise both sources into one shape ─────────────────────────── */
  function fromApi(e) {
    return {
      id: e.id,
      name: e.title || e.id,
      description: e.summary || '',
      categories: e.category ? [e.category] : [],
      tags: [],
      transport: e.remoteUrl ? 'remote' : 'stdio',
      installed: !!e.installed,
      enabled: !!e.enabled,
      installs: e.installs || 0
    };
  }
  function fromStatic(e) {
    return {
      id: e.id,
      name: e.name || e.id,
      description: e.description || '',
      categories: e.categories || [],
      tags: e.tags || [],
      transport: e.transport || 'stdio',
      installed: !!e.on,
      enabled: !!e.on,
      installs: 0,
      accent: e.accent,
      source: e.source
    };
  }

  /* ── Filter logic ───────────────────────────────────────────────────
     The pills use friendlier labels than the registry's own categories
     ("AI & ML", "Web & Search", "Finance", …), so alias them before
     substring-matching against category + tags + name. */
  var CAT_ALIAS = {
    comms: 'messaging',
    code:  'develop',
    files: 'file',
    data:  'data',
    search: 'search'
  };
  function matchesCat(entry, cat) {
    if (cat === 'all' || !cat) return true;
    var needle = (CAT_ALIAS[cat] || cat).toLowerCase();
    var hay = (
      ((entry && entry.categories) || []).join(',') + ' ' +
      ((entry && entry.tags) || []).join(',') + ' ' +
      ((entry && entry.name) || '')
    ).toLowerCase();
    return hay.indexOf(needle) >= 0;
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  function render() {
    if (!allEntries.length) {
      grid.style.display = 'none';
      countLine.textContent = '';
      if (emptyCard) emptyCard.style.display = '';
      return;
    }

    var shown = allEntries.filter(function (e) { return matchesCat(e, activeFilter); });
    var total = shown.length;
    var capped = shown.slice(0, RENDER_CAP);

    if (emptyCard) emptyCard.style.display = 'none';
    grid.style.display = '';

    countLine.textContent = liveRegistry
      ? (total > capped.length
          ? 'Showing ' + capped.length + ' of ' + total + ' servers'
          : total + ' server' + (total === 1 ? '' : 's'))
      : 'Registry unreachable — showing the bundled list';

    if (!total) {
      grid.innerHTML =
        '<div style="padding:32px 16px;text-align:center;grid-column:1/-1;">' +
          '<div style="font-weight:600;margin-bottom:4px;color:var(--hub-text-primary)">' +
            'No MCPs in this category' +
          '</div>' +
          '<div class="muted" style="font-size:0.84rem;">Try a different filter.</div>' +
        '</div>';
      return;
    }

    grid.innerHTML = capped.map(function (e) {
      var accent = e.accent || 'var(--hub-accent-bright, #2A8FA8)';
      var cats = (e.categories && e.categories.length)
        ? e.categories.join(' · ')
        : (e.source || '');
      var onChip = e.installed && e.enabled
        ? '<span class="chip chip--accent"><span class="dot"></span>On</span>'
        : '';
      /* Actions only when the live registry answered — the bundled fallback
         has no install state to act on. */
      var actions = '';
      if (liveRegistry) {
        actions = e.installed
          ? '<button class="hub-btn-ghost" type="button" data-mcp-toggle>' +
              (e.enabled ? 'Disable' : 'Enable') + '</button>' +
            '<button class="hub-btn-ghost" type="button" data-mcp-uninstall>Remove</button>'
          : '<button class="hub-btn-ghost" type="button" data-mcp-install>Install</button>';
      }
      return '\
        <article class="hub-card" role="listitem" data-mcp-id="' + esc(e.id) + '">\
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">\
            <span style="display:grid;place-items:center;width:36px;height:36px;border-radius:8px;' +
              'background:' + esc(accent) + ';color:#0b1620;font-weight:700;font-size:0.8rem;flex-shrink:0;">' +
              esc(initials(e.name)) +
            '</span>\
            <div style="min-width:0;flex:1;">\
              <h3 style="margin:0;font-size:0.95rem;color:var(--hub-text-primary)">' +
                esc(e.name || '') +
              '</h3>\
              <span class="mono" style="font-size:0.7rem;color:var(--hub-text-secondary)">' +
                esc(cats) +
              '</span>\
            </div>\
          </div>\
          <p style="margin:0 0 10px;font-size:0.8rem;color:var(--hub-text-secondary);line-height:1.4">' +
            esc(e.description || '') +
          '</p>\
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">\
            <span class="chip chip--mono">' + esc(e.transport) + '</span>\
            ' + onChip + actions + '\
          </div>\
        </article>';
    }).join('');
  }

  /* ── Actions ──────────────────────────────────────────────────────── */
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return null; }); });
  }

  function entryById(id) {
    for (var i = 0; i < allEntries.length; i++) {
      if (allEntries[i].id === id) return allEntries[i];
    }
    return null;
  }

  function act(btn, id, kind) {
    var e = entryById(id);
    if (!e) return;
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';

    var req = kind === 'install'   ? post('/api/mcp/install',   { mcpId: id })
            : kind === 'uninstall' ? post('/api/mcp/uninstall', { mcpId: id })
            : post('/api/mcp/toggle', { mcpId: id, enabled: !e.enabled });

    req.then(function (d) {
      if (!d || d.ok === false) {
        btn.textContent = (d && d.error) ? String(d.error).slice(0, 24) : 'Failed';
        setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
        return;
      }
      if (kind === 'install')        { e.installed = true;  e.enabled = true; }
      else if (kind === 'uninstall') { e.installed = false; e.enabled = false; }
      else                           { e.enabled = !e.enabled; }
      render();
    }).catch(function () {
      btn.textContent = 'Failed';
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
    });
  }

  grid.addEventListener('click', function (ev) {
    var card = ev.target.closest('[data-mcp-id]');
    if (!card) return;
    var id = card.getAttribute('data-mcp-id');
    if (ev.target.closest('[data-mcp-install]'))   return act(ev.target.closest('button'), id, 'install');
    if (ev.target.closest('[data-mcp-uninstall]')) return act(ev.target.closest('button'), id, 'uninstall');
    if (ev.target.closest('[data-mcp-toggle]'))    return act(ev.target.closest('button'), id, 'toggle');
  });

  /* ── Load ─────────────────────────────────────────────────────────── */
  function loadStaticFallback() {
    return fetch('/mcp/catalog', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad-status:' + res.status);
        return res.json();
      })
      .then(function (data) {
        var entries = (data && data.entries) || (Array.isArray(data) ? data : []);
        liveRegistry = false;
        allEntries = entries.filter(function (e) { return e && e.id; }).map(fromStatic);
        render();
      })
      .catch(function () { allEntries = []; render(); });
  }

  fetch('/api/mcp/list?limit=500', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok || !d.entries || !d.entries.length) return loadStaticFallback();
      liveRegistry = true;
      allEntries = d.entries.filter(function (e) { return e && e.id; }).map(fromApi);
      render();
    })
    .catch(function () { return loadStaticFallback(); });

  /* ── Filter pills ─────────────────────────────────────────────────── */
  var pills = screen.querySelectorAll('.s-mcps__filters .hub-filter-pill');
  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-cat') || 'all';
      render();
    });
  });

  /* ── "Connect MCP" CTAs — jump to the catalog instead of a dead toast ── */
  function toCatalog() {
    var filters = screen.querySelector('.s-mcps__filters');
    if (filters && filters.scrollIntoView) {
      filters.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  screen.querySelectorAll('.s-mcps__connect').forEach(function (btn) {
    btn.addEventListener('click', toCatalog);
  });
  var emptyPrimary = screen.querySelector('.s-mcps__empty-actions .hub-btn-primary');
  if (emptyPrimary) emptyPrimary.addEventListener('click', toCatalog);
  var browseBtn = screen.querySelector('.s-mcps__empty-actions .hub-btn-ghost');
  if (browseBtn) browseBtn.addEventListener('click', toCatalog);
})();
