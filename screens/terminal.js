/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Terminal screen controller
   CLI surface against the workspace. The cloud has no shell endpoint
   (no /api/cli or /api/shell) — the terminal is a sidecar-only feature
   on port 7456. We state this honestly and disable input.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var screen = document.querySelector('[data-screen="terminal"]');
  if (!screen) return;

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  var input = screen.querySelector('[data-terminal-input]');
  var output = screen.querySelector('[data-terminal-out]');
  var statusText = screen.querySelector('[data-terminal-status-text]');
  var statusChip = screen.querySelector('[data-terminal-status]');
  var clearBtn = screen.querySelector('[data-terminal-clear]');

  /* ── Check for a cloud shell endpoint ────────────────────────────────
     The old cloud app and the local Hub both route CLI through the sidecar
     (localhost:7456/cli/streams). No such endpoint exists at the cloud
     origin (/api/*) — verify this remains true by probing once.
     If a future lane wires /api/shell, the banner below auto-updates.
     ──────────────────────────────────────────────────────────────────── */
  var SHELL_AVAILABLE = false;

  /* There is no cloud shell route, and there never has been. This used to HEAD
     /api/shell/status on every visit to "feature-detect" it, which meant a
     guaranteed 404 in the console every single time — a probe for something
     nobody has ever shipped is not detection, it is noise. When a lane actually
     wires the endpoint, flip CLOUD_SHELL_ROUTE to its path and this goes back to
     probing on exactly the deploy where the probe can succeed. */
  var CLOUD_SHELL_ROUTE = '';

  function checkShellEndpoint() {
    if (typeof HubAPI === 'undefined') return;
    if (!CLOUD_SHELL_ROUTE) { setUnavailable(); return; }
    fetch(CLOUD_SHELL_ROUTE, { method: 'HEAD', credentials: 'include' })
      .then(function (res) {
        if (res.ok || res.status === 401) {
          // Endpoint exists (even if unauthenticated) — we can use it
          SHELL_AVAILABLE = true;
          setStatus('ready', 'Connected');
          if (input) input.disabled = false;
        } else {
          setUnavailable();
        }
      })
      .catch(function () {
        setUnavailable();
      });
  }

  function setUnavailable() {
    SHELL_AVAILABLE = false;
    setStatus('offline', 'No remote shell — the terminal is a sidecar-only feature');
    if (input) {
      input.disabled = true;
      input.placeholder = 'Shell unavailable (sidecar-only feature)';
    }
  }

  function setStatus(tone, text) {
    if (statusText) statusText.textContent = text;
    if (statusChip) {
      statusChip.className = 'chip chip--' + tone;
      var dot = statusChip.querySelector('.dot');
      if (dot) {
        if (tone === 'offline') {
          dot.style.cssText = 'background:var(--hub-offline);box-shadow:none';
        } else {
          dot.style.cssText = 'background:var(--hub-online);box-shadow:0 0 6px var(--hub-online)';
        }
      }
    }
  }

  function appendToOutput(text, className) {
    if (!output) return;
    var line = document.createElement('div');
    line.className = 's-terminal__line' + (className ? ' ' + className : '');
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  /* ── Wire input (available only if shell endpoint exists) ─────────── */
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var val = input.value.trim();
      if (!val) return;
      if (!SHELL_AVAILABLE) {
        appendToOutput('Shell unavailable — cannot execute commands', 's-terminal__line--error');
        return;
      }
      // Echo command
      appendToOutput('> ' + val, 's-terminal__line--input');

      // Placeholder: in future, POST to /api/shell or /api/cli
      appendToOutput('Command execution not yet wired to a cloud shell endpoint', 's-terminal__line--info');

      input.value = '';
    });
  }

  /* ── Wire clear button ────────────────────────────────────────────── */
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (output) output.innerHTML = '';
    });
  }

  /* ── Initial output banner ────────────────────────────────────────── */
  appendToOutput('RHOBEAR Terminal — workspace shell');
  appendToOutput('');

  /* ── Init ─────────────────────────────────────────────────────────── */
  checkShellEndpoint();
})();
