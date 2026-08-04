/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Harness + Model catalog (CLOUD).
   Plain browser ES, no build step. Loaded before work.js / aios.js.

   This is the ONE source of truth for "what can I run this stream on?".
   Harness-selection IS the product — the cloud Hub surfaces every brain
   Hermes can route to, grouped into harnesses, branded by the house lineup.

   Ported + re-skinned from the local build's authoritative
   D:/rhobear-app/hub/.../js/data/harness-data.jsx (Core · Summit · Peak).
   Cloud has no BYOK, so there are no "connect a key" CTAs — but the FULL
   harness/model picker is here, and it is driven by the live /v1/models
   catalog the backend (Hermes) actually surfaces. Never a fake cosmetic
   cycle: what you see is what Hermes will route.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── The roster — branding + grouping metadata only. ──────────────────
     `model` is the canonical id passed to /chat/stream. `aliases` lets a
     branded tier resolve against whatever exact id /v1/models returns
     (backend may list "core", the openrouter pin, or a legacy name). */
  var HARNESSES = [
    {
      id: 'house',
      label: 'House',
      glyph: '★',
      tagline: 'RHOBEAR house lineup — Core · Summit · Peak',
      models: [
        { model: 'core',   label: 'Core',   glyph: '★', note: 'everyday',        aliases: ['deepseek/deepseek-v4-flash', 'deepseek-v4-flash'] },
        { model: 'summit', label: 'Summit', glyph: '✻', note: 'speedy',          aliases: ['inclusionai/ling-2.6-flash', 'ling-2.6-flash'] },
        { model: 'peak',   label: 'Peak',   glyph: '◆', note: 'top · think:high', aliases: ['z-ai/glm-5.2', 'glm-5.2', 'glm-5', 'glm'] },
      ],
    },
    {
      id: 'claude',
      label: 'Claude',
      glyph: '◈',
      tagline: 'Anthropic flagships — pick your model',
      models: [
        { model: 'anthropic/claude-opus-4-8',   label: 'Opus 4.8',   note: 'most capable',  aliases: ['claude-opus-4-8', 'opus-4-8'] },
        { model: 'anthropic/claude-opus-4-7',   label: 'Opus 4.7',   note: 'deep',          aliases: ['claude-opus-4-7', 'opus-4-7'] },
        { model: 'anthropic/claude-sonnet-5',   label: 'Sonnet 5',   note: 'balanced',      aliases: ['claude-sonnet-5', 'sonnet-5'] },
        { model: 'anthropic/claude-sonnet-4-6', label: 'Sonnet 4.6', note: 'daily driver',  aliases: ['claude-sonnet-4-6', 'sonnet-4-6'] },
        { model: 'anthropic/claude-fable-5',    label: 'Fable 5',    note: 'creative',      aliases: ['claude-fable-5', 'fable-5'] },
        { model: 'anthropic/claude-haiku-4-5',  label: 'Haiku 4.5',  note: 'fast lane',     aliases: ['claude-haiku-4-5', 'haiku-4-5'] },
      ],
    },
    {
      id: 'open',
      label: 'Open',
      glyph: '⬡',
      tagline: 'Open models Hermes surfaces',
      models: [
        { model: 'z-ai/glm-5.2',          label: 'GLM 5.2',     note: 'think:high', aliases: ['glm-5.2', 'glm-5', 'glm'] },
        { model: 'deepseek/deepseek-v3',  label: 'DeepSeek V3', note: 'cheap · strong', aliases: ['deepseek-v3'] },
        { model: 'deepseek/deepseek-r1',  label: 'DeepSeek R1', note: 'reasoning',  aliases: ['deepseek-r1'] },
        { model: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'long ctx', aliases: ['gemini-2.5-pro'] },
        { model: 'moonshot/kimi-k2',      label: 'Kimi K2',     note: 'agentic',    aliases: ['kimi-k2'] },
      ],
    },
  ];

  var DEFAULT = { harness: 'house', model: 'core' };
  var STORE_KEY = 'hub.brain.selection';

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Flatten roster → [{harness, model, label, note, glyph, aliases}] */
  function flat() {
    var out = [];
    HARNESSES.forEach(function (h) {
      h.models.forEach(function (m) {
        out.push({
          harness: h.id, harnessLabel: h.label,
          model: m.model, label: m.label, note: m.note || '',
          glyph: m.glyph || h.glyph, aliases: m.aliases || [],
        });
      });
    });
    return out;
  }

  function findModel(harness, model) {
    var all = flat();
    var hit = all.filter(function (e) { return e.harness === harness && e.model === model; })[0];
    if (hit) return hit;
    hit = all.filter(function (e) { return e.model === model; })[0];
    return hit || all.filter(function (e) { return e.model === DEFAULT.model; })[0];
  }

  /* ── Live catalog (what Hermes actually surfaces) ─────────────────────
     GET /v1/models → { data:[{id}] } (OpenAI shape) OR { models:[...] }.
     Cached for the session. Never blocks the picker: on any failure the
     roster shows as-is (all available) so the lineup is never hidden. */
  var _livePromise = null;
  function liveIds() {
    if (_livePromise) return _livePromise;
    _livePromise = fetch('/v1/models', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var arr = (j && (j.data || j.models || j.available)) || [];
        var set = {};
        (Array.isArray(arr) ? arr : []).forEach(function (m) {
          var id = (typeof m === 'string') ? m : (m && (m.id || m.model || m.name));
          if (id) set[String(id).toLowerCase()] = (typeof m === 'object') ? m : { id: id };
        });
        return set;
      })
      .catch(function () { return {}; });
    return _livePromise;
  }

  // Does the live /v1/models list actually share our model namespace? Some
  // backends expose a single opaque router agent (e.g. "rhobear-agent") that
  // tolerates any `model` value — in that case /v1/models tells us nothing
  // about which brands are up, so we must NOT dim the lineup on it.
  function sharesNamespace(set) {
    if (!set || Object.keys(set).length === 0) return false;
    var known = {};
    flat().forEach(function (e) {
      known[e.model.toLowerCase()] = 1;
      (e.aliases || []).forEach(function (a) { known[String(a).toLowerCase()] = 1; });
    });
    return Object.keys(set).some(function (id) { return known[id]; });
  }

  function isAvail(entry, set, ns) {
    if (!ns) return true;                 // opaque/blip → show the whole lineup bright
    var keys = [entry.model].concat(entry.aliases || []).map(function (s) { return String(s).toLowerCase(); });
    for (var i = 0; i < keys.length; i++) { if (set[keys[i]]) return true; }
    return false;
  }

  /* Persist selection */
  function readSel() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var s = JSON.parse(raw); if (s && s.harness && s.model) return s; }
    } catch (e) {}
    return { harness: DEFAULT.harness, model: DEFAULT.model };
  }
  function writeSel(sel) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(sel)); } catch (e) {}
  }

  /* Label for the current chip, e.g. "★ Core" */
  function chipLabel(sel) {
    var e = findModel(sel.harness, sel.model);
    return (e.glyph ? e.glyph + ' ' : '') + e.label;
  }

  /* ── The popover picker ───────────────────────────────────────────────
     Two-step feel in one panel: harness section headers, model rows under
     each, live-dot per row (green = Hermes has it, dim = not up right now).
     Anything /v1/models returns that the roster doesn't know gets its own
     "More" group so nothing surfaced is ever hidden. */
  var _open = null;
  function closePicker() {
    if (_open) { _open.remove(); _open = null; }
    document.removeEventListener('click', _outside, true);
    document.removeEventListener('keydown', _esc, true);
  }
  function _outside(e) { if (_open && !_open.contains(e.target) && !(_open._anchor && _open._anchor.contains(e.target))) closePicker(); }
  function _esc(e) { if (e.key === 'Escape') closePicker(); }

  function openPicker(anchor, onPick) {
    if (_open) { closePicker(); return; }
    var sel = readSel();

    var panel = document.createElement('div');
    panel.className = 'hub-brainpick';
    panel._anchor = anchor;
    panel.setAttribute('role', 'listbox');

    liveIds().then(function (set) {
      var ns = sharesNamespace(set); // only gate/append when it's really our namespace
      var known = {}; // canonical + alias ids claimed by the roster
      flat().forEach(function (e) {
        known[e.model.toLowerCase()] = 1;
        (e.aliases || []).forEach(function (a) { known[String(a).toLowerCase()] = 1; });
      });

      var html = '';
      HARNESSES.forEach(function (h) {
        html += '<div class="hub-brainpick__group">' +
          '<div class="hub-brainpick__grouphdr">' + esc(h.label) +
          '<span class="hub-brainpick__grouptag">' + esc(h.tagline) + '</span></div>';
        h.models.forEach(function (m) {
          var entry = { model: m.model, aliases: m.aliases };
          var up = isAvail(entry, set, ns);
          var active = (sel.harness === h.id && sel.model === m.model);
          html += '<button class="hub-brainpick__row' + (active ? ' is-active' : '') + (up ? '' : ' is-down') +
            '" type="button" role="option" aria-selected="' + (active ? 'true' : 'false') +
            '" data-harness="' + esc(h.id) + '" data-model="' + esc(m.model) + '">' +
            '<span class="hub-brainpick__glyph">' + esc(m.glyph || h.glyph) + '</span>' +
            '<span class="hub-brainpick__name">' + esc(m.label) + '</span>' +
            '<span class="hub-brainpick__note">' + esc(m.note || '') + '</span>' +
            '<span class="hub-brainpick__dot" title="' + (up ? 'available' : 'not up right now') + '"></span>' +
            '</button>';
        });
        html += '</div>';
      });

      // Anything Hermes surfaces that the roster doesn't already claim — only
      // when the live list is genuinely our model namespace (not an opaque
      // single-agent router, which would just dump "rhobear-agent" here).
      var extras = ns ? Object.keys(set).filter(function (id) { return !known[id]; }) : [];
      if (extras.length) {
        html += '<div class="hub-brainpick__group"><div class="hub-brainpick__grouphdr">More<span class="hub-brainpick__grouptag">also surfaced by Hermes</span></div>';
        extras.forEach(function (id) {
          var real = set[id].id || id;
          var active = (sel.model === real);
          html += '<button class="hub-brainpick__row' + (active ? ' is-active' : '') +
            '" type="button" role="option" data-harness="open" data-model="' + esc(real) + '">' +
            '<span class="hub-brainpick__glyph">⬡</span>' +
            '<span class="hub-brainpick__name">' + esc(real) + '</span>' +
            '<span class="hub-brainpick__note"></span>' +
            '<span class="hub-brainpick__dot"></span></button>';
        });
        html += '</div>';
      }

      panel.innerHTML = html;
      panel.querySelectorAll('.hub-brainpick__row').forEach(function (row) {
        row.addEventListener('click', function () {
          var pick = { harness: row.getAttribute('data-harness'), model: row.getAttribute('data-model') };
          writeSel(pick);
          closePicker();
          if (typeof onPick === 'function') onPick(pick);
        });
      });
    });

    document.body.appendChild(panel);
    _open = panel;

    // Position above the anchor (options row sits low on the page)
    var r = anchor.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.left = Math.max(12, r.left) + 'px';
    var below = window.innerHeight - r.bottom;
    if (below < 320) {
      panel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    } else {
      panel.style.top = (r.bottom + 8) + 'px';
    }

    setTimeout(function () {
      document.addEventListener('click', _outside, true);
      document.addEventListener('keydown', _esc, true);
    }, 0);
  }

  window.HubCatalog = {
    harnesses: HARNESSES,
    defaultSelection: function () { return { harness: DEFAULT.harness, model: DEFAULT.model }; },
    readSelection: readSel,
    writeSelection: writeSel,
    findModel: findModel,
    chipLabel: chipLabel,
    liveIds: liveIds,
    openPicker: openPicker,
    closePicker: closePicker,
  };
})();
