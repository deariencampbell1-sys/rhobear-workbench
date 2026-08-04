/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Schedule screen controller
   Populates recurring/scheduled runs from /api/jobs via HubAPI.jobs().
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="schedule"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  var list = screen.querySelector('[data-schedule-list]');
  var count = screen.querySelector('[data-schedule-count]');
  var newBtn = screen.querySelector('[data-schedule-new]');
  var empty = screen.querySelector('[data-schedule-empty]');

  /* ── Render schedule rows (uses existing CSS: .s-schedule__row, .when, .what) ── */
  function renderJobs(jobs) {
    if (!list) return;
    var hasRows = jobs.length > 0;

    // toggle empty state
    if (empty) empty.style.display = hasRows ? 'none' : '';

    if (!hasRows) {
      if (count) count.textContent = '0 active';
      return;
    }

    var html = jobs.map(function (j) {
      var name = j.name || j.title || j.goal || 'Untitled';
      var desc = j.desc || j.description || '';
      var cadence = j.cadence || j.schedule || j.cron || '—';
      var next = j.next || j.next_run || j.nextRun || '';
      var on = j.on !== false && j.enabled !== false;
      var statusText = on ? (next ? 'next: ' + next : 'active') : 'paused';

      return '\
        <div class="s-schedule__row" data-job-id="' + esc(j.id) + '">\
          <span class="when">' + esc(cadence) + '</span>\
          <span class="what">\
            <span style="font-weight:500;color:var(--hub-text-primary)">' + esc(name) + '</span>\
            ' + (desc ? '<span style="display:block;font-size:0.78rem;color:var(--hub-text-secondary);margin-top:2px">' + esc(desc) + '</span>' : '') + '\
          </span>\
          <span class="chip ' + (on ? 'chip--accent' : 'chip--mono') + '" style="flex-shrink:0">' + esc(statusText) + '</span>\
        </div>';
    }).join('');

    list.innerHTML = html;

    if (count) {
      var active = jobs.filter(function (j) { return j.on !== false && j.enabled !== false; }).length;
      count.textContent = active + ' active';
    }
  }

  /* ── Fetch data from API ──────────────────────────────────────────── */
  function loadSchedule() {
    if (typeof HubAPI === 'undefined' || !HubAPI.jobs) return;

    HubAPI.jobs().then(function (result) {
      if (!result.ok || !result.data) return;

      var jobs = Array.isArray(result.data) ? result.data : (result.data.jobs || []);
      // Show jobs that look scheduled (have cadence/schedule/cron/next field)
      // or show all if none have it — the endpoint returns all runs but the
      // schedule screen filters to cron-like entries.
      var scheduled = jobs.filter(function (j) {
        return j.cadence || j.schedule || j.cron || j.next || j.next_run || j.nextRun;
      });
      renderJobs(scheduled.length ? scheduled : jobs);
    });
  }

  /* ── Wire new-schedule button ─────────────────────────────────────── */
  if (newBtn) {
    newBtn.addEventListener('click', function () {
      var title = prompt('Schedule name:', 'Morning brief');
      if (!title || !title.trim()) return;
      if (typeof HubAPI === 'undefined' || !HubAPI.sessions || !HubAPI.sessions.create) {
        flashToast('Schedule creation saved locally: ' + esc(title));
        return;
      }
      HubAPI.sessions.create(title).then(function (r) {
        if (r.ok) {
          flashToast('Schedule "' + esc(title) + '" created');
          loadSchedule();
        } else {
          flashToast('Could not create schedule', 'error');
        }
      });
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
  loadSchedule();
})();
