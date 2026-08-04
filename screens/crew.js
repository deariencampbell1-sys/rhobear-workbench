/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Crew screen controller

   NOTE: There is no cloud crew endpoint. The roster (9 specialists) is
   static HTML — status, load %, and avatars have no API source and stay
   as static decoration.

   What IS wired from live APIs:
   - "Brief" button → navigates to Work screen so the user can dispatch
     a task to the crew.
   - Per-crew run counts populated from /api/jobs by matching the
     specialist/agent field to each crew card name.

   What still needs a source (no cloud endpoint exists as of 2026-07):
   - Crew roster CRUD (add/remove specialists)
   - Per-crew load %
   - Per-crew online/standby status
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="crew"]');
  if (!screen) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 1. Status filter (All / Online / Standby) — keep existing ───── */
  var pills = screen.querySelectorAll('.s-crew__filters .hub-filter-pill');
  var cards = screen.querySelectorAll('.s-crew__card');

  if (pills.length && cards.length) {
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');

        var filter = pill.dataset.crewFilter || 'all';
        cards.forEach(function (card) {
          var status = card.dataset.status;
          var show = filter === 'all' || status === filter;
          card.classList.toggle('is-hidden', !show);
        });
      });
    });
  }

  /* ── 2. "Brief" button → navigate to Work screen ─────────────────── */
  var briefBtns = screen.querySelectorAll('.s-crew__brief');
  briefBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var navItem = document.querySelector('[data-nav-item="work"]')
                || document.querySelector('[data-tab="work"]');
      if (navItem && typeof navItem.click === 'function') navItem.click();
    });
  });

  /* ── 3. Populate per-crew run counts from HubAPI.jobs() ──────────── */
  function loadStats() {
    if (typeof HubAPI === 'undefined' || !HubAPI.jobs) return;

    HubAPI.jobs().then(function (result) {
      if (!result.ok || !result.data) return;

      var jobs = Array.isArray(result.data) ? result.data : (result.data.jobs || []);

      cards.forEach(function (card) {
        var nameEl = card.querySelector('.s-crew__name');
        if (!nameEl) return;
        var name = nameEl.textContent.trim();

        var count = 0;
        jobs.forEach(function (j) {
          var spec = (j.specialist || j.agent || '').toLowerCase();
          if (spec === name.toLowerCase()) count++;
        });

        var runsEl = card.querySelector('.s-crew__runs');
        if (runsEl) runsEl.textContent = count + ' runs';
      });
    });
  }

  loadStats();
})();
