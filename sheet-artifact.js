/* rhobear.sheet-artifact.v1 — universal spreadsheet VIEWER, every surface.
 *
 * Loaded globally from index.html (like dictation.js). When a spreadsheet is
 * attached anywhere in the app — the agent composer, a file input, a drag-drop —
 * a real Excel viewer slides in on the right: sheet tabs across the top, a
 * scrollable grid with a sticky header row. Handles multi-sheet Microsoft
 * workbooks (xlsx / xlsm / xlsb / xls / ods) and csv / tsv.
 *
 *   window.RBSheet.open(fileOrBlob, name)   // open the viewer on a file
 *   window.RBSheet.close()
 *
 * It ALSO self-installs capture-phase listeners on file <input>s and drop zones,
 * so on surfaces we don't control the composer (the compiled Plans SPA) the
 * viewer still pops the moment a workbook is chosen/dropped.
 *
 * Self-contained, dependency-free (lazy-loads SheetJS from jsdelivr), idempotent.
 * Accent: window.RB_SHEET_ACCENT (Plans purple by default).
 */
(function () {
  'use strict';
  if (window.__rbSheet) return;
  window.__rbSheet = '1';

  var ACCENT = window.RB_SHEET_ACCENT || '#7c5cff';
  var XLSX_LOCAL = '/vendor/xlsx.full.min.js';
  var XLSX_CDN   = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var SHEET_RE = /\.(xlsx|xlsm|xlsb|xls|ods|csv|tsv)$/i;
  var MAX_ROWS = 2000;   // viewer cap (workbook itself is untouched)
  var MAX_COLS = 120;

  function isSheetFile(f) { return !!(f && f.name && SHEET_RE.test(f.name)); }

  // ---- styles ------------------------------------------------------------
  function injectCss() {
    if (document.getElementById('rbsheet-css')) return;
    var css = document.createElement('style');
    css.id = 'rbsheet-css';
    css.textContent =
      '.rbsheet{--rbs:' + ACCENT + ';position:fixed;top:0;right:0;height:100vh;width:min(760px,92vw);' +
      'z-index:2147482000;background:#0e1018;color:#e9ecf5;border-left:1px solid rgba(255,255,255,.10);' +
      'box-shadow:-18px 0 48px rgba(0,0,0,.45);display:flex;flex-direction:column;' +
      'transform:translateX(100%);transition:transform .22s cubic-bezier(.2,.7,.2,1);' +
      'font:13px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.rbsheet[data-open="1"]{transform:translateX(0)}' +
      '.rbsheet.rbsheet--full{width:100vw}' +
      '.rbsheet__hdr{display:flex;align-items:center;gap:10px;padding:11px 14px;' +
      'border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto}' +
      '.rbsheet__ico{width:26px;height:26px;border-radius:7px;flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:center;background:color-mix(in srgb,var(--rbs) 22%,transparent);color:var(--rbs)}' +
      '.rbsheet__name{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto}' +
      '.rbsheet__meta{color:rgba(233,236,245,.5);font-size:11px;flex:0 0 auto}' +
      '.rbsheet__btn{border:0;background:transparent;color:rgba(233,236,245,.62);cursor:pointer;' +
      'width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
      '.rbsheet__btn:hover{background:rgba(255,255,255,.08);color:#fff}' +
      '.rbsheet__tabs{display:flex;gap:4px;padding:8px 12px 0;overflow-x:auto;flex:0 0 auto;scrollbar-width:thin}' +
      '.rbsheet__tab{border:0;background:rgba(255,255,255,.05);color:rgba(233,236,245,.72);cursor:pointer;' +
      'padding:6px 12px;border-radius:8px 8px 0 0;white-space:nowrap;font-size:12px;font-weight:500}' +
      '.rbsheet__tab[data-on="1"]{background:color-mix(in srgb,var(--rbs) 18%,#0e1018);color:#fff;' +
      'box-shadow:inset 0 -2px 0 var(--rbs)}' +
      '.rbsheet__grid{flex:1 1 auto;overflow:auto;margin:0 6px 6px}' +
      '.rbsheet table{border-collapse:separate;border-spacing:0;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
      '.rbsheet th,.rbsheet td{border-right:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);' +
      'padding:5px 9px;text-align:left;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top}' +
      '.rbsheet thead th{position:sticky;top:0;z-index:2;background:#171a26;color:#c9cffa;font-weight:600;' +
      'border-bottom:1px solid rgba(255,255,255,.12)}' +
      '.rbsheet tbody th{position:sticky;left:0;z-index:1;background:#141722;color:rgba(233,236,245,.45);' +
      'font-weight:500;text-align:right}' +
      '.rbsheet thead th:first-child{position:sticky;left:0;z-index:3;background:#171a26}' +
      '.rbsheet tbody tr:hover td{background:rgba(255,255,255,.03)}' +
      '.rbsheet__empty{padding:26px 16px;color:rgba(233,236,245,.55)}' +
      '.rbsheet__note{padding:7px 14px;color:rgba(233,236,245,.5);font-size:11px;border-top:1px solid rgba(255,255,255,.07);flex:0 0 auto}' +
      '@media (prefers-color-scheme: light){' +
      '.rbsheet{background:#fff;color:#1a1d29;border-left:1px solid rgba(0,0,0,.10);box-shadow:-18px 0 48px rgba(0,0,0,.16)}' +
      '.rbsheet thead th{background:#f3f4fb;color:#3a3f6b}.rbsheet tbody th{background:#f7f8fc;color:rgba(26,29,41,.5)}' +
      '.rbsheet thead th:first-child{background:#f3f4fb}' +
      '.rbsheet th,.rbsheet td{border-color:rgba(0,0,0,.08)}}';
    (document.head || document.documentElement).appendChild(css);
  }

  // A→AA column labels, spreadsheet style.
  function colLabel(n) {
    var s = '';
    n = n + 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // ---- lazy SheetJS ------------------------------------------------------
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (window.__xlsxLoading) return window.__xlsxLoading;
    window.__xlsxLoading = new Promise(function (res, rej) {
      // self-hosted first (no external dependency for her spreadsheets), CDN as fallback.
      function load(src, onFail) {
        var sc = document.createElement('script');
        sc.src = src;
        sc.onload = function () { window.XLSX ? res() : onFail(); };
        sc.onerror = onFail;
        document.head.appendChild(sc);
      }
      load(XLSX_LOCAL, function () {
        load(XLSX_CDN, function () { rej(new Error('xlsx load failed')); });
      });
    });
    return window.__xlsxLoading;
  }

  // ---- panel -------------------------------------------------------------
  var el = null, state = { sheets: [], active: 0, name: '' };

  function ensurePanel() {
    if (el) return el;
    injectCss();
    el = document.createElement('div');
    el.className = 'rbsheet';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Spreadsheet viewer');
    el.innerHTML =
      '<div class="rbsheet__hdr">' +
        '<div class="rbsheet__ico">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path></svg>' +
        '</div>' +
        '<div class="rbsheet__name" data-el="name">Spreadsheet</div>' +
        '<span class="rbsheet__meta" data-el="meta"></span>' +
        '<button class="rbsheet__btn" data-el="full" title="Expand / collapse" aria-label="Expand">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"></path></svg>' +
        '</button>' +
        '<button class="rbsheet__btn" data-el="close" title="Close" aria-label="Close">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>' +
        '</button>' +
      '</div>' +
      '<div class="rbsheet__tabs" data-el="tabs"></div>' +
      '<div class="rbsheet__grid" data-el="grid"><div class="rbsheet__empty">Loading…</div></div>' +
      '<div class="rbsheet__note" data-el="note" style="display:none"></div>';
    document.body.appendChild(el);
    el.querySelector('[data-el="close"]').addEventListener('click', close);
    el.querySelector('[data-el="full"]').addEventListener('click', function () { el.classList.toggle('rbsheet--full'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el && el.getAttribute('data-open') === '1') close(); });
    return el;
  }

  function renderTabs() {
    var tabs = el.querySelector('[data-el="tabs"]');
    tabs.innerHTML = '';
    if (state.sheets.length <= 1) { tabs.style.display = 'none'; return; }
    tabs.style.display = 'flex';
    state.sheets.forEach(function (sh, i) {
      var b = document.createElement('button');
      b.className = 'rbsheet__tab';
      if (i === state.active) b.setAttribute('data-on', '1');
      b.textContent = sh.name;
      b.addEventListener('click', function () { state.active = i; renderTabs(); renderGrid(); });
      tabs.appendChild(b);
    });
  }

  function renderGrid() {
    var grid = el.querySelector('[data-el="grid"]');
    var note = el.querySelector('[data-el="note"]');
    var sh = state.sheets[state.active];
    if (!sh || !sh.rows || !sh.rows.length) {
      grid.innerHTML = '<div class="rbsheet__empty">This sheet is empty.</div>';
      note.style.display = 'none';
      return;
    }
    var rows = sh.rows;
    var nCols = 0;
    for (var r = 0; r < rows.length; r++) nCols = Math.max(nCols, rows[r].length);
    var clampedCols = Math.min(nCols, MAX_COLS);
    var clampedRows = Math.min(rows.length, MAX_ROWS);

    // first row = header labels (the sheet's own first row).
    var head = rows[0] || [];
    var html = '<table><thead><tr><th></th>';
    for (var c = 0; c < clampedCols; c++) {
      var hv = head[c] == null ? '' : String(head[c]);
      html += '<th title="' + esc(hv) + '">' + (esc(hv) || colLabel(c)) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var ri = 1; ri < clampedRows; ri++) {
      var row = rows[ri] || [];
      html += '<tr><th>' + (ri) + '</th>';
      for (var ci = 0; ci < clampedCols; ci++) {
        var v = row[ci] == null ? '' : String(row[ci]);
        html += '<td title="' + esc(v) + '">' + esc(v) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    grid.innerHTML = html;
    grid.scrollTop = 0; grid.scrollLeft = 0;

    var truncated = (rows.length > MAX_ROWS) || (nCols > MAX_COLS);
    if (truncated) {
      note.style.display = '';
      note.textContent = 'Showing ' + Math.min(rows.length, MAX_ROWS) + ' of ' + rows.length + ' rows' +
        (nCols > MAX_COLS ? (', ' + MAX_COLS + ' of ' + nCols + ' columns') : '') + ' — the agent still receives the full data.';
    } else {
      note.style.display = 'none';
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function paint() {
    ensurePanel();
    el.querySelector('[data-el="name"]').textContent = state.name || 'Spreadsheet';
    el.querySelector('[data-el="meta"]').textContent =
      state.sheets.length ? (state.sheets.length + (state.sheets.length === 1 ? ' sheet' : ' sheets')) : '';
    renderTabs();
    renderGrid();
    requestAnimationFrame(function () { el.setAttribute('data-open', '1'); });
  }

  function close() { if (el) el.removeAttribute('data-open'); }

  // ---- open on a file ----------------------------------------------------
  var _busyKey = '';
  function open(file, name) {
    if (!file) return;
    name = name || file.name || 'Spreadsheet';
    ensurePanel();
    el.querySelector('[data-el="name"]').textContent = name;
    el.querySelector('[data-el="grid"]').innerHTML = '<div class="rbsheet__empty">Loading ' + esc(name) + '…</div>';
    el.querySelector('[data-el="tabs"]').style.display = 'none';
    el.querySelector('[data-el="note"]').style.display = 'none';
    requestAnimationFrame(function () { el.setAttribute('data-open', '1'); });

    var isCsv = /\.(csv|tsv)$/i.test(name);
    ensureXLSX().then(function () {
      if (isCsv) {
        return file.text().then(function (t) {
          var wb = window.XLSX.read(t, { type: 'string' });
          return wb;
        });
      }
      return file.arrayBuffer().then(function (buf) {
        return window.XLSX.read(buf, { type: 'array' });
      });
    }).then(function (wb) {
      var sheets = (wb.SheetNames || []).map(function (nm) {
        var aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: false, defval: '' });
        return { name: nm, rows: aoa };
      });
      state = { sheets: sheets, active: 0, name: name };
      paint();
    }).catch(function (e) {
      ensurePanel();
      el.querySelector('[data-el="grid"]').innerHTML =
        '<div class="rbsheet__empty">Couldn\'t read this spreadsheet.<br><span style="opacity:.6">' + esc(e && e.message || e) + '</span></div>';
    });
  }

  // ---- auto-intercept attachments (capture phase) ------------------------
  // On surfaces where we don't own the composer (the compiled Plans SPA), catch
  // the file the moment it's chosen or dropped so the viewer still opens.
  function firstSheet(list) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (isSheetFile(list[i])) return list[i];
    return null;
  }
  function onChange(e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || (t.type || '').toLowerCase() !== 'file') return;
    var f = firstSheet(t.files);
    if (f) open(f, f.name);
  }
  function onDrop(e) {
    var dt = e.dataTransfer;
    if (!dt) return;
    var f = firstSheet(dt.files);
    if (f) open(f, f.name);
  }
  document.addEventListener('change', onChange, true);
  document.addEventListener('drop', onDrop, true);

  window.RBSheet = { open: open, close: close, isSheetFile: isSheetFile };
})();
