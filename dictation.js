/* rhobear.dictation.v2 — universal voice dictation, every surface, no bundle rebuild.
 *
 * Loaded globally from index.html (like registerSW.js / picker.css). Auto-attaches
 * a mic button to every text field in the app — textarea, text/search/email/url
 * inputs, and [contenteditable] editors (the agent chat composer) — including fields
 * the SPA renders later (MutationObserver). Password fields are never touched.
 * Opt a region out with [data-rb-no-dictation].
 *
 * v2 (final pass): real SVG mic (no emoji), brand accent (Plans purple by default,
 * override with window.RB_DICTATION_ACCENT before load), recording = accent-gradient
 * jewel with breathing pulse rings. Engines unchanged:
 *   ENGINE: in-browser Whisper ONLY (transformers.js, runs locally, private).
 *   webkitSpeechRecognition is BANNED — worse, and it streams mic audio to Google.
 *
 * Self-contained, dependency-free, idempotent.
 */
(function () {
  'use strict';
  if (window.__rbDictation) return;
  window.__rbDictation = '2';

  // DOCTRINE [[whisper-is-the-stt-standard]]: NEVER webkitSpeechRecognition. It is
  // worse than Whisper AND it streams the user's microphone audio to Google. Whisper
  // runs locally in this browser instead — private, offline after the one-time model
  // download, no server round-trip. SR is hard-disabled; do not "restore" it.
  var canRecord = !!(navigator.mediaDevices && window.MediaRecorder);
  if (!canRecord) return; // nothing we can do in this browser

  var ACCENT = window.RB_DICTATION_ACCENT || '#7c5cff';

  // stroke-style mic, matches the product icon set (not an emoji)
  // The app's canonical mic (js/icons.jsx `mic`) — identical geometry to the
  // composer's Adobe-style mic so every mic in the product is the SAME mic.
  var MIC_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="3.5" width="6" height="11" rx="3"></rect>' +
    '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"></path>' +
    '<line x1="12" y1="18" x2="12" y2="21"></line></svg>';

  // ---- styles ------------------------------------------------------------
  var css = document.createElement('style');
  css.textContent =
    '.rb-mic{--rbm:' + ACCENT + ';position:absolute;z-index:2147483000;width:26px;height:26px;padding:0;' +
    'display:inline-flex;align-items:center;justify-content:center;border-radius:8px;' +
    'border:0;background:transparent;color:rgba(255,255,255,.42);cursor:pointer;line-height:1;' +
    'transition:color .15s ease,background .15s ease}' +
    '.rb-mic:hover{color:rgba(255,255,255,.85);background:rgba(255,255,255,.07)}' +
    '.rb-mic svg{display:block}' +
    '.rb-mic[data-on="1"]{color:var(--rbm);background:color-mix(in srgb,var(--rbm) 14%,transparent);' +
    'animation:rbbreathe 1.6s ease-in-out infinite}' +
    '@keyframes rbbreathe{0%,100%{opacity:1}50%{opacity:.55}}' +
    '.rb-mic[data-busy="1"]{color:var(--rbm);opacity:.6;cursor:progress;animation:none}' +
    '.rb-mic-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483001;' +
    'background:rgba(18,20,30,.94);color:#eef0ff;border:1px solid rgba(255,255,255,.10);' +
    'padding:9px 15px;border-radius:12px;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;pointer-events:none}' +
    '.rb-mic-toast.show{opacity:1}';
  (document.head || document.documentElement).appendChild(css);

  function toast(msg) {
    var t = document.querySelector('.rb-mic-toast');
    if (!t) { t = document.createElement('div'); t.className = 'rb-mic-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t.__h); t.__h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---- which fields get a mic -------------------------------------------
  function eligible(el) {
    if (!el || el.__rbMic) return false;
    if (el.closest && el.closest('[data-rb-no-dictation]')) return false;
    // Rho owns its composer mic. A second universal mic over that same field
    // creates two incompatible turn models on one control.
    if (el.id === 'rho-input' || (el.closest && el.closest('#rho-embed'))) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return el.offsetParent !== null;
    if (tag === 'input') {
      var t = (el.type || 'text').toLowerCase();
      if (['text', 'search', 'email', 'url', 'tel'].indexOf(t) < 0) return false;
      if (el.readOnly || el.disabled) return false;
      if (el.offsetWidth < 90) return false; // skip tiny inputs
      return el.offsetParent !== null;
    }
    if (el.isContentEditable) return el.offsetParent !== null;
    return false;
  }

  // ---- insert text at the caret -----------------------------------------
  function insert(el, text, replaceInterim) {
    if (!text) return;
    if (el.isContentEditable) {
      el.focus();
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    var start = el.selectionStart, end = el.selectionEnd, v = el.value;
    if (typeof start !== 'number') { el.value = v + text; }
    else {
      el.value = v.slice(0, start) + text + v.slice(end);
      var pos = start + text.length;
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---- Web Speech engine -------------------------------------------------
  function removeInterim(el, n) {
    if (!n) return;
    if (el.isContentEditable) { return; } // interim not tracked in CE for simplicity
    var start = el.selectionStart, v = el.value;
    if (typeof start === 'number' && start >= n) {
      el.value = v.slice(0, start - n) + v.slice(start);
      try { el.setSelectionRange(start - n, start - n); } catch (e) {}
    }
  }

  // ---- in-browser Whisper (the ONLY engine) ------------------------------
  function ensureWhisper() {
    if (window.WhisperSTT) return Promise.resolve();
    if (window.__whisperLoading) return window.__whisperLoading;
    window.__whisperLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/whisper-stt.js?v=12';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.__whisperLoading;
  }

  // ---- Whisper engine ----------------------------------------------------
  function whisperDictate(el, btn, stopRef) {
    var chunks = [], rec;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      rec = new MediaRecorder(stream);
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (!chunks.length) { stopRef.finish(); return; }
        btn.setAttribute('data-busy', '1');
        var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        // Whisper runs HERE, in this browser — no upload, no server, no Google.
        ensureWhisper()
          .then(function () { return window.WhisperSTT.transcribeBlob(blob); })
          .then(function (text) {
            if (text && text.trim()) {
              var pre = (el.value || el.textContent || '').match(/\S$/) ? ' ' : '';
              insert(el, pre + text.trim());
            } else { toast('Did not catch that - say it again'); }
          })
          .catch(function () { toast('Transcription failed'); })
          .finally(function () { btn.removeAttribute('data-busy'); stopRef.finish(); });
      };
      rec.start();
      ensureWhisper().then(function () { window.WhisperSTT.warmup(); }).catch(function () {});
    }).catch(function () { toast('Microphone permission blocked'); stopRef.finish(); });
    return function () { try { rec && rec.state !== 'inactive' && rec.stop(); } catch (e) {} };
  }

  // ---- attach a mic to one field ----------------------------------------
  function attach(el) {
    if (!eligible(el)) return;
    el.__rbMic = true;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rb-mic';
    btn.title = 'Dictate (voice to text)';
    btn.setAttribute('aria-label', 'Dictate');
    btn.innerHTML = MIC_SVG;
    document.body.appendChild(btn);

    function place() {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { btn.style.display = 'none'; return; }
      btn.style.display = '';
      btn.style.top = (window.scrollY + r.top + 6) + 'px';
      var isArea = (el.tagName || '').toLowerCase() === 'textarea' || el.isContentEditable;
      btn.style.left = (window.scrollX + r.right - 34) + 'px';
      if (!isArea) btn.style.top = (window.scrollY + r.top + (r.height - 28) / 2) + 'px';
    }
    place();
    var reflow = place;
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    // keep the button alive with its field; drop it if the field leaves the DOM
    var mo = new MutationObserver(function () {
      if (!document.contains(el)) {
        btn.remove(); window.removeEventListener('scroll', reflow, true);
        window.removeEventListener('resize', reflow); mo.disconnect();
      } else place();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    var stopFn = null;
    var stopRef = {
      active: false,
      stop: function () {
        stopRef.active = false;
        btn.removeAttribute('data-on'); btn.removeAttribute('data-busy');
        try { window.WhisperSTT && window.WhisperSTT.stopTalk && window.WhisperSTT.stopTalk(); } catch (e) {}
        if (stopFn) { var f = stopFn; stopFn = null; try { f(); } catch (e) {} }
      },
      finish: function () { stopRef.active = false; btn.removeAttribute('data-on'); btn.removeAttribute('data-busy'); }
    };

    // Plain dictation is one deliberate recording: tap to begin, tap again to
    // finish, then review the transcription in the field. Conversational
    // turn-taking belongs to the Rho companion's explicit voice-follow-up mode.
    btn.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (stopRef.active) { stopRef.stop(); return; }
      stopRef.active = true;
      btn.setAttribute('data-on', '1');
      el.focus();
      stopFn = whisperDictate(el, btn, stopRef);
    });
  }

  // ---- scan + observe ----------------------------------------------------
  function scan(root) {
    var nodes = (root || document).querySelectorAll('textarea, input, [contenteditable=""], [contenteditable="true"]');
    for (var i = 0; i < nodes.length; i++) attach(nodes[i]);
  }
  function boot() {
    scan(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('textarea, input, [contenteditable]')) attach(n);
          if (n.querySelectorAll) scan(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
