/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Vault store

   The vault is a folder of plain Markdown files with [[wikilinks]] — the
   Obsidian format — living under the `vault/` prefix of the bucket the
   CUSTOMER connected. We do not host it. There is no RHOBEAR copy.

   Where the bytes actually go, stated plainly because it matters:
     · WRITE  browser → their bucket, directly, over a presigned PUT.
              Their note text never touches a RHOBEAR process.
     · READ   their bucket → cw-api → browser. cw-api streams it; nothing
              is written to our disk. There is no presigned-GET route, so
              this hop exists until one is added.
     · INDEX  parsed and cached in THIS BROWSER (IndexedDB). The link graph
              is computed here. No server ever sees the parse.

   The presigned PUT is a cross-origin request to the customer's own R2
   bucket, so that bucket needs a CORS rule allowing this origin. That is
   not a preference — a presigned PUT is the only write path the storage
   API exposes, so CORS is a hard requirement of it. corsRule() below is
   what the UI shows them when a save is refused.

   window.HubVault — used by screens/vault.js and screens/notes.js. Two
   views, one store.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIX = 'vault/';
  var DB_NAME = 'rhobear-hub-vault';
  var DB_STORE = 'notes';
  var MAX_OBJECTS = 1000;

  /* ── tiny fetch helper ──────────────────────────────────────────── */
  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: 'include' }, opts || {}))
      .then(function (r) {
        return r.json().catch(function () { return null; })
          .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      });
  }

  /* ── IndexedDB cache ─────────────────────────────────────────────
     Keyed by accountId + object key. A cached body is trusted only when
     the object's size AND lastModified both still match what the bucket
     reports, so an edit made from another device re-downloads. */
  var _db = null;
  function db() {
    if (_db) return _db;
    _db = new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return _db;
  }

  function cacheGet(id) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        var r;
        try { r = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id); }
        catch (e) { resolve(null); return; }
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    });
  }

  function cachePut(id, rec) {
    return db().then(function (d) {
      if (!d) return;
      try { d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(rec, id); }
      catch (e) { /* a full or blocked cache must never break the vault */ }
    });
  }

  function cacheDrop(id) {
    return db().then(function (d) {
      if (!d) return;
      try { d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id); }
      catch (e) { /* same */ }
    });
  }

  /* ── Markdown parsing — the Obsidian format ─────────────────────── */

  /* YAML frontmatter, only the flat scalar keys a vault actually uses. */
  function frontmatter(text) {
    var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { meta: {}, body: text };
    var meta = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) return;
      var v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (/^\[.*\]$/.test(v)) {
        v = v.slice(1, -1).split(',').map(function (s) {
          return s.trim().replace(/^["']|["']$/g, '');
        }).filter(Boolean);
      }
      meta[kv[1].toLowerCase()] = v;
    });
    return { meta: meta, body: text.slice(m[0].length) };
  }

  /* [[Target]] · [[Target|alias]] · [[Target#heading]] — the alias and the
     heading are display detail; the link is to the note. Code fences and
     inline code are stripped first so a documented example is not a link. */
  function wikilinks(body) {
    var stripped = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    var out = [], seen = {}, m;
    var re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
    while ((m = re.exec(stripped))) {
      var t = m[1].trim();
      if (!t) continue;
      var k = t.toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(t);
    }
    return out;
  }

  function titleOf(path, meta, body) {
    if (meta.title) return String(meta.title);
    var h = /^#\s+(.+)$/m.exec(body || '');
    if (h) return h[1].trim();
    return baseName(path);
  }

  function baseName(path) {
    var f = path.split('/').pop() || path;
    return f.replace(/\.md$/i, '');
  }

  /* First folder under vault/ — vault/runbook/deploy.md → "runbook". A note
     at the vault root has no folder, which the graph draws in its default
     colour rather than pretending it belongs somewhere. */
  function folderOf(path, meta) {
    if (meta && meta.folder) return String(meta.folder).toLowerCase();
    var rest = path.indexOf(PREFIX) === 0 ? path.slice(PREFIX.length) : path;
    var parts = rest.split('/');
    return parts.length > 1 ? parts[0].toLowerCase() : '';
  }

  /* ── State ───────────────────────────────────────────────────────── */
  var state = {
    ready: false,
    connected: false,
    accountId: null,
    accountLabel: '',
    bucket: '',
    tier: 'none',
    loadError: null,
    notes: [],          // [{path,title,folder,size,mtime,body,links,meta}]
    graph: { nodes: [], edges: [] }
  };

  var listeners = [];
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }

  /* ── Storage account ─────────────────────────────────────────────── */
  function loadAccount() {
    return api('/api/storage/accounts').then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) {
        state.loadError = (r.data && r.data.error) || ('storage/accounts ' + r.status);
        state.connected = false;
        return state;
      }
      state.loadError = null;
      state.tier = r.data.tier || 'none';
      var accts = r.data.accounts || [];
      state.connected = accts.length > 0;
      if (state.connected) {
        state.accountId = accts[0].id;
        state.accountLabel = accts[0].label || accts[0].bucket || '';
        state.bucket = accts[0].bucket || '';
      } else {
        state.accountId = null;
        state.accountLabel = '';
        state.bucket = '';
      }
      return state;
    }).catch(function (e) {
      state.loadError = String(e && e.message || e);
      state.connected = false;
      return state;
    });
  }

  /* ── Read one note, cache-aware ──────────────────────────────────── */
  function fetchNote(obj) {
    var id = state.accountId + '\n' + obj.key;
    return cacheGet(id).then(function (hit) {
      if (hit && hit.size === obj.size && hit.mtime === obj.lastModified) {
        return hit.text;
      }
      return fetch('/api/storage/download/' + encodeURIComponent(state.accountId) + '/' +
                   obj.key.split('/').map(encodeURIComponent).join('/'),
                   { credentials: 'include' })
        .then(function (r) {
          if (!r.ok) throw new Error('download ' + r.status);
          return r.text();
        })
        .then(function (text) {
          cachePut(id, { text: text, size: obj.size, mtime: obj.lastModified });
          return text;
        });
    });
  }

  /* ── Build the index + the link graph, entirely in this browser ──── */
  function buildGraph(notes) {
    var byKey = {};          // lowercased title AND basename both resolve
    notes.forEach(function (n) {
      byKey[n.title.toLowerCase()] = n.path;
      byKey[baseName(n.path).toLowerCase()] = n.path;
    });

    var nodes = {}, edges = [], backlinks = {};

    notes.forEach(function (n) {
      nodes[n.path] = {
        id: n.path, title: n.title, folder: n.folder, weight: 1, missing: false
      };
    });

    notes.forEach(function (n) {
      n.links.forEach(function (raw) {
        var target = byKey[raw.toLowerCase()];
        if (!target) {
          /* An unresolved [[link]] is a real fact about the vault — the note
             you meant to write and haven't. Showing the gap is the point of
             a vault graph, so it becomes a node, marked missing. */
          target = PREFIX + raw + '.md';
          if (!nodes[target]) {
            nodes[target] = {
              id: target, title: raw, folder: '', weight: 1, missing: true
            };
          }
        }
        if (target === n.path) return;
        edges.push({ source: n.path, target: target });
        backlinks[target] = (backlinks[target] || 0) + 1;
      });
    });

    Object.keys(backlinks).forEach(function (k) {
      if (nodes[k]) nodes[k].weight = Math.min(4, 1 + backlinks[k]);
    });

    var list = Object.keys(nodes).map(function (k) { return nodes[k]; });
    return { nodes: list, edges: edges, backlinks: backlinks };
  }

  function refresh() {
    if (!state.connected) {
      state.notes = [];
      state.graph = { nodes: [], edges: [] };
      state.ready = true;
      emit();
      return Promise.resolve(state);
    }

    return api('/api/storage/list/' + encodeURIComponent(state.accountId) +
               '?prefix=' + encodeURIComponent(PREFIX) + '&max=' + MAX_OBJECTS)
      .then(function (r) {
        if (!r.ok || !r.data || !r.data.ok) {
          throw new Error((r.data && r.data.error) || ('storage/list ' + r.status));
        }
        var objs = (r.data.objects || []).filter(function (o) {
          return /\.md$/i.test(o.key) && o.size >= 0;
        });
        return Promise.all(objs.map(function (o) {
          return fetchNote(o).then(function (text) {
            var fm = frontmatter(text);
            return {
              path: o.key,
              size: o.size,
              mtime: o.lastModified,
              text: text,
              body: fm.body,
              meta: fm.meta,
              title: titleOf(o.key, fm.meta, fm.body),
              folder: folderOf(o.key, fm.meta),
              links: wikilinks(fm.body)
            };
          }).catch(function () {
            /* One unreadable object must not blank the whole vault. It is
               listed with the reason instead of being silently dropped. */
            return {
              path: o.key, size: o.size, mtime: o.lastModified,
              text: '', body: '', meta: {}, unreadable: true,
              title: baseName(o.key), folder: folderOf(o.key, {}), links: []
            };
          });
        }));
      })
      .then(function (notes) {
        notes.sort(function (a, b) { return (b.mtime || '').localeCompare(a.mtime || ''); });
        state.notes = notes;
        state.graph = buildGraph(notes);
        state.loadError = null;
        state.ready = true;
        emit();
        return state;
      })
      .catch(function (e) {
        state.loadError = String(e && e.message || e);
        state.ready = true;
        emit();
        return state;
      });
  }

  function init(force) {
    if (state.ready && !force) return Promise.resolve(state);
    return loadAccount().then(function () { return refresh(); });
  }

  /* ── Write — browser straight to their bucket ────────────────────── */
  var CORS_ERROR = 'cors';

  function save(path, text) {
    if (!state.connected) return Promise.reject(new Error('no storage connected'));
    var key = path.indexOf(PREFIX) === 0 ? path : PREFIX + path.replace(/^\/+/, '');
    if (!/\.md$/i.test(key)) key += '.md';

    return api('/api/storage/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: state.accountId, key: key, contentType: 'text/markdown' })
    }).then(function (r) {
      if (r.status === 402) {
        var e = new Error((r.data && r.data.error) || 'storage requires a paid subscription');
        e.code = 'upgrade';
        throw e;
      }
      if (!r.ok || !r.data || !r.data.ok || !r.data.url) {
        throw new Error((r.data && r.data.error) || ('upload-url ' + r.status));
      }
      /* The presigned URL signs Content-Type, so this header has to match
         byte for byte or R2 rejects the signature. */
      return fetch(r.data.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: text
      }).then(function (res) {
        if (!res.ok) throw new Error('bucket returned ' + res.status);
        state.lastWrite = 'direct';
        return res;
      }).catch(function (err) {
        if (err && /^bucket returned/.test(err.message)) throw err;
        /* A cross-origin fetch blocked by CORS rejects with an opaque
           TypeError — no status, no body. Nothing else about this request
           fails that way, so this is the CORS case, and the note still has
           to be saved. Retry through the same-origin fallback, which asks
           for the same presigned URL and sends the bytes from our host —
           where CORS does not apply. Nothing is stored there. */
        return proxyWrite(key, text).then(function (res) {
          state.lastWrite = 'proxy';
          return res;
        }, function (proxyErr) {
          /* Both paths failed. Report the CORS cause, because fixing that is
             what restores the direct, private path. */
          var e = new Error(proxyErr && proxyErr.message || 'the bucket refused the upload');
          e.code = (proxyErr && proxyErr.code) || CORS_ERROR;
          throw e;
        });
      });
    }).then(function () {
      cacheDrop(state.accountId + '\n' + key);
      return key;
    });
  }

  function proxyWrite(key, text) {
    return fetch('/api/vault-write?accountId=' + encodeURIComponent(state.accountId) +
                 '&key=' + encodeURIComponent(key) +
                 '&contentType=' + encodeURIComponent('text/markdown'), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'text/markdown' },
      body: text
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (r.status === 402) {
          var up = new Error((d && d.error) || 'storage requires a paid subscription');
          up.code = 'upgrade';
          throw up;
        }
        if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ('vault-write ' + r.status));
        return d;
      });
    });
  }

  function remove(path) {
    if (!state.connected) return Promise.reject(new Error('no storage connected'));
    return api('/api/storage/object/' + encodeURIComponent(state.accountId) + '/' +
               path.split('/').map(encodeURIComponent).join('/'),
               { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok || !r.data || !r.data.ok) {
          throw new Error((r.data && r.data.error) || ('delete ' + r.status));
        }
        cacheDrop(state.accountId + '\n' + path);
        return true;
      });
  }

  /* ── Connect / disconnect a bucket ───────────────────────────────
     POST /storage/accounts validates the credentials with a HeadBucket
     before storing them, so a typo comes back as a real error rather than
     a vault that silently lists nothing. */
  function connect(fields) {
    return api('/api/storage/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    }).then(function (r) {
      if (r.status === 402) {
        var e = new Error((r.data && r.data.error) || 'storage requires a paid subscription');
        e.code = 'upgrade';
        throw e;
      }
      if (!r.ok || !r.data || !r.data.ok) {
        throw new Error((r.data && r.data.error) || ('connect ' + r.status));
      }
      return init(true);
    });
  }

  function disconnect() {
    if (!state.accountId) return Promise.resolve();
    var id = state.accountId;
    return api('/api/storage/accounts/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error((r.data && r.data.error) || ('disconnect ' + r.status));
        /* Removing the account removes OUR pointer to their bucket. The
           bucket and every note in it stay exactly where they were. */
        return init(true);
      });
  }

  /* The rule the customer pastes into their own bucket. Generated from the
     live origin so it is right wherever the Hub is served from. */
  function corsRule() {
    return JSON.stringify([{
      AllowedOrigins: [window.location.origin],
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600
    }], null, 2);
  }

  window.HubVault = {
    PREFIX: PREFIX,
    state: state,
    init: init,
    refresh: refresh,
    save: save,
    remove: remove,
    connect: connect,
    disconnect: disconnect,
    corsRule: corsRule,
    baseName: baseName,
    frontmatter: frontmatter,
    wikilinks: wikilinks,
    onChange: function (fn) { listeners.push(fn); },
    find: function (path) {
      for (var i = 0; i < state.notes.length; i++) {
        if (state.notes[i].path === path) return state.notes[i];
      }
      return null;
    }
  };
})();
