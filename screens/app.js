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
    // scroll to top
    var sc = $('#screenScroll');
    if (sc) sc.scrollTop = 0;
    // sync mobile bottom-tab active state
    $all('.mob-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });
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
          <div class="wt-title">Welcome to <span class="accent">RHOBEAR Hub</span></div>\
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
            ['rho-opus', 'Rho · Opus', 'most capable'],
            ['rho-sonnet', 'Rho · Sonnet', 'balanced'],
            ['rho-haiku', 'Rho · Haiku', 'fastest']
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
          return '<button class="hub-btn-primary wt-go" style="flex:1;justify-content:center;">Go to Hub\
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
    function closeWt() { wt.classList.remove('is-open'); }

    var replay = $('#wtReplay');
    if (replay) replay.addEventListener('click', openWt);

    // show on first load (in-memory), dismissable
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

  // ---- Rho widget (riding the Hub) ----
  function toggleRhoWidget() {
    var w = $('#rhoWidget');
    if (w) { w.classList.toggle('open'); return; }
    w = document.createElement('div');
    w.id = 'rhoWidget';
    w.className = 'hub-rho-widget open';
    w.innerHTML =
      '<div class="hub-rho-widget__head">' +
        '<span class="hub-rho-widget__orb"></span>' +
        '<span class="hub-rho-widget__names"><b>Rho</b><i>riding the Hub</i></span>' +
        '<button class="hub-rho-widget__close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="hub-rho-widget__msgs" id="rhoMsgs">' +
        '<div class="hub-rho-bubble hub-rho-bubble--agent">Hey — I’m Rho, riding the Hub. Ask me about your crew, runs, or board.</div>' +
        '<div class="hub-rho-bubble hub-rho-bubble--user">What’s running right now?</div>' +
        '<div class="hub-rho-bubble hub-rho-bubble--agent">Two runs live: <b>plans-mcp-w1</b> is verifying, <b>hub-glass-pass</b> just opened a PR. Board has 3 notes waiting on you.</div>' +
      '</div>' +
      '<div class="hub-rho-widget__bar">' +
        '<input type="text" placeholder="Message Rho…" id="rhoWidgetInput">' +
        '<button id="rhoWidgetSend" aria-label="Send">➤</button>' +
      '</div>';
    document.body.appendChild(w);
    $('.hub-rho-widget__close', w).addEventListener('click', function () { w.classList.remove('open'); });
    function send() {
      var inp = $('#rhoWidgetInput'), msgs = $('#rhoMsgs');
      var v = (inp.value || '').trim(); if (!v) return;
      var u = document.createElement('div'); u.className = 'hub-rho-bubble hub-rho-bubble--user'; u.textContent = v;
      msgs.appendChild(u); inp.value = '';
      setTimeout(function () {
        var a = document.createElement('div'); a.className = 'hub-rho-bubble hub-rho-bubble--agent';
        a.textContent = 'On it — I’ll dig into that and drop the answer on your board.';
        msgs.appendChild(a); msgs.scrollTop = msgs.scrollHeight;
      }, 600);
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

  // ---- Sign-in state (401 from /api/me) ----
  function showSignIn() {
    var shell = document.getElementById('appShell');
    if (!shell) return;
    shell.innerHTML = '\
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;\
                   min-height:100vh;gap:20px;padding:32px;text-align:center;">\
        <img src="assets/hub-bear.png" alt="RHOBEAR" style="width:80px;height:80px;" />\
        <h1 style="font-size:1.6rem;font-weight:600;margin:0;">RHOBEAR Hub</h1>\
        <p style="color:var(--hub-text-secondary);max-width:400px;margin:0;">\
          Sign in to dispatch your crew, track runs, and manage your workspace.</p>\
        <a href="/api/auth/google" class="hub-btn-primary" \
           style="padding:12px 32px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;">\
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" \
               stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>\
          Sign in with Google\
        </a>\
      </div>';
  }

  // ---- Boot: auth gate, then wire everything ----
  function init() {
    function boot() {
      initDesktop();
      initMobile();
      initWalkthrough();
      initGlobal();
      activateScreen('home', document);
    }

    // If api.js is loaded and HubAPI exists, check auth first
    if (typeof HubAPI !== 'undefined' && HubAPI.me) {
      HubAPI.me().then(function (result) {
        if (result.ok && result.data && result.data.email) {
          window.__user = result.data;
          updateAvatar(result.data);
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
