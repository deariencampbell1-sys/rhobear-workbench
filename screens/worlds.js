/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Worlds
   Real, persisted world list + active selection (localStorage — no cloud
   multi-world endpoint exists yet). Switching updates the nav label for
   real, everywhere, immediately — not a cosmetic label cycle.
   Swap the storage functions for a HubAPI.worlds.* call when the cloud
   endpoint ships; per-world DATA isolation (separate board/crew/files per
   world) is a backend feature to wire next — this lane makes the CONCEPT
   real and persisted, honestly, without claiming full isolation yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'hub_worlds_v1';
  var ACTIVE_KEY = 'hub_active_world_v1';

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && v.length) return v;
    } catch (e) {}
    return [{ id: 'home', name: 'Home world' }];
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  function activeId() { try { return localStorage.getItem(ACTIVE_KEY) || 'home'; } catch (e) { return 'home'; } }
  function setActiveId(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }

  function syncNavLabel() {
    var list = load(), id = activeId();
    var w = list.filter(function (x) { return x.id === id; })[0] || list[0];
    var v = document.querySelector('#worldSwitch .w-value');
    if (v && w) v.textContent = w.name;
  }
  window.RB_syncWorldLabel = syncNavLabel;
  syncNavLabel();

  var screen = document.querySelector('[data-screen="worlds"]');
  if (!screen) return;

  function render() {
    var list = load(), id = activeId();
    var countEl = screen.querySelector('[data-world-count]');
    if (countEl) countEl.textContent = list.length + (list.length === 1 ? ' world' : ' worlds');

    var grid = screen.querySelector('[data-worlds-grid]');
    if (grid) {
      grid.innerHTML = list.map(function (w) {
        var isActive = w.id === id;
        return '\
          <div class="hub-card s-worlds__card' + (isActive ? ' is-active' : '') + '" data-world-id="' + esc(w.id) + '">\
            <div class="between">\
              <strong>' + esc(w.name) + '</strong>\
              ' + (isActive ? '<span class="chip chip--accent">Active</span>' : '<button class="hub-btn-ghost" data-world-switch="' + esc(w.id) + '" type="button">Switch</button>') + '\
            </div>\
          </div>';
      }).join('');
    }
  }

  var newBtn = screen.querySelector('[data-world-new]');
  if (newBtn) newBtn.addEventListener('click', function () {
    var name = window.prompt('Name the new world:');
    if (!name) return;
    var list = load();
    var id = 'w_' + Date.now();
    list.push({ id: id, name: name });
    save(list);
    setActiveId(id);
    syncNavLabel();
    render();
  });

  screen.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-world-switch]');
    if (!t) return;
    setActiveId(t.getAttribute('data-world-switch'));
    syncNavLabel();
    render();
  });

  render();
})();
