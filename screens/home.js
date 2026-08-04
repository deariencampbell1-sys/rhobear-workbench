/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — HOME screen behaviour.
   IIFE scoped to [data-screen="home"].
   Replaces mock data with real data from /api/jobs and /api/sessions.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var screen = document.querySelector('[data-screen="home"]');
  if (!screen) return;

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 1. Time-of-day greeting ───────────────────────────────────────── */
  (function updateGreeting() {
    var h = new Date().getHours();
    var part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    var span = screen.querySelector('.page-head h1 .accent');
    if (span) span.textContent = part;
  })();

  /* ── 2. Crew chip multi-select toggle (keep existing) ──────────────── */
  var crewChips = screen.querySelectorAll('.s-home__crew-chips .hub-filter-pill');
  crewChips.forEach(function (chip) {
    chip.addEventListener('click', function () { chip.classList.toggle('active'); });
  });

  /* ── 3. Data rendering ─────────────────────────────────────────────── */
  function renderJobs(raw) {
    // Normalise: /api/jobs may return { jobs: [...] } or [...] directly
    var jobs = Array.isArray(raw) ? raw : (raw && raw.jobs) || [];

    var inMotion = jobs.filter(function (j) {
      return j.status === 'running' || j.status === 'in_progress' || j.status === 'queued';
    });
    // sort newest-first defensively (API order is not guaranteed), then take latest 4
    var tval = function (j) { return Date.parse(j.created_at || j.createdAt || j.startedAt || j.started_at || j.ts || 0) || 0; };
    var recent = jobs.slice().sort(function (a, b) { return tval(b) - tval(a); }).slice(0, 4);

    // ── In motion ──────────────────────────────────────────────────
    var motionSection = screen.querySelector('.s-home__grid > .hub-card:first-child');
    var motionHead = motionSection && motionSection.querySelector('.chip--accent');
    if (motionHead) motionHead.textContent = String(inMotion.length);

    var motionStack = motionSection && motionSection.querySelector('.stack');
    if (motionStack) {
      motionStack.innerHTML = '';
      if (inMotion.length === 0) {
        motionStack.innerHTML = '<div class="muted" style="padding:16px 0;text-align:center;">' +
          'Nothing in motion right now.</div>';
      } else {
        inMotion.forEach(function (job) {
          var pct = job.progress || job.percentage || 0;
          var initial = (job.specialist || job.agent || '?').charAt(0).toUpperCase();
          var title = job.title || job.goal || job.name || 'Task';
          var el = document.createElement('div');
          el.className = 's-home__task';
          el.innerHTML = '\
            <div class="s-home__task-avatar">' + esc(initial) + '</div>\
            <div class="s-home__task-body grow">\
              <div class="between wrap">\
                <span class="s-home__task-title">' + esc(title) + '</span>\
                <span class="mono s-home__task-pct">' + Math.round(pct) + '%</span>\
              </div>\
              <div class="s-home__progress" role="progressbar" aria-valuemin="0"\
                   aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '">\
                <div class="s-home__progress-fill" data-pct="' + Math.round(pct) + '"\
                     style="width:' + Math.round(pct) + '%"></div>\
              </div>\
            </div>\
            <span class="chip chip--online"><span class="dot"></span>Running</span>';
          motionStack.appendChild(el);
        });
      }
    }

    // ── Recent runs ────────────────────────────────────────────────
    var runsSection = screen.querySelector('.s-home__grid > .hub-card:last-child');
    var runsStack = runsSection && runsSection.querySelector('.stack');
    if (runsStack) {
      runsStack.innerHTML = '';
      if (recent.length === 0) {
        runsStack.innerHTML = '<div class="muted" style="padding:16px 0;text-align:center;">' +
          'No runs yet. Give the crew a task above.</div>';
      } else {
        recent.forEach(function (job) {
          var status = job.status || 'completed';
          var statusClass = status === 'failed' || status === 'error'
            ? 'chip--offline' : 'chip--online';
          var statusLabel = status === 'failed' ? 'Failed'
            : status === 'running' || status === 'in_progress' ? 'Running'
            : 'Done';
          var initial = (job.specialist || job.agent || '?').charAt(0).toUpperCase();
          var title = job.title || job.goal || job.name || 'Task';

          var meta = '';
          if (job.duration) meta += job.duration;
          if (job.cost !== undefined && job.cost !== null) {
            meta += (meta ? ' · ' : '') + '$' + Number(job.cost).toFixed(2);
          }

          var el = document.createElement('div');
          el.className = 's-home__run';
          el.innerHTML = '\
            <span class="s-home__run-title grow">' + esc(title) + '</span>\
            <span class="chip chip--mono">' + esc(initial) + '</span>\
            <span class="mono s-home__run-meta">' + esc(meta) + '</span>\
            <span class="chip ' + statusClass + '"><span class="dot"></span>' + statusLabel + '</span>';
          runsStack.appendChild(el);
        });
      }
    }

    // ── Subtitle ───────────────────────────────────────────────────
    var sub = screen.querySelector('.page-head .sub');
    if (sub) {
      sub.textContent = jobs.length + ' runs recorded. ' + inMotion.length + ' still in motion.';
    }
  }

  /* ── 4. Load data ──────────────────────────────────────────────────── */
  /* On failure this used to "leave existing HTML as-is (graceful mock
     fallback)" — which meant the hardcoded demo tasks and runs baked into the
     markup stayed on screen and read as the user's real work. A dashboard that
     shows invented runs when the API is down is worse than one that says it
     could not load. Render an honest failure instead. */
  function renderUnavailable() {
    var msg = '<div class="muted" style="padding:16px 0;text-align:center;">' +
      'Couldn’t load your runs just now.</div>';
    var motionStack = screen.querySelector('.s-home__motion .stack') ||
                      screen.querySelector('.s-home__motion');
    if (motionStack) motionStack.innerHTML = msg;
    var runsSection = screen.querySelector('.s-home__grid > .hub-card:last-child');
    var runsStack = runsSection && runsSection.querySelector('.stack');
    if (runsStack) runsStack.innerHTML = msg;
    var sub = screen.querySelector('.page-head .sub');
    if (sub) sub.textContent = 'Runs unavailable right now.';
  }

  function loadData() {
    if (typeof HubAPI === 'undefined' || !HubAPI.jobs) { renderUnavailable(); return; }
    HubAPI.jobs().then(function (result) {
      if (result && result.ok && result.data) renderJobs(result.data);
      else renderUnavailable();
    }).catch(renderUnavailable);
  }
  loadData();

  /* ── 5. Run crew — create session with the prompt ───────────────────── */
  var runBtn = screen.querySelector('[data-action="run-crew"]');
  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var textarea = screen.querySelector('#s-home-prompt-input');
      var goal = (textarea && textarea.value.trim()) || '';
      if (!goal) { if (textarea) textarea.focus(); return; }

      if (typeof HubAPI !== 'undefined' && HubAPI.sessions) {
        HubAPI.sessions.create(goal).then(function (result) {
          if (result.ok) {
            // Navigate to Work screen to show the session
            var workNav = document.querySelector('[data-nav-item="work"]');
            if (workNav && typeof workNav.click === 'function') workNav.click();
          }
        });
      }
    });
  }

  /* ── 6. View all runs — navigate to runs screen ─────────────────────── */
  var viewRunsBtn = screen.querySelector('[data-action="view-runs"]');
  if (viewRunsBtn) {
    viewRunsBtn.addEventListener('click', function () {
      var navItem = document.querySelector('.hub-nav__item[data-nav-item="runs"]')
                || document.querySelector('[data-tab="runs"]');
      if (navItem && typeof navItem.click === 'function') navItem.click();
    });
  }
})();
