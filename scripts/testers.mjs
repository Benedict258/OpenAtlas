// Tester feedback: the sessions logged through the website's /tester form (operator only;
// needs OPENATLAS_ADMIN_TOKEN). Testers are known only by the reference you give them (T01, T02, …);
// keep the reference → person mapping yourself, outside this system.
//
//   node --env-file=.env scripts/testers.mjs                  every session, newest last
//   node --env-file=.env scripts/testers.mjs summary          totals as Markdown (evidence for the submission)
//   node --env-file=.env scripts/testers.mjs csv > out.csv    all sessions as CSV
//   node --env-file=.env scripts/testers.mjs delete <ref>     a tester withdraws: delete all their sessions
//
// Send testers to <site>/tester?ref=T01 so their reference is filled in.

const gateway = process.env.OPENATLAS_BASE_URL;
const headers = { Authorization: `Bearer ${process.env.OPENATLAS_ADMIN_TOKEN}`, "Content-Type": "application/json" };
const [action, ...rest] = process.argv.slice(2);

async function call(path, body) {
  const res = await fetch(gateway + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const out = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${out.error?.code}: ${out.error?.message}`);
  return out;
}

async function allSessions() {
  const sessions = [];
  let since = 0;
  for (;;) {
    const page = await call(`/v1/admin/tester-sessions?since=${since}`);
    sessions.push(...page.sessions);
    if (page.sessions.length < 500) return sessions;
    since = page.next_since;
  }
}

const iso = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16);
const COLUMNS = [
  "id", "created_at", "tester_ref", "tester_type", "consent_quote", "tested", "languages", "outcome", "minutes_to_first_call",
  "rating_setup", "rating_quality", "rating_docs", "issues", "issue_severity", "issue_report_id", "feedback", "api_key_label",
];
const cell = (v) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join(" ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const mean = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
const count = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "—";

if (!action) {
  for (const s of await allSessions()) {
    console.log(`\n${s.tester_ref} · ${s.tester_type} · ${iso(s.created_at)} · ${s.outcome.toUpperCase()} · quote: ${s.consent_quote}`);
    console.log(`  tested: ${s.tested.join(", ")} · languages: ${s.languages.join(", ")}${s.minutes_to_first_call != null ? ` · first call in ${s.minutes_to_first_call} min` : ""}`);
    console.log(`  ratings (1-5): setup ${s.rating_setup ?? "—"}, quality ${s.rating_quality ?? "—"}, docs ${s.rating_docs ?? "—"}${s.api_key_label ? ` · key "${s.api_key_label}"` : ""}`);
    if (s.issues) console.log(`  issues [${s.issue_severity ?? "—"}]${s.issue_report_id ? ` (reportIssue ${s.issue_report_id})` : ""}: ${s.issues}`);
    if (s.feedback) console.log(`  feedback: ${s.feedback}`);
  }
} else if (action === "csv") {
  const sessions = await allSessions();
  console.log(COLUMNS.join(","));
  for (const s of sessions) console.log(COLUMNS.map((c) => cell(c === "created_at" ? iso(s[c]) : s[c])).join(","));
} else if (action === "summary") {
  const sessions = await allSessions();
  const testers = new Set(sessions.map((s) => s.tester_ref));
  const nums = (f) => sessions.map((s) => s[f]).filter((v) => v != null);
  console.log(`## Tester sessions (${new Date().toISOString().slice(0, 10)})\n`);
  console.log(`- **Sessions:** ${sessions.length}, from **${testers.size}** testers (${count(sessions.map((s) => s.tester_type))})`);
  console.log(`- **Outcome:** ${count(sessions.map((s) => s.outcome))}`);
  console.log(`- **Tested:** ${count(sessions.flatMap((s) => s.tested))}`);
  console.log(`- **Languages:** ${count(sessions.flatMap((s) => s.languages))}`);
  console.log(`- **Minutes to first successful call:** median ${(() => { const m = nums("minutes_to_first_call").sort((a, b) => a - b); return m.length ? m[Math.floor(m.length / 2)] : "—"; })()} (${nums("minutes_to_first_call").length} answered)`);
  console.log(`- **Mean ratings (1-5):** setup ${mean(nums("rating_setup"))}, output quality ${mean(nums("rating_quality"))}, docs ${mean(nums("rating_docs"))}`);
  console.log(`- **Worst issue per session:** ${count(sessions.map((s) => s.issue_severity ?? "not given"))}`);
  const quotable = sessions.filter((s) => s.consent_quote !== "no" && s.feedback);
  if (quotable.length) {
    console.log("\n### Quotable feedback (consent given)\n");
    for (const s of quotable) console.log(`- "${s.feedback.replaceAll("\n", " ")}" (${s.consent_quote === "named" ? `${s.tester_ref}, named: confirm the name before using it` : "anonymous"}, ${s.tester_type})`);
  }
} else if (action === "delete" && rest[0]) {
  const r = await call("/v1/admin/tester-sessions/delete", { tester_ref: rest[0] });
  console.log(`Deleted ${r.deleted} session(s) for ${r.tester_ref}.`);
} else {
  console.error("Usage: scripts/testers.mjs [summary | csv | delete <ref>]");
  process.exit(1);
}
