// Citizen Services window: question → POST /api/citizen/ask (normalizeText() + chat()).
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
    if (s.mock) document.querySelectorAll('[data-kit="citizen"] [data-mock]').forEach((el) => (el.hidden = false));
  }).catch(() => {});

  const btn = $("c-ask");
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Asking…";
    $("c-out").textContent = "Waiting for N-ATLaS… (the first request can take a while if the model is still loading)";
    try {
      const r = await post("/api/citizen/ask", { question: $("cq").value, language: $("cl").value, user: uid });
      $("c-out").textContent = r.answer;
      $("c-norm").hidden = !r.normalized;
      $("c-norm-text").textContent = r.normalized ?? "";
    } catch (e) {
      $("c-out").textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Ask";
    }
  };
})();
