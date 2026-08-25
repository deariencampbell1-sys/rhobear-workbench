/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — WORK screen behaviour.
   IIFE scoped to [data-screen="work"].

   Real harness/model picker (HubCatalog, driven by /v1/models — Hermes).
   A task TRANSFORMS into an ongoing chat WORKBENCH:
     chat column  ‖  deep canvas (Preview / Diff / Files / Shell),
   with TABBED PAGES — each tab is its own conversation (session, model,
   crew, autonomy, canvas). Backed by /api/sessions + /chat/stream (SSE).

   DOM discipline (GOTCHAS §1B): streaming appends / patches nodes only.
   We NEVER innerHTML= a streaming region. Switching tabs toggles display
   on persistent per-tab DOM — it never re-renders a log.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="work"]');
  if (!screen) return;

  /* The workstation owns the viewport. Keep the old task/stat nodes only as
     compatibility hooks for the live stream code; the visible entry surface
     is a stream rail, model route, viewer stage, and bottom composer. */
  var initialHead = screen.querySelector('.page-head');
  var initialPrompt = screen.querySelector('.s-work__prompt-card');
  var initialOptions = screen.querySelector('.s-work__options');
  if (initialHead && initialPrompt && initialOptions) {
    screen.classList.add('builds-workstation');
    initialHead.innerHTML = '<div class="builds-work__eyebrow">BUILDS</div>' +
      '<h1>New build stream</h1><p class="sub">Every turn stays in the stream rail. Thinking, tools, and the final answer stay together.</p>';
    initialPrompt.innerHTML = '<div class="builds-work__stage-empty"><div class="builds-work__stage-orb">R</div>' +
      '<h2>What are we building?</h2><p class="muted">Ask the Builds crew. Your viewer opens beside the active stream when a build produces something to inspect.</p>' +
      '<div class="builds-work__examples"><button type="button" data-build-example="inspect the current build queue">Try “inspect the current build queue”</button>' +
      '<button type="button" data-build-example="compare Peak and Summit">Try “compare Peak and Summit”</button></div></div>';
    initialPrompt.className = 'builds-work__entry-stage';
    initialOptions.innerHTML = '<div class="builds-work__composer-title">Ask the Builds crew what to build next…</div>' +
      '<div class="builds-work__composer-row"><div class="builds-work__composer-controls">' +
      '<span class="muted">Harness</span><button class="s-work__select" type="button" aria-label="Harness and model"><span class="dot" aria-hidden="true"></span><span class="s-work__select-label">✦ Hermes · Summit</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg></button>' +
      '<span class="muted">Specialist</span><button class="chip s-work__assign" type="button" aria-label="Assign to specialist"><span class="s-work__assign-label">Coder</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg></button>' +
      '<button class="chip" type="button" data-open-sheet aria-label="Open spreadsheet">Spreadsheet</button><input type="file" data-sheet-file-input accept=".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv" hidden /></div>' +
      '<div class="builds-work__composer-actions"><span class="s-work__estimate mono muted">≈ 0 tokens</span><button class="hub-btn-primary" type="button" data-action="run-task">Send <span aria-hidden="true">→</span></button></div></div>' +
      '<div class="s-work__focus-row" role="group" aria-label="Autonomy"><button class="hub-filter-pill active" type="button">Auto</button><button class="hub-filter-pill" type="button">Suggest</button><button class="hub-filter-pill" type="button">Act</button></div>';
    initialOptions.className = 'builds-work__entry-composer';
    var task = document.createElement('textarea');
    task.id = 's-work-task'; task.className = 's-work__textarea'; task.rows = 2;
    task.setAttribute('aria-label', 'Describe what the Builds crew should build');
    task.placeholder = 'Describe what the Builds crew should build…';
    initialOptions.insertBefore(task, initialOptions.querySelector('.builds-work__composer-title'));

    var layout = document.createElement('div'); layout.className = 'builds-work__layout';
    var rail = document.createElement('aside'); rail.className = 'builds-work__rail';
    rail.innerHTML = '<div class="builds-work__rail-head"><strong>Streams</strong><span class="chip chip--mono">0</span></div>' +
      '<button class="hub-btn-ghost builds-work__new-stream" type="button" data-action="new-tab">+ New stream</button>' +
      '<div class="builds-work__rail-empty">No saved streams yet. Start one and it will stay here.</div>' +
      '<ul class="s-work__list builds-work__stream-list" aria-label="Saved build streams"></ul>' +
      '<div class="builds-work__rail-foot">Session history is live</div>';
    var station = document.createElement('main'); station.className = 'builds-work__station';
    station.innerHTML = '<div class="builds-work__station-head"><div><strong>MODEL ROUTE</strong><p class="muted">R3 tier routes stay selectable across the three local harnesses.</p></div>' +
      '<div class="builds-work__station-actions"><button class="chip" type="button">Files</button><button class="chip" type="button">GitHub MCP</button><button class="chip" type="button">Vault</button><button class="chip" type="button" data-open-build-viewer>Open viewer</button></div></div>' +
      '<div class="builds-work__route-cards"><div class="builds-work__route-card"><b>Claude SDK</b><span>R3 · speedy</span><em>Ready</em></div><div class="builds-work__route-card is-selected"><b>Hermes</b><span>R3 · speedy</span><em>Ready</em></div><div class="builds-work__route-card"><b>Pi.dev</b><span>R3 · speedy</span><em>Ready</em></div></div>';
    var stage = document.createElement('div'); stage.className = 'builds-work__stage';
    screen.innerHTML = '';
    screen.appendChild(initialHead); screen.appendChild(layout);
    layout.appendChild(rail); layout.appendChild(station);
    station.appendChild(stage); station.appendChild(initialOptions);
    stage.innerHTML = '<div class="builds-work__stage-placeholder"><div class="builds-work__stage-orb">R</div><h2>What are we building?</h2><p class="muted">Ask the Builds crew. Thinking, tools, and the final answer stay together in the stream.</p><div class="builds-work__examples"><button type="button" data-build-example="inspect the current build queue">Try “inspect the current build queue”</button><button type="button" data-build-example="compare Peak and Summit">Try “compare Peak and Summit”</button></div></div>';
    var examples = screen.querySelectorAll('[data-build-example]');
    examples.forEach(function (button) { button.addEventListener('click', function () { task.value = button.getAttribute('data-build-example') || ''; task.dispatchEvent(new Event('input', { bubbles: true })); task.focus(); }); });
    var viewerButton = screen.querySelector('[data-open-build-viewer]');
    if (viewerButton) viewerButton.addEventListener('click', function () { var viewer = document.querySelector('[data-nav-item="viewer"]'); if (viewer) viewer.click(); });
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  var SPECIALISTS = [
    'Architect', 'Researcher', 'Writer', 'Coder',
    'Reviewer', 'Analyst', 'Designer', 'Operator', 'Librarian'
  ];

  /* Autonomy dial — surfaced as a system hint on the stream. Real state,
     honestly passed; whether the backend honours it is the backend's call. */
  var AUTONOMY = [
    { id: 'suggest', label: 'Suggest', hint: 'Operate in suggest mode: propose changes, do not apply them.' },
    { id: 'act',     label: 'Act',     hint: 'Operate in act mode: apply changes, then summarise what you did.' },
    { id: 'auto',    label: 'Auto',    hint: 'Operate in auto mode: plan, act, and verify with minimal checking in.' },
  ];

  var CANVAS_TABS = [
    { id: 'preview', label: 'Preview' },
    { id: 'diff',    label: 'Diff' },
    { id: 'files',   label: 'Files' },
    { id: 'shell',   label: 'Shell' },
  ];

  /* A small workspace list the Files canvas can show + route to the real
     Files screen. Mirrors screens/files.js's snippet set so the two agree. */
  var WORKSPACE_FILES = [
    { path: 'README.md',          note: 'workspace root' },
    { path: 'crew/architect.md',  note: 'specialist profile' },
    { path: 'crew/researcher.md', note: 'specialist profile' },
    { path: 'run-log.json',       note: 'last 50 runs' },
  ];

  /* ── Focus pills: single-select toggle ─────────────────────────────── */
  var focusRow = screen.querySelector('.s-work__focus-row');
  if (focusRow) {
    var pills = focusRow.querySelectorAll('.hub-filter-pill');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
      });
    });
  }

  /* ── Entry model selector — REAL picker (harness → model), Hermes-driven.
     Sets the DEFAULT model used when a new conversation tab is opened.
     Each tab can still override its own model from its composer chip. */
  var selectBtn = screen.querySelector('.s-work__select');
  var selectLabel = screen.querySelector('.s-work__select-label');
  var topPills = document.querySelectorAll('.model-pill');

  function currentModelId() {
    return (window.HubCatalog && HubCatalog.readSelection())
      ? HubCatalog.readSelection().model : 'summit';
  }

  function paintSelection() {
    if (!window.HubCatalog) return;
    var lbl = HubCatalog.chipLabel(HubCatalog.readSelection());
    if (selectLabel) selectLabel.textContent = lbl;
    topPills.forEach(function (p) {
      var dot = p.querySelector('.dot');
      p.textContent = '';
      if (dot) p.appendChild(dot);
      p.appendChild(document.createTextNode(lbl));
    });
  }

  if (selectBtn && window.HubCatalog) {
    paintSelection();
    selectBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      HubCatalog.openPicker(selectBtn, function () { paintSelection(); });
    });
  }

  /* ── Specialist assign (entry) — cycle through specialists ─────────── */
  var assignBtn = screen.querySelector('.s-work__assign');
  var assignLabel = screen.querySelector('.s-work__assign-label');
  if (assignBtn && assignLabel) {
    var specIdx = 3; // "Coder"
    assignBtn.addEventListener('click', function () {
      specIdx = (specIdx + 1) % SPECIALISTS.length;
      assignLabel.textContent = SPECIALISTS[specIdx];
    });
  }

  /* ── Token estimate (entry textarea) ───────────────────────────────── */
  var taskTextarea = screen.querySelector('#s-work-task');
  var estimateEl = screen.querySelector('.s-work__estimate');
  if (taskTextarea && estimateEl) {
    function updateEstimate() {
      var chars = (taskTextarea.value || '').length;
      var tokens = Math.max(0, Math.round(chars * 0.3));
      estimateEl.textContent = '≈ ' + tokens.toLocaleString() + ' tokens';
    }
    taskTextarea.addEventListener('input', updateEstimate);
    updateEstimate();
  }

  /* ── Run task — start a new conversation tab ───────────────────────── */
  // Bulletproof lookup: prefer the stable data-action hook, fall back to the
  // options-right primary button (the live DOM has drifted before).
  var runBtn = screen.querySelector('[data-action="run-task"]')
    || screen.querySelector('.s-work__options-right .hub-btn-primary')
    || screen.querySelector('.s-work__options .hub-btn-primary');

  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var task = (taskTextarea && taskTextarea.value.trim()) || '';
      if (!task) { if (taskTextarea) taskTextarea.focus(); return; }
      startConversation(task);
    });
  }
  if (taskTextarea) {
    taskTextarea.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && runBtn) { e.preventDefault(); runBtn.click(); }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     THE BENCH — tab strip + stacked per-conversation pages.
     Built once (in JS — never touches work.html) on first task / "+ New".
     Each page owns: chat column ‖ canvas column.
     ════════════════════════════════════════════════════════════════════ */
  var _bench = null;     // { root, tabs, pages }
  var _tabs = [];        // [{ id, title, sessionId, model, crewIdx, autoIdx, attached, streaming, agentBubble, els:{...} }]
  var _active = null;    // active tab id
  var _seq = 0;

  function buildBench() {
    if (_bench) return _bench;
    var bench = el('div', 's-work__bench',
      '<div class="s-work__tabstrip" role="tablist">' +
        '<div class="s-work__tabs" data-work-tabs></div>' +
        '<button class="hub-btn-ghost s-work__tab-new" type="button" data-action="new-tab" aria-label="New conversation">+ New</button>' +
      '</div>' +
      '<div class="s-work__pages" data-work-pages></div>');

    var optionsRow = screen.querySelector('.s-work__options');
    if (optionsRow && optionsRow.parentNode) optionsRow.parentNode.insertBefore(bench, optionsRow.nextSibling);
    else screen.appendChild(bench);
    var entryStage = screen.querySelector('.builds-work__stage');
    var entryPrompt = screen.querySelector('.builds-work__entry-stage');
    if (entryStage) entryStage.hidden = true;
    if (entryPrompt) entryPrompt.hidden = true;
    if (optionsRow) optionsRow.hidden = true;

    _bench = { root: bench, tabs: bench.querySelector('[data-work-tabs]'), pages: bench.querySelector('[data-work-pages]') };
    _bench.root.querySelector('[data-action="new-tab"]').addEventListener('click', function () {
      var t = newTab({ title: 'New conversation' });
      activateTab(t.id);
      if (t.els.composer) t.els.composer.focus();
    });
    renderEmptyState();
    return _bench;
  }

  function renderEmptyState() {
    if (!_bench) return;
    if (_tabs.length > 0) {
      var empty = _bench.pages.querySelector('.s-work__empty');
      if (empty) empty.remove();
      return;
    }
    _bench.pages.innerHTML =
      '<div class="s-work__empty hub-card hub-card--static">' +
        '<p class="muted">No conversations yet. Describe a task above and Run it — or hit <strong>+ New</strong>.</p>' +
      '</div>';
  }

  /* ── Create a tab + its page DOM ───────────────────────────────────── */
  function newTab(opts) {
    opts = opts || {};
    buildBench();
    var id = 't' + (++_seq);
    var tab = {
      id: id,
      title: opts.title || 'New conversation',
      sessionId: opts.sessionId || null,
      harness: opts.harness || (window.HubCatalog && HubCatalog.readSelection ? HubCatalog.readSelection().harness : 'hermes'),
      model: opts.model || currentModelId(),
      crewIdx: 3,        // "Coder"
      autoIdx: 1,        // "Act"
      attached: null,    // { name, size } when a non-sheet file is queued
      streaming: false,
      agentBubble: null,
      els: {},
    };

    /* ---- tabstrip button ---- */
    var btn = el('button', 's-work__tab' + (_active === null ? ' is-active' : ''), '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-tab-id', id);
    btn.innerHTML =
      '<span class="s-work__tab-title">' + esc(tab.title) + '</span>' +
      '<span class="s-work__tab-close" role="button" aria-label="Close tab" title="Close">&times;</span>';
    btn.addEventListener('click', function (ev) {
      if (ev.target.closest('.s-work__tab-close')) { ev.stopPropagation(); closeTab(id); return; }
      activateTab(id);
    });
    _bench.tabs.appendChild(btn);
    tab.els.tabBtn = btn;

    /* ---- page: chat ‖ canvas ---- */
    var page = el('div', 's-work__page' + (_active === null ? ' is-active' : ''));
    page.setAttribute('data-tab-id', id);
    page.innerHTML = pageTemplate(tab);
    _bench.pages.appendChild(page);

    // chat refs
    tab.els.page = page;
    tab.els.msgs = page.querySelector('[data-chat-msgs]');
    tab.els.composer = page.querySelector('[data-composer-input]');
    tab.els.send = page.querySelector('[data-composer-send]');
    tab.els.title = page.querySelector('[data-chat-title]');
    tab.els.crewLabel = page.querySelector('[data-crew-label]');
    tab.els.autoLabel = page.querySelector('[data-auto-label]');
    tab.els.modelLabel = page.querySelector('[data-model-label]');
    tab.els.ctxBar = page.querySelector('[data-ctx-bar]');
    tab.els.ctxNum = page.querySelector('[data-ctx-num]');
    tab.els.attachChip = page.querySelector('[data-attach-chip]');
    // canvas refs
    tab.els.canvasPanels = {};
    CANVAS_TABS.forEach(function (ct) {
      tab.els.canvasPanels[ct.id] = page.querySelector('[data-canvas="' + ct.id + '"]');
    });
    tab.els.diffList = page.querySelector('[data-diff-list]');

    wirePage(tab);

    if (_active === null) _active = id;
    else activateTab(id);

    _tabs.push(tab);
    renderEmptyState();

    if (opts.seedMessage) {
      // Defer so the page is painted + visible before we stream into it.
      var msg = opts.seedMessage;
      setTimeout(function () { sendMessage(tab, msg); }, 0);
    }
    return tab;
  }

  /* The HTML template for one page. Hooks are all data-* (stable). */
  function pageTemplate(tab) {
    var crewLbl = SPECIALISTS[tab.crewIdx];
    var autoLbl = AUTONOMY[tab.autoIdx].label;
    var modelLbl = (window.HubCatalog ? HubCatalog.chipLabel({ harness: tab.harness, model: tab.model }) : tab.model);
    return '' +
      '<div class="s-work__chat hub-card">' +
        '<div class="s-work__chat-head">' +
          '<span class="s-work__chat-title" data-chat-title>' + esc(tab.title) + '</span>' +
          '<button class="hub-btn-ghost s-work__chat-close" type="button" data-action="close-tab" aria-label="Close conversation">Close</button>' +
        '</div>' +
        '<div class="s-work__chat-msgs" data-chat-msgs></div>' +
        '<div class="s-work__composer">' +
          '<div class="s-work__composer-tools">' +
            '<button class="s-work__chip-btn" type="button" data-action="attach" aria-label="Attach a file" title="Attach a file (spreadsheet opens the viewer)">' +
              '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M11.5 4.5L6 10a2 2 0 102.8 2.8L13.5 8a3.5 3.5 0 00-5-5L3.7 7.8a5 5 0 007 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '<span data-attach-chip></span>' +
            '</button>' +
            '<button class="s-work__chip-btn chip" type="button" data-action="crew" aria-label="Crew specialist">' +
              '<span data-crew-label>' + esc(crewLbl) + '</span>' +
              '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<button class="s-work__chip-btn chip" type="button" data-action="autonomy" aria-label="Autonomy" title="How much freedom the agent has">' +
              '<span data-auto-label>' + esc(autoLbl) + '</span>' +
            '</button>' +
            '<button class="s-work__chip-btn chip" type="button" data-action="model" aria-label="Model">' +
              '<span data-model-label>' + esc(modelLbl) + '</span>' +
              '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="s-work__composer-inputrow">' +
            '<textarea class="s-work__composer-input" data-composer-input rows="1" placeholder="Reply, or add to the task…"></textarea>' +
            '<button class="hub-btn-primary s-work__composer-send" type="button" data-composer-send aria-label="Send">' +
              '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="s-work__composer-foot">' +
            '<span class="muted mono s-work__ctx-label">Context</span>' +
            '<span class="s-work__ctx-meter"><i data-ctx-bar></i></span>' +
            '<span class="muted mono" data-ctx-num>~0 / 120k</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      canvasTemplate();
  }

  function canvasTemplate() {
    var tabs = CANVAS_TABS.map(function (ct, i) {
      return '<button class="s-work__canvas-tab' + (i === 0 ? ' is-active' : '') + '" type="button" data-canvas-tab="' + ct.id + '">' + ct.label + '</button>';
    }).join('');

    var filesRows = WORKSPACE_FILES.map(function (f) {
      return '<button class="s-work__file-row" type="button" data-open-file="' + esc(f.path) + '">' +
        '<span class="s-work__file-path mono">' + esc(f.path) + '</span>' +
        '<span class="s-work__file-note muted">' + esc(f.note) + '</span>' +
      '</button>';
    }).join('');

    return '' +
      '<div class="s-work__canvas hub-card">' +
        '<div class="s-work__canvas-tabs" role="tablist">' + tabs + '</div>' +
        '<div class="s-work__canvas-panel is-active" data-canvas="preview">' +
          '<iframe class="s-work__preview" data-preview-frame title="Preview" src="about:blank"></iframe>' +
        '</div>' +
        '<div class="s-work__canvas-panel" data-canvas="diff">' +
          '<div class="s-work__diff-list" data-diff-list></div>' +
          '<div class="s-work__diff-empty muted">Changes the agent makes will surface here as hunks. ' +
            'Apply / reject needs a backend op that is not wired yet — diffs are shown live regardless.</div>' +
        '</div>' +
        '<div class="s-work__canvas-panel" data-canvas="files">' +
          '<div class="s-work__files-head between"><strong>Workspace</strong>' +
            '<button class="hub-btn-ghost" type="button" data-open-files-screen>Open Files →</button></div>' +
          filesRows +
        '</div>' +
        '<div class="s-work__canvas-panel" data-canvas="shell">' +
          '<div class="s-work__shell-status" data-shell-status>Checking for a remote shell…</div>' +
          '<div class="s-work__shell-out mono" data-shell-out></div>' +
          '<input class="s-work__shell-input mono" type="text" data-shell-input placeholder="Shell unavailable (sidecar-only feature)" disabled />' +
        '</div>' +
      '</div>';
  }

  /* ── Wire one page's interactions ──────────────────────────────────── */
  function wirePage(tab) {
    var p = tab.els.page;

    // send
    function submit() {
      var v = (tab.els.composer.value || '').trim();
      if (!v || tab.streaming) return;
      tab.els.composer.value = ''; autoGrow(tab);
      sendMessage(tab, v);
    }
    tab.els.send.addEventListener('click', submit);
    tab.els.composer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    function autoGrow(t) {
      var c = t.els.composer; c.style.height = 'auto'; c.style.height = Math.min(c.scrollHeight, 160) + 'px';
    }
    tab.els.composer.addEventListener('input', function () { autoGrow(tab); updateContextMeter(tab); });

    // close (chat head)
    var closeHead = p.querySelector('[data-action="close-tab"]');
    if (closeHead) closeHead.addEventListener('click', function () { closeTab(tab.id); });

    // attach (+) — spreadsheet → RBSheet viewer; other file → queued as context
    var attachBtn = p.querySelector('[data-action="attach"]');
    if (attachBtn) {
      attachBtn.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file'; input.style.display = 'none'; document.body.appendChild(input);
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          document.body.removeChild(input);
          if (!file) return;
          if (window.RBSheet && typeof window.RBSheet.isSheetFile === 'function' && window.RBSheet.isSheetFile(file)) {
            window.RBSheet.open(file, file.name);   // viewer slides in
            return;
          }
          tab.attached = { name: file.name, size: file.size };
          if (tab.els.attachChip) tab.els.attachChip.textContent = ' · ' + file.name;
          flashToast('Attached ' + file.name + ' (sent as context with your next message)');
          updateContextMeter(tab);
        });
        input.click();
      });
    }

    // crew cycle
    var crewBtn = p.querySelector('[data-action="crew"]');
    if (crewBtn) crewBtn.addEventListener('click', function () {
      tab.crewIdx = (tab.crewIdx + 1) % SPECIALISTS.length;
      if (tab.els.crewLabel) tab.els.crewLabel.textContent = SPECIALISTS[tab.crewIdx];
    });

    // autonomy cycle
    var autoBtn = p.querySelector('[data-action="autonomy"]');
    if (autoBtn) autoBtn.addEventListener('click', function () {
      tab.autoIdx = (tab.autoIdx + 1) % AUTONOMY.length;
      if (tab.els.autoLabel) tab.els.autoLabel.textContent = AUTONOMY[tab.autoIdx].label;
    });

    // model chip → reuse the shipped HubCatalog picker, scoped to this tab
    var modelBtn = p.querySelector('[data-action="model"]');
    if (modelBtn) modelBtn.addEventListener('click', function (e) {
      if (!window.HubCatalog) return;
      e.stopPropagation();
      HubCatalog.openPicker(modelBtn, function (sel) {
        tab.harness = sel.harness;
        tab.model = sel.model;
        if (tab.els.modelLabel) tab.els.modelLabel.textContent = HubCatalog.chipLabel(sel);
      });
    });

    // canvas tab switching
    p.querySelectorAll('[data-canvas-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cid = btn.getAttribute('data-canvas-tab');
        p.querySelectorAll('[data-canvas-tab]').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        CANVAS_TABS.forEach(function (ct) {
          var panel = tab.els.canvasPanels[ct.id];
          if (panel) panel.classList.toggle('is-active', ct.id === cid);
        });
        if (cid === 'preview') loadPreview(tab);
        if (cid === 'shell') ensureShell(tab);
      });
    });

    // files → route to the real Files screen
    p.querySelectorAll('[data-open-file]').forEach(function (row) {
      row.addEventListener('click', function () {
        var path = row.getAttribute('data-open-file');
        flashToast('Opening ' + path + ' in Files…');
        // router lives on the root document
        if (typeof window.activateScreen === 'function') window.activateScreen('files');
        else document.querySelector('[data-nav-item="files"]') && document.querySelector('[data-nav-item="files"]').click();
      });
    });
    var openFiles = p.querySelector('[data-open-files-screen]');
    if (openFiles) openFiles.addEventListener('click', function () {
      if (typeof window.activateScreen === 'function') window.activateScreen('files');
      else document.querySelector('[data-nav-item="files"]') && document.querySelector('[data-nav-item="files"]').click();
    });

    // load preview lazily on the active tab
    if (tab === activeTab()) loadPreview(tab);
    updateContextMeter(tab);
  }

  /* ── Tab activation / close ────────────────────────────────────────── */
  function activeTab() {
    for (var i = 0; i < _tabs.length; i++) if (_tabs[i].id === _active) return _tabs[i];
    return null;
  }
  function activateTab(id) {
    _active = id;
    _tabs.forEach(function (t) {
      var on = t.id === id;
      t.els.page.classList.toggle('is-active', on);
      t.els.tabBtn.classList.toggle('is-active', on);
      if (on) loadPreview(t);
    });
    var active = activeTab();
    if (active && active.els.msgs) active.els.msgs.scrollTop = active.els.msgs.scrollHeight;
  }
  function closeTab(id) {
    var idx = -1;
    for (var i = 0; i < _tabs.length; i++) if (_tabs[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var t = _tabs[idx];
    if (t.streaming) {
      if (t._stream && t._stream.abort) t._stream.abort();  // stop the SSE/fetch — never leak it
      t.streaming = false;
    }
    t.els.page.remove();
    t.els.tabBtn.remove();
    _tabs.splice(idx, 1);
    if (_active === id) {
      _active = _tabs.length ? _tabs[Math.max(0, idx - 1)].id : null;
      if (_active) activateTab(_active);
    }
    renderEmptyState();
  }

  /* ── Canvas: Preview (iframe), Shell (probe), Diff (live) ─────────── */
  function loadPreview(tab) {
    var frame = tab.els.page.querySelector('[data-preview-frame]');
    if (!frame || frame.dataset.loaded === '1') return;
    frame.dataset.loaded = '1';
    frame.src = '/preview/list.html';
  }

  var _shellProbed = false;   // the endpoint is global, probe once
  var _shellUp = false;
  function ensureShell(tab) {
    var panel = tab.els.canvasPanels.shell;
    if (!panel || panel.dataset.probed === '1') return;
    panel.dataset.probed = '1';
    var status = panel.querySelector('[data-shell-status]');
    var input = panel.querySelector('[data-shell-input]');
    var out = panel.querySelector('[data-shell-out]');

    function paint(ready) {
      if (status) status.textContent = ready
        ? 'Connected to a remote shell.'
        : 'No remote shell — the terminal is a sidecar-only feature (localhost:7456).';
      if (input) { input.disabled = !ready; input.placeholder = ready ? 'Type a command and press Enter…' : 'Shell unavailable (sidecar-only feature)'; }
    }
    function echo(line, cls) {
      var d = el('div', 's-terminal__line' + (cls ? ' ' + cls : ''), esc(line));
      out.appendChild(d); out.scrollTop = out.scrollHeight;
    }
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = input.value.trim(); input.value = '';
      if (!v) return;
      echo('$ ' + v, 's-terminal__line--input');
      if (!_shellUp) { echo('Shell unavailable — cannot execute commands', 's-terminal__line--error'); return; }
      echo('Command execution not yet wired to a cloud shell endpoint', 's-terminal__line--info');
    });

    if (_shellProbed) { paint(_shellUp); return; }
    _shellProbed = true;
    if (typeof HubAPI === 'undefined') { paint(false); return; }
    /* Same dead probe the Terminal screen had: /api/shell/status has never
       existed, so this fired a guaranteed 404 on every boot (this runs on the
       Work screen, which is the landing surface). Set CLOUD_SHELL_ROUTE when a
       lane ships the endpoint. */
    var CLOUD_SHELL_ROUTE = '';
    if (!CLOUD_SHELL_ROUTE) { _shellUp = false; paint(false); return; }
    fetch(CLOUD_SHELL_ROUTE, { method: 'HEAD', credentials: 'include' })
      .then(function (r) { _shellUp = !!(r.ok || r.status === 401); paint(_shellUp); })
      .catch(function () { _shellUp = false; paint(false); });
  }

  function touchCanvasDiff(tab, data) {
    if (!tab.els.diffList) return;
    var name = data.tool_name || '';
    // surface only tools that look like they touch files
    if (!/edit|write|patch|file|read|apply|save/i.test(name)) return;
    var empty = tab.els.canvasPanels.diff.querySelector('.s-work__diff-empty');
    if (empty) empty.style.display = 'none';
    var row = el('div', 's-work__diff-hunk',
      '<div class="s-work__diff-tool mono">⇢ ' + esc(name) +
        (data.tool_input ? ' · ' + esc(truncate(JSON.stringify(data.tool_input), 80)) : '') + '</div>' +
      '<div class="s-work__diff-actions">' +
        '<button class="hub-btn-ghost s-work__diff-btn" type="button" data-diff-action="apply">Apply</button>' +
        '<button class="hub-btn-ghost s-work__diff-btn" type="button" data-diff-action="reject">Reject</button>' +
      '</div>');
    row.querySelectorAll('[data-diff-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        flashToast('Apply / reject needs a backend op not yet wired — diff is shown live only.');
      });
    });
    tab.els.diffList.appendChild(row);
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ── Context ArcMeter — honest estimate from rendered conversation ─── */
  function updateContextMeter(tab) {
    if (!tab.els.ctxBar) return;
    var chars = 0;
    if (tab.els.msgs) {
      // approx: a token per ~3.3 chars of visible conversation text
      tab.els.msgs.querySelectorAll('.s-work__bubble, .s-work__toolrow').forEach(function (n) {
        chars += (n.textContent || '').length;
      });
    }
    if (tab.els.composer) chars += (tab.els.composer.value || '').length;
    var tokens = Math.round(chars / 3.3);
    var CAP = 120000;            // a representative context cap for the meter
    var pct = Math.max(0, Math.min(100, (tokens / CAP) * 100));
    tab.els.ctxBar.style.width = pct.toFixed(1) + '%';
    if (tab.els.ctxNum) tab.els.ctxNum.textContent = '~' + fmtTokens(tokens) + ' / ' + fmtTokens(CAP);
  }
  function fmtTokens(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }

  /* ── Chat bubbles ──────────────────────────────────────────────────── */
  function addBubble(tab, role, text) {
    var b = el('div', 's-work__bubble s-work__bubble--' + role);
    b.textContent = text || '';
    tab.els.msgs.appendChild(b);
    tab.els.msgs.scrollTop = tab.els.msgs.scrollHeight;
    return b;
  }
  function addToolRow(tab, name, before) {
    var t = el('div', 's-work__toolrow', '⇢ ' + esc(name));
    tab.els.msgs.insertBefore(t, before);
    tab.els.msgs.scrollTop = tab.els.msgs.scrollHeight;
  }
  function setSendDisabled(tab, on) {
    if (tab.els.send) { if (on) tab.els.send.setAttribute('disabled', ''); else tab.els.send.removeAttribute('disabled'); }
  }

  function buildSystemMessage(tab) {
    // Light, honest context: who's on it + how free they are. Passed as
    // system_message; the backend may ignore it.
    var lines = [];
    lines.push('Crew specialist: ' + SPECIALISTS[tab.crewIdx] + '.');
    lines.push(AUTONOMY[tab.autoIdx].hint);
    if (tab.attached) lines.push('A file is attached as context: ' + tab.attached.name + ' (' + tab.attached.size + ' bytes).');
    return lines.join(' ');
  }

  /* ── Start a conversation from the entry task ─────────────────────── */
  function startConversation(task) {
    buildBench();
    if (taskTextarea) taskTextarea.value = '';
    if (estimateEl) estimateEl.textContent = '≈ 0 tokens';
    var t = newTab({ title: task.slice(0, 48), seedMessage: task });
    activateTab(t.id);
  }

  /* ── Ensure a session exists for a tab, then send ─────────────────── */
  function ensureSession(tab, firstMessage) {
    if (tab.sessionId) return Promise.resolve(tab.sessionId);
    if (typeof HubAPI === 'undefined' || !HubAPI.sessions) return Promise.resolve(null);
    return HubAPI.sessions.create(firstMessage || tab.title || 'Work').then(function (r) {
      if (!r || !r.ok || !r.data) throw r;
      var sid = r.data.id || r.data.session_id;
      if (!sid) throw r;
      tab.sessionId = sid;
      // reflect a trimmed session title if the backend gave one
      if (r.data.title && tab.els.title) { tab.title = r.data.title; tab.els.title.textContent = r.data.title; }
      return sid;
    });
  }

  function sendMessage(tab, message) {
    message = (message || '').trim();
    if (!message || tab.streaming) return;
    addBubble(tab, 'user', message);
    var agent = addBubble(tab, 'agent', '');
    agent.classList.add('is-typing');
    var _typ = document.createElement('span'); _typ.className = 's-work__typing';
    for (var _d = 0; _d < 3; _d++) _typ.appendChild(document.createElement('i'));
    agent.appendChild(_typ);
    tab.streaming = true;
    tab.agentBubble = agent;
    setSendDisabled(tab, true);

    ensureSession(tab, message).then(function (sid) {
      if (!sid) { onStreamError(tab, agent, 'Sign in to start a task'); return; }
      var firstDelta = true;
      tab._stream = HubAPI.chatStream({
        sessionId: sid,
        message: message,
        model: tab.model,
        harness: tab.harness,
        system_message: buildSystemMessage(tab),
      }, {
        onText: function (delta) {
          if (firstDelta) { agent.classList.remove('is-typing'); agent.textContent = ''; firstDelta = false; }
          agent.textContent += delta;
          if (tab.id === _active) tab.els.msgs.scrollTop = tab.els.msgs.scrollHeight;
        },
        onEvent: function (event, data) {
          if (event === 'tool.started' && data && data.tool_name && data.tool_name !== '_thinking') {
            addToolRow(tab, data.tool_name, agent);
            touchCanvasDiff(tab, data);
          }
        },
        onDone: function () {
          tab.streaming = false; tab._stream = null; setSendDisabled(tab, false);
          if (firstDelta) { agent.classList.remove('is-typing'); agent.textContent = '(no response)'; }
          updateContextMeter(tab);
          loadSessions();
        },
        onError: function (err, info) {
          var msg = String(err || 'error');
          if (info && info.status === 401) msg = 'Sign in to start a task';
          onStreamError(tab, agent, msg);
        },
      });
    }).catch(function (r) {
      var msg = (r && r.status === 401) ? 'Sign in to start a task' : 'Could not start the task';
      onStreamError(tab, agent, msg);
    });
    updateContextMeter(tab);
  }

  function onStreamError(tab, agent, msg) {
    tab.streaming = false; tab._stream = null; setSendDisabled(tab, false);
    agent.classList.remove('is-typing');
    agent.classList.add('s-work__bubble--error');
    agent.textContent = msg;
    updateContextMeter(tab);
  }

  /* ── Load sessions into Recent work + Stats ────────────────────────── */
  function loadSessions() {
    if (typeof HubAPI === 'undefined' || !HubAPI.sessions) return;
    HubAPI.sessions.list().then(function (result) {
      if (!result.ok || !result.data) return;
      var sessions = Array.isArray(result.data) ? result.data : (result.data.sessions || []);
      renderSessions(sessions);
    });
  }

  function renderSessions(sessions) {
    var list = screen.querySelector('.s-work__list');
    if (list) {
      list.innerHTML = '';
      if (sessions.length === 0) {
        list.innerHTML = '<li class="muted" style="padding:16px 0;text-align:center;">No work yet. Start a task above.</li>';
      } else {
        sessions.slice(0, 8).forEach(function (sess) {
          var title = sess.title || sess.goal || 'Work session';
          var specialist = sess.specialist || sess.agent || '';
          var status = sess.status || 'completed';
          var statusClass = status === 'running' || status === 'in_progress' ? 'chip--standby'
            : status === 'failed' ? 'chip--offline' : 'chip--online';
          var statusLabel = status === 'running' ? 'Running' : status === 'failed' ? 'Failed' : 'Done';
          var ts = timeAgo(sess.created_at || sess.updated_at);
          var li = document.createElement('li');
          li.className = 's-work__row';
          li.innerHTML = '\
            <div class="s-work__row-main">\
              <span class="s-work__row-title">' + esc(title) + '</span>\
              <div class="row wrap">\
                <span class="chip chip--mono">' + esc(specialist || 'General') + '</span>\
                <span class="mono muted s-work__row-ts">' + ts + '</span>\
              </div>\
            </div>\
            <span class="chip ' + statusClass + '"><span class="dot"></span>' + statusLabel + '</span>';
          list.appendChild(li);
        });
      }
    }

    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todaySessions = sessions.filter(function (s) { return s.created_at && new Date(s.created_at) >= todayStart; });
    var tasksTodayEl = screen.querySelector('.s-work__stat:nth-child(1) .s-work__stat-num');
    if (tasksTodayEl) tasksTodayEl.textContent = String(todaySessions.length);

    var totalTokens = 0; sessions.forEach(function (s) { totalTokens += s.total_tokens || 0; });
    var tokensEl = screen.querySelector('.s-work__stat:nth-child(2) .s-work__stat-num');
    if (tokensEl) tokensEl.textContent = totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : String(totalTokens);

    var totalCost = 0; sessions.forEach(function (s) { totalCost += s.total_cost || 0; });
    var avgCost = sessions.length > 0 ? totalCost / sessions.length : 0;
    var costEl = screen.querySelector('.s-work__stat:nth-child(3) .s-work__stat-num');
    if (costEl) costEl.textContent = '$' + avgCost.toFixed(2);
  }

  /* ── Clear history ─────────────────────────────────────────────────── */
  var clearBtn = screen.querySelector('.s-work__recent-footer .hub-btn-ghost');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      _tabs.slice().forEach(function (t) { t.els.page.remove(); t.els.tabBtn.remove(); });
      _tabs = []; _active = null;
      renderEmptyState();
      loadSessions();
    });
  }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  var _toastTimer;
  function flashToast(msg, tone) {
    var t = document.getElementById('rhoToast');
    if (!t) { t = document.createElement('div'); t.id = 'rhoToast'; document.body.appendChild(t); }
    t.textContent = msg;
    var borderColor = tone === 'error' ? 'var(--hub-offline,#EF4444)' : 'var(--hub-border)';
    t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:130;' +
      'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid ' + borderColor + ';' +
      'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.84rem;font-weight:600;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.5);opacity:0;transition:opacity 200ms ease;';
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ── Initial load ──────────────────────────────────────────────────── */
  loadSessions();
  /* Notes → Builds handoff: start the real persistent session after the Work
     surface is mounted. The brief is consumed once by api.js and then removed
     from the address bar, so reloads never duplicate a build. */
  if (typeof HubAPI !== 'undefined' && HubAPI.pendingBrief) {
    var handoff = HubAPI.pendingBrief;
    setTimeout(function () {
      var workNav = document.querySelector('[data-nav-item="work"]');
      if (workNav) workNav.click();
      var prompt = 'Source brief: ' + handoff.title + '\n\n' + handoff.body;
      var t = newTab({ title: handoff.title, harness: handoff.harness, model: handoff.model, seedMessage: prompt });
      activateTab(t.id);
    }, 0);
  }
})();
