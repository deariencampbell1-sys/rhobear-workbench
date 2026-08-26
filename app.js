/* RHOBEAR Hub — core shell logic: routing, nav collapse, walkthrough, mobile drawer. */
(function () {
  'use strict';

  var TITLES = {
    home: 'Home', work: 'Work', crew: 'Crew', board: 'Board', runs: 'Runs',
    schedule: 'Schedule', files: 'Files', skills: 'Skills', connectors: 'Connectors',
    notes: 'Notes', vault: 'Vault', memory: 'Memory', mcps: 'MCPs', learn: 'Learn',
    terminal: 'Terminal', aios: 'AIOS', settings: 'Settings',
    brief: 'Daily brief', goals: 'Goals', worlds: 'Worlds'
  };

  /* Keyboard nav (parity with the local Hub: 1-9 + comma). */
  var KEY_NAV = { '1': 'home', '2': 'work', '3': 'crew', '4': 'board', '5': 'runs',
                  '6': 'schedule', '7': 'skills', '8': 'vault', '9': 'terminal', ',': 'settings' };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function activateScreen(name, ctx) {
    ctx = ctx || document;
    var screen = $('.screen[data-screen="' + name + '"]', ctx);
    if (!screen) return;
    $all('.screen', ctx).forEach(function (s) { s.classList.remove('is-active'); });
    screen.classList.add('is-active');

    // nav active state (desktop + drawer)
    $all('[data-nav-item]').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-nav-item') === name);
    });
    // topbar title
    var tt = $('#topbarTitle'); if (tt) tt.textContent = TITLES[name] || name;
    // Keep direct links and hard refreshes on the surface the user actually
    // opened. Previously the screen changed in-place but the hash stayed at
    // #home, and boot then forced Home again on every refresh.
    if (window.history && window.history.replaceState && location.hash !== '#' + name) {
      window.history.replaceState(null, '', '#' + name);
    }
    // scroll to top
    var sc = $('#screenScroll');
    if (sc) sc.scrollTop = 0;
    // sync mobile bottom-tab active state
    $all('.mob-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });

    /* Tell the screens they are being shown.
       Every data-backed screen fetched exactly once, at page load, and never
       again — so creating a task and then switching to the Board showed the
       board as it looked before the task existed, and the only cure was a full
       reload. Screens listen for this and refresh themselves. */
    try {
      document.dispatchEvent(new CustomEvent('hub:screen', { detail: { name: name } }));
    } catch (e) { /* very old browser — screens still work, just not live */ }
  }

  // ---- desktop nav routing (same elements serve the mobile drawer) ----
  function initDesktop() {
    var shell = $('#appShell'); if (!shell) return;
    function closeDrawer() {
      var nav = $('#hubNav'); if (nav) nav.classList.remove('is-open');
      var scrim = $('#mobScrim'); if (scrim) scrim.classList.remove('is-open');
    }
    $all('[data-nav-item]').forEach(function (item) {
      item.addEventListener('click', function () {
        activateScreen(item.getAttribute('data-nav-item'), document);
        closeDrawer();
      });
    });
    // collapse toggle
    var collapse = $('#navCollapse');
    if (collapse) collapse.addEventListener('click', function () {
      shell.setAttribute('data-nav', shell.getAttribute('data-nav') === 'collapsed' ? 'expanded' : 'collapsed');
    });
    // topbar search/cmdk stub
    var search = $('#topbarSearch');
    if (search) search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); flashRho('Searching: ' + search.value); search.value = ''; }
    });

    // keyboard nav (parity with the local Hub) — ignored while typing
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target, tag = (t && t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
      var dest = KEY_NAV[e.key];
      if (dest) { e.preventDefault(); activateScreen(dest, document); }
    });
  }

  // ---- mobile (nav-rail becomes a drawer; screens live once) ----
  function initMobile() {
    var nav = $('#hubNav');
    var menu = $('#mobMenu');
    var scrim = $('#mobScrim');
    function open() { if (nav) nav.classList.add('is-open'); if (scrim) scrim.classList.add('is-open'); }
    function close() { if (nav) nav.classList.remove('is-open'); if (scrim) scrim.classList.remove('is-open'); }
    if (menu) menu.addEventListener('click', function () {
      if (nav && nav.classList.contains('is-open')) close(); else open();
    });
    if (scrim) scrim.addEventListener('click', close);
    // bottom tabs (subset of screens)
    $all('.mob-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        activateScreen(tab.getAttribute('data-tab'), document);
        close();
      });
    });
  }

  // ---- walkthrough (5 steps) ----
  function initWalkthrough() {
    var wt = $('#walkthrough'); if (!wt) return;
    var card = $('.wt-card', wt);
    var step = 0;

    var steps = [
      { // 1 — welcome, ink-roar bear
        render: function () {
          return '\
          <img class="ink-bear--lg" src="assets/hub-bear.png" alt="" />\
          <div class="wt-step">Step 1 of 5</div>\
          <div class="wt-title">Welcome to <span class="accent">RHOBEAR Builds</span></div>\
          <div class="wt-body">Your workbench for running a crew of AI specialists against your own models. Dispatch work, watch runs, keep files, notes and memory — all in one calm place.</div>';
        },
        actions: function () { return primaryNext('Continue'); }
      },
      { // 2 — name your workspace
        render: function () {
          return '\
          <div class="wt-step">Step 2 of 5</div>\
          <div class="wt-title">Name your workspace</div>\
          <div class="wt-body">This is what your crew will call home.</div>\
          <input class="wt-input" id="wtName" type="text" placeholder="e.g. Studio One" value="Studio One">';
        },
        actions: function () { return primaryNext('Next'); }
      },
      { // 3 — pick your default model
        render: function () {
          var models = [
            ['core', '★ Core', 'everyday'],
            ['summit', '✻ Summit', 'speedy'],
            ['peak', '◆ Peak', 'top · think:high']
          ];
          var opts = models.map(function (m, i) {
            return '<button class="wt-choice' + (i === 0 ? ' is-selected' : '') + '" data-model="' + m[0] + '">\
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>\
              <span><strong>' + m[1] + '</strong> — <span class="muted">' + m[2] + '</span></span></button>';
          }).join('');
          return '<div class="wt-step">Step 3 of 5</div>\
            <div class="wt-title">Pick your default model</div>\
            <div class="wt-body">You can switch per-task later.</div>\
            <div class="wt-choice-row">' + opts + '</div>';
        },
        actions: function () { return primaryNext('Next'); }
      },
      { // 4 — meet the crew
        render: function () {
          return '\
          <div class="wt-step">Step 4 of 5</div>\
          <div class="wt-title">Meet your crew</div>\
          <div class="wt-body">Nine specialists — Architect, Researcher, Writer, Coder, Reviewer, Analyst, Designer, Operator and Librarian — stand by to take your work. You can dispatch them from Home or Work.</div>';
        },
        actions: function () { return primaryNext('Next'); }
      },
      { // 5 — final, constellation bear + glow ring
        render: function () {
          return '\
          <img class="const-bear--lg" src="assets/hub-bear.png" alt="" />\
          <div class="wt-step">Step 5 of 5</div>\
          <div class="wt-title">You\'re all set</div>\
          <div class="wt-body">Your workspace is ready. Your crew is standing by.</div>';
        },
        actions: function () {
          return '<button class="hub-btn-primary wt-go" style="flex:1;justify-content:center;">Go to Builds\
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
        }
      }
    ];

    function dots() {
      return steps.map(function (_, i) {
        return '<span class="pd' + (i === step ? ' is-current' : '') + '"></span>';
      }).join('');
    }
    function primaryNext(label) {
      return '<button class="hub-btn-primary wt-next" style="flex:1;justify-content:center;">' + label +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>';
    }
    function paint() {
      var s = steps[step];
      card.innerHTML = s.render() +
        '<div class="wt-actions">' + s.actions() + '<button class="wt-skip">' + (step === steps.length - 1 ? '' : 'Skip') + '</button></div>' +
        '<div class="progress-dots">' + dots() + '</div>';
      // wire next / go
      var next = $('.wt-next', card);
      if (next) next.addEventListener('click', function () {
        if (step < steps.length - 1) { step++; paint(); }
      });
      var go = $('.wt-go', card);
      if (go) go.addEventListener('click', closeWt);
      var skip = $('.wt-skip', card);
      if (skip && skip.textContent.trim()) skip.addEventListener('click', closeWt);
      // choice selection
      $all('.wt-choice', card).forEach(function (c) {
        c.addEventListener('click', function () {
          $all('.wt-choice', card).forEach(function (x) { x.classList.remove('is-selected'); });
          c.classList.add('is-selected');
        });
      });
    }
    function openWt() { wt.classList.add('is-open'); step = 0; paint(); }
    function closeWt() {
      wt.classList.remove('is-open');
      // Remember it server-side, so finishing (or skipping) here also holds on the
      // next device. Best-effort: a failed write must never block the UI.
      if (window.__user && !window.__user.onboarded) {
        window.__user.onboarded = true;
        try {
          if (window.HubAPI && HubAPI.settings && HubAPI.settings.save) {
            HubAPI.settings.save({ onboarded: true });
          }
        } catch (e) { /* non-fatal */ }
      }
    }

    var replay = $('#wtReplay');
    if (replay) replay.addEventListener('click', openWt);

    // Never replay onboarding at someone who is already past it. The server is
    // the authority (`onboarded` from /api/me, persisted per-user); sessionStorage
    // alone would re-run this walkthrough in every new browser session, which for
    // a dev/staff account is exactly the nag the entitlement flags exist to stop.
    if (window.__user && window.__user.onboarded) return;

    try {
      if (!sessionStorage.getItem('hub_wt_seen')) {
        sessionStorage.setItem('hub_wt_seen', '1');
        openWt();
      }
    } catch (e) { openWt(); }
  }

  // ---- misc wiring ----
  function initGlobal() {
    // world switcher opens the real Worlds screen (manage/add/switch) — not a cosmetic cycle
    var world = $('#worldSwitch');
    if (world) {
      world.addEventListener('click', function () {
        activateScreen('worlds', document);
      });
    }
    // Ask Rho FAB / rail orb → open the real Rho widget
    $all('[data-ask-rho]').forEach(function (b) {
      b.addEventListener('click', toggleRhoWidget);
    });
    var orb = $('#railRho'); if (orb) orb.addEventListener('click', toggleRhoWidget);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  // ---- Rho widget (riding Builds) ----
  function toggleRhoWidget() {
    var w = $('#rhoWidget');
    if (w) { w.classList.toggle('open'); return; }
    var assistant = assistantIdentity();
    w = document.createElement('div');
    w.id = 'rhoWidget';
    w.className = 'hub-rho-widget open';
    w.innerHTML =
      '<div class="hub-rho-widget__head">' +
        '<span class="hub-rho-widget__orb"></span>' +
        '<span class="hub-rho-widget__names"><b>' + escapeHtml(assistant) + '</b><i>riding Builds</i></span>' +
        '<button class="hub-rho-widget__close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="hub-rho-widget__msgs" id="rhoMsgs">' +
        '<div class="hub-rho-bubble hub-rho-bubble--agent">Hey — I’m ' + escapeHtml(assistant) + ', riding Builds. Ask me to start a real build stream.</div>' +
      '</div>' +
      '<div class="hub-rho-widget__bar">' +
        '<input type="text" placeholder="Message ' + escapeHtml(assistant) + '…" id="rhoWidgetInput">' +
        '<button id="rhoWidgetSend" aria-label="Send">➤</button>' +
      '</div>';
    document.body.appendChild(w);
    $('.hub-rho-widget__close', w).addEventListener('click', function () { w.classList.remove('open'); });
    function send() {
      var inp = $('#rhoWidgetInput'), msgs = $('#rhoMsgs');
      var v = (inp.value || '').trim(); if (!v) return;
      var u = document.createElement('div'); u.className = 'hub-rho-bubble hub-rho-bubble--user'; u.textContent = v;
      msgs.appendChild(u); inp.value = '';
      var a = document.createElement('div'); a.className = 'hub-rho-bubble hub-rho-bubble--agent';
      a.textContent = 'Opening a real Builds stream…'; msgs.appendChild(a); msgs.scrollTop = msgs.scrollHeight;
      if (typeof HubAPI === 'undefined' || !HubAPI.sessions || !HubAPI.chatStream) {
        a.textContent = 'Sign in to start a real Builds stream.';
        return;
      }
      var selected = window.HubCatalog && HubCatalog.readSelection ? HubCatalog.readSelection() : {};
      HubAPI.sessions.create(v).then(function (result) {
        var sid = result && result.data && (result.data.id || result.data.session_id);
        if (!sid) throw new Error('Could not create a Builds stream');
        a.textContent = '';
        HubAPI.chatStream({ sessionId: sid, message: v, harness: selected.harness, model: selected.model }, {
          onText: function (delta) { a.textContent += delta; msgs.scrollTop = msgs.scrollHeight; },
          onEvent: function (event, data) {
            if (event !== 'tool.started' || !data || !data.tool_name || data.tool_name === '_thinking') return;
            var tool = document.createElement('div');
            tool.className = 'hub-rho-bubble hub-rho-bubble--tool';
            tool.textContent = 'Tool · ' + data.tool_name;
            msgs.insertBefore(tool, a); msgs.scrollTop = msgs.scrollHeight;
          },
          onError: function (err) { a.textContent = String(err || 'Build stream failed'); },
        });
      }).catch(function (err) {
        a.textContent = err && err.message ? err.message : 'Could not open the Builds stream';
      });
      msgs.scrollTop = msgs.scrollHeight;
    }
    $('#rhoWidgetSend', w).addEventListener('click', send);
    $('#rhoWidgetInput', w).addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }

  var toastTimer;
  function flashRho(msg) {
    var t = $('#rhoToast');
    if (!t) { t = document.createElement('div'); t.id = 'rhoToast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:90;' +
      'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid var(--hub-border);' +
      'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.84rem;font-weight:600;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 24px rgba(42,143,168,0.3);opacity:0;transition:opacity 200ms ease;';
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  // ---- Account chip: populate avatar with real user info ----
  function updateAvatar(user) {
    var avatar = document.querySelector('.avatar');
    if (!avatar) return;
    var initial = (user.name || user.email || '?').charAt(0).toUpperCase();
    avatar.textContent = initial;
    avatar.title = user.email || '';

    // Also update settings avatar
    var sa = document.querySelector('.s-settings__avatar');
    if (sa) sa.textContent = initial;

    // Settings email field
    var emailInput = document.querySelector('.s-settings__input[type="email"]');
    if (emailInput) emailInput.value = user.email || '';
  }

  /* One assistant identity across the product. Builds receives the same
     account payload as Blueprints, so the companion must never invent a
     second name or a staff-only identity. */
  function assistantIdentity() {
    var user = window.__user || {};
    var settings = user.settings || user.preferences || {};
    var sources = [user, settings, settings.assistant, user.workspace, user.account];
    var keys = ['assistantName', 'assistant_name', 'frontmanName', 'frontman_name', 'rhoName', 'rho_name'];
    for (var si = 0; si < sources.length; si++) {
      var source = sources[si];
      if (!source || typeof source !== 'object') continue;
      for (var ki = 0; ki < keys.length; ki++) {
        var value = source[keys[ki]];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      if (source.assistant && typeof source.assistant === 'object' &&
          typeof source.assistant.name === 'string' && source.assistant.name.trim()) {
        return source.assistant.name.trim();
      }
    }
    try {
      return localStorage.getItem('rhobear.assistant.name') || 'Rho';
    } catch (e) {
      return 'Rho';
    }
  }

  function applyAssistantIdentity() {
    var name = assistantIdentity();
    var railLabel = document.querySelector('#railRho .rho-label');
    if (railLabel) railLabel.textContent = 'Ask ' + name;
    document.querySelectorAll('[data-ask-rho]').forEach(function (button) {
      var orb = button.querySelector('.mini-orb');
      button.textContent = '';
      if (orb) button.appendChild(orb);
      button.appendChild(document.createTextNode('Ask ' + name));
      button.setAttribute('aria-label', 'Ask ' + name);
    });
  }

  // ---- Sign-in state (401 from /api/me) ----
  function showSignIn() {
    var shell = document.getElementById('appShell');
    if (!shell) return;

    /* .app-shell is `display:grid; grid-template-columns: <nav> 1fr` — the
       sidebar column and the content column. Replacing its innerHTML with a
       single centred <div> put that div in the FIRST column, so the whole
       sign-in screen rendered inside a 220px strip pinned to the left edge:
       the wordmark wrapped mid-word, the button wrapped onto two lines, and
       nothing was centred on the page. The gate has to stop being a grid
       before it can centre itself. */
    shell.style.display = 'block';
    shell.style.gridTemplateColumns = 'none';

    shell.innerHTML = '\
      <div class="hub-signin">\
        <div class="hub-card hub-card--static hub-signin__card">\
          <img src="assets/hub-bear.png" alt="" class="hub-signin__mark" />\
           <h1 class="hub-signin__title">RHOBEAR Builds</h1>\
          <p class="hub-signin__blurb">\
            Sign in to dispatch your crew, track runs, and manage your workspace.</p>\
          <a href="https://blueprints.rhobear.ai/login?next=https%3A%2F%2Fbuilds.rhobear.ai%2F" \
             class="hub-btn-primary hub-signin__cta">\
            Sign in with RHOBEAR\
          </a>\
          <p class="hub-signin__alt">Magic Link, Google, and GitHub use the same central account across RHOBEAR apps.</p>\
        </div>\
      </div>';
  }

  // ---- Boot: auth gate, then wire everything ----
  function init() {
    function boot() {
      initDesktop();
      initMobile();
      initWalkthrough();
      initGlobal();
      var requested = (location.hash || '').replace(/^#/, '').split('?')[0] || 'home';
      if (!document.querySelector('.screen[data-screen="' + requested + '"]')) requested = 'home';
      activateScreen(requested, document);
    }

    // If api.js is loaded and HubAPI exists, check auth first
    if (typeof HubAPI !== 'undefined' && HubAPI.me) {
      HubAPI.me().then(function (result) {
        var _u = result.data && (result.data.user || result.data);
        if (result.ok && _u && _u.email) {
          /* `onboarded` and `settings` sit at the TOP level of /api/me, beside
             `user`, not inside it. Reading them off `user` gave undefined every
             time, so the walkthrough's "already past it" check below could never
             be true and the tour replayed on every single visit — even once the
             server had recorded it. Carry them across. */
          if (result.data && result.data !== _u) {
            if (_u.onboarded === undefined && result.data.onboarded !== undefined) {
              _u.onboarded = result.data.onboarded;
            }
            if (_u.settings === undefined && result.data.settings !== undefined) {
              _u.settings = result.data.settings;
            }
          }
          window.__user = _u;
          if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('rhobear:auth', { detail: { signedIn: true } }));
          }
          updateAvatar(_u);
          applyAssistantIdentity();
          boot();
        } else if (result.status === 401) {
          showSignIn();
        } else if (result.offline) {
          // Offline — show app anyway; data screens will silently fail
          boot();
        } else {
          // Other error — treat as unauthenticated
          showSignIn();
        }
      });
    } else {
      // No API client — bootstrap anyway (unlikely)
      boot();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
