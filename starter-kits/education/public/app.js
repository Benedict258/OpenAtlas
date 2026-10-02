// Education window: question → POST /api/education/explain (chat()); corrections → /api/education/report (reportIssue()).
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
    if (s.mock) document.querySelectorAll('[data-kit="education"] [data-mock]').forEach((el) => (el.hidden = false));
  }).catch(() => {});

  let last = null;
  const showReport = (on) => {
    $("e-report").hidden = !on;
    $("e-fix").hidden = $("e-send").hidden = true;
    $("e-status").textContent = "";
  };

  $("e-go").onclick = async () => {
    const btn = $("e-go");
    btn.disabled = true;
    btn.textContent = "Explaining…";
    showReport(false);
    $("e-out").textContent = "Waiting for N-ATLaS… (the first request can take a while if the model is still loading)";
    const request = { question: $("eq").value, language: $("el").value, level: $("ev").value };
    try {
      const r = await post("/api/education/explain", { ...request, user: uid });
      $("e-out").textContent = r.explanation;
      last = { question: request.question, language: request.language, explanation: r.explanation };
      showReport(true);
    } catch (e) {
      $("e-out").textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Explain";
    }
  };

  $("e-report").onclick = () => {
    $("e-report").hidden = true;
    $("e-fix").hidden = $("e-send").hidden = false;
    $("e-fix-text").focus();
  };

  $("e-send").onclick = async () => {
    const btn = $("e-send");
    btn.disabled = true;
    try {
      const r = await post("/api/education/report", { ...last, correction: $("e-fix-text").value, user: uid });
      $("e-status").textContent = `Thanks, correction recorded (${r.id.slice(0, 8)}).`;
      $("e-fix").hidden = btn.hidden = true;
      $("e-fix-text").value = "";
    } catch (e) {
      $("e-status").textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };
})();
