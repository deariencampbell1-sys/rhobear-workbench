/* ════════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Vault view

   The list + editor + graph, mounted against whatever root element carries
   the data-vault-* contract. Vault and Notes are two views of ONE store,
   so they are two mounts of one module rather than two implementations
   that drift apart.

   A view only gets the controls its markup contains — every element lookup
   is optional. Notes has no connect form and no disconnect button; those
   branches simply never fire there.

   window.HubVaultView.mount(root, { screenName })
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function mount(root, opts) {
    opts = opts || {};
    if (!root || !window.HubVault) return null;
    var V = window.HubVault;

    var el = {
      strip:     root.querySelector('[data-vault-strip]'),
      bucket:    root.querySelector('[data-vault-bucket]'),
      count:     root.querySelector('[data-vault-count]'),
      gate:      root.querySelector('[data-vault-gate]'),
      gateBody:  root.querySelector('[data-vault-gate-body]'),
      connect:   root.querySelector('[data-vault-connect]'),
      notesWrap: root.querySelector('[data-vault-noteswrap]'),
      graphWrap: root.querySelector('[data-vault-graphwrap]'),
      seg:       root.querySelector('[data-vault-viewswitch]'),
      items:     root.querySelector('[data-vault-items]'),
      search:    root.querySelector('[data-vault-search]'),
      path:      root.querySelector('[data-vault-path]'),
      folder:    root.querySelector('[data-vault-folder]'),
      links:     root.querySelector('[data-vault-links]'),
      body:      root.querySelector('[data-vault-body]'),
      stats:     root.querySelector('[data-vault-stats]'),
      status:    root.querySelector('[data-vault-status]'),
      save:      root.querySelector('[data-vault-save]'),
      del:       root.querySelector('[data-vault-delete]'),
      cors:      root.querySelector('[data-vault-cors]'),
      corsRule:  root.querySelector('[data-vault-cors-rule]'),
      corsTitle: root.querySelector('[data-vault-cors-title]'),
      corsBody:  root.querySelector('[data-vault-cors-body]'),
      corsCopy:  root.querySelector('[data-vault-cors-copy]'),
      canvas:    root.querySelector('[data-vault-graph-canvas]'),
      graphEmpty:root.querySelector('[data-vault-graph-empty]'),
      form:      root.querySelector('[data-vault-connect-form]'),
      formCors:  root.querySelector('[data-vault-connect-cors]'),
      formStatus:root.querySelector('[data-vault-connect-status]'),
      disconnect:root.querySelector('[data-vault-disconnect]')
    };

    var current = null;      // the open note's path, null for an unsaved new note
    var dirty = false;
    var view = 'notes';
    var graph = null;

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function setStatus(msg, tone) {
      if (!el.status) return;
      el.status.textContent = msg || '';
      el.status.style.color = tone === 'error' ? 'var(--hub-offline, #EF4444)'
                            : tone === 'good'  ? 'var(--hub-accent-bright, #00E5CC)'
                            : '';
    }

    /* ── list ────────────────────────────────────────────────────────── */
    function matches(n, q) {
      if (!q) return true;
      q = q.toLowerCase();
      return n.title.toLowerCase().indexOf(q) >= 0 ||
             n.path.toLowerCase().indexOf(q) >= 0 ||
             (n.body || '').toLowerCase().indexOf(q) >= 0;
    }

    function preview(n) {
      var t = (n.body || '').replace(/^#.*$/m, '').replace(/[#*_>`\[\]]/g, ' ')
                .replace(/\s+/g, ' ').trim();
      return t.slice(0, 96);
    }

    function renderList() {
      if (!el.items) return;
      var q = el.search ? el.search.value.trim() : '';
      var notes = V.state.notes.filter(function (n) { return matches(n, q); });

      if (!notes.length) {
        el.items.innerHTML = '<li class="muted" style="padding:16px 12px;font-size:0.8rem">' +
          (V.state.notes.length ? 'Nothing matches “' + esc(q) + '”.'
                                : 'No notes yet — “New note” starts one.') + '</li>';
        return;
      }

      el.items.innerHTML = notes.map(function (n) {
        var date = (n.mtime || '').slice(0, 10);
        return '<li class="s-notes__item' + (n.path === current ? ' is-selected' : '') +
               '" data-vault-open="' + esc(n.path) + '">' +
                 '<div class="s-notes__item-row">' +
                   '<span class="s-notes__item-title">' + esc(n.title) + '</span>' +
                   '<span class="s-notes__item-date mono">' + esc(date) + '</span>' +
                 '</div>' +
                 '<p class="s-notes__item-preview">' +
                   (n.unreadable ? 'Could not be read from your bucket.' : esc(preview(n))) +
                 '</p>' +
               '</li>';
      }).join('');
    }

    /* ── editor ──────────────────────────────────────────────────────── */
    function openNote(path) {
      var n = V.find(path);
      if (!n) return;
      current = n.path;
      dirty = false;
      if (el.path) el.path.value = n.path.replace(V.PREFIX, '');
      if (el.body) el.body.value = n.text || '';
      hideCors();
      setStatus(n.unreadable ? 'This object could not be read from your bucket.' : '',
                n.unreadable ? 'error' : '');
      updateMeta();
      renderList();
    }

    function newNote() {
      current = null;
      dirty = false;
      if (el.path) el.path.value = '';
      if (el.body) el.body.value = '';
      hideCors();
      setStatus('Unsaved');
      updateMeta();
      renderList();
      if (el.path) el.path.focus();
      setView('notes');
    }

    function updateMeta() {
      var text = el.body ? el.body.value : '';
      var fm = V.frontmatter(text);
      var links = V.wikilinks(fm.body);
      var words = fm.body.trim() ? fm.body.trim().split(/\s+/).length : 0;
      if (el.stats) el.stats.textContent = words + ' words · ' + text.length + ' chars';
      if (el.links) {
        el.links.textContent = links.length
          ? links.length + (links.length === 1 ? ' link' : ' links') + ' · ' + links.slice(0, 4).join(', ')
          : 'no links yet';
      }
      if (el.folder) {
        var p = el.path ? el.path.value : '';
        var seg = p.indexOf('/') > 0 ? p.split('/')[0] : '';
        el.folder.textContent = seg ? 'vault/' + seg : 'vault';
      }
    }

    function hideCors() { if (el.cors) el.cors.hidden = true; }

    /* Two situations, one panel, and the difference matters:
         'proxy'  the note IS saved — it just travelled through RHOBEAR to
                  get there, because the bucket has no CORS rule for this
                  site. The rule is an upgrade in privacy, not a fix.
         'failed' nothing was saved by either path. */
    var corsShownOnce = false;
    function showCors(kind) {
      if (!el.cors) return;
      if (kind === 'proxy') {
        if (corsShownOnce) return;
        corsShownOnce = true;
      }
      if (el.corsTitle) {
        el.corsTitle.textContent = kind === 'proxy'
          ? 'Your notes are taking the long way round.'
          : 'Your bucket refused the upload.';
      }
      if (el.corsBody) {
        el.corsBody.textContent = kind === 'proxy'
          ? 'Saved — but this note passed through RHOBEAR on its way to your bucket, ' +
            'because the bucket does not accept uploads from this site yet. We keep no ' +
            'copy either way. Add this rule and notes go straight from your browser to ' +
            'your storage, never touching our servers: Cloudflare dashboard → R2 → your ' +
            'bucket → Settings → CORS Policy.'
          : 'Neither path could write the note. Add this to the bucket’s CORS policy ' +
            '(Cloudflare dashboard → R2 → your bucket → Settings → CORS Policy) and save again.';
      }
      if (el.corsRule) el.corsRule.textContent = V.corsRule();
      el.cors.hidden = false;
    }

    function doSave() {
      var raw = (el.path ? el.path.value : '').trim();
      if (!raw) { setStatus('Give the note a filename first.', 'error'); if (el.path) el.path.focus(); return; }
      var text = el.body ? el.body.value : '';

      el.save.disabled = true;
      setStatus('Saving to your bucket…');

      V.save(raw, text).then(function (key) {
        /* Renaming = writing under the new key. The old object is only
           removed once the new one is confirmed written, so a failed rename
           can never lose the note. */
        var wasRenamed = current && current !== key;
        var after = function () {
          el.save.disabled = false;
          current = key;
          dirty = false;
          if (V.state.lastWrite === 'proxy') {
            setStatus('Saved · went through RHOBEAR', 'good');
            showCors('proxy');
          } else {
            setStatus('Saved', 'good');
          }
          return V.refresh().then(function () { renderList(); if (graph) graph.redraw(); refreshChrome(); });
        };
        if (wasRenamed) return V.remove(current).then(after, after);
        return after();
      }).catch(function (e) {
        el.save.disabled = false;
        if (e && e.code === 'cors') { setStatus('Your bucket refused the upload.', 'error'); showCors('failed'); return; }
        if (e && e.code === 'upgrade') { setStatus('Saving to storage needs a paid plan.', 'error'); return; }
        setStatus(String(e && e.message || e), 'error');
      });
    }

    function doDelete() {
      if (!current) { newNote(); return; }
      if (!window.confirm('Delete ' + current + ' from your bucket? This cannot be undone.')) return;
      el.del.disabled = true;
      setStatus('Deleting…');
      V.remove(current).then(function () {
        el.del.disabled = false;
        current = null;
        if (el.path) el.path.value = '';
        if (el.body) el.body.value = '';
        setStatus('Deleted', 'good');
        return V.refresh().then(function () { renderList(); if (graph) graph.redraw(); refreshChrome(); });
      }).catch(function (e) {
        el.del.disabled = false;
        setStatus(String(e && e.message || e), 'error');
      });
    }

    /* ── view switch ─────────────────────────────────────────────────── */
    function setView(next) {
      view = next;
      if (el.seg) {
        el.seg.querySelectorAll('[data-vault-view]').forEach(function (b) {
          var on = b.getAttribute('data-vault-view') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
      var connected = V.state.connected;
      if (el.notesWrap) el.notesWrap.hidden = !connected || next !== 'notes';
      if (el.graphWrap) el.graphWrap.hidden = !connected || next !== 'graph';
      if (next === 'graph' && connected) { ensureGraph(); graph.start(); }
      else if (graph) graph.stop();
    }

    function ensureGraph() {
      if (graph || !el.canvas || !window.HubVaultGraph) return;
      graph = window.HubVaultGraph.mount(el.canvas, function () { return V.state.graph; }, {
        onCount: function (n) { if (el.graphEmpty) el.graphEmpty.style.display = n ? 'none' : ''; },
        onOpen: function (node) {
          if (node.missing) {
            /* Clicking a note that does not exist yet starts it, pre-titled —
               the same gesture Obsidian uses to grow a vault. */
            newNote();
            if (el.path) el.path.value = node.title + '.md';
            if (el.body) el.body.value = '# ' + node.title + '\n\n';
            updateMeta();
            return;
          }
          setView('notes');
          openNote(node.id);
        }
      });
    }

    /* ── chrome: gate vs vault ───────────────────────────────────────── */
    function refreshChrome() {
      var s = V.state;
      var connected = s.connected;

      if (el.strip) el.strip.hidden = !connected;
      if (el.gate) el.gate.hidden = connected;
      if (el.notesWrap) el.notesWrap.hidden = !connected || view !== 'notes';
      if (el.graphWrap) el.graphWrap.hidden = !connected || view !== 'graph';

      if (connected) {
        if (el.bucket) el.bucket.textContent = s.accountLabel || s.bucket || 'your bucket';
        if (el.count) {
          el.count.textContent = s.notes.length + (s.notes.length === 1 ? ' note' : ' notes');
        }
        if (s.loadError && el.items) {
          el.items.innerHTML = '<li class="muted" style="padding:16px 12px;font-size:0.8rem">' +
            'Couldn’t read your bucket: ' + esc(s.loadError) + '</li>';
        }
        return;
      }

      /* Not connected — say WHICH not-connected this is. */
      if (el.gateBody) {
        if (s.loadError) {
          el.gateBody.textContent = 'Couldn’t check your storage: ' + s.loadError;
        } else if (s.tier === 'none') {
          el.gateBody.textContent =
            'RHOBEAR does not store your notes — the vault lives in a bucket you own. ' +
            'Connecting storage is part of a paid plan; after that the notes, and the keys ' +
            'to them, stay yours.';
        }
      }
    }

    /* ── wiring ──────────────────────────────────────────────────────── */
    if (el.seg) el.seg.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-vault-view]');
      if (t) setView(t.getAttribute('data-vault-view'));
    });

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-vault-new]')) { newNote(); return; }
      if (e.target.closest('[data-vault-save]')) { doSave(); return; }
      if (e.target.closest('[data-vault-delete]')) { doDelete(); return; }
      if (e.target.closest('[data-vault-connect]')) {
        if (el.form) {
          el.form.hidden = false;
          if (el.formCors) el.formCors.textContent = V.corsRule();
          var first = el.form.querySelector('input[name="accountId"]');
          if (first) first.focus();
        } else {
          /* This view has no connect form of its own — the Vault screen owns
             the one wizard. Send them there rather than growing a second. */
          var nav = document.querySelector('[data-nav-item="vault"]');
          if (nav) nav.click();
        }
        return;
      }
      if (e.target.closest('[data-vault-connect-cancel]')) {
        if (el.form) el.form.hidden = true;
        return;
      }
      if (e.target.closest('[data-vault-disconnect]')) {
        if (!window.confirm('Disconnect this bucket? Your notes stay in it — the Hub just stops reading them.')) return;
        el.disconnect.disabled = true;
        V.disconnect().then(function () {
          el.disconnect.disabled = false;
          current = null;
          if (el.path) el.path.value = '';
          if (el.body) el.body.value = '';
          refreshChrome(); renderList();
        }).catch(function (err) {
          el.disconnect.disabled = false;
          window.alert('Could not disconnect: ' + (err && err.message || err));
        });
        return;
      }
      if (e.target.closest('[data-vault-cors-dismiss]')) { hideCors(); return; }
      if (e.target.closest('[data-vault-cors-copy]')) {
        var rule = V.corsRule();
        var done = function () {
          var b = e.target.closest('[data-vault-cors-copy]');
          var o = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = o; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(rule).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = rule; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (err) {}
          document.body.removeChild(ta); done();
        }
        return;
      }
      var open = e.target.closest('[data-vault-open]');
      if (open) openNote(open.getAttribute('data-vault-open'));
    });

    if (el.form) el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(el.form);
      var btn = el.form.querySelector('button[type="submit"]');
      var fields = {
        accountId: (f.get('accountId') || '').trim(),
        bucket: (f.get('bucket') || '').trim(),
        accessKeyId: (f.get('accessKeyId') || '').trim(),
        secretAccessKey: (f.get('secretAccessKey') || '').trim(),
        label: (f.get('label') || '').trim()
      };
      if (btn) btn.disabled = true;
      if (el.formStatus) el.formStatus.textContent = 'Checking the bucket…';
      V.connect(fields).then(function () {
        if (btn) btn.disabled = false;
        if (el.formStatus) el.formStatus.textContent = '';
        el.form.reset();
        el.form.hidden = true;
        refreshChrome();
        renderList();
      }).catch(function (err) {
        if (btn) btn.disabled = false;
        if (el.formStatus) {
          var msg = String(err && err.message || err);
          /* R2 answers a bad key or a bad account id with an opaque
             "UnknownError". Pass the upstream text through — it may be
             specific — but say what to check when it is not. */
          if (/UnknownError/i.test(msg)) {
            msg = 'The bucket did not answer. Check the account ID, the bucket name, ' +
                  'and that the token has Object Read & Write on it.';
          }
          el.formStatus.textContent = err && err.code === 'upgrade'
            ? 'Connecting storage needs a paid plan.'
            : msg;
          el.formStatus.style.color = 'var(--hub-offline, #EF4444)';
        }
      });
    });

    if (el.search) el.search.addEventListener('input', renderList);
    if (el.body) el.body.addEventListener('input', function () {
      dirty = true; setStatus('Unsaved'); updateMeta();
    });
    if (el.path) el.path.addEventListener('input', function () { dirty = true; updateMeta(); });

    window.addEventListener('beforeunload', function (e) {
      if (!dirty) return;
      e.preventDefault(); e.returnValue = '';
    });

    /* ── boot ────────────────────────────────────────────────────────── */
    function boot(force) {
      V.init(force).then(function () {
        refreshChrome();
        renderList();
        if (view === 'graph' && V.state.connected) { ensureGraph(); graph.start(); }
        if (!current && V.state.notes.length) openNote(V.state.notes[0].path);
      });
    }

    boot(false);
    document.addEventListener('hub:screen', function (e) {
      if (e.detail && e.detail.name === opts.screenName) boot(true);
    });

    return { boot: boot, setView: setView };
  }

  window.HubVaultView = { mount: mount };
})();
