/* RHOBEAR Strive on the Hub — the writing assistant (our Scribe model, gated /strive endpoint).
   Attaches a Strive bar under text inputs (the Work task composer, and any .hub-strive-target):
   operates on the selection or the whole field, one-step Undo. Themed to the Hub teal. */
(function () {
  "use strict";
  if (window.__hubStrive) return; window.__hubStrive = true;

  var ACTIONS = [
    { id: "grammar", label: "Fix grammar" },
    { id: "simplify", label: "Simplify" },
    { id: "formal", label: "Make formal" },
    { id: "paraphrase", label: "Rephrase" },
  ];

  function css() {
    if (document.getElementById("hub-strive-css")) return;
    var s = document.createElement("style"); s.id = "hub-strive-css";
    s.textContent = [
      ".hub-strive{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".hub-strive__brand{display:inline-flex;align-items:center;gap:5px;font:600 11px/1 var(--hub-font-body,system-ui);",
      "letter-spacing:.04em;text-transform:uppercase;color:var(--hub-accent-bright,#00E5CC)}",
      ".hub-strive__btn{appearance:none;border:1px solid var(--hub-border-hover,rgba(255,255,255,.14));",
      "background:var(--hub-surface,rgba(255,255,255,.04));color:var(--hub-text-primary,#e8eef2);",
      "font:500 12.5px/1 var(--hub-font-body,system-ui);padding:6px 11px;border-radius:999px;cursor:pointer;",
      "min-height:30px;display:inline-flex;align-items:center;transition:all .15s}",
      ".hub-strive__btn:hover:not(:disabled){border-color:var(--hub-accent-bright,#00E5CC);color:var(--hub-accent-bright,#00E5CC);box-shadow:0 0 12px rgba(0,229,204,.2)}",
      ".hub-strive__btn:disabled{opacity:.55;cursor:default}",
      ".hub-strive__note{font-size:12px;color:var(--hub-text-secondary,#9fb3c8)}",
      ".hub-strive__spin{width:13px;height:13px;border-radius:50%;border:2px solid rgba(0,229,204,.25);border-top-color:var(--hub-accent-bright,#00E5CC);animation:hub-strive-spin .7s linear infinite}",
      "@keyframes hub-strive-spin{to{transform:rotate(360deg)}}"
    ].join("");
    document.head.appendChild(s);
  }

  function attach(ta) {
    // Builds owns a dedicated stream composer. The global writing helper used
    // to inject a second toolbar into it, which broke the pinned workstation
    // geometry and made the live composer look like an old generic Hub form.
    if (!ta || ta.__strive || (ta.closest && ta.closest('[data-screen="work"]'))) return;
    ta.__strive = true;
    css();
    var bar = document.createElement("div");
    bar.className = "hub-strive";
    var brand = document.createElement("span");
    brand.className = "hub-strive__brand";
    brand.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2l1.9 5.9L20 9.8l-5.1 3.6L16.8 20 12 16.2 7.2 20l1.9-6.6L4 9.8l6.1-1.9L12 2z" fill="currentColor"/></svg> Strive';
    bar.appendChild(brand);
    var note = document.createElement("span"); note.className = "hub-strive__note";
    var undoVal = null, busy = false;

    function setBusy(b) { busy = b; bar.querySelectorAll(".hub-strive__btn").forEach(function (x) { x.disabled = b; }); }

    ACTIONS.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "hub-strive__btn"; b.textContent = a.label;
      b.addEventListener("click", function () { run(a.id, b); });
      bar.appendChild(b);
    });
    var undoBtn = document.createElement("button");
    undoBtn.type = "button"; undoBtn.className = "hub-strive__btn"; undoBtn.textContent = "Undo";
    undoBtn.style.display = "none";
    undoBtn.addEventListener("click", function () { if (undoVal != null) { setVal(undoVal); undoVal = null; undoBtn.style.display = "none"; note.textContent = ""; } });
    bar.appendChild(undoBtn); bar.appendChild(note);

    function setVal(v) {
      // React-friendly: set via the native setter so the app's onChange fires
      var proto = Object.getPrototypeOf(ta);
      var d = Object.getOwnPropertyDescriptor(proto, "value");
      if (d && d.set) d.set.call(ta, v); else ta.value = v;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    async function run(action, btn) {
      var full = ta.value || "";
      if (!full.trim() || busy) return;
      var s = 0, e = full.length;
      if (ta.selectionStart !== ta.selectionEnd) { s = ta.selectionStart; e = ta.selectionEnd; }
      var seg = full.slice(s, e);
      if (!seg.trim()) return;
      setBusy(true); note.textContent = "";
      var old = btn.textContent; btn.innerHTML = '<span class="hub-strive__spin"></span>';
      try {
        var r = await fetch("/strive", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: seg, action: action }) });
        if (r.status === 401) { note.textContent = "Sign in to use Strive."; return; }
        if (!r.ok) { note.textContent = "Strive is warming up — try again."; return; }
        var j = await r.json();
        if (j.changed) { undoVal = full; setVal(full.slice(0, s) + j.result + full.slice(e)); undoBtn.style.display = ""; }
        else note.textContent = "Looks clean already.";
      } catch (e2) { note.textContent = "Strive is warming up — try again."; }
      finally { setBusy(false); btn.textContent = old; }
    }

    ta.insertAdjacentElement("afterend", bar);
  }

  function scan() {
    var t = document.getElementById("s-work-task");
    if (t && !(t.closest && t.closest('[data-screen="work"]'))) attach(t);
    document.querySelectorAll(".hub-strive-target").forEach(function (target) {
      if (!(target.closest && target.closest('[data-screen="work"]'))) attach(target);
    });
  }

  function boot() { scan(); var mo = new MutationObserver(scan); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
