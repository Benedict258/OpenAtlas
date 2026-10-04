// Tester session form (/tester) → POST /api/tester-session → gateway POST /v1/tester-sessions.
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("ts");
  const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
  const rating = (id) => ($(id).value ? Number($(id).value) : null);
  const show = (title, text) => {
    $("ts-out").hidden = false;
    $("ts-out-title").textContent = title;
    $("ts-out-text").textContent = text;
  };
  // A reference sent in the link (/tester?ref=T01) is filled in.
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) $("ts-ref").value = ref.slice(0, 20);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const missing = [
      !$("ts-ref").value.trim() && "your tester reference",
      !checked("tested").length && "what you tested",
      !checked("languages").length && "the languages you used",
      !checked("outcome").length && "whether it worked",
      !checked("quote").length && "whether we may quote you",
      !$("ts-consent").checked && "your consent to store the answers",
    ].filter(Boolean);
    if (missing.length) return show("Not sent yet", `Please fill in ${missing.join(", ")}.`);
    const minutes = $("ts-minutes").value.trim();
    const btn = $("ts-send");
    btn.disabled = true;
    try {
      const res = await fetch("/api/tester-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester_ref: $("ts-ref").value,
          tester_type: $("ts-type").value,
          tested: checked("tested"),
          languages: checked("languages"),
          outcome: checked("outcome")[0],
          minutes_to_first_call: minutes === "" ? null : Number(minutes),
          rating_setup: rating("ts-r-setup"),
          rating_quality: rating("ts-r-quality"),
          rating_docs: rating("ts-r-docs"),
          issues: $("ts-issues").value.trim(),
          issue_severity: $("ts-sev").value,
          issue_report_id: $("ts-issue-id").value.trim(),
          feedback: $("ts-feedback").value.trim(),
          api_key_label: $("ts-key").value.trim(),
          consent_quote: checked("quote")[0],
          consent_store: $("ts-consent").checked,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
      show("Session recorded", `Thank you. Saved under ${body.tester_ref} (reference ${body.id.slice(0, 8)}). Tested again later? Reload the page and log another session.`);
      form.querySelectorAll("input,textarea,select,button").forEach((el) => (el.disabled = true));
    } catch (err) {
      show("Not sent", err.message);
      btn.disabled = false;
    }
  });
})();
