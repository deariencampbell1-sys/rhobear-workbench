#!/usr/bin/env node
/* ==========================================================================
   GUARD — Builds' Rho companion must be configured before the embed loads.
   --------------------------------------------------------------------------
   Regression coverage for the live defect where builds.rhobear.ai answered
   every turn with the permanent "warming up" placeholder:
     - index.html loaded companion-embed-orb4.js but never set
       window.RHOBEAR_COMPANION, so the embed ran unconfigured
       (ENDPOINT='' / READY=false) and its send path short-circuited to the
       warming text instead of calling the brain.

   What this file guards:
     A. index.html declares a same-origin endpoint + ready BEFORE the embed
        <script> tag (the embed reads the config at IIFE time, so the config
        block must precede it).
     B. The shipped embed, when configured, actually POSTs to
        /companion/api/chat and streams the reply — and when unconfigured it
        emits the warming fallback with zero network calls. Both directions
        are asserted, so the check fails if the defect returns.
     C. Negative controls: each assertion is proven to FAIL when its guarded
        property is removed (missing config / ready:false / embed unconfigured).

   Run:  node tests/companion-config.guard.js
   Zero dependencies — plain Node, no test framework, mirrors deploy.sh's
   inline-script syntax gate.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const INDEX = path.join(REPO, 'index.html');
const EMBED = path.join(REPO, 'companion-embed-orb4.js');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + ' — ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- A: static contract on index.html ------------------------------------- */

// Same regex family as deploy.sh's syntax gate: inline <script> blocks only
// (any <script> carrying a src= attribute is skipped).
function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push({ source: m[1], index: m.index });
  return out;
}

function embedScriptIndex(html) {
  const m = /<script[^>]*\bsrc=["'][^"']*companion-embed-orb4\.js[^"']*["'][^>]*>/.exec(html);
  assert(m, 'index.html must include companion-embed-orb4.js');
  return m.index;
}

function assertConfigBeforeEmbed(html) {
  const blocks = extractInlineScripts(html).filter((b) => b.source.indexOf('window.RHOBEAR_COMPANION') !== -1);
  assert(blocks.length === 1,
    'expected exactly one window.RHOBEAR_COMPANION inline block, found ' + blocks.length);
  const ctx = { window: {} };
  vm.runInNewContext(blocks[0].source, ctx, { timeout: 1000 });
  const cfg = ctx.window.RHOBEAR_COMPANION;
  assert(cfg && typeof cfg === 'object', 'window.RHOBEAR_COMPANION must be an object');
  assert(typeof cfg.endpoint === 'string' && cfg.endpoint.length > 0,
    'endpoint must be a non-empty string, got ' + JSON.stringify(cfg.endpoint));
  assert(cfg.endpoint.charAt(0) === '/' && cfg.endpoint.indexOf('://') === -1 && cfg.endpoint.indexOf('//') !== 0,
    'endpoint must be same-origin (path only, no host), got ' + JSON.stringify(cfg.endpoint));
  assert(cfg.ready === true, 'ready must be true, got ' + JSON.stringify(cfg.ready));
  assert(blocks[0].index < embedScriptIndex(html),
    'config block must appear BEFORE the embed <script> tag');
}

/* ---- B: behavioral contract — the real embed, real send path --------------- */

// Minimal DOM stub: enough surface for companion-embed-orb4.js to mount,
// wire every control, and drive one send. The embed builds its whole tree
// from a root innerHTML template, so the stub parses tags/ids/classes from
// that template instead of hand-modeling the UI.
const VOID_TAGS = new Set(['img', 'br', 'input', 'link', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'meta']);

function makeEl(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    id: '',
    className: '',
    value: '',
    title: '',
    type: '',
    accept: '',
    disabled: false,
    isConnected: false,
    scrollTop: 0,
    scrollHeight: 0,
    _handlers: {},
    _attrs: {},
    _text: null,
    style: { setProperty: function () {} },
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    appendChild: function (c) { c.parentNode = this; c.isConnected = this.isConnected; this.children.push(c); return c; },
    insertBefore: function (c, ref) {
      c.parentNode = this; c.isConnected = this.isConnected;
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    remove: function () {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null; this.isConnected = false;
      }
    },
    contains: function (n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; },
    addEventListener: function (t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    dispatchEvent: function (t) { (this._handlers[t] || []).slice().forEach((fn) => fn.call(this)); },
    focus: function () {},
    select: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; },
    animate: function () { return { onfinish: null }; },
    classList: {
      _s: new Set(),
      add: function () { for (let i = 0; i < arguments.length; i++) this._s.add(arguments[i]); },
      remove: function () { for (let i = 0; i < arguments.length; i++) this._s.delete(arguments[i]); },
      toggle: function (c, force) {
        const on = force === undefined ? !this._s.has(c) : !!force;
        if (on) this._s.add(c); else this._s.delete(c);
        return on;
      },
      contains: function (c) { return this._s.has(c); }
    },
    querySelector: function (sel) { return dfs(this, sel, false); },
    querySelectorAll: function (sel) { return dfs(this, sel, true); }
  };
  Object.defineProperties(el, {
    firstChild: { get: function () { return this.children[0] || null; } },
    lastChild: { get: function () { return this.children[this.children.length - 1] || null; } },
    nextSibling: {
      get: function () {
        if (!this.parentNode) return null;
        const i = this.parentNode.children.indexOf(this);
        return i >= 0 && i + 1 < this.parentNode.children.length ? this.parentNode.children[i + 1] : null;
      }
    },
    textContent: {
      configurable: true,
      get: function () { return this._text != null ? this._text : this.children.map((c) => c.textContent || '').join(''); },
      set: function (v) { this._text = String(v); this.children.length = 0; }
    },
    innerHTML: {
      configurable: true,
      get: function () { return ''; },   // the embed only writes innerHTML, never reads it
      set: function (html) { this.children.length = 0; parseHTMLInto(html, this); }
    }
  });
  return el;
}

