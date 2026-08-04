/* RHOBEAR Rho — the LIVING plasma orb. Real-time <canvas> render: electric
   plasma filaments churning from a breathing core inside a glass sphere, holographic
   bloom, and genuine floating drift. Not a bubble, not a static image, not an emblem.
   Per-surface colour (Hub = teal). States: idle · thinking · speaking. Self-mounting.
   Canon: ~/.claude/canon/RHO-PLASMA-ORB.md */
(function () {
  "use strict";
  if (window.__rhoOrbLive) return; window.__rhoOrbLive = true;

  // ---- palette (Hub = teal; overridable via data-rho-surface) ----
  var SURFACES = {
    hub:     { core: "#F0FEFF", a: "#5FE9DC", b: "#22B8CE", c: "#12617A", spark: "#B9F6FF", violet: "#6E7BF2" },
    plans:   { core: "#FFF0FB", a: "#FF7FE6", b: "#C84BAA", c: "#7D2E77", spark: "#FFC6F2", violet: "#8A5CF0" },
    sales:   { core: "#FBFFE8", a: "#DDE85F", b: "#AEC22A", c: "#6F7A1A", spark: "#F2FFB9", violet: "#9AD84B" },
    reviews: { core: "#FFF6E8", a: "#F0C25F", b: "#C8912A", c: "#7A5A1A", spark: "#FFE6B9", violet: "#E0A84B" }
  };

  function hexToRgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function rgba(h,a){ var c=hexToRgb(h); return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }

  function Orb(canvas, surfaceName) {
    var P = SURFACES[surfaceName] || SURFACES.hub;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var self = { state: "idle", _raf: 0 };
    var t = 0, rings = [], lastRing = 0;

    // filaments: fixed angular slots with per-frame jitter (lightning look)
    var N = 11, fil = [];
    for (var i = 0; i < N; i++) fil.push({ ang: (i / N) * Math.PI * 2, seed: Math.random() * 1000, len: 0.72 + Math.random() * 0.24, ph: Math.random() * 6.28 });

    function resize() {
      var r = canvas.getBoundingClientRect();
      var s = Math.max(r.width, 40);
      canvas.width = s * dpr; canvas.height = s * dpr;
    }
    resize();
    var _ro = new ResizeObserver(resize); _ro.observe(canvas);

    function noise(x) { return Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 5.1 + 0.4) * 0.2; }

    function draw() {
      var w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
      var R = Math.min(w, h) * 0.5;
      var st = self.state;
      var speed = st === "thinking" ? 2.3 : st === "speaking" ? 1.7 : 0.85;
      var energy = st === "thinking" ? 1.0 : st === "speaking" ? 0.9 : 0.55;
      t += 0.016 * speed;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // holographic aurora bloom (hue drifts when idle)
      var hueShift = st === "idle" ? Math.sin(t * 0.25) * 0.5 + 0.5 : 0.2;
      var bloom = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.15);
      bloom.addColorStop(0, rgba(P.a, 0.34 * energy + 0.12));
      bloom.addColorStop(0.45, rgba(mix(P.b, P.violet, hueShift), 0.20));
      bloom.addColorStop(1, rgba(P.c, 0));
      ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(cx, cy, R * 1.15, 0, 6.2832); ctx.fill();

      // glass sphere body
      ctx.globalCompositeOperation = "source-over";
      var body = ctx.createRadialGradient(cx - R * 0.22, cy - R * 0.28, R * 0.1, cx, cy, R * 0.92);
      body.addColorStop(0, rgba(P.a, 0.30));
      body.addColorStop(0.5, rgba(P.c, 0.42));
      body.addColorStop(0.85, "rgba(6,12,18,0.62)");
      body.addColorStop(1, "rgba(3,7,11,0.30)");
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 6.2832); ctx.fill();

      // clip to sphere for the plasma
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 6.2832); ctx.clip();
      ctx.globalCompositeOperation = "lighter";

      // plasma filaments — jagged electric arcs from the core
      var rot = t * 0.5;
      for (var i = 0; i < N; i++) {
        var f = fil[i];
        var baseA = f.ang + rot + noise(t * 0.7 + f.seed) * 0.25;
        var segs = 7, prevx = cx, prevy = cy;
        var flick = 0.55 + 0.45 * Math.abs(noise(t * (st === "speaking" ? 5 : 3) + f.ph));
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (var s = 1; s <= segs; s++) {
          var rr = (s / segs) * R * 0.86 * f.len;
          var wob = noise(t * 2.2 + f.seed + s * 1.3) * (0.12 + 0.05 * s) * energy;
          var a2 = baseA + wob;
          var x = cx + Math.cos(a2) * rr, y = cy + Math.sin(a2) * rr;
          ctx.lineTo(x, y); prevx = x; prevy = y;
        }
        var grd = ctx.createLinearGradient(cx, cy, prevx, prevy);
        grd.addColorStop(0, rgba(P.spark, 0.9 * flick));
        grd.addColorStop(0.5, rgba(P.a, 0.7 * flick));
        grd.addColorStop(1, rgba(P.b, 0.0));
        ctx.strokeStyle = grd; ctx.lineWidth = Math.max(1, R * 0.02); ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = rgba(P.a, 0.8); ctx.shadowBlur = R * 0.06; ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // breathing core
      var pulse = 0.5 + 0.5 * Math.sin(t * (st === "speaking" ? 6 : 3.2));
      var cr = R * (0.16 + 0.05 * pulse * energy);
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 2.4);
      core.addColorStop(0, rgba(P.core, 0.98));
      core.addColorStop(0.35, rgba(P.spark, 0.85));
      core.addColorStop(0.7, rgba(P.a, 0.35));
      core.addColorStop(1, rgba(P.b, 0));
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, cr * 2.4, 0, 6.2832); ctx.fill();
      ctx.restore();

      // speaking rings emanate
      if (st === "speaking" && t - lastRing > 0.5) { rings.push({ r: R * 0.3, a: 0.8 }); lastRing = t; }
      for (var k = rings.length - 1; k >= 0; k--) {
        var rg = rings[k]; rg.r += R * 0.02; rg.a -= 0.02;
        if (rg.a <= 0) { rings.splice(k, 1); continue; }
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(P.a, rg.a);
        ctx.lineWidth = Math.max(1, R * 0.015); ctx.beginPath(); ctx.arc(cx, cy, rg.r, 0, 6.2832); ctx.stroke();
      }

      // glass highlight
      ctx.globalCompositeOperation = "source-over";
      var hi = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.34, 0, cx - R * 0.3, cy - R * 0.34, R * 0.5);
      hi.addColorStop(0, "rgba(255,255,255,0.5)"); hi.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(cx - R * 0.3, cy - R * 0.34, R * 0.5, 0, 6.2832); ctx.fill();

      // rim light
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1, R * 0.02); ctx.strokeStyle = rgba(P.a, 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 6.2832); ctx.stroke();

      self._raf = requestAnimationFrame(draw);
    }
    function mix(h1, h2, m) { var a = hexToRgb(h1), b = hexToRgb(h2); function hx(n){ return ("0"+Math.round(Math.max(0,Math.min(255,n))).toString(16)).slice(-2); } return "#" + hx(a[0]+(b[0]-a[0])*m) + hx(a[1]+(b[1]-a[1])*m) + hx(a[2]+(b[2]-a[2])*m); }
    draw();
    self.setState = function (s) { self.state = s; };
    self.destroy = function () { cancelAnimationFrame(self._raf); _ro.disconnect(); };
    return self;
  }

  // ---- self-mount: inject styles, build a big floating launcher, wire existing hooks ----
  function css() {
    if (document.getElementById("rho-orb-live-css")) return;
    var s = document.createElement("style"); s.id = "rho-orb-live-css";
    s.textContent = [
      ".rho-live-canvas{display:block;border-radius:50%}",
      ".rho-live--float{animation:rhoDrift 11s ease-in-out infinite}",
      "@keyframes rhoDrift{0%{transform:translate(0,0) scale(1)}20%{transform:translate(6px,-8px) scale(1.03)}45%{transform:translate(-5px,5px) scale(0.99)}70%{transform:translate(5px,7px) scale(1.03)}100%{transform:translate(0,0) scale(1)}}",
      /* KILL every flat/duplicate Rho emblem — the living canvas orb is the only Rho */
      ".fab-rho{display:none!important}",
      "#rho-launch .rho-orbimg,.mini-orb,#railRho .rho-orb{display:none!important}",
      "@media (prefers-reduced-motion: reduce){.rho-live--float{animation:none}}"
    ].join("");
    document.head.appendChild(s);
  }

  function mountCanvas(host, size, surface, floatIt) {
    if (!host || host.__rho) return; host.__rho = true;
    var cv = document.createElement("canvas");
    cv.className = "rho-live-canvas" + (floatIt ? " rho-live--float" : "");
    cv.style.width = size + "px"; cv.style.height = size + "px";
    host.insertBefore(cv, host.firstChild);
    window.RhoOrbs.push(Orb(cv, surface));
  }

  function boot() {
    css();
    var surface = (document.body.getAttribute("data-rho-surface") || "hub");
    window.RhoOrbs = window.RhoOrbs || [];

    // Rail orb (sidebar) — present immediately
    var rail = document.getElementById("railRho");
    if (rail && !rail.__rhoRail) {
      rail.__rhoRail = true;
      var span = document.createElement("span");
      span.style.cssText = "width:28px;height:28px;display:inline-block;vertical-align:middle;margin-right:8px";
      rail.insertBefore(span, rail.firstChild);
      mountCanvas(span, 28, surface, false);
    }

    // The embed launcher (#rho-launch) mounts a moment later and already opens the
    // real chat — poll for it, then make IT the big living orb; hide its flat image.
    var tries = 0;
    (function waitLaunch() {
      var launch = document.getElementById("rho-launch");
      if (launch && !launch.__rho) {
        launch.style.width = "76px"; launch.style.height = "76px";
        launch.style.background = "none"; launch.style.boxShadow = "none"; launch.style.border = "none";
        mountCanvas(launch, 76, surface, true);
        return;
      }
      if (tries++ < 60) setTimeout(waitLaunch, 120);
    })();

    window.RhoSetState = function (s) { (window.RhoOrbs || []).forEach(function (o) { o.setState(s); }); };
  }

  window.RhoOrb = Orb;           // mount on any canvas: RhoOrb(canvasEl, 'hub'|'plans'|...)
  window.RhoOrbCss = css;        // inject the float/style helpers on demand

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
