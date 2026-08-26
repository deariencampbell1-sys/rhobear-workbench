/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — cloud data client.
   Plain browser ES, no build step. Loaded via <script> before app.js.
   Same-origin fetch, cookie auth. Export on window.HubAPI.

   Ported from the proven cloud (IS_CLOUD===true) branches of
   rhobear-workbench-src/js/api.jsx — same endpoints, same shapes.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Auth handoff gate ──────────────────────────────────────────────────
     Central auth lands staff/agents on `?rhobear_session=…`. That token has to
     be promoted to a cookie before anything else fires, otherwise every screen
     that loads on boot races the handoff and shows a spurious 401. So: when the
     token is present, spend it FIRST and make every request below wait on it.
     Without a token this resolves immediately and costs nothing. */
  var _authReady = (function () {
    var tok = '';
    try {
      tok = new URLSearchParams(window.location.search).get('rhobear_session') || '';
    } catch (e) { tok = ''; }
    if (!tok) return Promise.resolve(null);

    return fetch('/api/me?rhobear_session=' + encodeURIComponent(tok), {
      credentials: 'include',
    })
      .then(function (res) { return res.json().catch(function () { return null; }); })
      .catch(function () { return null; })
      .then(function (data) {
        // Drop the token from the address bar so it stops riding in history,
        // logs and Referer headers. Cosmetic — never block sign-in on it.
        try {
          var url = new URL(window.location.href);
          url.searchParams.delete('rhobear_session');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        } catch (e) { /* ignore */ }
        return data;
      });
  })();

  /* A Notes handoff is deliberately small and one-shot. Blueprints sends the
     signed-in user to Builds with the source brief; Builds then creates the
     normal persistent /api/sessions record and streams through the same SSE
     contract as every other Build. No transcript is fabricated in the URL. */
  function readBriefHandoff() {
    try {
      var raw = new URLSearchParams(window.location.search).get('brief');
      if (!raw) return null;
      var bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !parsed.noteId || !parsed.body) return null;
      var clean = new URL(window.location.href);
      clean.searchParams.delete('brief');
      window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      return parsed;
    } catch (e) { return null; }
  }
  var _briefHandoff = readBriefHandoff();

  /* ── HTTP helpers (same-origin, cookie auth, AbortController timeout) ── */
  function getJSON(url, ms) {
    ms = ms || 8000;
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return _authReady.then(function () {
      return fetch(url, { signal: ctl.signal, credentials: 'include' });
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        }).catch(function () {
          return { ok: res.ok, status: res.status, data: null };
        });
      })
      .catch(function (e) {
        return { ok: false, status: 0, data: null, offline: true, error: e };
      })
      .then(function (result) {
        clearTimeout(t);
        return result;
      });
  }

  function patchJSON(url, body, ms) {
    ms = ms || 12000;
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return _authReady.then(function () { return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
      credentials: 'include',
    }); })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        }).catch(function () {
          return { ok: res.ok, status: res.status, data: null };
        });
      })
      .catch(function (e) {
        return { ok: false, status: 0, data: null, offline: true, error: e };
      })
      .then(function (result) {
        clearTimeout(t);
        return result;
      });
  }

  function postJSON(url, body, ms) {
    ms = ms || 12000;
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return _authReady.then(function () { return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
      credentials: 'include',
    }); })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        }).catch(function () {
          return { ok: res.ok, status: res.status, data: null };
        });
      })
      .catch(function (e) {
        return { ok: false, status: 0, data: null, offline: true, error: e };
      })
      .then(function (result) {
        clearTimeout(t);
        return result;
      });
  }

  /* ── SSE reader — used by chatStream ───────────────────────────────── */
  function readSSE(res, on) {
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          var frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          var event = 'message', data = '';
          frame.split('\n').forEach(function (line) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          });
          if (!data) continue;
          try {
            var parsed = JSON.parse(data);
            if (parsed) on(event, parsed);
          } catch (e) { /* skip bad frame */ }
        }
        return pump();
      });
    }
    return pump();
  }

  /* ── HubAPI — the public API surface ────────────────────────────────── */
  var HubAPI = {

    /* ── Auth ──────────────────────────────────────────────── */
    /* Plain cookie auth. Any `?rhobear_session=` handoff was already spent by
       _authReady above, which every helper below waits on. */
    me: function () { return getJSON('/api/me'); },
    logout: function () { return postJSON('/api/auth/logout', {}); },

    /* ── Sessions ──────────────────────────────────────────── */
    sessions: {
      list: function () { return getJSON('/api/sessions'); },
      create: function (title) {
        // Gateway enforces UNIQUE session titles — always append a token
        var base = (title && String(title).trim().slice(0, 40)) || 'Work';
        var uniq = base + ' ' + Date.now().toString(36);
        return postJSON('/api/sessions', { title: uniq }).then(function (r) {
          if (r && r.data && r.data.session && typeof r.data.id === 'undefined') {
            r.data.id = r.data.session.id; r.data.session_id = r.data.session.id;
          }
          return r;
        });
      },
      messages: function (sessionId) {
        return getJSON('/api/sessions/' + encodeURIComponent(sessionId) + '/messages');
      },
    },

    /* ── Board ─────────────────────────────────────────────── */
    board: function () { return getJSON('/api/board'); },

    /* ── Jobs / runs ───────────────────────────────────────── */
    jobs: function () { return getJSON('/api/jobs'); },

    /* ── Credits ───────────────────────────────────────────── */
    credits: function () { return getJSON('/api/credits/summary'); },

    /* ── Settings / account — PATCH /api/me ────────────────── */
    settings: {
      save: function (body) { return patchJSON('/api/me', body); },
    },
    pendingBrief: _briefHandoff,

    /* ── Storage (BYO R2 buckets) ──────────────────────────── */
    storage: {
      accounts: function () { return getJSON('/api/storage/accounts'); },
      list: function (accountId, prefix) {
        var q = prefix ? '?prefix=' + encodeURIComponent(prefix) : '';
        return getJSON('/api/storage/list/' + encodeURIComponent(accountId) + q);
      },
    },

    /* ── Chat stream (SSE-backed) ──────────────────────────── */
    chatStream: function (payload, callbacks) {
      callbacks = callbacks || {};
      var sid = payload.sessionId;
      if (!sid) { if (callbacks.onError) callbacks.onError('no session'); return; }

      /* Builds is the control plane for the whole harness family. A failed
         adapter may be retried through the next route, but ONLY while the
         attempt is still silent. Once a tool or assistant delta is visible,
         retrying would duplicate work, so the error stays attached to this
         persistent session instead. */
      var routeIds = [payload.harness].concat(payload.fallbacks || []).filter(function (id, i, all) {
        return id && all.indexOf(id) === i;
      });
      if (!routeIds.length) routeIds = ['hermes'];
      var activeCtl = null;
      var activeTimer = null;
      var stopped = false;
      var completed = false;
      var currentAttempt = 0;

      function routeNotice(state, index, reason) {
        if (callbacks.onRoute) {
          callbacks.onRoute({
            state: state,
            harness: routeIds[index],
            attempt: index + 1,
            chain: routeIds.slice(),
            from: index > 0 ? routeIds[index - 1] : null,
            reason: reason || '',
          });
        }
      }

      function isHardStop(info) {
        var status = info && Number(info.status);
        var error = String((info && info.error) || '').toLowerCase();
        return status === 401 || status === 402 || status === 403 || status === 429 ||
          error === 'rate_limit_exceeded' || error === 'insufficient_credits' || error === 'login_required';
      }

      function canFallback(index, sawOutput, info) {
        return !stopped && !completed && !sawOutput && index < routeIds.length - 1 && !isHardStop(info);
      }

      function finishError(message, info) {
        if (completed || stopped) return;
        completed = true;
        if (callbacks.onError) callbacks.onError(message, info || {});
      }

      function startAttempt(index) {
        if (stopped || completed) return;
        currentAttempt = index;
        var sawOutput = false;
        var terminal = false;
        var fullText = '';
        var route = routeIds[index];
        activeCtl = new AbortController();
        routeNotice(index ? 'fallback' : 'starting', index, index ? 'previous adapter could not start' : 'preferred adapter');
        activeTimer = setTimeout(function () { activeCtl.abort(); }, payload.timeoutMs || (4 * 60 * 60 * 1000));

        fetch('/api/sessions/' + encodeURIComponent(sid) + '/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: payload.message,
            system_message: payload.system_message,
            harness: route,
            model: payload.model,
            // Older gateways ignore this field; newer adapters can use it to
            // record the route without inventing a second session contract.
            routing: { preferred: routeIds[0], chain: routeIds, attempt: index + 1 },
          }),
          credentials: 'include',
          signal: activeCtl.signal,
        }).then(function (res) {
          clearTimeout(activeTimer);
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (edata) {
              var info = { status: res.status, error: edata && edata.error, message: edata && edata.message };
              if (edata && (edata.error === 'rate_limit_exceeded' || edata.error === 'insufficient_credits')) {
                if (edata.error === 'insufficient_credits' && window.HubBilling) {
                  try { window.HubBilling.openPlan(); } catch (e) { /* non-fatal */ }
                }
                finishError(HubAPI.formatLimitError(edata), info);
                return;
              }
              if (canFallback(index, sawOutput, info)) {
                routeNotice('retrying', index + 1, info.message || info.error || ('HTTP ' + res.status));
                startAttempt(index + 1);
                return;
              }
              finishError((edata && edata.message) || (edata && edata.error) || 'bad-response', info);
            });
          }

          routeNotice('active', index, 'stream connected');
          var PASS_EVENTS = {
            'tool.started': 1, 'tool.completed': 1, 'tool.failed': 1,
            'tool.progress': 1, 'run.completed': 1,
          };

          return readSSE(res, function (event, data) {
            data = data || {};
            if (event === 'assistant.delta' && data.delta) {
              sawOutput = true;
              fullText += data.delta;
              if (callbacks.onText) callbacks.onText(data.delta);
            }
            if (PASS_EVENTS[event]) {
              sawOutput = true;
              if (callbacks.onEvent) {
                try { callbacks.onEvent(event, data); } catch (e) { /* never kill the stream */ }
              }
            }
            if (event === 'done' && !terminal) {
              terminal = true;
              completed = true;
              routeNotice('done', index, 'stream completed');
              if (callbacks.onDone) callbacks.onDone({ ok: true, text: fullText, harness: route, attempt: index + 1 });
            }
            if (event === 'error' && !terminal) {
              terminal = true;
              var info = { kind: 'agent', status: data.status, error: data.error, message: data.message };
              if (canFallback(index, sawOutput, info)) {
                routeNotice('retrying', index + 1, data.message || data.error || 'adapter error');
                startAttempt(index + 1);
                return;
              }
              finishError(data.message || 'agent error', info);
            }
          }).then(function () {
            if (!terminal && !stopped && !completed) {
              var info = { kind: 'network', message: 'stream closed before completion' };
              if (canFallback(index, sawOutput, info)) {
                routeNotice('retrying', index + 1, info.message);
                startAttempt(index + 1);
              } else {
                finishError('stream closed before completion', info);
              }
            }
          });
        }).catch(function (e) {
          clearTimeout(activeTimer);
          if (stopped || completed) return;
          var info = { kind: (e && e.name === 'AbortError') ? 'timeout' : 'network', message: e && e.message };
          if (canFallback(index, sawOutput, info)) {
            routeNotice('retrying', index + 1, info.kind);
            startAttempt(index + 1);
            return;
          }
          finishError(info.kind === 'timeout' ? 'timeout' : 'offline', info);
        });
      }

      startAttempt(0);
      return {
        abort: function () {
          stopped = true;
          if (activeTimer) clearTimeout(activeTimer);
          if (activeCtl) activeCtl.abort();
        },
        route: routeIds.slice(),
        attempt: function () { return currentAttempt + 1; },
      };
    },

    /* ── Voice transcription ───────────────────────────────── */
    transcribe: function (blob) {
      return fetch('/api/transcribe', { method: 'POST', body: blob, credentials: 'include' })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok && (data && data.ok !== false), data: data || null };
          }).catch(function () {
            return { ok: false, data: null };
          });
        })
        .catch(function () {
          return { ok: false, data: null, offline: true };
        });
    },
  };

  /* ── Credit limit error formatting (from reference api.jsx) ────────── */
  HubAPI.fmtCountdown = function (iso) {
    if (!iso) return '';
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return '';
    var mins = Math.ceil(ms / 60000);
    if (mins < 60) return mins + 'm';
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + 'h ' + (mins % 60) + 'm';
    return Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h';
  };

  HubAPI.formatLimitError = function (edata) {
    if (!edata) return 'bad-response';
    if (edata.error === 'insufficient_credits') {
      return edata.message || "You're out of credits. Top up to keep the crew working.";
    }
    var lbl = edata.type === '5h' ? '5-hour' : edata.type === 'week' ? 'weekly' : 'monthly';
    var cd = HubAPI.fmtCountdown(edata.reset_at);
    return "You've hit your " + lbl + ' usage window.' +
      (cd ? ' It resets in ' + cd + '.' : ' It resets on a rolling window.') +
      ' Your chats and files are safe — just give it a breather.';
  };

  window.HubAPI = HubAPI;
})();
