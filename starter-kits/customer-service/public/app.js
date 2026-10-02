// Customer Service window: voice note → POST /api/support/ticket (transcribe() → normalizeText() → chat());
// transcript corrections → /api/support/report (reportIssue() with the audio).
// A note is sent as soon as recording stops or a file is chosen, in the selected language.
(() => {
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
  fetch("/api/status").then((r) => r.json()).then((s) => {
    if (s.mock) document.querySelectorAll('[data-kit="support"] [data-mock]').forEach((el) => (el.hidden = false));
  }).catch(() => {});

  const status = (text) => {
    $("s-status").hidden = !text;
    $("s-status").textContent = text ?? "";
  };
  const resetReport = () => {
    $("s-report").hidden = $("s-fix").hidden = $("s-send").hidden = true;
    $("s-fix-status").textContent = "";
  };
  const toDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });

  let last = null;
  let busy = false;
  async function submit(blob, label) {
    if (busy) return;
    busy = true;
    $("s-rec").disabled = $("s-upload").disabled = true;
    resetReport();
    const language = $("sl").value;
    status(`${label}: transcribing and drafting… (the first request can take a while if the model is still loading)`);
    $("s-transcript").textContent = "…";
    $("s-draft").textContent = "…";
    try {
      const audio = await toDataURL(blob);
      const r = await post("/api/support/ticket", { audio, language, user: uid });
      $("s-transcript").textContent = r.transcript;
      $("s-draft").textContent = r.draft;
      status(`Done: ${r.asrModel} → ${r.llmModel}`);
      last = { audio, transcript: r.transcript, language };
      $("s-fix-text").value = r.transcript;
      $("s-report").hidden = false;
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
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      $("s-rec-label").textContent = "Record voice note";
      submit(new Blob(chunks, { type: recorder.mimeType }), "Voice note");
    };
    recorder.start();
    $("s-rec-label").textContent = "Stop recording";
    status("Recording… press Stop recording when you're done.");
  };

  $("s-upload").onclick = () => $("s-file").click();
  $("s-file").onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) submit(file, file.name);
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
})();
