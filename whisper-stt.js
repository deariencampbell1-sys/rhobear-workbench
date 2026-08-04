/* =============================================================================
   RHOBEAR · whisper-stt.js — Whisper dictation that runs IN THE BROWSER.
   Doctrine [[whisper-is-the-stt-standard]]: never webkitSpeechRecognition
   (worse + secretly streams to Google + flaky in WebView). This runs Whisper
   locally via transformers.js — no server, no Germany round-trip, no
   concurrency limit, private, offline after the one-time model download.

   FIRST LOAD: the ~40MB quantized model downloads once (progress bar shown),
   then it's cached in the browser forever and dictation is instant.

   Drop-in: replaces the SpeechRecognition pattern. One global: window.WhisperSTT.
     WhisperSTT.dictate({ onText, onStatus })   // speak → text, you review+send
     WhisperSTT.talk   ({ onFinal, onStatus })  // hands-free: auto-stops on silence
     WhisperSTT.stop()
     WhisperSTT.warmup()                         // kick the download early (optional)
   Emits a small progress pill automatically; host can also read WhisperSTT.state.
   ============================================================================= */
(function () {
  if (window.WhisperSTT) return;

  var CFG = {
    lib: "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
    model: "Xenova/whisper-base.en",   // ~40MB quantized · swap to whisper-tiny.en for smaller
    silenceMs: 1100,                    // talk-mode: stop after this much quiet
  };
  var W = {
    state: "cold",     // cold → loading → ready → (recording/transcribing)
    pct: 0,
    _pipe: null, _loading: null, _files: {},
    _rec: null, _stream: null, _chunks: [], _mode: null, _cbs: null,
    _ac: null, _vadRAF: 0, _spoke: false, _quietSince: 0,
    _continuous: false, _stopped: false, _maxTimer: 0,
  };

  // ---- tiny built-in progress pill (host can hide via [data-whisper-pill]) ----
  function pill() {
    var el = document.getElementById("whisper-pill");
    if (el) return el;
    el = document.createElement("div"); el.id = "whisper-pill";
    el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;" +
      "background:#141230;color:#eae7ff;border:1px solid #2a2658;border-radius:999px;padding:8px 14px;" +
      "font:12px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 24px #0007;display:none;align-items:center;gap:9px";
    el.innerHTML = '<span class="wp-dot" style="width:9px;height:9px;border-radius:50%;background:#22d3ee;flex:0 0 auto"></span>' +
      '<span class="wp-txt">Whisper</span>' +
      '<span class="wp-bar" style="width:90px;height:5px;border-radius:3px;background:#2a2658;overflow:hidden">' +
        '<i class="wp-fill" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#7c3aed,#22d3ee)"></i></span>';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }
  function showPill(txt, pct, spin) {
    var p = pill(); p.style.display = "flex";
    p.querySelector(".wp-txt").textContent = txt;
    p.querySelector(".wp-fill").style.width = (pct || 0) + "%";
    p.querySelector(".wp-dot").style.animation = spin ? "wpblink 1s infinite" : "";
    if (!document.getElementById("wp-kf")) {
      var s = document.createElement("style"); s.id = "wp-kf";
      s.textContent = "@keyframes wpblink{50%{opacity:.35}}"; document.head.appendChild(s);
    }
  }
  function hidePill(delay) { setTimeout(function () { var p = document.getElementById("whisper-pill"); if (p) p.style.display = "none"; }, delay || 0); }

  function emitProgress(status) {
    if (W._cbs && W._cbs.onStatus) try { W._cbs.onStatus(status, W.pct); } catch (e) {}
    window.dispatchEvent(new CustomEvent("whisper:progress", { detail: { state: W.state, pct: W.pct, status: status } }));
  }

  // ---- model load (once) with download progress ----
  async function ensureReady() {
    if (W.state === "ready") return W._pipe;
    if (W._loading) return W._loading;
    W.state = "loading"; showPill("Downloading Whisper…", 0, true); emitProgress("loading");
    W._loading = (async function () {
      var mod = await import(CFG.lib);
      var pipeline = mod.pipeline;
      if (mod.env) { mod.env.allowLocalModels = false; }   // pull the model from the CDN, cache in-browser
      W._pipe = await pipeline("automatic-speech-recognition", CFG.model, {
        quantized: true,
        progress_callback: function (p) {
          if (p && (p.status === "progress" || p.status === "download" || p.status === "initiate")) {
            if (p.file && typeof p.progress === "number") W._files[p.file] = p.progress;
            var vals = Object.keys(W._files).map(function (k) { return W._files[k]; });
            W.pct = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;
            showPill("Downloading Whisper… " + W.pct + "%", W.pct, true); emitProgress("downloading");
          }
        },
      });
      W.state = "ready"; W.pct = 100; showPill("Whisper ready", 100, false); hidePill(1400); emitProgress("ready");
      return W._pipe;
    })();
    return W._loading;
  }
  function warmup() { ensureReady().catch(function (e) { showPill("Whisper failed to load", 0, false); hidePill(3000); console.error("[whisper] load", e); }); }

  // ---- audio → 16kHz mono Float32 (what Whisper wants) ----
  async function blobToFloat32(blob) {
    var buf = await blob.arrayBuffer();
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = new AC();
    var decoded = await ac.decodeAudioData(buf);
    ac.close();
    var off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    var src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start(0);
    var rendered = await off.startRendering();
    return rendered.getChannelData(0);
  }

  async function transcribe(blob) {
    var pipe = await ensureReady();
    W.state = "transcribing"; showPill("Transcribing…", 100, true); emitProgress("transcribing");
    var audio = await blobToFloat32(blob);
    var out = await pipe(audio, { chunk_length_s: 30, stride_length_s: 5 });
    W.state = "ready"; hidePill(300);
    return (out && out.text || "").trim();
  }

  // ---- recording ----
  async function startRec(onStop) {
    if (W._rec && W._rec.state === "recording") return;
    W._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    W._chunks = []; W._rec = new MediaRecorder(W._stream);
    W._rec.ondataavailable = function (e) { if (e.data.size) W._chunks.push(e.data); };
    W._rec.onstop = function () {
      var blob = new Blob(W._chunks, { type: W._rec.mimeType || "audio/webm" });
      stopVAD(); if (W._stream) W._stream.getTracks().forEach(function (t) { t.stop(); });
      onStop(blob);
    };
    W._rec.start();
  }
  function stopRec() { try { if (W._rec && W._rec.state === "recording") W._rec.stop(); } catch (e) {} }

  // ---- silence VAD — adaptive so it works across mics/levels ----
  // Old bug: a fixed 0.045 threshold. On a quieter mic, speech never crossed it,
  // so "spoke" never triggered and it never auto-stopped → never transcribed →
  // nothing landed in the box. Now: learn the room's noise floor for ~300ms,
  // call it "speech" when RMS jumps well above that floor, then stop after a
  // pause. Safety: if nothing crosses in 6s, stop and transcribe anyway.
  function startVAD() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      W._ac = new AC(); var src = W._ac.createMediaStreamSource(W._stream);
      var an = W._ac.createAnalyser(); an.fftSize = 512; src.connect(an);
      var data = new Uint8Array(an.frequencyBinCount);
      W._spoke = false; W._quietSince = 0;
      var t0 = performance.now(), floor = 0.5, run = 0;
      var MIN_MS = 1500;   // never stop in the first 1.5s (kills premature cutoff)
      var tick = function () {
        an.getByteTimeDomainData(data);
        var sum = 0; for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
        var rms = Math.sqrt(sum / data.length);
        // expose the live level so hosts can drive a real waveform off the mic
        if (W._cbs && W._cbs.onLevel) { try { W._cbs.onLevel(rms); } catch (e) {} }
        var now = performance.now(), elapsed = now - t0;
        if (elapsed < 300) { floor = Math.min(floor, rms); W._vadRAF = requestAnimationFrame(tick); return; }  // calibrate
        var speakThresh = Math.max(0.02, floor + 0.02, floor * 3);
        // require SUSTAINED speech (~5 frames) so a click/breath can't count
        if (rms > speakThresh) { run++; if (run >= 5) { W._spoke = true; W._quietSince = 0; } }
        else {
          run = 0;
          if (W._spoke && elapsed > MIN_MS) {
            if (!W._quietSince) W._quietSince = now;
            else if (now - W._quietSince > CFG.silenceMs) { stopRec(); return; }
          }
        }
        // safety: if speech was never clearly detected, still stop by 7s
        if (!W._spoke && elapsed > 7000) { stopRec(); return; }
        W._vadRAF = requestAnimationFrame(tick);
      };
      W._vadRAF = requestAnimationFrame(tick);
    } catch (e) {}
  }
  function stopVAD() { if (W._vadRAF) cancelAnimationFrame(W._vadRAF); W._vadRAF = 0; if (W._ac) { try { W._ac.close(); } catch (e) {} W._ac = null; } }

  // ---- DICTATE — the dead-simple, proven path -----------------------------
  // This is DELIBERATELY its own tiny state machine, NOT the shared run()/VAD
  // engine. Four browser-tested rewrites of the clever version failed; this is
  // byte-for-byte the flow that works on the test page: getUserMedia →
  // MediaRecorder → tap-again stops → decode → transcribe → onText. No VAD, no
  // adaptive thresholds, no async closures that can drop the callback. Tap
  // once = record; tap again = stop + transcribe. That's it.
  var D = { rec: null, stream: null, chunks: null, cbs: null, safety: 0 };
  function dictate(cbs) {
    // tap again while recording → stop now. Do NOT overwrite D.cbs here — the
    // in-flight transcribe must fire the callbacks from the tap that STARTED it,
    // not whatever (possibly empty) callbacks this stop-tap carried.
    if (D.rec && D.rec.state === "recording") { try { D.rec.stop(); } catch (e) {} return; }
    D.cbs = cbs || {};
    warmup();  // start the one-time model load in parallel with recording
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      D.stream = stream; D.chunks = [];
      var rec = new MediaRecorder(stream); D.rec = rec;
      rec.ondataavailable = function (e) { if (e.data && e.data.size) D.chunks.push(e.data); };
      rec.onstop = function () {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        if (D.safety) { clearTimeout(D.safety); D.safety = 0; }
        var blob = new Blob(D.chunks, { type: rec.mimeType || "audio/webm" });
        D.rec = null;
        W._cbs = D.cbs;  // so transcribe's "transcribing" status reaches the host
        transcribe(blob).then(function (text) {
          if (D.cbs.onText) try { D.cbs.onText(text || ""); } catch (e) {}
        }).catch(function (e) {
          console.error("[whisper] transcribe", e);
          if (D.cbs.onStatus) D.cbs.onStatus("error:" + (e && e.message || e));
          showPill("Whisper error", 0, false); hidePill(2500);
        });
      };
      rec.start();
      if (D.cbs.onStatus) D.cbs.onStatus("listening");
      if (D.safety) clearTimeout(D.safety);
      D.safety = setTimeout(function () { try { if (rec.state === "recording") rec.stop(); } catch (e) {} }, 60000);
    }).catch(function (e) {
      if (D.cbs.onStatus) D.cbs.onStatus("mic:" + (e && e.message || e));
      showPill("Mic blocked", 0, false); hidePill(2500);
    });
  }

  // ---- TALK — hands-free voice (VAD auto-stop) ----------------------------
  // talk()           : one-shot — listen, auto-stop on silence, transcribe once.
  // talkContinuous() : keep re-arming after each silence-stop so you can dictate
  //                    sentence after sentence hands-free until you tap off.
  //                    (owner: dictation must auto-detect the silence like it used
  //                     to, NOT the click-to-start/click-to-stop chatbot toggle.)
  function talk(cbs) { W._continuous = false; W._stopped = false; startTalkSegment(cbs); }
  function talkContinuous(cbs) {
    // second tap while a continuous session is live = stop it
    if (W._continuous && W._rec && W._rec.state === "recording") { stopTalk(); return; }
    W._continuous = true; W._stopped = false; startTalkSegment(cbs);
  }
  function startTalkSegment(cbs) {
    W._cbs = cbs || {};
    if (!W._continuous && W._rec && W._rec.state === "recording") { stopRec(); return; }  // one-shot: tap again = stop
    warmup();
    if (cbs && cbs.onStatus) cbs.onStatus("listening");
    startRec(async function (blob) {
      // one segment ended (silence, tap, or per-segment safety) → transcribe it
      try {
        var text = await transcribe(blob);
        if (cbs && cbs.onFinal) cbs.onFinal(text);
      } catch (e) {
        console.error("[whisper] transcribe", e);
        if (cbs && cbs.onStatus) cbs.onStatus("error:" + (e && e.message || e));
        showPill("Whisper error", 0, false); hidePill(2500);
      }
      // continuous: re-arm the next segment unless the user tapped off
      if (W._continuous && !W._stopped) {
        setTimeout(function () { if (W._continuous && !W._stopped) startTalkSegment(cbs); }, 80);
      }
    }).then(function () {
      startVAD();
      if (W._maxTimer) clearTimeout(W._maxTimer);
      W._maxTimer = setTimeout(function () { stopRec(); }, 20000);  // per-segment safety only
    }).catch(function (e) {
      if (cbs && cbs.onStatus) cbs.onStatus("mic:" + (e && e.message || e));
    });
  }
  function stopTalk() {
    W._stopped = true; W._continuous = false;
    if (W._maxTimer) { clearTimeout(W._maxTimer); W._maxTimer = 0; }
    stopRec();
    if (W._cbs && W._cbs.onStatus) { try { W._cbs.onStatus("stopped"); } catch (e) {} }
  }

  function stopAll() {
    W._stopped = true; W._continuous = false;
    if (W._maxTimer) { clearTimeout(W._maxTimer); W._maxTimer = 0; }
    if (D.rec && D.rec.state === "recording") { try { D.rec.stop(); } catch (e) {} }
    stopRec();
  }

  window.WhisperSTT = {
    get state() { return W.state; }, get pct() { return W.pct; },
    get listening() { return !!(W._rec && W._rec.state === "recording") || !!W._continuous; },
    dictate: dictate, talk: talk, talkContinuous: talkContinuous, stop: stopAll, stopTalk: stopTalk, warmup: warmup,
    transcribeBlob: function (blob) { return transcribe(blob); },  // proven engine, for any host that records itself
    available: function () { return !!(navigator.mediaDevices && window.MediaRecorder); },
    config: CFG,
  };
})();
