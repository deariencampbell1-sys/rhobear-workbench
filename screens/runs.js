/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Runs screen controller
   Fetches real runs from /api/jobs via HubAPI.jobs().
   Replaces static mock rows with live data. Filter pills toggle by status.
   Falls back gracefully on API failure (static content remains).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="runs"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDuration(d) {
    if (d === undefined || d === null) return '';
    if (typeof d === 'string') return d;
    var totalSec = Math.round(d);
    if (totalSec <= 0) return '';
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec % 60;
    return mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's';
  }

  function formatTokens(n) {
    if (n === undefined || n === null) return '';
    return Number(n).toLocaleString();
  }

  function statusChip(s) {
    if (s === 'running' || s === 'in_progress') return 'chip--accent';
    if (s === 'failed' || s === 'error' || s === 'cancelled') return 'chip--offline';
    return 'chip--online';
  }

  function statusLabel(s) {
    if (s === 'running' || s === 'in_progress') return 'Running';
    if (s === 'failed' || s === 'error') return 'Failed';
    if (s === 'cancelled') return 'Cancelled';
    return 'Done';
  }

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  var tbody = screen.querySelector('.s-runs__table tbody');
  var summary = screen.querySelector('.s-runs__summary');
  var pills = screen.querySelectorAll('.s-runs__filters .hub-filter-pill');
  var activeFilter = 'all';

  /* ── Render table rows from API data ──────────────────────────────── */
  function renderRows(jobs) {
    if (!tbody) return;
    tbody.innerHTML = jobs.map(function (j) {
      var s = j.status || 'completed';
      return '\
        <tr class="s-runs__tr" data-status="' + esc(s) + '">\
          <td class="s-runs__td s-runs__td--task">' + esc(j.title || j.goal || j.name || '') + '</td>\
          <td class="s-runs__td s-runs__td--mono">' + esc(j.model || '—') + '</td>\
          <td class="s-runs__td"><span class="chip chip--mono">' + esc(j.specialist || j.agent || '—') + '</span></td>\
          <td class="s-runs__td s-runs__td--num s-runs__td--mono">' + formatTokens(j.tokens) + '</td>\
          <td class="s-runs__td s-runs__td--num s-runs__td--mono">' + (j.cost !== undefined && j.cost !== null ? '$' + Number(j.cost).toFixed(2) : '') + '</td>\
          <td class="s-runs__td s-runs__td--mono">' + formatDuration(j.duration) + '</td>\
          <td class="s-runs__td"><span class="chip ' + statusChip(s) + '"><span class="dot"></span>' + statusLabel(s) + '</span></td>\
        </tr>';
    }).join('');

    // Re-apply active filter after DOM replacement
    applyFilter(activeFilter);
  }

  /* ── Update summary footer ────────────────────────────────────────── */
  function updateSummary(jobs) {
    if (!summary) return;
    var total = jobs.length;
    var totalTokens = 0;
    var totalCost = 0;
    var totalDurationSec = 0;

    jobs.forEach(function (j) {
      totalTokens += j.tokens || 0;
      totalCost += j.cost || 0;
      var dur = j.duration;
      if (typeof dur === 'number') totalDurationSec += dur;
    });

    var items = summary.querySelectorAll('.s-runs__summary-item');
    if (items.length >= 1) items[0].innerHTML = '<strong>' + total + '</strong> runs';
    if (items.length >= 2) {
      var tokStr = totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : totalTokens.toLocaleString();
      items[1].innerHTML = '<strong>' + tokStr + '</strong> tokens';
    }
    if (items.length >= 3) items[2].innerHTML = '<strong>$' + totalCost.toFixed(2) + '</strong>';
    if (items.length >= 4) items[3].innerHTML = '<strong>' + formatDuration(totalDurationSec) + '</strong>';
  }

  /* ── Fetch data from API ────────────────────────────────────────────
     A bare `return` on failure used to leave the demo rows that ship in the
     markup sitting in the table, where they read as the user's real run
     history — complete with invented costs and durations. Say it failed
     instead. */
  function renderUnavailable() {
    if (tbody) {
      tbody.innerHTML = '<div class="muted" style="padding:20px 0;text-align:center;">' +
        'Couldn’t load your runs just now.</div>';
    }
  }

  function loadRuns() {
    if (typeof HubAPI === 'undefined' || !HubAPI.jobs) { renderUnavailable(); return; }

    HubAPI.jobs().then(function (result) {
      if (!result || !result.ok || !result.data) { renderUnavailable(); return; }

      var jobs = Array.isArray(result.data) ? result.data : (result.data.jobs || []);
      renderRows(jobs);
      updateSummary(jobs);
    }).catch(renderUnavailable);
  }

  /* ── Filter pills ─────────────────────────────────────────────────── */
  function applyFilter(filter) {
    if (!tbody) return;
    var rows = tbody.querySelectorAll('.s-runs__tr');
    var visible = 0;
    rows.forEach(function (row) {
      var status = row.getAttribute('data-status');
      var show = filter === 'all' || status === filter;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (summary) summary.style.opacity = visible === 0 ? '0.5' : '1';
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      activeFilter = pill.getAttribute('data-s-runs-filter') || 'all';
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      applyFilter(activeFilter);
    });
  });

  /* ── Load on DOM ready (defer guarantees DOM is parsed) ───────────── */
  loadRuns();
})();
