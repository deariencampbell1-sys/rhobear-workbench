/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — Notes

   The same vault as the Vault screen, mounted as the capture view. One
   store, two views — the behaviour lives in screens/vault-view.js.

   This screen used to be five hardcoded notes behind a CSS blur, under a
   "Sign in to sync your notes" gate whose Continue-with-Google and Maybe-
   later buttons were both inert, with a comment explaining that notes had
   no cloud endpoint. The endpoint they needed was the customer's own
   storage, which was already built.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('[data-screen="notes"]');
  if (!root || !window.HubVaultView) return;
  window.HubVaultView.mount(root, { screenName: 'notes' });
})();
