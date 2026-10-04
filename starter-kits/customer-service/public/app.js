// Customer Service window: voice note → POST /api/support/ticket (transcribe() → normalizeText() → chat());
// transcript corrections → /api/support/report (reportIssue() with the audio); text chat → /api/support/chat
// (a multi-turn chat(); the conversation lives only in this page and is sent with each message).
// A recorded or chosen note is staged for review (play it back, change the language) and only sent
// when the user presses "Send voice note".
// Speech recognition is reliable on up to 30 s at a time (docs/REPORT.md, KI-11), so recording stops
// at 30 s, and every note is converted here to 16 kHz mono WAV (what the models use) and, if longer
// than 30 s, cut into plain pieces of up to 25 s, which the user is told about before sending.
(() => {
  const MAX_RECORD_SECONDS = 30;
  const MAX_UPLOAD_SECONDS = 120;
  const PIECE_SECONDS = 25;
  const RATE = 16000;
  const $ = (id) => document.getElementById(id);
  // Stable, anonymous per-browser ID, sent as `user` so the license cap counts real end users.
  let uid;
  try { uid = localStorage.oaUser || (localStorage.oaUser = crypto.randomUUID()); } catch { uid = crypto.randomUUID(); }
  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (HTTP ${res.status})`);
    return json;
  };
  // speechLive: "Play response audio" is offered only when the server reports speak() switched on and ready.
  let speechLive = false;
  // Backend state up front, so the window says so before anyone presses a button, not only after a
  // request fails.
  const BACKEND_TEXT = {
    offline: "The N-ATLaS backend isn't reachable right now, so requests will fail until it's back. Anyone can run their own: see Deploy your own in the docs.",
    loading: "The N-ATLaS backend is starting and still loading its models. Requests may wait or fail for a few minutes.",
  };
  const showBackend = (state) => {
    const el = document.querySelector('[data-kit="support"] [data-offline]');
    if (!el) return;
    el.hidden = state === "online";
    el.querySelector("b").textContent = state === "loading" ? "Backend starting" : "Backend offline";
    el.querySelector("span").textContent = BACKEND_TEXT[state] ?? BACKEND_TEXT.offline;
  };
  const checkStatus = () => fetch("/api/status").then((r) => r.json()).then((s) => {
    if (s.mock) document.querySelectorAll('[data-kit="support"] [data-mock]').forEach((el) => (el.hidden = false));
    speechLive = s.speech === true;
    showBackend(s.backend ?? "offline");
  }).catch(() => showBackend("offline"));
  checkStatus();
  setInterval(checkStatus, 60_000);

  const status = (text) => {
    $("s-status").hidden = !text;
    $("s-status").textContent = text ?? "";
  };
  let speechUrl = null;
  const resetReport = () => {
    $("s-report").hidden = $("s-fix").hidden = $("s-send").hidden = true;
    $("s-fix-status").textContent = "";
    $("s-speak").hidden = $("s-speech").hidden = true;
    if (speechUrl) URL.revokeObjectURL(speechUrl);
    speechUrl = null;
  };

  // Optional: N-ATLaS's drafted reply read aloud by speak() (a separate text-to-speech renderer).
  $("s-speak").onclick = async () => {
    const draft = $("s-draft").textContent;
    $("s-speak").disabled = true;
    status("Rendering the reply as speech… (natural voices can take a minute or more per sentence)");
    try {
      const r = await post("/api/support/speak", { draft, language: last.language, user: uid });
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      if (speechUrl) URL.revokeObjectURL(speechUrl);
      speechUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      $("s-speech-audio").src = speechUrl;
      $("s-speech-credit").textContent = `${r.attribution}.` + (r.fallback_reason ? " (Fell back to MMS-TTS.)" : "");
      $("s-speech").hidden = false;
      $("s-speech-audio").play().catch(() => {});
      status(`Spoken reply: ${r.seconds} s of audio (${r.model}).` + (r.warnings?.length ? ` ${r.warnings.join(" ")}` : ""));
    } catch (e) {
      status(`Error: ${e.message}`);
    } finally {
      $("s-speak").disabled = false;
    }
  };

  // Any audio the browser can play → 16 kHz mono samples.
  async function decode(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let audio;
    try {
      audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      ctx.close?.();
    }
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * RATE)), RATE);
    const src = offline.createBufferSource();
    src.buffer = audio;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  }
  // Plain, non-overlapping pieces; a leftover under 2 s joins the last piece.
  function split(samples) {
    const step = PIECE_SECONDS * RATE;
    const pieces = [];
    for (let i = 0; i < samples.length; i += step) pieces.push(samples.subarray(i, i + step));
    if (pieces.length > 1 && pieces[pieces.length - 1].length < 2 * RATE) {
      const tail = pieces.pop();
      const head = pieces.pop();
      const joined = new Float32Array(head.length + tail.length);
      joined.set(head);
      joined.set(tail, head.length);
      pieces.push(joined);
    }
    return pieces;
  }
  // 16-bit PCM WAV, base64.
  function wavBase64(samples) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  let last = null;
  let busy = false;

  // Review step: nothing is sent until the user confirms.
  let pending = null;
  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    pending = null;
    $("s-review-audio").removeAttribute("src");
    $("s-review").hidden = $("s-review-actions").hidden = true;
  };
  async function stage(blob, label) {
    clearPending();
    status("Preparing the voice note…");
    let samples;
    try {
      samples = await decode(blob);
    } catch {
      return status("This file couldn't be read as audio. Try a different recording (wav, mp3, m4a, ogg or webm).");
    }
    const seconds = samples.length / RATE;
    if (seconds < 0.5) return status("That recording is too short. Record or upload a longer voice note.");
    if (seconds > MAX_UPLOAD_SECONDS) {
      return status(`That recording is ${Math.round(seconds)} s long. This demo takes voice notes of up to ${MAX_UPLOAD_SECONDS / 60} minutes.`);
    }
    // Up to 30 s goes as one clip; only longer notes are cut into pieces.
    const pieces = (seconds > MAX_RECORD_SECONDS ? split(samples) : [samples]).map(wavBase64);
    pending = { pieces, label, url: URL.createObjectURL(blob) };
    $("s-review-audio").src = pending.url;
    $("s-review-label").textContent =
      `${label} · ${seconds.toFixed(1)} s. ` +
      (pieces.length > 1
        ? `Longer than 30 s, so it will be sent as ${pieces.length} parts of up to ${PIECE_SECONDS} s: speech recognition is only reliable on 30 s at a time. Words at the joins can be missed. `
        : "") +
      "Play it back, check the language, then send.";
    $("s-review").hidden = $("s-review-actions").hidden = false;
    status("");
  }
  $("s-discard").onclick = () => {
    clearPending();
    status("Voice note discarded.");
  };
  $("s-send-note").onclick = () => {
    if (!pending) return;
    const { pieces, label } = pending;
    clearPending();
    submit(pieces, label);
  };

  async function submit(pieces, label) {
    if (busy) return;
    busy = true;
    $("s-rec").disabled = $("s-upload").disabled = true;
    resetReport();
    const language = $("sl").value;
    status(`${label}: transcribing and drafting… (the first request can take a while if the model is still loading)`);
    $("s-transcript").textContent = "…";
    $("s-draft").textContent = "…";
    try {
      const r = await post("/api/support/ticket", { pieces, language, user: uid });
      $("s-transcript").textContent = r.transcript;
      $("s-draft").textContent = r.draft;
      status(`Done: ${r.asrModel}${r.pieces > 1 ? ` (${r.pieces} parts)` : ""} → ${r.llmModel}. ${r.attribution ?? "Powered by Awarri"}.`);
      // A correction carries the audio only for a single-part note.
      last = { audio: pieces.length === 1 ? pieces[0] : undefined, transcript: r.transcript, language };
      $("s-fix-text").value = r.transcript;
      $("s-report").hidden = false;
      $("s-speak").hidden = !speechLive || !/draft reply\**\s*:/i.test(r.draft);
    } catch (e) {
      $("s-transcript").textContent = "The N-ATLaS ASR transcript appears here.";
      $("s-draft").textContent = "The N-ATLaS LLM draft appears here.";
      status(`Error: ${e.message}`);
    } finally {
      busy = false;
      $("s-rec").disabled = $("s-upload").disabled = false;
    }
  }

  let recorder = null;
  $("s-rec").onclick = async () => {
    if (recorder && recorder.state === "recording") return recorder.stop();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return status(`Microphone unavailable: ${e.message}. Upload an audio file instead.`);
    }
    const chunks = [];
    const started = Date.now();
    let capped = false;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    const tick = setInterval(() => {
      const left = MAX_RECORD_SECONDS - Math.floor((Date.now() - started) / 1000);
      $("s-rec-label").textContent = `Stop recording (${Math.max(0, left)} s left)`;
    }, 250);
    const limit = setTimeout(() => {
      capped = true;
      if (recorder.state === "recording") recorder.stop();
    }, MAX_RECORD_SECONDS * 1000);
    recorder.onstop = async () => {
      clearInterval(tick);
      clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      $("s-rec-label").textContent = "Record voice note";
      await stage(new Blob(chunks, { type: recorder.mimeType }), "Voice note");
      if (capped && pending) $("s-review-label").textContent = `Stopped at the ${MAX_RECORD_SECONDS}-second limit. ` + $("s-review-label").textContent;
    };
    clearPending();
    recorder.start();
    $("s-rec-label").textContent = `Stop recording (${MAX_RECORD_SECONDS} s left)`;
    status(`Recording… up to ${MAX_RECORD_SECONDS} seconds; press Stop recording when you're done.`);
  };

  $("s-upload").onclick = () => $("s-file").click();
  $("s-file").onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) stage(file, file.name);
  };

  $("s-report").onclick = () => {
    $("s-report").hidden = true;
    $("s-fix").hidden = $("s-send").hidden = false;
    $("s-fix-text").focus();
  };
  $("s-send").onclick = async () => {
    const btn = $("s-send");
    btn.disabled = true;
    try {
      const r = await post("/api/support/report", { ...last, correction: $("s-fix-text").value, user: uid });
      $("s-fix-status").textContent = `Thanks, recorded (${r.id.slice(0, 8)})${r.audio_included ? " with audio" : ", text only (clip too long to attach)"}.`;
      $("s-fix").hidden = btn.hidden = true;
    } catch (e) {
      $("s-fix-status").textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };

  // Voice note / text chat switch. Both share the language picker.
  const setMode = (mode) => {
    for (const [m, pane] of [["voice", "s-voice"], ["chat", "s-chat"]]) {
      $(`s-mode-${m}`).setAttribute("aria-selected", String(m === mode));
      $(pane).hidden = m !== mode;
    }
  };
  $("s-mode-voice").onclick = () => setMode("voice");
  $("s-mode-chat").onclick = () => setMode("chat");

  // Text chat.
  const GREETING = "Hello! How can we help you today?";
  let thread = [];
  let chatBusy = false;
  const chatStatus = (text) => {
    $("s-chat-status").hidden = !text;
    $("s-chat-status").textContent = text ?? "";
  };
  const bubble = (cls, text, note) => {
    const el = document.createElement("div");
    el.className = `msg ${cls}`;
    el.textContent = text;
    if (note) {
      const small = document.createElement("small");
      small.textContent = note;
      el.append(small);
    }
    $("s-thread").append(el);
    $("s-thread").scrollTop = $("s-thread").scrollHeight;
    return el;
  };
  const newConversation = () => {
    thread = [];
    $("s-thread").replaceChildren();
    bubble("bot", GREETING);
    chatStatus("");
  };
  $("s-chat-new").onclick = () => !chatBusy && newConversation();
  // Changing the language mid-conversation starts a new one, so the history stays in one language.
  $("sl").addEventListener("change", () => thread.length && !chatBusy && newConversation());
  async function sendChat() {
    const text = $("s-msg").value.trim();
    if (!text || chatBusy) return;
    chatBusy = true;
    $("s-chat-send").disabled = $("s-chat-new").disabled = true;
    thread.push({ role: "user", content: text });
    bubble("me", text);
    $("s-msg").value = "";
    const typing = bubble("bot", "…");
    chatStatus("N-ATLaS is writing a reply…");
    try {
      const r = await post("/api/support/chat", { messages: thread, language: $("sl").value, user: uid });
      typing.remove();
      thread.push({ role: "assistant", content: r.reply });
      bubble("bot", r.reply, `${r.model} · ${r.attribution}`);
      chatStatus(r.truncated ? "Long conversation: only the most recent messages are sent to the model." : "");
    } catch (e) {
      typing.remove();
      thread.pop();
      bubble("err", `Not sent: ${e.message}`);
      $("s-msg").value = text;
      chatStatus("");
    } finally {
      chatBusy = false;
      $("s-chat-send").disabled = $("s-chat-new").disabled = false;
    }
  }
  $("s-chat-send").onclick = sendChat;
  $("s-msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat();
    }
  });
})();
