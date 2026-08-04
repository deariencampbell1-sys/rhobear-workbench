/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Daily Brief
   Real data, computed from HubAPI.jobs() + HubAPI.sessions.list() — not a
   mock feed. "Overnight" = finished work since local midnight. "Needs you"
   = failed jobs + sessions with no crew reply yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="brief"]');
  if (!screen) return;

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    return Math.floor(hrs / 24) + 'd ago';
  }

  function load() {
    if (typeof HubAPI === 'undefined') return;

    var dateEl = screen.querySelector('[data-brief-date]');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    var midnight = new Date(); midnight.setHours(0, 0, 0, 0);

    Promise.all([
      HubAPI.jobs ? HubAPI.jobs() : Promise.resolve({ ok: false }),
      HubAPI.sessions && HubAPI.sessions.list ? HubAPI.sessions.list() : Promise.resolve({ ok: false })
    ]).then(function (results) {
      var jobsRes = results[0], sessRes = results[1];
      var jobs = (jobsRes.ok && jobsRes.data && (jobsRes.data.jobs || jobsRes.data)) || [];
      var sessions = (sessRes.ok && sessRes.data && (sessRes.data.sessions || sessRes.data)) || [];
      if (!Array.isArray(jobs)) jobs = [];
      if (!Array.isArray(sessions)) sessions = [];

      var overnight = jobs.filter(function (j) {
        var ts = j.finished_at || j.completed_at || j.updated_at || j.created_at;
        return ts && new Date(typeof ts === 'number' ? ts * 1000 : ts) >= midnight && (j.status === 'done' || j.status === 'completed');
      });
      var needsYou = jobs.filter(function (j) { return j.status === 'failed' || j.status === 'error' || j.status === 'blocked'; })
        .concat(sessions.filter(function (s) { return s.needs_input || s.status === 'awaiting_input'; }));

      var overEl = screen.querySelector('[data-brief-overnight]');
      if (overEl) {
        overEl.innerHTML = overnight.length
          ? overnight.slice(0, 6).map(function (j) {
              return '<div class="s-brief__row"><span>' + esc(j.title || j.goal || j.name || 'Task') + '</span>' +
                     '<span class="muted mono" style="font-size:0.76rem">' + esc(timeAgo(j.finished_at || j.completed_at || j.updated_at)) + '</span></div>';
            }).join('')
          : '<p class="muted">Nothing finished overnight yet.</p>';
      }
      var needEl = screen.querySelector('[data-brief-needsyou]');
      if (needEl) {
        needEl.innerHTML = needsYou.length
          ? needsYou.slice(0, 6).map(function (j) {
              return '<div class="s-brief__row"><span>' + esc(j.title || j.goal || j.name || 'Item') + '</span>' +
                     '<span class="chip chip--danger" style="font-size:0.72rem">' + esc(j.status || 'needs input') + '</span></div>';
            }).join('')
          : '<p class="muted">Nothing is waiting on you.</p>';
      }
    });
  }

  var refresh = screen.querySelector('[data-brief-refresh]');
  if (refresh) refresh.addEventListener('click', load);

  load();
})();
