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

      var ctl = new AbortController();
      var to = setTimeout(function () { ctl.abort(); }, 45000);

      fetch('/api/sessions/' + encodeURIComponent(sid) + '/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: payload.message,
          system_message: payload.system_message,
          model: payload.model,
        }),
        credentials: 'include',
        signal: ctl.signal,
      }).then(function (res) {
        clearTimeout(to);
        if (!res.ok) {
          return res.json().then(function (edata) {
            if (edata && (edata.error === 'rate_limit_exceeded' || edata.error === 'insufficient_credits')) {
              /* "Top up to keep the crew working" used to be the end of it —
                 the message named an upsell at /billing that no screen owned,
                 so a spent-out customer was told to pay and given nowhere to
                 do it. Open the plan panel, where the credit pack now lives. */
              if (edata.error === 'insufficient_credits' && window.HubBilling) {
                try { window.HubBilling.openPlan(); } catch (e) { /* non-fatal */ }
              }
              if (callbacks.onError) callbacks.onError(HubAPI.formatLimitError(edata), edata);
              return;
            }
            if (callbacks.onError) callbacks.onError(
              (edata && edata.message) || (edata && edata.error) || 'bad-response',
              { status: res.status, error: edata && edata.error, message: edata && edata.message }
            );
          }).catch(function () {
            if (callbacks.onError) callbacks.onError('bad-response');
          });
        }

        var fullText = '';
        var PASS_EVENTS = {
          'tool.started': 1, 'tool.completed': 1, 'tool.failed': 1,
          'tool.progress': 1, 'run.completed': 1,
        };

        return readSSE(res, function (event, data) {
          if (event === 'assistant.delta' && data.delta) {
            fullText += data.delta;
            if (callbacks.onText) callbacks.onText(data.delta);
          }
          if (PASS_EVENTS[event] && callbacks.onEvent) {
            try { callbacks.onEvent(event, data || {}); } catch (e) { /* never kill the stream */ }
          }
          if (event === 'done' && callbacks.onDone) {
            callbacks.onDone({ ok: true, text: fullText });
          }
          if (event === 'error') {
            if (callbacks.onError) callbacks.onError(
              (data && data.message) || 'agent error',
              { kind: 'agent', message: data && data.message }
            );
          }
        });
      }).catch(function (e) {
        clearTimeout(to);
        if (callbacks.onError) callbacks.onError(
          (e && e.name === 'AbortError') ? 'timeout' : 'offline',
          { kind: (e && e.name === 'AbortError') ? 'timeout' : 'network', message: e && e.message }
        );
      });
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
