// Review API key requests submitted through the website form.
//
//   node --env-file=.env scripts/key-requests.mjs                 list pending requests
//   node --env-file=.env scripts/key-requests.mjs approve <id>    issue a key (printed once; email it to the requester)
//   node --env-file=.env scripts/key-requests.mjs decline <id>

const gateway = process.env.OPENATLAS_BASE_URL;
const headers = { Authorization: `Bearer ${process.env.OPENATLAS_ADMIN_TOKEN}`, "Content-Type": "application/json" };
const [action, id] = process.argv.slice(2);

async function call(path, init) {
  const res = await fetch(gateway + path, { headers, ...init });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${body.error?.code}: ${body.error?.message}`);
  return body;
}

if (!action) {
  const { requests } = await call("/v1/admin/key-requests");
  if (!requests.length) console.log("No pending key requests.");
  for (const r of requests) {
    console.log(`\n${r.id}  ${new Date(r.created_at).toISOString()}`);
    console.log(`  ${r.name} <${r.email}>  ·  ${r.project}  ·  expected users: ${r.expected_users ?? "—"}`);
    console.log(`  ${r.use_case}`);
  }
} else if ((action === "approve" || action === "decline") && id) {
  const r = await call("/v1/admin/key-requests/decide", { method: "POST", body: JSON.stringify({ id, decision: action }) });
  console.log(`${r.status}: ${r.email}`);
  if (r.key) console.log(`\nKey (shown once, send it to ${r.email}):\n${r.key}`);
} else {
  console.error("Usage: key-requests.mjs [approve|decline <id>]");
  process.exit(1);
}
