/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Board screen controller
   Fetches real kanban data from /api/board via HubAPI.board().
   Groups tasks into Todo / In Progress / Done columns.
   Replaces static mock cards with live data. Falls back gracefully.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="board"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    var diff = Date.now() - date.getTime();
    if (diff < 0) return '';
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function formatTokens(n) {
    if (n === undefined || n === null) return null;
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /* ── Column config: API status → column ──────────────────────────── */
  var COLS = [
    { statuses: ['todo', 'triage', 'ready'], type: 'todo', label: 'queued' },
    { statuses: ['running', 'in_progress', 'review', 'blocked'], type: 'prog', label: 'running' },
    { statuses: ['done'], type: 'done', label: 'done' },
  ];

  /* ── Render ────────────────────────────────────────────────────────
     Returning silently on failure left the demo cards from the markup in the
     columns, where they read as real tasks. Empty the columns and say so. */
  function renderUnavailable() {
    screen.querySelectorAll('.s-board__col').forEach(function (colEl) {
      var stack = colEl.querySelector('.stack');
      if (stack) {
        stack.innerHTML = '<div class="muted" style="padding:14px 0;text-align:center;">' +
          'Couldn’t load the board.</div>';
      }
      var countBadge = colEl.querySelector('.hub-card__head .chip--mono');
      if (countBadge) countBadge.textContent = '—';
    });
  }

  function loadBoard() {
    if (typeof HubAPI === 'undefined' || !HubAPI.board) { renderUnavailable(); return; }

    HubAPI.board().then(function (result) {
      if (!result || !result.ok || !result.data) { renderUnavailable(); return; }

      var tasks = result.data.tasks || [];
      var colEls = screen.querySelectorAll('.s-board__col');
      if (!colEls.length) return;

      COLS.forEach(function (colDef, idx) {
        var colEl = colEls[idx];
        if (!colEl) return;

        var colTasks = tasks.filter(function (t) {
          return colDef.statuses.indexOf(t.status) >= 0;
        });

        // Update count badge
        var countBadge = colEl.querySelector('.hub-card__head .chip--mono');
        if (countBadge) countBadge.textContent = String(colTasks.length);

        // Render cards into stack
        var stack = colEl.querySelector('.stack');
        if (!stack) return;

        if (colTasks.length === 0) {
          stack.innerHTML = '<div class="muted" style="padding:24px 0;text-align:center;font-size:0.85rem;">No tasks</div>';
          return;
        }

        stack.innerHTML = colTasks.map(function (task) {
          var specialist = task.specialist || task.assigned_to || task.agent || '';
          var tokens = formatTokens(task.tokens || task.total_tokens);
          var ago = timeAgo(task.created_at || task.updated_at);
          var extraClass = '';
          var progressBar = '';
          var checkIcon = '';
          var metaPrefix = colDef.label;

          if (colDef.type === 'prog') {
            extraClass = ' s-board__card--active';
            var pct = task.progress || task.percentage || 0;
            if (pct > 0) {
              progressBar = '<div class="s-board__bar"><span style="width:' + Math.round(pct) + '%"></span></div>';
            }
          } else if (colDef.type === 'done') {
            extraClass = ' s-board__card--done';
            checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg> ';
          }

          /* Verbs the engine actually has. Kanban is a lifecycle, not a
             drag-anywhere grid: triage → promote → ready → complete, plus
             block/archive. Offering a free-form status drop would be inventing
             a model the store does not support. */
          var actions = colDef.type === 'done'
            ? '<button class="hub-btn-ghost s-board__act" type="button" data-task-archive>Remove</button>'
            : (task.status === 'triage'
                ? '<button class="hub-btn-ghost s-board__act" type="button" data-task-promote>Promote</button>' +
                  '<button class="hub-btn-ghost s-board__act" type="button" data-task-complete>Done</button>'
                : '<button class="hub-btn-ghost s-board__act" type="button" data-task-complete>Done</button>');

          return '\
            <article class="s-board__card' + extraClass + '" data-task-id="' + esc(task.id) + '">\
              <h4>' + esc(task.title || task.goal || task.name || '') + '</h4>\
              <div class="between">\
                ' + (specialist ? '<span class="chip chip--mono">' + esc(specialist) + '</span>' : '<span></span>') + '\
                ' + (tokens !== null ? '<div class="s-board__coin"><span class="coin-num">' + tokens + '</span><span class="coin-lbl">tok</span></div>' : '') + '\
              </div>\
              ' + progressBar + '\
              <div class="s-board__meta mono">' + checkIcon + esc(metaPrefix) + (ago ? ' · ' + esc(ago) : '') + '</div>\
              <div class="row gap-sm" style="margin-top:8px">' + actions + '</div>\
            </article>';
        }).join('');
      });
    }).catch(renderUnavailable);
  }

  /* ── writes ─────────────────────────────────────────────────────────
     The board used to be display-only because the router refused every
     non-GET with "read-only in wave 1". It writes through Hermes kanban now,
     tenant-scoped server-side. */
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return null; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    });
  }

  function act(btn, id, verb) {
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    post('/api/board/task/' + encodeURIComponent(id) + '/' + verb).then(function (r) {
      if (!r.ok || !r.data || r.data.ok === false) {
        btn.textContent = (r.data && r.data.error) ? String(r.data.error).slice(0, 28) : 'Failed';
        setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 2800);
        return;
      }
      loadBoard();
    }).catch(function () {
      btn.textContent = 'Failed';
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 2500);
    });
  }

  screen.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('[data-task-id]');
    if (card) {
      var id = card.getAttribute('data-task-id');
      if (e.target.closest('[data-task-complete]')) return act(e.target.closest('button'), id, 'complete');
      if (e.target.closest('[data-task-promote]')) return act(e.target.closest('button'), id, 'promote');
      if (e.target.closest('[data-task-archive]')) return act(e.target.closest('button'), id, 'archive');
      return;
    }
    // "New task" in the page head — present in the markup, never wired.
    var newBtn = e.target.closest('.page-head__row .hub-btn-primary');
    if (!newBtn) return;
    var title = window.prompt('What needs doing?');
    if (!title || !title.trim()) return;
    newBtn.disabled = true;
    post('/api/board/task', { title: title.trim() }).then(function (r) {
      newBtn.disabled = false;
      if (!r.ok || !r.data || !r.data.ok) {
        window.alert('Could not create that task: ' + ((r.data && r.data.error) || r.status));
        return;
      }
      loadBoard();
    }).catch(function () { newBtn.disabled = false; });
  });

  loadBoard();
  /* Refresh whenever the Board is opened — see app.js activateScreen. */
  document.addEventListener('hub:screen', function (e) {
    if (e.detail && e.detail.name === 'board') loadBoard();
  });
})();
