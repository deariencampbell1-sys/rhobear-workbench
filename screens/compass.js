/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — COMPASS screen behaviour.
   IIFE scoped to [data-screen="compass"].

   A calm chat surface where the user reasons with the RHOBEAR agent.
   Real harness/model picker (HubCatalog, driven by /v1/models), backed by
   /api/sessions + /chat/stream — same contract as WORK, mirrored from
   screens/work.js (beginSession → sessions.create → sendMessage → chatStream).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="compass"]');
  if (!screen) return;

  /* ── Minimal structural styles (flex column + scroll). ─────────────────
     Partner owns the skin; this block is function-only: the log must scroll
     independently of the composer, streaming newlines must render, and the
     typing dots need their keyframes. No colors / spacing opinions. */
  var style = document.createElement('style');
  style.textContent = [
    '.s-compass__card{display:flex;flex-direction:column;min-height:420px;max-height:calc(100vh - 260px);}',
    '.s-compass__log{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:4px 2px;}',
    '.s-compass__composer{display:flex;align-items:flex-end;gap:8px;}',
    '.s-compass__input{flex:1;min-height:44px;resize:none;}',
    '.s-compass__bubble{white-space:pre-wrap;word-wrap:break-word;}',
    '.s-compass__empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:48px 16px;}',
    '.s-compass__typing{display:inline-flex;gap:3px;}',
    '.s-compass__typing i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.4;animation:s-compass-blink 1.2s infinite;}',
    '.s-compass__typing i:nth-child(2){animation-delay:.2s;}',
    '.s-compass__typing i:nth-child(3){animation-delay:.4s;}',
    '@keyframes s-compass-blink{0%,80%,100%{opacity:.25;}40%{opacity:1;}}',
  ].join('\n');
  document.head.appendChild(style);

  /* ── Data hooks ─────────────────────────────────────────────────────── */
  var logEl      = screen.querySelector('[data-compass-log]');
  var inputEl    = screen.querySelector('[data-compass-input]');
  var sendBtn    = screen.querySelector('[data-compass-send]');
  var modelBtn   = screen.querySelector('[data-compass-model]');
  var modelLabel = screen.querySelector('[data-compass-model-label]');

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function currentModelId() {
    if (window.HubCatalog) {
      var sel = HubCatalog.readSelection();
      if (sel && sel.model) return sel.model;
    }
    return 'core';
  }

  function paintModel() {
    if (!window.HubCatalog || !modelLabel) return;
    modelLabel.textContent = HubCatalog.chipLabel(HubCatalog.readSelection());
  }

  function scrollLog() { if (logEl) logEl.scrollTop = logEl.scrollHeight; }

  function clearEmpty() {
    var empty = logEl && logEl.querySelector('.s-compass__empty');
    if (empty) empty.remove();
  }

  function addBubble(role, text) {
    if (!logEl) return null;
    var b = document.createElement('div');
    b.className = 's-compass__bubble s-compass__bubble--' + role;
    b.textContent = text || '';
    logEl.appendChild(b);
    scrollLog();
    return b;
  }

  // Non-spammy: at most one notice per kind — reuse it instead of stacking.
  function ensureNotice(kind, text) {
    if (!logEl) return null;
    var existing = logEl.querySelector('.s-compass__notice--' + kind);
    if (existing) { existing.textContent = text || ''; scrollLog(); return existing; }
    var n = document.createElement('div');
    n.className = 's-compass__notice muted s-compass__notice--' + kind;
    n.setAttribute('role', 'status');
    n.textContent = text || '';
    logEl.appendChild(n);
    scrollLog();
    return n;
  }

  function showTyping(agent) {
    agent.classList.add('is-typing');
    agent.textContent = '';
    var wrap = document.createElement('span');
    wrap.className = 's-compass__typing';
    wrap.setAttribute('aria-label', 'Compass is thinking');
    // Streaming path — build the dots as DOM nodes; never innerHTML here.
    for (var _d = 0; _d < 3; _d++) wrap.appendChild(document.createElement('i'));
    agent.appendChild(wrap);
  }

  function setBusy(busy) {
    _streaming = !!busy;
    if (sendBtn) { if (busy) sendBtn.setAttribute('disabled', ''); else sendBtn.removeAttribute('disabled'); }
    if (inputEl) { if (busy) inputEl.setAttribute('disabled', ''); else inputEl.removeAttribute('disabled'); }
  }

  /* ── Model picker — reuse HubCatalog (driven by /v1/models) ─────────── */
  if (modelBtn && window.HubCatalog) {
    paintModel();
    modelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      HubCatalog.openPicker(modelBtn, function () { paintModel(); });
    });
  }

  /* ── Conversation state — one active session per page load ─────────── */
  var _activeSessionId = null;
  var _streaming = false;

  function beginSession(message) {
    if (typeof HubAPI === 'undefined' || !HubAPI.sessions) {
      ensureNotice('error', 'Chat is not available right now.');
      return;
    }
    setBusy(true);
    // sessions.create() truncates to 40 chars + appends a uniquifier itself;
    // pass a human title derived from the first message.
    HubAPI.sessions.create(message.slice(0, 40)).then(function (result) {
      if (!result || !result.ok || !result.data) {
        setBusy(false);
        if (result && result.status === 401) {
          ensureNotice('auth', 'Sign in to chat with Compass.');
        } else {
          ensureNotice('error', 'Could not start the conversation.');
        }
        return;
      }
      var sid = result.data.id || result.data.session_id;
      if (!sid) {
        setBusy(false);
        ensureNotice('error', 'Could not start the conversation.');
        return;
      }
      _activeSessionId = sid;
      sendMessage(message);
    });
  }

  function sendMessage(message) {
    if (!_activeSessionId) { beginSession(message); return; }
    if (typeof HubAPI === 'undefined' || !HubAPI.chatStream) return;
    clearEmpty();
    addBubble('user', message);
    var agent = addBubble('agent', '');
    showTyping(agent);
    setBusy(true);

    var firstDelta = true;
    HubAPI.chatStream({
      sessionId: _activeSessionId,
      message: message,
      model: currentModelId(),
    }, {
      onText: function (delta) {
        // SURGICAL: append a text node — never innerHTML the streaming region.
        if (firstDelta) {
          agent.classList.remove('is-typing');
          agent.textContent = '';
          firstDelta = false;
        }
        agent.appendChild(document.createTextNode(delta));
        scrollLog();
      },
      onEvent: function (event, data) {
        if (event === 'tool.started' && data && data.tool_name && data.tool_name !== '_thinking') {
          var tool = document.createElement('div');
          tool.className = 's-compass__toolrow mono muted';
          tool.textContent = '⇢ ' + data.tool_name;
          if (agent.parentNode === logEl) logEl.insertBefore(tool, agent);
          scrollLog();
        }
      },
      onDone: function () {
        setBusy(false);
        if (firstDelta) {
          agent.classList.remove('is-typing');
          agent.textContent = '(no response)';
        }
      },
      onError: function (err, info) {
        setBusy(false);
        var status = info && info.status;
        if (status === 401) {
          // Inline, non-spammy — drop the empty agent bubble, keep the user
          // message, show one auth notice, and force the next send to retry
          // the session-create path (which is where 401 normally surfaces).
          if (agent.parentNode) agent.remove();
          _activeSessionId = null;
          ensureNotice('auth', 'Sign in to chat with Compass.');
          return;
        }
        agent.classList.remove('is-typing');
        agent.classList.add('s-compass__bubble--error');
        console.error('[compass] stream error:', err);
        agent.textContent = (err && err.message) ? err.message : 'Something went wrong. Try again.';
      },
    });
  }

  /* ── Composer — Enter sends, Shift+Enter newline (matches work.js) ──── */
  function autoGrow() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
  }

  function submit() {
    if (!inputEl) return;
    var v = inputEl.value.trim();
    if (!v || _streaming) return;
    inputEl.value = '';
    autoGrow();
    sendMessage(v);
  }

  if (sendBtn) sendBtn.addEventListener('click', submit);
  if (inputEl) {
    inputEl.addEventListener('input', autoGrow);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
  }

  /* ── Initial paint ──────────────────────────────────────────────────── */
  paintModel();
})();
