/* RHOBEAR Hub — always-visible light/dark toggle at the top of every page.
   Accessibility: dark-only shells lock out low-vision users. The Hub already has a
   full [data-theme="light"] theme; this surfaces it prominently, applies instantly
   (localStorage, no flash), and syncs server-side via /api/me settings.
   Canon: light/dark toggle is standard on ALL apps ([[global-light-dark-toggle]]). */
(function () {
  "use strict";
  if (window.__hubTheme) return; window.__hubTheme = true;
  var KEY = "hub-theme";

  function apply(theme) {
    var light = theme === "light";
    document.documentElement.setAttribute("data-theme", light ? "light" : "");
    try { document.querySelector('meta[name="color-scheme"]').setAttribute("content", light ? "light" : "dark"); } catch (e) {}
    var btn = document.getElementById("hubThemeBtn");
    if (btn) { btn.setAttribute("aria-pressed", String(light)); btn.dataset.theme = light ? "light" : "dark"; }
  }
  function current() {
    var a = document.documentElement.getAttribute("data-theme");
    return a === "light" ? "light" : "dark";
  }
  // apply persisted choice ASAP (before first paint of the app)
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (!saved) saved = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  apply(saved);

  function svg(kind) {
    if (kind === "sun") return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>';
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  }

  function mount() {
    if (document.getElementById("hubThemeBtn")) return;
    var bar = document.querySelector(".topbar");
    if (!bar) return false;
    var style = document.createElement("style");
    style.textContent = [
      "#hubThemeBtn{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 6px 0 12px;margin-right:6px;border-radius:99px;",
      "background:var(--hub-surface,#131E2B);border:1px solid var(--hub-border-hover,rgba(255,255,255,.14));color:var(--hub-text-secondary,#9fb3c8);",
      "cursor:pointer;font:600 12px/1 var(--hub-font-body,system-ui);letter-spacing:.02em;transition:all .2s}",
      "#hubThemeBtn:hover{color:var(--hub-text-primary,#fff);border-color:var(--hub-accent-bright,#00E5CC);box-shadow:0 0 14px rgba(0,229,204,.25)}",
      "#hubThemeBtn .htk{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--hub-accent-dim,rgba(42,143,168,.12));color:var(--hub-accent-bright,#00E5CC)}",
      '#hubThemeBtn[data-theme="light"] .htk{color:#C77400;background:rgba(199,116,0,.12)}',
      "#hubThemeBtn .htl{white-space:nowrap}"
    ].join("");
    document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.id = "hubThemeBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Toggle light or dark mode");
    function render() {
      var light = current() === "light";
      btn.innerHTML = '<span class="htk">' + svg(light ? "sun" : "moon") + '</span><span class="htl">' + (light ? "Light" : "Dark") + '</span>';
      btn.dataset.theme = light ? "light" : "dark";
    }
    render();
    btn.addEventListener("click", function () {
      var next = current() === "light" ? "dark" : "light";
      apply(next); render();
      try { localStorage.setItem(KEY, next); } catch (e) {}
      try { if (window.HubAPI && HubAPI.settings && HubAPI.settings.save) HubAPI.settings.save({ settings: { theme: next } }); } catch (e) {}
    });

    // place it just before the avatar (or at the end of the bar)
    var avatar = bar.querySelector(".avatar");
    if (avatar) bar.insertBefore(btn, avatar); else bar.appendChild(btn);
    return true;
  }

  function boot() { if (!mount()) { var n = 0; var iv = setInterval(function () { if (mount() || ++n > 40) clearInterval(iv); }, 150); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
