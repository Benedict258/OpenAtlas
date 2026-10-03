// Manage OpenAtlas API keys (operator only; needs OPENATLAS_ADMIN_TOKEN). Keys requested through the
// website form are reviewed with deploy/key-requests.mjs; this script covers everything after that.
//
//   node --env-file=.env deploy/keys.mjs                                   list keys with limits and usage
//   node --env-file=.env deploy/keys.mjs issue <label> [--daily N|none] [--users N|none]
//                                                                          issue a key (printed once)
//   node --env-file=.env deploy/keys.mjs limits <id> [--daily N|none] [--users N|none]
//   node --env-file=.env deploy/keys.mjs revoke <id> [reason…]
//   node --env-file=.env deploy/keys.mjs report                            per-key usage as Markdown (evidence)
//
// Limits: --daily is requests per rolling 24 h; --users is the key's share of the N-ATLaS license cap
// (active end users per 30 days). New keys get the gateway defaults (gateway/wrangler.toml) unless given.

const gateway = process.env.OPENATLAS_BASE_URL;
const headers = { Authorization: `Bearer ${process.env.OPENATLAS_ADMIN_TOKEN}`, "Content-Type": "application/json" };
const [action, ...rest] = process.argv.slice(2);

async function call(path, body) {
  const res = await fetch(gateway + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const out = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${out.error?.code}: ${out.error?.message}`);
  return out;
}

function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const name = { "--daily": "daily_request_limit", "--users": "max_active_users" }[args[i]];
    if (!name) continue;
    const v = args[++i];
    out[name] = v === "none" ? null : Number(v);
  }
  return out;
}

const iso = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "—");
const limit = (v) => (v == null ? "none" : String(v));

if (!action) {
  const { keys, window_days } = await call("/v1/admin/keys");
  for (const k of keys) {
    console.log(`\n${k.label}${k.revoked_at ? `  [REVOKED ${iso(k.revoked_at)}${k.revoked_reason ? `: ${k.revoked_reason}` : ""}]` : ""}`);
    console.log(`  id ${k.id} · created ${iso(k.created_at)}`);
    console.log(`  limits: ${limit(k.daily_request_limit)} requests/24 h, ${limit(k.max_active_users)} active users`);
    console.log(`  last 24 h: ${k.requests_24h} requests · last ${window_days} days: ${k.requests_window} requests (${k.errors_window} errors), ${k.active_users_window} active users`);
    console.log(`  first ${iso(k.first_request_at)} · last ${iso(k.last_request_at)} · routes ${JSON.stringify(k.routes_window)}`);
  }
} else if (action === "issue" && rest[0]) {
  const k = await call("/v1/admin/keys", { label: rest[0], ...flags(rest.slice(1)) });
  console.log(`Issued "${k.label}" (id ${k.id}); limits: ${limit(k.daily_request_limit)} requests/24 h, ${limit(k.max_active_users)} active users.`);
  console.log(`\nKey (shown once):\n${k.key}`);
} else if (action === "limits" && rest[0]) {
  const k = await call("/v1/admin/keys/limits", { id: rest[0], ...flags(rest.slice(1)) });
  console.log(`${k.label}: ${limit(k.daily_request_limit)} requests/24 h, ${limit(k.max_active_users)} active users.`);
} else if (action === "revoke" && rest[0]) {
  const r = await call("/v1/admin/keys/revoke", { id: rest[0], reason: rest.slice(1).join(" ") || undefined });
  console.log(`Revoked ${r.label} at ${r.revoked_at}.`);
} else if (action === "report") {
  const { keys, window_days } = await call("/v1/admin/keys");
  const usage = await call("/v1/usage");
  console.log(`## OpenAtlas API usage by key\n\nGenerated ${new Date().toISOString()} from the gateway's request log. Window: last ${window_days} days.`);
  console.log(`Total active end users: ${usage.active_users} of the ${usage.cap} N-ATLaS license cap.\n`);
  console.log("| Key | Created | First request | Last request | Requests | Errors | Active users | chat | transcribe | speak | issues |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const k of keys) {
    const r = k.routes_window;
    console.log(`| ${k.label}${k.revoked_at ? " (revoked)" : ""} | ${iso(k.created_at)} | ${iso(k.first_request_at)} | ${iso(k.last_request_at)} | ${k.requests_window} | ${k.errors_window} | ${k.active_users_window} | ${r["/v1/chat/completions"] ?? 0} | ${r["/v1/audio/transcriptions"] ?? 0} | ${r["/v1/audio/speech"] ?? 0} | ${r["/v1/issues"] ?? 0} |`);
  }
} else {
  console.error("Usage: keys.mjs [issue <label> | limits <id> | revoke <id> [reason] | report] [--daily N|none] [--users N|none]");
  process.exit(1);
}