function pushText(parent, text) {
  const t = text.replace(/[\t\n\r ]+/g, ' ').trim();
  if (t) parent.children.push({ nodeType: 3, textContent: t, parentNode: parent, children: [] });
}

function parseHTMLInto(html, parent) {
  const stack = [parent];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-zA-Z0-9-]+(?:\s*=\s*"[^"]*")?)*?)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) pushText(stack[stack.length - 1], html.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1], tag = m[2].toUpperCase(), attrs = m[3], selfClose = m[4];
    if (closing) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName === tag) { stack.length = i; break; }
      }
      continue;
    }
    const el = makeEl(tag);
    const am = /([a-zA-Z0-9-]+)(?:\s*=\s*"([^"]*)")?/g;
    let a;
    while ((a = am.exec(attrs))) {
      const k = a[1], v = a[2] == null ? '' : a[2];
      el._attrs[k] = v;
      if (k === 'id') el.id = v;
      else if (k === 'class') el.className = v;
      else if (k === 'disabled') el.disabled = true;
      else if (k === 'style') {
        v.split(';').forEach((decl) => {
          const kv = decl.split(':');
          if (kv.length === 2) el.style[kv[0].trim()] = kv[1].trim();
        });
      }
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !VOID_TAGS.has(m[2].toLowerCase())) stack.push(el);
  }
  if (html.length > last) pushText(stack[stack.length - 1], html.slice(last));
}

// Selector shapes the embed actually uses: #id, .class, and one-level
// descendant chains with comma lists (".rho-head-orb .rho-orbimg, #rho-call-orb .rho-orbimg").
function matchSimple(n, part) {
  if (!n.nodeType) return false;
  if (part.charAt(0) === '#') return n._attrs && n._attrs.id === part.slice(1);
  if (part.charAt(0) === '.') return (n.className || '').split(/\s+/).indexOf(part.slice(1)) >= 0;
  return n.tagName === part.toUpperCase();
}
function matchChain(node, parts, i) {
  if (!node || !matchSimple(node, parts[i])) return false;
  if (i === 0) return true;
  for (let p = node.parentNode; p; p = p.parentNode) if (matchChain(p, parts, i - 1)) return true;
  return false;
}
function matchesSel(node, sel) {
  return sel.split(',').some((one) => matchChain(node, one.trim().split(/\s+/), one.trim().split(/\s+/).length - 1));
}
function dfs(root, sel, all, out) {
  out = out || [];
  if (matchesSel(root, sel)) { if (!all) return root; out.push(root); }
  for (let i = 0; i < (root.children || []).length; i++) {
    const r = dfs(root.children[i], sel, all, out);
    if (!all && r) return r;
  }
  return all ? out : null;
}

const URLClass = class extends URL { static createObjectURL() { return 'blob:fake'; } };

