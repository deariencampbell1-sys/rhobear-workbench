/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Vault

   The full vault: notes, the [[wikilink]] graph, and the storage
   connection itself. The behaviour is in screens/vault-view.js, shared
   with Notes; this file only says which root to mount it on.

   What it replaces: an encrypted-secrets manager. There was never a
   secrets backend — not a route, not a table, not a sidecar. The five rows
   were hardcoded in the markup, "reveal" swapped one hardcoded string for
   another, and "Add secret" disabled itself for two seconds and called
   that a feature. Nothing that worked was removed with it.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('[data-screen="vault"]');
  if (!root || !window.HubVaultView) return;
  window.HubVaultView.mount(root, { screenName: 'vault' });
})();
