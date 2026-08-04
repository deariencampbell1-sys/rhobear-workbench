/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Goals

   Backed by Hermes kanban, the same store the Board reads:
     GET  /api/goal                  -> { ok, goals:[task] }   (goal_mode rows)
     POST /api/goal {title, body}    -> creates it in triage
     POST /api/goal/<id>/decompose   -> real child tasks on the Board
     POST /api/goal/<id>/complete    -> done
     POST /api/goal/<id>/archive     -> removed

   This used to persist to localStorage — per-browser, gone on a new device,
   and invisible to the crew that was supposed to be working toward it. The
   comment said "swap the two storage functions when the cloud endpoint ships".
   The engine was already installed; the board's write surface was just shut.

   Decompose is the reason this rides kanban instead of a list: a goal becomes
   real, dependency-aware child tasks by an engine that already knows how.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="goals"]');
  if (!screen) return;

  var goals = [];
  var loadFailed = false;

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: 'include' }, opts || {}))
      .then(function (r) {
        return r.json().catch(function () { return null; })
          .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      });
  }

  function render() {
    var listEl = screen.querySelector('[data-goals-list]');
    var countEl = screen.querySelector('[data-goal-count]');
    var emptyEl = screen.querySelector('[data-goals-empty]');

    if (loadFailed) {
      if (countEl) countEl.textContent = '—';
      if (listEl) {
        listEl.innerHTML = '<div class="muted" style="padding:18px 0;text-align:center;">' +
          'Couldn’t load your goals just now.</div>';
      }
      return;
    }

    if (countEl) countEl.textContent = goals.length + ' active';

    if (!goals.length) {
      if (listEl && emptyEl) listEl.innerHTML = emptyEl.outerHTML;
      return;
    }
    if (!listEl) return;

    listEl.innerHTML = goals.map(function (g) {
      var done = g.status === 'done';
      var canDecompose = g.status === 'triage';
      return '\
        <div class="hub-card s-goals__row" data-goal-id="' + esc(g.id) + '">\
          <div class="between">\
            <div style="min-width:0">\
              <strong>' + esc(g.title) + '</strong>\
              ' + (g.body ? '<p class="muted" style="margin:4px 0 0">' + esc(g.body) + '</p>' : '') + '\
              <div class="mono" style="font-size:0.7rem;opacity:0.6;margin-top:4px">' +
                esc(g.id) + ' · ' + esc(g.status || '') +
              '</div>\
            </div>\
            <div class="row gap-sm">\
              ' + (canDecompose
                    ? '<button class="hub-btn-ghost" data-goal-decompose type="button">Break into tasks</button>'
                    : '') + '\
              ' + (done
                    ? ''
                    : '<button class="hub-btn-ghost" data-goal-complete type="button">Mark done</button>') + '\
              <button class="hub-btn-ghost" data-goal-archive type="button">Remove</button>\
            </div>\
          </div>\
        </div>';
    }).join('');
  }

  function load() {
    return api('/api/goal').then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) { loadFailed = true; render(); return; }
      loadFailed = false;
      goals = r.data.goals || [];
      render();
    }).catch(function () { loadFailed = true; render(); });
  }

  /* ── create ───────────────────────────────────────────────────────── */
  var newBtn = screen.querySelector('[data-goal-new]');
  if (newBtn) newBtn.addEventListener('click', function () {
    var title = window.prompt('What outcome is the crew working toward?');
    if (!title || !title.trim()) return;
    newBtn.disabled = true;
    api('/api/goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() })
    }).then(function (r) {
      newBtn.disabled = false;
      if (!r.ok || !r.data || !r.data.ok) {
        window.alert('Could not create that goal: ' + ((r.data && r.data.error) || r.status));
        return;
      }
      load();
    }).catch(function () { newBtn.disabled = false; });
  });

  /* ── verbs ────────────────────────────────────────────────────────── */
  function act(btn, id, verb, label) {
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = label || '…';
    api('/api/goal/' + encodeURIComponent(id) + '/' + verb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) {
      if (!r.ok || !r.data || r.data.ok === false) {
        // The engine refuses some moves for real reasons (a goal must sit in
        // triage to be decomposed) — show its reason, don't invent one.
        btn.textContent = (r.data && r.data.error) ? String(r.data.error).slice(0, 40) : 'Failed';
        setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 3000);
        return;
      }
      load();
    }).catch(function () {
      btn.textContent = 'Failed';
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 2500);
    });
  }

  screen.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('[data-goal-id]');
    if (!row) return;
    var id = row.getAttribute('data-goal-id');
    if (e.target.closest('[data-goal-decompose]')) {
      return act(e.target.closest('button'), id, 'decompose', 'Breaking down…');
    }
    if (e.target.closest('[data-goal-complete]')) {
      return act(e.target.closest('button'), id, 'complete');
    }
    if (e.target.closest('[data-goal-archive]')) {
      return act(e.target.closest('button'), id, 'archive');
    }
  });

  load();
  /* Refresh whenever Goals is opened — see app.js activateScreen. */
  document.addEventListener('hub:screen', function (e) {
    if (e.detail && e.detail.name === 'goals') load();
  });
})();