function makeContext(config) {
  const fetchCalls = [];
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const body = makeEl('body'); body.isConnected = true;
  const head = makeEl('head');
  const documentStub = {
    body, head,
    currentScript: null,
    createElement: (t) => makeEl(t),
    getElementById: (id) => dfs(body, '#' + id, false) || dfs(head, '#' + id, false),
    addEventListener: function () {}
  };
  // Fake brain: streams one session + one delta + done, exactly like the
  // companion server's SSE surface (event: session|delta|done, blank line apart).
  function chatResponse() {
    const chunks = [
      'event: session\ndata: {"sessionId":"s-guard-test"}\n\n',
      'event: delta\ndata: {"text":"Hello from the guard-test brain"}\n\n',
      'event: done\ndata: {}\n\n'
    ];
    let i = 0;
    const enc = new TextEncoder();
    return {
      status: 200, ok: true,
      json: async () => ({}),
      body: { getReader: () => ({ read: async () => (i < chunks.length ? { value: enc.encode(chunks[i++]) } : { done: true }) }) }
    };
  }
  const ctx = {
    console,
    URL: URLClass,
    TextDecoder, TextEncoder,
    AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    screen: { width: 1280, height: 800 },
    location: { hostname: 'builds.rhobear.ai', href: 'https://builds.rhobear.ai/', origin: 'https://builds.rhobear.ai' },
    localStorage,
    navigator: { clipboard: undefined, mediaDevices: undefined },
    document: documentStub,
    open: () => null,
    addEventListener: function () {},   // window.addEventListener (message bus)
    Audio: function () { return { play: () => Promise.resolve(), pause: function () {} }; },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      if (String(url).indexOf('/api/chat') !== -1) return chatResponse();
      if (String(url).indexOf('/api/me') !== -1) return { status: 200, ok: true, json: async () => ({ authRequired: false, signedIn: true }) };
      return { status: 200, ok: true, json: async () => ({}) };
    }
  };
  ctx.window = ctx;                       // the embed talks to window.* and the IIFE's window === this
  if (config) ctx.window.RHOBEAR_COMPANION = config;
  return { ctx, fetchCalls };
}

// Mount the real embed, type a turn, hit send, and let the async chain land.
async function runEmbed(embedSrc, config) {
  const { ctx, fetchCalls } = makeContext(config);
  vm.runInNewContext(embedSrc, ctx, { timeout: 5000 });
  const input = ctx.document.getElementById('rho-input');
  const sendBtn = ctx.document.getElementById('rho-send');
  assert(input && sendBtn, 'embed must mount the composer (input + send)');
  input.value = 'ping the crew';
  input.dispatchEvent('input');          // refreshSend() enables the send button
  sendBtn.dispatchEvent('click');        // send()
  // Warming fallback typewrites ~14ms/char; streamed reply lands in microtasks.
  await sleep(config ? 120 : 900);
  return { fetchCalls, threadText: ctx.document.getElementById('rho-thread').textContent };
}

/* ---- main ----------------------------------------------------------------- */

async function main() {
  console.log('guard: Builds Rho companion must be configured and hit /companion/api/chat\n');

  const html = fs.readFileSync(INDEX, 'utf8');
  check('A1  index.html declares same-origin endpoint + ready BEFORE the embed script',
    () => assertConfigBeforeEmbed(html));

  check('A2  (negative) guard fails when the config block is missing',
    () => {
      const stripped = html.replace(/<script>\s*window\.RHOBEAR_COMPANION[\s\S]*?<\/script>/, '');
      let threw = false;
      try { assertConfigBeforeEmbed(stripped); } catch (e) { threw = true; }
      assert(threw, 'expected the guard to fail on missing config');
    });

  check('A3  (negative) guard fails when ready:false',
    () => {
      let threw = false;
      try { assertConfigBeforeEmbed(html.replace('ready: true', 'ready: false')); } catch (e) { threw = true; }
      assert(threw, 'expected the guard to fail on ready:false');
    });

  const embedSrc = fs.readFileSync(EMBED, 'utf8');

  const warm = await runEmbed(embedSrc, null);
  check('B1  (negative) unconfigured embed answers the warming placeholder with zero network calls',
    () => {
      assert(warm.threadText.indexOf('warming') !== -1,
        'expected the warming text, got: ' + JSON.stringify(warm.threadText.slice(0, 100)));
      assert(warm.fetchCalls.length === 0,
        'expected zero network calls from the unconfigured embed, got ' + warm.fetchCalls.length);
    });

  const cold = await runEmbed(embedSrc, { endpoint: '/companion', ready: true });
  check('B2  configured embed POSTs /companion/api/chat and streams the reply (no warming text)',
    () => {
      assert(cold.fetchCalls.length === 1,
        'expected exactly one network call, got ' + cold.fetchCalls.length);
      const call = cold.fetchCalls[0];
      assert(call.url === '/companion/api/chat',
        'expected /companion/api/chat, got ' + JSON.stringify(call.url));
      assert(call.opts.method === 'POST', 'expected POST, got ' + call.opts.method);
      const payload = JSON.parse(call.opts.body);
      assert(payload.text === 'ping the crew', 'expected the typed text in the payload');
      assert(cold.threadText.indexOf('Hello from the guard-test brain') !== -1,
        'expected the streamed reply in the thread, got: ' + JSON.stringify(cold.threadText.slice(0, 100)));
      assert(cold.threadText.indexOf('warming') === -1,
        'the warming placeholder must not appear when the embed is configured');
    });

  console.log('');
  if (failures) { console.error(failures + ' check(s) FAILED'); process.exit(1); }
  console.log('all checks passed');
}

main().catch((e) => { console.error('guard crashed: ' + (e && e.stack || e)); process.exit(1); });
