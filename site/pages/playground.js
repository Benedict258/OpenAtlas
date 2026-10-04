// Playground (/playground): chat(), transcribe() and speak() against the live N-ATLaS backend through
// the site's API (site/src/playground.mjs), which calls the SDK with the shared demo key. Each response is
// shown as the SDK returned it, with the equivalent SDK code built from the current inputs.
(() => {
  const $ = (id) => document.getElementById(id);
  const RATE = 16000;
  const MAX_SECONDS = 30;

  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (HTTP ${res.status})`);
    return json;
  };
  const say = (id, text) => {
    $(id).hidden = !text;
    $(id).textContent = text ?? "";
  };
  const show = (id, value) => ($(id).textContent = JSON.stringify(value, null, 2));
  const q = (s) => JSON.stringify(s);

  // Tabs.
  const TABS = ["chat", "transcribe", "speak"];
  const setTab = (tab) => {
    for (const t of TABS) {
      $(`t-${t}`).setAttribute("aria-selected", String(t === tab));
      $(`p-${t}`).hidden = t !== tab;
    }
    try { history.replaceState(null, "", `#${tab}`); } catch {}
  };
  for (const t of TABS) $(`t-${t}`).onclick = () => setTab(t);
  if (TABS.includes(location.hash.slice(1))) setTab(location.hash.slice(1));

  // Backend state, so the page says it's offline before anyone presses a button.
  const BACKEND_TEXT = {
    offline: "The N-ATLaS backend isn't reachable right now, so requests will fail until it's back. Anyone can run their own: see Deploy your own in the docs.",
    loading: "The N-ATLaS backend is starting and still loading its models. Requests may wait or fail for a few minutes.",
  };
  const showBackend = (state) => {
    const el = document.querySelector("#pg [data-offline]");
    el.hidden = state === "online";
    el.querySelector("b").textContent = state === "loading" ? "Backend starting" : "Backend offline";
    el.querySelector("span").textContent = BACKEND_TEXT[state] ?? BACKEND_TEXT.offline;
  };
  const checkStatus = () => fetch("/api/status").then((r) => r.json()).then((s) => {
    document.querySelectorAll("#pg [data-mock]").forEach((el) => (el.hidden = !s.mock));
    showBackend(s.backend ?? "offline");
    $("s-off").hidden = s.playground_speech === true || s.backend !== "online";
    $("s-send").disabled = s.playground_speech !== true && s.backend === "online";
  }).catch(() => showBackend("offline"));
  checkStatus();
  setInterval(checkStatus, 60_000);

  const HEADER = 'import { OpenAtlas } from "@openatlas/sdk";\n\nconst client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });\n';

  // ---------- chat() ----------
  let thread = [];
  let chatBusy = false;
  const chatParams = () => ({
    system: $("c-system").value.trim(),
    language: $("c-lang").value,
    max_tokens: Number($("c-max").value) || 256,
    temperature: $("c-temp").value === "" ? 0.1 : Number($("c-temp").value),
  });
  const chatCode = () => {
    const p = chatParams();
    const pending = $("c-msg").value.trim();
    const msgs = [...(p.system ? [{ role: "system", content: p.system }] : []), ...thread, ...(pending ? [{ role: "user", content: pending }] : [])];
    const lines = msgs.length ? msgs.map((m) => `    { role: ${q(m.role)}, content: ${q(m.content)} },`).join("\n") : '    { role: "user", content: "…" },';
    $("c-code").textContent = `${HEADER}
const r = await client.chat({
  messages: [
${lines}
  ],${p.language ? `\n  language: ${q(p.language)},` : ""}
  max_tokens: ${p.max_tokens},
  temperature: ${p.temperature},
  user: "end-user-123", // a stable ID for your end user (licence-cap counting)
});
console.log(r.content, r.model, r.attribution);`;
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
    $("c-thread").append(el);
    $("c-thread").scrollTop = $("c-thread").scrollHeight;
    return el;
  };
  const newChat = () => {
    thread = [];
    $("c-thread").replaceChildren();
    bubble("sys", "Replies from N-ATLaS appear here.");
    $("c-json").textContent = "—";
    say("c-status", "");
    chatCode();
  };
  async function sendChat() {
    const text = $("c-msg").value.trim();
    if (!text || chatBusy) return;
    chatBusy = true;
    $("c-send").disabled = $("c-new").disabled = true;
    if (!thread.length) $("c-thread").replaceChildren();
    chatCode();
    thread.push({ role: "user", content: text });
    bubble("me", text);
    $("c-msg").value = "";
    const typing = bubble("bot", "…");
    say("c-status", "Waiting for N-ATLaS… (the first request after the backend starts can take a while)");
    try {
      const r = await post("/api/playground/chat", { messages: thread, ...chatParams() });
      typing.remove();
      thread.push({ role: "assistant", content: r.response.content });
      bubble("bot", r.response.content, `${r.response.model} · ${r.response.attribution} · ${(r.ms / 1000).toFixed(1)} s`);
      show("c-json", r.response);
      say("c-status", thread.length >= 10 ? "The playground keeps up to 10 messages: start a new conversation to continue." : "");
    } catch (e) {
      typing.remove();
      thread.pop();
      bubble("err", `Not sent: ${e.message}`);
      $("c-msg").value = text;
      say("c-status", "");
    } finally {
      chatBusy = false;
      $("c-send").disabled = $("c-new").disabled = false;
      chatCode();
    }
  }
  $("c-send").onclick = sendChat;
  $("c-new").onclick = () => !chatBusy && newChat();
  $("c-msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat();
    }
  });
  for (const id of ["c-system", "c-lang", "c-max", "c-temp", "c-msg"]) $(id).addEventListener("input", chatCode);
  chatCode();

  // ---------- transcribe() ----------
  const transcribeCode = () => {
    $("a-code").textContent = `import { readFileSync } from "node:fs";
${HEADER}
const r = await client.transcribe({
  audio: readFileSync("clip.wav"), // any format ffmpeg reads; 30 s or less is the reliable range
  language: ${q($("a-lang").value)},
  user: "end-user-123",
});
console.log(r.text, r.model);`;
  };
  $("a-lang").addEventListener("input", transcribeCode);
  transcribeCode();

  // Any audio the browser can play → 16 kHz mono samples → 16-bit WAV (base64), what the models use.
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

  let clip = null;
  let clipUrl = null;
  async function stage(blob, label) {
    clip = null;
    $("a-send").disabled = true;
    $("a-review").hidden = true;
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    clipUrl = null;
    say("a-status", "Preparing the clip…");
    let samples;
    try {
      samples = await decode(blob);
    } catch {
      return say("a-status", "This file couldn't be read as audio. Try a different recording (wav, mp3, m4a, ogg or webm).");
    }
    const seconds = samples.length / RATE;
    if (seconds < 0.5) return say("a-status", "That clip is too short.");
    if (seconds > MAX_SECONDS + 0.5) return say("a-status", `That clip is ${Math.round(seconds)} s long. The playground takes up to ${MAX_SECONDS} s; trim it, or use the SDK, which takes longer audio.`);
    clip = wavBase64(samples);
    clipUrl = URL.createObjectURL(blob);
    $("a-review-audio").src = clipUrl;
    $("a-review-label").textContent = `${label} · ${seconds.toFixed(1)} s. Check the language, then press Transcribe.`;
    $("a-review").hidden = false;
    $("a-send").disabled = false;
    say("a-status", "");
  }
  let recorder = null;
  $("a-rec").onclick = async () => {
    if (recorder && recorder.state === "recording") return recorder.stop();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return say("a-status", `Microphone unavailable: ${e.message}. Upload an audio file instead.`);
    }
    const chunks = [];
    const started = Date.now();
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    const tick = setInterval(() => {
      $("a-rec-label").textContent = `Stop (${Math.max(0, MAX_SECONDS - Math.floor((Date.now() - started) / 1000))} s left)`;
    }, 250);
    const limit = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_SECONDS * 1000);
    recorder.onstop = () => {
      clearInterval(tick);
      clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      $("a-rec-label").textContent = "Record";
      stage(new Blob(chunks, { type: recorder.mimeType }), "Recording");
    };
    recorder.start();
    $("a-rec-label").textContent = `Stop (${MAX_SECONDS} s left)`;
    say("a-status", `Recording… up to ${MAX_SECONDS} seconds.`);
  };
  $("a-upload").onclick = () => $("a-file").click();
  $("a-file").onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) stage(file, file.name);
  };
  $("a-send").onclick = async () => {
    if (!clip) return;
    $("a-send").disabled = $("a-rec").disabled = $("a-upload").disabled = true;
    $("a-text").textContent = "…";
    say("a-status", "Transcribing…");
    try {
      const r = await post("/api/playground/transcribe", { audio: clip, language: $("a-lang").value });
      $("a-text").textContent = r.response.text || "(no speech recognised)";
      show("a-json", r.response);
      say("a-status", `${r.response.model} · ${r.response.attribution} · ${(r.ms / 1000).toFixed(1)} s`);
    } catch (e) {
      $("a-text").textContent = "The N-ATLaS transcript appears here.";
      say("a-status", `Error: ${e.message}`);
    } finally {
      $("a-send").disabled = $("a-rec").disabled = $("a-upload").disabled = false;
    }
  };

  // ---------- speak() ----------
  const speakCode = () => {
    $("s-code").textContent = `import { writeFileSync } from "node:fs";
${HEADER}
const r = await client.speak({
  text: ${q($("s-text").value)},
  language: ${q($("s-lang").value)},${$("s-engine").value !== "auto" ? `\n  engine: ${q($("s-engine").value)},` : ""}
  user: "end-user-123",
});
writeFileSync("speech.wav", r.audio);
console.log(r.seconds, r.model, r.attribution);`;
  };
  for (const id of ["s-text", "s-lang", "s-engine"]) $(id).addEventListener("input", speakCode);
  speakCode();
  let audioUrl = null;
  $("s-send").onclick = async () => {
    const text = $("s-text").value.trim();
    if (!text) return say("s-status", "Type some text first.");
    $("s-send").disabled = true;
    say("s-status", "Rendering speech… (natural voices take a few seconds per sentence)");
    try {
      const r = await post("/api/playground/speak", { text, language: $("s-lang").value, engine: $("s-engine").value });
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      $("s-audio").src = audioUrl;
      $("s-audio").hidden = false;
      $("s-audio").play().catch(() => {});
      $("s-credit").textContent = `${r.response.attribution}.` + (r.response.fallback_reason ? ` Fell back to MMS-TTS: ${r.response.fallback_reason}` : "");
      show("s-json", { ...r.response, audio: `<${r.response.audio_bytes} bytes of WAV>` });
      say("s-status", `${r.response.seconds} s of audio (${r.response.engine}, ${r.response.model}) · ${(r.ms / 1000).toFixed(1)} s` + (r.response.warnings?.length ? ` · ${r.response.warnings.join(" ")}` : ""));
    } catch (e) {
      say("s-status", `Error: ${e.message}`);
    } finally {
      $("s-send").disabled = false;
    }
  };
})();
