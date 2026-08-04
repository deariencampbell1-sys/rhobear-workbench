/* Memory screen — real read/write against the per-user curated files.
   IIFE scoped to [data-screen="memory"]. Exposes nothing global.

   This screen used to open with "no cloud endpoint (was sidecar-only on
   localhost:7456)", blank both editors and disable Save. That was wrong: the
   hermes router has served these files directly the whole time —
     GET    /api/memory                  -> { memoryMd, userMd, caps, purposes }
     POST   /api/memory {action:"write", file, content}
     DELETE /api/memory/<file>
   So the hosted Hub was painting an empty, read-only box over live data. */
(function () {
  'use strict';

  var screen = document.querySelector('.screen[data-screen="memory"]');
  if (!screen) return;

  var FILES = ['MEMORY.md', 'USER.md'];
  var caps = {};
  var loaded = {};

  /* Each panel is identified by the mono chip in its header. */
  function panelFor(file) {
    var panels = screen.querySelectorAll('.s-memory__panel');
    for (var i = 0; i < panels.length; i++) {
      var chip = panels[i].querySelector('.chip--mono');
      if (chip && chip.textContent.trim() === file) return panels[i];
    }
    return null;
  }
  function editorFor(file) {
    var p = panelFor(file);
    return p ? p.querySelector('[data-editor]') : null;
  }
  function btnIn(panel, label) {
    var bs = panel.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].textContent.trim() === label) return bs[i];
    }
    return null;
  }

  function paintCount(file) {
    var p = panelFor(file); if (!p) return;
    var ta = p.querySelector('[data-editor]');
    var chip = p.querySelector('[data-charcount]');
    if (!ta || !chip) return;
    var n = ta.value.length;
    var cap = caps[file];
    chip.textContent = cap
      ? n.toLocaleString() + ' / ' + cap.toLocaleString() + ' chars'
      : n.toLocaleString() + ' chars';
    // The write is rejected server-side past the cap; say so before they hit Save.
    chip.classList.toggle('chip--warn', !!(cap && n > cap));
  }

  function setStatus(text) {
    var chip = screen.querySelector('.chip--accent');
    if (!chip) return;
    var dot = chip.querySelector('.dot');
    chip.textContent = ' ' + text;
    if (dot) chip.insertBefore(dot, chip.firstChild);
  }

  function flash(btn, text, ms) {
    var original = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', original);
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(function () { btn.textContent = original; btn.disabled = false; }, ms || 1600);
  }

  /* ── load ─────────────────────────────────────────────────────────── */
  function load() {
    setStatus('Loading…');
    fetch('/api/memory', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { setStatus('Could not load memory'); return; }
        caps = d.caps || {};
        FILES.forEach(function (f) {
          var ta = editorFor(f);
          if (!ta) return;
          var val = (f === 'MEMORY.md' ? d.memoryMd : d.userMd) || '';
          ta.value = val;
          loaded[f] = val;
          ta.readOnly = false;
          ta.placeholder = (d.purposes && d.purposes[f]) || '';
          paintCount(f);
        });
        setStatus('Synced');
      })
      .catch(function () { setStatus('Could not load memory'); });
  }

  /* ── save ─────────────────────────────────────────────────────────── */
  function save(file, btn) {
    var ta = editorFor(file);
    if (!ta) return;
    var cap = caps[file];
    if (cap && ta.value.length > cap) { flash(btn, 'Too long — over cap', 2200); return; }
    btn.disabled = true;
    fetch('/api/memory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', file: file, content: ta.value })
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (d && d.ok) { loaded[file] = ta.value; flash(btn, 'Saved'); setStatus('Saved just now'); }
        else { flash(btn, (d && d.error) ? String(d.error) : 'Save failed', 2400); }
      })
      .catch(function () { flash(btn, 'Save failed', 2400); });
  }

  /* ── wire ─────────────────────────────────────────────────────────── */
  FILES.forEach(function (file) {
    var p = panelFor(file);
    if (!p) return;
    var ta = p.querySelector('[data-editor]');
    if (ta) ta.addEventListener('input', function () { paintCount(file); });

    var reset = btnIn(p, 'Reset');
    /* Reset restores what the server last gave us — it does not blank the file.
       Blanking and then saving was a one-click way to destroy real memory. */
    if (reset) reset.addEventListener('click', function () {
      if (ta) { ta.value = loaded[file] || ''; paintCount(file); }
    });

    var saveBtn = btnIn(p, 'Save');
    if (saveBtn) saveBtn.addEventListener('click', function () { save(file, saveBtn); });
  });

  load();
})();
