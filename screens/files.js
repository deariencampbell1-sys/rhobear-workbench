/* Files screen — tree navigation + code preview swap + storage wiring.
   IIFE scoped to [data-screen="files"]. Exposes nothing global.
   - Loads storage accounts on init; shows connected state if available.
   - Upload button opens file picker and uploads to connected storage.
   - clicking a tree file → updates breadcrumb + lang chip + swaps <code> from
     an in-file dictionary of snippets; unknown paths fall back to a graceful empty.
   - clicking a folder head → toggles its children open/closed and aria-expanded.
   - copy button → brief "copied" flash. */
(function () {
  'use strict';

  var root = document.querySelector('[data-screen="files"]');
  if (!root) return;

  /* ═══ Storage check (cloud endpoint) ═════════════════════════════ */
  var _storageConnected = false;
  var _selectedAccount = null;

  function checkStorage() {
    if (typeof HubAPI === 'undefined' || !HubAPI.storage || !HubAPI.storage.accounts) return;
    HubAPI.storage.accounts().then(function (result) {
      if (result.ok && result.data && result.data.accounts && result.data.accounts.length > 0) {
        _storageConnected = true;
        _selectedAccount = result.data.accounts[0].id;

        // Show a chip in the page head indicating storage is connected
        var headRow = root.querySelector('.page-head__row');
        if (headRow) {
          var chip = document.createElement('span');
          chip.className = 'chip chip--accent';
          chip.innerHTML = '<span class="dot" style="background:var(--hub-online);box-shadow:0 0 6px var(--hub-online)"></span> Storage connected';
          chip.style.fontSize = '0.72rem';
          headRow.appendChild(chip);
        }
      }
    });
  }
  checkStorage();

  /* ═══ Toast helper ═══════════════════════════════════════════════ */
  var _toastTimer;
  function flashNotice(msg, tone) {
    tone = tone || '';
    var t = document.getElementById('rhoToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rhoToast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    var borderColor = tone === 'error' ? 'var(--hub-offline)' : 'var(--hub-border)';
    t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:90;' +
      'background:var(--hub-glass-bg);backdrop-filter:blur(14px);border:1px solid ' + borderColor + ';' +
      'color:var(--hub-text-primary);padding:10px 18px;border-radius:99px;font-size:0.84rem;font-weight:600;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.5),0 0 24px rgba(42,143,168,0.3);opacity:0;transition:opacity 200ms ease;';
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ═══ Upload button wiring ════════════════════════════════════════ */
  var uploadBtn = root.querySelector('.s-files__upload');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function () {
      if (!_storageConnected) {
        /* There is no storage control in Settings — it is on Vault, which is
           where the connect wizard lives. Sending people to Settings was
           sending them nowhere. */
        flashNotice('Connect your storage on the Vault screen first', 'error');
        return;
      }

      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', function (e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        document.body.removeChild(input);
        if (!files.length) return;

        /* This used to flash "Upload coming to connected storage" and drop the
           files on the floor — the comment said the presigned flow was "complex".
           It is the same two steps the Vault uses: ask our API to sign a PUT,
           then send the bytes from here straight to the customer's bucket. */
        flashNotice('Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…', '');

        var done = 0, failed = 0;
        files.reduce(function (chain, file) {
          return chain.then(function () {
            return fetch('/api/storage/upload-url', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accountId: _selectedAccount,
                key: 'files/' + file.name,
                contentType: file.type || 'application/octet-stream'
              })
            }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
              .then(function (res) {
                if (res.status === 402) throw new Error('paid plan required');
                if (!res.d || !res.d.ok || !res.d.url) throw new Error((res.d && res.d.error) || 'no upload url');
                return fetch(res.d.url, {
                  method: 'PUT',
                  headers: { 'Content-Type': file.type || 'application/octet-stream' },
                  body: file
                });
              })
              .then(function (put) {
                if (!put.ok) throw new Error('bucket returned ' + put.status);
                done++;
              })
              .catch(function (err) {
                failed++;
                /* A cross-origin PUT blocked by CORS rejects with a bare
                   TypeError. Name the real cause instead of "upload failed". */
                var why = (err && err.message) ? err.message : 'the bucket refused it';
                if (why === 'Failed to fetch' || err instanceof TypeError) {
                  why = 'your bucket needs a CORS rule for this site — the Vault screen has it';
                }
                flashNotice(file.name + ': ' + why, 'error');
              });
          });
        }, Promise.resolve()).then(function () {
          if (done) flashNotice(done + ' uploaded to your bucket' + (failed ? ', ' + failed + ' failed' : ''), failed ? 'error' : '');
        });
      });

      input.click();
    });
  }

  /* ── snippet dictionary: path → { lang, html } ─────────────────────
     html is a tight run of <span class="s-files__line">…</span> rows so the
     CSS line-counter resets cleanly. Tokens (.tok-h / .tok-key / .tok-str /
     .tok-com / .tok-fence / .tok-bullet / .tok-num) get tasteful accent colour. */
  var L = '<span class="s-files__line">';   // line-open
  var X = '</span>';                         // line-close
  function lines() { return Array.prototype.join.call(arguments, ''); }

  var snippets = {
    'crew/architect.md': {
      lang: 'md',
      html: lines(
        L + '<span class="tok-h"># Architect</span>' + X,
        L + X,
        L + 'The Architect plans the work. Hands out lanes, holds the shape.' + X,
        L + X,
        L + '<span class="tok-h">## Strengths</span>' + X,
        L + '<span class="tok-bullet">-</span> Sees the whole board before the first move' + X,
        L + '<span class="tok-bullet">-</span> Writes briefs others can execute cold' + X,
        L + '<span class="tok-bullet">-</span> Stops scope creep at the door' + X,
        L + X,
        L + '<span class="tok-h">## When to call</span>' + X,
        L + '<span class="tok-bullet">-</span> Multi-step builds that span files' + X,
        L + '<span class="tok-bullet">-</span> Anything prefixed with "the new…"' + X,
        L + '<span class="tok-bullet">-</span> When the brief feels thin' + X,
        L + X,
        L + '<span class="tok-fence">```yaml</span>' + X,
        L + '<span class="tok-key">role:</span> architect' + X,
        L + '<span class="tok-key">priority:</span> planning' + X,
        L + '<span class="tok-key">parallelize:</span> <span class="tok-str">true</span>' + X,
        L + '<span class="tok-fence">```</span>' + X
      )
    },

    'crew/researcher.md': {
      lang: 'md',
      html: lines(
        L + '<span class="tok-h"># Researcher</span>' + X,
        L + X,
        L + 'Deep search across the open web, then the closed shelves.' + X,
        L + X,
        L + '<span class="tok-h">## Strengths</span>' + X,
        L + '<span class="tok-bullet">-</span> Reads three papers, summarises one' + X,
        L + '<span class="tok-bullet">-</span> Cites what it uses, never invents sources' + X,
        L + '<span class="tok-bullet">-</span> Asks the next question instead of stopping early' + X,
        L + X,
        L + '<span class="tok-h">## When to call</span>' + X,
        L + '<span class="tok-bullet">-</span> "What does the literature say about…"' + X,
        L + '<span class="tok-bullet">-</span> Need a cited report, not a hunch' + X,
        L + '<span class="tok-bullet">-</span> Verifying a claim before it ships' + X,
        L + X,
        L + '<span class="tok-fence">```yaml</span>' + X,
        L + '<span class="tok-key">role:</span> researcher' + X,
        L + '<span class="tok-key">depth:</span> thorough' + X,
        L + '<span class="tok-key">cite:</span> <span class="tok-str">required</span>' + X,
        L + '<span class="tok-fence">```</span>' + X
      )
    },

    'README.md': {
      lang: 'md',
      html: lines(
        L + '<span class="tok-h"># Workspace</span>' + X,
        L + X,
        L + "Your crew's shared workspace. Drop skills, notes, and run logs here." + X,
        L + X,
        L + '<span class="tok-h">## Layout</span>' + X,
        L + '<span class="tok-bullet">-</span> <span class="tok-key">crew/</span>      specialist profiles' + X,
        L + '<span class="tok-bullet">-</span> <span class="tok-key">skills/</span>    reusable skills (markdown)' + X,
        L + '<span class="tok-bullet">-</span> <span class="tok-key">notes/</span>     long-form scratch and meeting notes' + X,
        L + '<span class="tok-bullet">-</span> <span class="tok-key">README.md</span>  you are here' + X,
        L + '<span class="tok-bullet">-</span> <span class="tok-key">run-log.json</span>  last 50 runs, machine-readable' + X,
        L + X,
        L + '<span class="tok-h">## Conventions</span>' + X,
        L + '<span class="tok-bullet">-</span> Filenames lowercase, dash-separated.' + X,
        L + '<span class="tok-bullet">-</span> Every skill starts with a one-line summary.' + X,
        L + '<span class="tok-bullet">-</span> Date runs as ISO 8601.' + X
      )
    },

    'run-log.json': {
      lang: 'json',
      html: lines(
        L + '<span class="tok-com">// Last 50 crew runs, newest first.</span>' + X,
        L + '{' + X,
        L + '  <span class="tok-key">"runs"</span>: [' + X,
        L + '    {' + X,
        L + '      <span class="tok-key">"id"</span>: <span class="tok-str">"r_8a3f"</span>,' + X,
        L + '      <span class="tok-key">"specialist"</span>: <span class="tok-str">"architect"</span>,' + X,
        L + '      <span class="tok-key">"status"</span>: <span class="tok-str">"complete"</span>,' + X,
        L + '      <span class="tok-key">"tokens"</span>: <span class="tok-num">14802</span>,' + X,
        L + '      <span class="tok-key">"ended_at"</span>: <span class="tok-str">"2026-07-19T14:22:08Z"</span>' + X,
        L + '    },' + X,
        L + '    {' + X,
        L + '      <span class="tok-key">"id"</span>: <span class="tok-str">"r_8a40"</span>,' + X,
        L + '      <span class="tok-key">"specialist"</span>: <span class="tok-str">"coder"</span>,' + X,
        L + '      <span class="tok-key">"status"</span>: <span class="tok-str">"running"</span>' + X,
        L + '    }' + X,
        L + '  ]' + X,
        L + '}' + X
      )
    }
  };

  /* graceful fallback for files without a snippet */
  var EMPTY_HTML = lines(
    L + '<span class="tok-com">// No preview available</span>' + X,
    L + X,
    L + 'This file is empty or not yet drafted.' + X,
    L + X,
    L + '<span class="tok-com">// Ping the Librarian to scaffold it.</span>' + X
  );

  /* ── wire DOM ───────────────────────────────────────────────────── */
  var breadcrumb  = root.querySelector('.s-files__breadcrumb');
  var langChip    = root.querySelector('.s-files__lang-chip');
  var codeContent = root.querySelector('.s-files__code-content');
  var fileRows    = root.querySelectorAll('.s-files__file');
  var folderHeads = root.querySelectorAll('.s-files__folder-head');

  function escapePart(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderBreadcrumb(path) {
    var parts = path.split('/');
    breadcrumb.innerHTML = parts.map(function (part, i) {
      var last = i === parts.length - 1;
      var cls = 's-files__crumb' + (last ? ' s-files__crumb--last' : '');
      return (i === 0 ? '' : '<span class="s-files__sep">/</span>') +
             '<span class="' + cls + '">' + escapePart(part) + '</span>';
    }).join('');
  }
  function langFromPath(path) {
    var dot = path.lastIndexOf('.');
    return dot === -1 ? '—' : path.slice(dot + 1).toLowerCase();
  }

  function selectFile(path) {
    fileRows.forEach(function (row) {
      row.classList.toggle('is-selected', row.dataset.file === path);
    });
    renderBreadcrumb(path);
    if (langChip) langChip.textContent = langFromPath(path);
    if (codeContent) {
      var snip = snippets[path];
      codeContent.innerHTML = snip ? snip.html : EMPTY_HTML;
    }
  }

  fileRows.forEach(function (row) {
    row.addEventListener('click', function () {
      var path = row.dataset.file;
      if (path) selectFile(path);
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
  });

  folderHeads.forEach(function (head) {
    head.addEventListener('click', function (e) {
      e.stopPropagation();
      var folder = head.closest('.s-files__folder');
      if (!folder) return;
      var opening = folder.classList.contains('is-closed');
      folder.classList.toggle('is-open', opening);
      folder.classList.toggle('is-closed', !opening);
      head.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });
    head.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        head.click();
      }
    });
  });

  /* Copy button. This used to only play the flash animation — it never put
     anything on the clipboard, so the button lied every time it was pressed.
     It now copies the file actually shown in the preview pane. The <pre> keeps
     one .s-files__line per line, so innerText already carries the newlines. */
  var copyBtn = root.querySelector('.s-files__icon-btn[aria-label^="Copy"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var code = root.querySelector('.s-files__code-content');
      var text = code ? (code.innerText || code.textContent || '') : '';
      if (!text) return;

      function done(ok) {
        copyBtn.classList.add('is-flashing');
        copyBtn.setAttribute('aria-label', ok ? 'Copied' : 'Copy failed');
        setTimeout(function () {
          copyBtn.classList.remove('is-flashing');
          copyBtn.setAttribute('aria-label', 'Copy file contents');
        }, 700);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
      /* Older/insecure-context fallback — execCommand still works there. */
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:absolute;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        done(ok);
      } catch (e) { done(false); }
    });
  }
})();
