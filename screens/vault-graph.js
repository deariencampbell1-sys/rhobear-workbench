/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Vault link graph

   The force-directed canvas renderer. It was written for the Notes screen
   and only ever fed { nodes: [], edges: [] }, so it had never drawn a
   single node. It is one module now — Vault and Notes both mount it —
   rather than a copy in each screen.

   Data contract, unchanged from the original:
     { nodes: [{ id, title, folder, weight, missing }], edges: [{ source, target }] }

   window.HubVaultGraph.mount(canvas, getGraph, opts) → { start, stop, redraw }
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FOLDER_COLOR = {
    runbook: '#2A8FA8', decisions: '#00E5CC', design: '#B794F4',
    runtime: '#F59E2C', crew: '#58A6FF', journal: '#E06552'
  };
  var DEFAULT_COLOR = '#2A8FA8';

  function colorFor(folder) { return FOLDER_COLOR[folder] || DEFAULT_COLOR; }

  function layoutStep(nodes, edges, w, h) {
    var i, j, n = nodes.length;
    for (i = 0; i < n; i++) {
      var a = nodes[i];
      a.vx = a.vx || 0; a.vy = a.vy || 0;
      for (j = i + 1; j < n; j++) {
        var b = nodes[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d2 = Math.max(dx * dx + dy * dy, 40);
        var f = 900 / d2;
        var fx = f * dx, fy = f * dy;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      a.vx += (w / 2 - a.x) * 0.002;
      a.vy += (h / 2 - a.y) * 0.002;
    }
    edges.forEach(function (e) {
      var a = nodes[e._si], b = nodes[e._ti];
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var f = (dist - 90) * 0.02;
      var fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    });
    var moved = 0;
    nodes.forEach(function (a) {
      a.vx *= 0.82; a.vy *= 0.82;
      a.x += a.vx; a.y += a.vy;
      a.x = Math.max(24, Math.min(w - 24, a.x));
      a.y = Math.max(24, Math.min(h - 24, a.y));
      moved += Math.abs(a.vx) + Math.abs(a.vy);
    });
    return moved;
  }

  function radius(n) { return 4 + (n.weight || 1) * 2.2; }

  function draw(ctx, nodes, edges, hoverIdx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.lineWidth = 1;
    edges.forEach(function (e) {
      var a = nodes[e._si], b = nodes[e._ti];
      if (!a || !b) return;
      var lit = hoverIdx >= 0 && (e._si === hoverIdx || e._ti === hoverIdx);
      ctx.strokeStyle = lit ? 'rgba(0,229,204,0.55)' : 'rgba(151,183,196,0.18)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    var font = getComputedStyle(document.body).getPropertyValue('--hub-font-body') || 'sans-serif';
    nodes.forEach(function (n, i) {
      var r = radius(n);
      var color = colorFor(n.folder);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.missing) {
        /* A note that is linked to but does not exist yet — drawn hollow so
           the gap is legible instead of looking like a real note. */
        ctx.strokeStyle = 'rgba(151,183,196,0.55)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.font = (i === hoverIdx ? '600 12px ' : '11px ') + font;
      ctx.fillStyle = n.missing ? 'rgba(151,183,196,0.7)'
                    : (i === hoverIdx ? '#E8EEF2' : 'rgba(232,238,242,0.82)');
      ctx.fillText(n.title || n.id, n.x + r + 5, n.y + 3);
    });
  }

  function mount(canvas, getGraph, opts) {
    opts = opts || {};
    var running = false, nodes = [], edges = [], w = 0, h = 0, ctx = null, hoverIdx = -1;

    function sync() {
      var g = getGraph() || { nodes: [], edges: [] };
      var prev = {};
      nodes.forEach(function (n) { prev[n.id] = n; });

      nodes = (g.nodes || []).map(function (n) {
        var p = prev[n.id];
        return Object.assign({}, n, p
          ? { x: p.x, y: p.y, vx: p.vx, vy: p.vy }
          : { x: w / 2 + (Math.random() - 0.5) * 220, y: h / 2 + (Math.random() - 0.5) * 220 });
      });
      var idx = {};
      nodes.forEach(function (n, i) { idx[n.id] = i; });
      edges = (g.edges || [])
        .map(function (e) { return { _si: idx[e.source], _ti: idx[e.target] }; })
        .filter(function (e) { return e._si !== undefined && e._ti !== undefined; });
      return nodes.length;
    }

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth || 600;
      h = canvas.clientHeight || 400;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function hitTest(px, py) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        var dx = px - n.x, dy = py - n.y, r = radius(n) + 6;
        if (dx * dx + dy * dy <= r * r) return i;
      }
      return -1;
    }

    canvas.addEventListener('mousemove', function (ev) {
      if (!nodes.length) return;
      var b = canvas.getBoundingClientRect();
      hoverIdx = hitTest(ev.clientX - b.left, ev.clientY - b.top);
      canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : '';
    });
    canvas.addEventListener('mouseleave', function () { hoverIdx = -1; });
    canvas.addEventListener('click', function (ev) {
      if (!opts.onOpen || !nodes.length) return;
      var b = canvas.getBoundingClientRect();
      var i = hitTest(ev.clientX - b.left, ev.clientY - b.top);
      if (i >= 0) opts.onOpen(nodes[i]);
    });

    function start() {
      resize();
      var count = sync();
      if (opts.onCount) opts.onCount(count);
      if (!count) { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      if (running) return;
      running = true;
      (function tick() {
        if (!running) return;
        layoutStep(nodes, edges, w, h);
        draw(ctx, nodes, edges, hoverIdx);
        requestAnimationFrame(tick);
      })();
    }

    function stop() { running = false; }

    /* Re-read the graph without losing the positions already settled. */
    function redraw() {
      if (!ctx) resize();
      var count = sync();
      if (opts.onCount) opts.onCount(count);
      if (count && !running) start();
      if (!count) { stop(); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    window.addEventListener('resize', function () {
      if (!running) return;
      resize();
    });

    return { start: start, stop: stop, redraw: redraw };
  }

  window.HubVaultGraph = { mount: mount, FOLDER_COLOR: FOLDER_COLOR, colorFor: colorFor };
})();
