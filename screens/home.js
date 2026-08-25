/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — HOME screen behaviour.
   IIFE scoped to [data-screen="home"].
   Replaces mock data with real data from /api/jobs and /api/sessions.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var screen = document.querySelector('[data-screen="home"]');
  if (!screen) return;

  /* Builds is a stream workstation, not a generic crew dashboard. The old
     Home markup is retained for data compatibility, but the visible surface
     is rebuilt here so the composer has one stable bottom position and every
     entry point opens the real Work stream. */
  screen.classList.add('builds-home');
  var legacyGrid = screen.querySelector('.s-home__grid');
  var legacyRule = screen.querySelector('.section-rule');
  var legacyCrew = screen.querySelector('.s-home__crew-section');
  if (legacyGrid) legacyGrid.hidden = true;
  if (legacyRule) legacyRule.hidden = true;
  if (legacyCrew) legacyCrew.hidden = true;
  var pageHead = screen.querySelector('.page-head');
  if (pageHead) {
    pageHead.innerHTML = '<div class="builds-home__eyebrow">BUILDS HARNESS</div>' +
      '<div class="between builds-home__head-row"><div><h1>Start a build stream</h1>' +
      '<p class="sub">Pick a model, choose a harness, and keep every turn in one persistent stream.</p></div>' +
      '<div class="row builds-home__head-actions"><button class="hub-btn-ghost" type="button" data-open-build-streams>Open streams</button>' +
      '<button class="hub-btn-ghost" type="button" data-open-build-viewer>Open viewer</button></div></div>';
  }
  var prompt = screen.querySelector('.s-home__prompt');
  if (prompt) {
    prompt.className = 'hub-card builds-home__launcher';
    prompt.innerHTML = '<div class="between builds-home__launcher-head"><div><h2>New build stream</h2>' +
      '<p class="muted">Every turn stays in the stream rail.</p></div>' +
      '<div class="builds-home__mode" role="group" aria-label="Stream mode"><button class="is-active" type="button">Chat</button>' +
      '<button type="button" data-open-build-compare>Compare 2 models</button></div></div>' +
      '<label class="sr-only" for="s-home-prompt-input">Describe what the Builds crew should build</label>' +
      '<textarea id="s-home-prompt-input" class="builds-home__textarea" rows="3" placeholder="Describe what the Builds crew should build…"></textarea>' +
      '<div class="builds-home__controls"><div class="builds-home__selectors"><span class="muted">Harness</span>' +
      '<button class="builds-home__select" type="button" data-home-harness>✦ Hermes <span>⌄</span></button>' +
      '<span class="muted">Model</span><button class="builds-home__select" type="button" data-home-model>✦ Summit <span>⌄</span></button></div>' +
      '<button class="hub-btn-primary builds-home__send" type="button" data-action="run-crew">Open build stream <span aria-hidden="true">→</span></button></div>' +
      '<div class="builds-home__route"><div class="builds-home__route-head"><div><strong>MODEL ROUTE</strong><span class="muted">R3 tier routes stay selectable across the three local harnesses.</span></div>' +
      '<span class="chip chip--mono">3 ready</span></div><div class="builds-home__route-cards">' +
      '<div class="builds-home__route-card"><b>Claude SDK</b><span>R3 · speedy</span><em>Ready</em></div>' +
      '<div class="builds-home__route-card is-selected"><b>Hermes</b><span>R3 · speedy</span><em>Ready</em></div>' +
      '<div class="builds-home__route-card"><b>Pi.dev</b><span>R3 · speedy</span><em>Ready</em></div></div></div>';
  }

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
        var workNav = document.querySelector('[data-nav-item="work"]');
        if (workNav && typeof workNav.click === 'function') workNav.click();
        setTimeout(function () {
          var workInput = document.querySelector('[data-screen="work"] #s-work-task');
          var workRun = document.querySelector('[data-screen="work"] [data-action="run-task"]');
          if (workInput && workRun) { workInput.value = goal; workInput.dispatchEvent(new Event('input', { bubbles: true })); workRun.click(); }
        }, 60);
      }
    });
  }

  function openWork() {
    var workNav = document.querySelector('[data-nav-item="work"]');
    if (workNav && typeof workNav.click === 'function') workNav.click();
  }
  var openStreams = screen.querySelector('[data-open-build-streams]');
  if (openStreams) openStreams.addEventListener('click', openWork);
  var openViewer = screen.querySelector('[data-open-build-viewer]');
  if (openViewer) openViewer.addEventListener('click', function () {
    var viewer = document.querySelector('[data-nav-item="viewer"]');
    if (viewer) viewer.click(); else openWork();
  });
  var compare = screen.querySelector('[data-open-build-compare]');
  if (compare) compare.addEventListener('click', openWork);

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
