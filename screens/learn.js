/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Learn screen controller
   Renders REAL lesson content from the bundled /lessons-catalog.json feed
   (148 lessons, same file the local Hub ships). Signed-in users see the
   grid populated with real titles + blurbs; the sign-in gate appears only
   for offline/unauthenticated sessions. Falls back to an honest empty
   state if the catalog fails to load — never fakes data.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.querySelector('[data-screen="learn"]');
  if (!root) return;

  /* Render in batches so a 148-entry catalog doesn't paint all at once, but
     ALL of them are reachable via "Load more" — no lesson is hidden. */
  var BATCH = 24;
  var _all = [];
  var _shown = 0;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Titles in the catalog often look like "Account Sentinel - Hawk Skill";
     derive a topic tag from the suffix if present (real signal, not faked). */
  function deriveTopic(title) {
    if (!title) return '';
    var m = String(title).match(/\s+[—-]\s+(.+)$/);
    return (m && m[1]) ? m[1].trim() : '';
  }

  function cardHTML(l) {
    var id = l.id || l.slug || '';
    var topic = deriveTopic(l.title);
    var blurb = (l.blurb || '').slice(0, 140);
    return '\
      <article class="s-learn__card" data-lesson-id="' + esc(id) + '">\
        <div class="s-learn__thumb">\
          <svg class="s-learn__play" viewBox="0 0 24 24" fill="none" aria-hidden="true">\
            <circle cx="12" cy="12" r="11" stroke="rgba(255,255,255,0.55)" stroke-width="1.1"/>\
            <path d="M10 8.4l5.6 3.6-5.6 3.6z" fill="rgba(255,255,255,0.95)"/>\
          </svg>\
        </div>\
        <h3 class="s-learn__title">' + esc(l.title || '') + '</h3>\
        <p style="font-size:0.8rem;color:var(--hub-text-secondary);line-height:1.4;margin:0">' +
          esc(blurb) +
        '</p>\
        <div class="s-learn__meta">\
          ' + (topic ? '<span class="s-learn__duration mono">' + esc(topic) + '</span>' : '') + '\
        </div>\
      </article>';
  }

  /* Load-more button lives just after the grid; created once, toggled by count. */
  function moreBtn() {
    var grid = root.querySelector('.s-learn__grid');
    var btn = root.querySelector('.s-learn__more');
    if (!btn && grid && grid.parentNode) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's-learn__more hub-btn-ghost';
      btn.style.cssText = 'display:block;margin:20px auto 0;padding:10px 22px';
      btn.addEventListener('click', appendMore);
      grid.parentNode.insertBefore(btn, grid.nextSibling);
    }
    return btn;
  }

  function appendMore() {
    var grid = root.querySelector('.s-learn__grid');
    if (!grid) return;
    var next = _all.slice(_shown, _shown + BATCH);
    grid.insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
    _shown += next.length;
    var btn = moreBtn();
    if (btn) {
      if (_shown < _all.length) { btn.style.display = 'block'; btn.textContent = 'Load more · ' + (_all.length - _shown) + ' of ' + _all.length + ' left'; }
      else { btn.style.display = 'none'; }
    }
  }

  /* ── Render the lesson grid from real catalog data ────────────────── */
  function renderGrid(lessons) {
    var grid = root.querySelector('.s-learn__grid');
    if (!grid) return;
    var btn = root.querySelector('.s-learn__more');
    if (btn) btn.style.display = 'none';

    if (!lessons || !lessons.length) {
      grid.innerHTML =
        '<div style="padding:32px 16px;text-align:center;grid-column:1/-1;">' +
          '<div style="font-weight:600;margin-bottom:4px;color:var(--hub-text-primary)">' +
            'No lessons available right now' +
          '</div>' +
          '<div class="muted" style="font-size:0.84rem;">' +
            'The lesson catalog didn’t load. Try again in a moment.' +
          '</div>' +
        '</div>';
      return;
    }

    _all = lessons; _shown = 0;
    grid.innerHTML = '';
    appendMore();  // renders the first BATCH + wires the load-more button
  }

  /* ── Fetch the real catalog (static docroot file — no auth needed) ─── */
  function loadAndRender() {
    fetch('/lessons-catalog.json', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad-status:' + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data
          : (data && Array.isArray(data.lessons)) ? data.lessons
          : (data && Array.isArray(data.entries)) ? data.entries
          : [];
        renderGrid(list);
      })
      .catch(function () {
        renderGrid([]);  /* honest empty state, never throw */
      });
  }

  /* ── Auth-aware render: hide gate, clear blur, populate grid ──────── */
  function renderLessons() {
    var gate = root.querySelector('.hub-gate.s-learn__gate');
    if (gate) gate.style.display = 'none';

    var blur = root.querySelector('.gate-stage__blur');
    if (blur) {
      blur.style.filter = 'none';
      blur.style.opacity = '1';
      blur.style.pointerEvents = 'auto';
      blur.removeAttribute('aria-hidden');
    }

    loadAndRender();
  }

  function tryRender() {
    if (window.__user) {
      renderLessons();
      return true;
    }
    return false;
  }

  if (!tryRender()) {
    /* Deferred scripts run before app.js resolves HubAPI.me(), so __user
       isn't set yet. Poll briefly for it. */
    var timer = setInterval(function () {
      if (tryRender()) clearInterval(timer);
    }, 100);
    /* Fallback: stop after 10s — keep the gate for offline or if auth
       never resolves. */
    setTimeout(function () { clearInterval(timer); }, 10000);
  }
})();
