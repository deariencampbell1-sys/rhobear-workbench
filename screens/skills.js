/* Skills screen — IIFE, scoped to [data-screen="skills"].

   Renders the LIVE skill catalog and toggles entitlement for real:
     GET  /api/skills               -> { ok, count, tier, skills:[{slug,name,
                                         description,version,minTier,enabled}] }
     POST /api/skills/:slug/toggle  {enabled}

   This screen used to open with "no cloud endpoint (was sidecar-only on
   localhost:7456)", hide the whole grid, blank the count to "cloud hub — no
   local sidecar", make the filter pills cosmetic and disable every toggle.
   /api/skills has 616 skills on it and has been live the whole time; the old
   Hub called skillsCatalog/skill/saveSkill. The grid markup is reused as-is —
   same card, same classes — it is just filled from the server now.

   Exposes nothing global. */
(function () {
  "use strict";

  var root = document.querySelector('[data-screen="skills"]');
  if (!root) return;

  var grid = root.querySelector('.s-skills__grid');
  var emptyWrap = root.querySelector('.s-skills__empty-wrap');
  var countChip = root.querySelector('.s-skills__count');
  if (!grid) return;

  /* The first card in the markup is the template for every rendered card, so
     the styling stays exactly where the design put it. */
  var template = grid.querySelector('.s-skills__card');
  var iconHtml = template
    ? ((template.querySelector('.s-skills__icon') || {}).innerHTML || '')
    : '';

  var all = [];
  var activeFilter = 'all';
  var RENDER_CAP = 60;

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function matches(s) {
    if (activeFilter === 'installed') return !!s.enabled;
    if (activeFilter === 'marketplace') return !s.enabled;
    if (activeFilter === 'custom') return !!(s.minTier && s.minTier !== 'none');
    return true;
  }

  function render() {
    if (!all.length) {
      grid.style.display = 'none';
      if (emptyWrap) emptyWrap.style.display = '';
      if (countChip) countChip.textContent = 'catalog unavailable';
      return;
    }

    var shown = all.filter(matches);
    var capped = shown.slice(0, RENDER_CAP);

    grid.style.display = '';
    if (emptyWrap) emptyWrap.style.display = 'none';
    if (countChip) {
      countChip.textContent = shown.length > capped.length
        ? capped.length + ' of ' + shown.length + ' shown'
        : shown.length + ' shown';
    }

    grid.innerHTML = capped.map(function (s) {
      var added = !!s.enabled;
      return '<article class="hub-card s-skills__card" data-skill="' + esc(s.slug) + '">' +
        '<div class="s-skills__head">' +
          '<div class="s-skills__icon" aria-hidden="true">' + iconHtml + '</div>' +
          '<div class="s-skills__meta">' +
            '<h3 class="s-skills__name">' + esc(s.name || s.slug) + '</h3>' +
            '<p class="s-skills__desc">' + esc(s.description || '') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="s-skills__foot">' +
          '<span class="chip chip--mono">' + esc(s.slug) +
            (s.version ? ' · v' + esc(s.version) : '') + '</span>' +
          '<button class="hub-btn-ghost s-skills__toggle' + (added ? ' is-added' : '') +
            '" type="button" data-skill-toggle>' + (added ? 'Added ✓' : 'Add') + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ── toggle entitlement for real ──────────────────────────────────── */
  grid.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-skill-toggle]');
    if (!btn) return;
    var card = btn.closest('[data-skill]');
    if (!card) return;
    var slug = card.getAttribute('data-skill');
    var rec = null;
    for (var i = 0; i < all.length; i++) { if (all[i].slug === slug) { rec = all[i]; break; } }
    if (!rec) return;

    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    fetch('/api/skills/' + encodeURIComponent(slug) + '/toggle', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rec.enabled })
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || d.ok === false) {
          btn.textContent = (d && d.reason) ? String(d.reason).slice(0, 22) : 'Failed';
          setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
          return;
        }
        rec.enabled = !rec.enabled;
        render();
      })
      .catch(function () {
        btn.textContent = 'Failed';
        setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
      });
  });

  /* ── filter pills — real filters now, not cosmetic ────────────────── */
  var FILTERS = ['all', 'installed', 'marketplace', 'custom'];
  var pills = root.querySelectorAll('.hub-filter-pill');
  pills.forEach(function (pill, i) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeFilter = FILTERS[i] || 'all';
      render();
    });
  });

  /* ── load ─────────────────────────────────────────────────────────── */
  fetch('/api/skills', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      all = (d && d.ok && d.skills) ? d.skills.filter(function (s) { return s && s.slug; }) : [];
      render();
    })
    .catch(function () { all = []; render(); });
})();
