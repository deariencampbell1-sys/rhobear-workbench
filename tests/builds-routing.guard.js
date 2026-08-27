#!/usr/bin/env node
/* Builds routing guard: fallback stays inside one session and never retries
   after visible work has started. This is intentionally dependency-free so it
   can run on the VPS and in the static deploy gate. */
const fs = require('fs');
const vm = require('vm');

const apiSource = fs.readFileSync(require('path').join(__dirname, '..', 'api.js'), 'utf8');

function streamResponse(events) {
  let index = 0;
  const encoder = new TextEncoder();
  const chunks = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return {
    ok: true,
    status: 200,
    body: { getReader: () => ({ read: async () => index < chunks.length
      ? { value: encoder.encode(chunks[index++]) }
      : { done: true } }) },
  };
}

function run(fetchImpl, onError) {
  const calls = [];
  const ctx = {
    console, TextDecoder, TextEncoder, AbortController, URLSearchParams, URL,
    setTimeout, clearTimeout,
    location: { href: 'https://builds.rhobear.ai/' },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return fetchImpl(calls.length);
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(apiSource, ctx);
  const routes = [];
  let text = '';
  ctx.HubAPI.chatStream({
    sessionId: 'session-guard', message: 'guard', model: 'summit',
    harness: 'hermes', fallbacks: ['pi'], timeoutMs: 1000,
  }, {
    onRoute: (route) => routes.push(route),
    onText: (delta) => { text += delta; },
    onDone: () => routes.push({ state: 'done' }),
    onError: (message, info) => { if (onError) onError(message, info); },
  });
  return new Promise((resolve) => setTimeout(() => resolve({ calls, routes, text }), 40));
}

async function main() {
  const retried = await run((n) => n === 1
    ? { ok: false, status: 503, json: async () => ({ error: 'gateway_unreachable' }) }
    : streamResponse([['assistant.delta', { delta: 'ok' }], ['done', {}]]));
  if (retried.calls.length !== 2) throw new Error('expected one retry in the same session');
  if (retried.calls[0].body.harness !== 'hermes' || retried.calls[1].body.harness !== 'pi') throw new Error('route order drifted');
  if (retried.calls[0].body.routing.chain.join(',') !== 'hermes,pi') throw new Error('routing chain missing');
  if (retried.text !== 'ok') throw new Error('fallback stream did not complete');

  let hardStop = false;
  const blocked = await run(() => ({
    ok: false, status: 402,
    json: async () => ({ error: 'insufficient_credits', message: 'no credits' }),
  }), () => { hardStop = true; });
  if (!hardStop || blocked.calls.length !== 1) throw new Error('credit failures must not fall through to another harness');

  console.log('builds-routing: all checks passed');
}

main().catch((error) => { console.error('builds-routing: ' + error.message); process.exit(1); });
