// One-command setup of your own OpenAtlas gateway on Cloudflare (Workers + D1; the free plan is enough).
// Run from a clone of the repo after `npm install`. It:
//   1. checks your Cloudflare token          4. deploys the gateway Worker
//   2. creates a D1 database                 5. sets a random ADMIN_TOKEN secret
//   3. writes its id into gateway/wrangler.toml and applies the schema
//   6. (with --backend) connects your N-ATLaS backend: deploy/set-backend.mjs
//   7. issues your first API key, and writes everything to .env.selfhost (never overwrites .env)
//
// Usage:
//   CLOUDFLARE_API_TOKEN=… node deploy/setup-gateway.mjs [--name my-openatlas] [--backend <url> <key>] [--dry-run]
//
// --dry-run prints every command and file change without running anything.
// The token needs: Workers Scripts Edit, D1 Edit, Account Settings Read (and Workers Routes Edit on
// some accounts). Create it at dash.cloudflare.com → My Profile → API Tokens.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gatewayDir = join(root, "gateway");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes("--dry-run");
const NAME = opt("--name") ?? "openatlas-gateway";
const DB_NAME = `${NAME}-db`;
const backendAt = args.indexOf("--backend");
const BACKEND = backendAt >= 0 ? { url: args[backendAt + 1], key: args[backendAt + 2] } : null;
if (!/^[a-z0-9-]{3,54}$/.test(NAME)) throw new Error("--name: lowercase letters, digits and dashes (3–54 chars).");
if (BACKEND && (!BACKEND.url || !BACKEND.key)) throw new Error("--backend needs <url> <key> (the values your backend notebook or server printed).");
if (!DRY && !process.env.CLOUDFLARE_API_TOKEN) throw new Error("Set CLOUDFLARE_API_TOKEN (see the header of this file), or use --dry-run.");

function wrangler(argv, { input, capture = true } = {}) {
  const shown = `npx wrangler ${argv.join(" ")}${input ? "   (value passed on stdin)" : ""}`;
  console.log(`  $ ${shown}`);
  if (DRY) return "";
  const r = spawnSync("npx", ["wrangler", ...argv], { cwd: gatewayDir, input, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`wrangler ${argv[0]} failed:\n${r.stdout}\n${r.stderr}`);
  return capture ? r.stdout : "";
}

console.log(`${DRY ? "[dry run] " : ""}Setting up an OpenAtlas gateway "${NAME}" with D1 database "${DB_NAME}".\n`);

console.log("1/7 Cloudflare account");
wrangler(["whoami"]);

console.log("2/7 D1 database");
let dbId = "<created database id>";
if (!DRY) {
  const list = JSON.parse(wrangler(["d1", "list", "--json"]));
  const found = list.find((d) => d.name === DB_NAME);
  if (found) {
    console.log(`    exists already: ${found.uuid}`);
    dbId = found.uuid;
  } else {
    wrangler(["d1", "create", DB_NAME]);
    dbId = JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === DB_NAME).uuid;
  }
} else {
  wrangler(["d1", "create", DB_NAME]);
}

console.log("3/7 gateway/wrangler.toml and schema");
const tomlPath = join(gatewayDir, "wrangler.toml");
let toml = readFileSync(tomlPath, "utf8");
toml = toml
  .replace(/^name = ".*"$/m, `name = "${NAME}"`)
  .replace(/^database_name = ".*"$/m, `database_name = "${DB_NAME}"`)
  .replace(/^database_id = ".*"$/m, `database_id = "${dbId}"`);
console.log(`    name = "${NAME}", database_name = "${DB_NAME}", database_id = "${dbId}"`);
if (!DRY) writeFileSync(tomlPath, toml);
wrangler(["d1", "execute", DB_NAME, "--remote", "--file", "schema.sql"]);

console.log("4/7 Deploy");
const deployOut = wrangler(["deploy"]);
const gatewayUrl = DRY ? `https://${NAME}.<your-subdomain>.workers.dev` : /https:\/\/[\w.-]+\.workers\.dev/.exec(deployOut)?.[0];
if (!gatewayUrl) throw new Error(`Deployed, but couldn't find the workers.dev URL in the output:\n${deployOut}`);
console.log(`    gateway: ${gatewayUrl}`);

console.log("5/7 Admin token");
const adminToken = randomBytes(32).toString("base64url");
wrangler(["secret", "put", "ADMIN_TOKEN"], { input: adminToken });

console.log("6/7 Backend");
if (BACKEND) {
  console.log(`  $ node deploy/set-backend.mjs ${BACKEND.url} <key>`);
  if (!DRY) {
    const r = spawnSync("node", [join(root, "deploy", "set-backend.mjs"), BACKEND.url, BACKEND.key], {
      cwd: root, stdio: "inherit", env: { ...process.env, OPENATLAS_BASE_URL: gatewayUrl },
    });
    if (r.status !== 0) throw new Error("Connecting the backend failed (see above). The gateway is deployed; re-run deploy/set-backend.mjs once the backend is up.");
  }
} else {
  console.log("    skipped (no --backend). Later: OPENATLAS_BASE_URL=<gateway> node deploy/set-backend.mjs <backend-url> <backend-key>");
}

console.log("7/7 First API key");
let apiKey = "<issued key>";
if (!DRY) {
  // A brand-new workers.dev route can take a few seconds to answer.
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${gatewayUrl}/v1/admin/keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "owner" }),
    }).catch(() => null);
    if (res?.ok) { apiKey = (await res.json()).key; break; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (apiKey.startsWith("<")) throw new Error("Couldn't issue the first key; try `node deploy/keys.mjs issue owner` with the values in .env.selfhost.");
}
console.log(`  POST ${gatewayUrl}/v1/admin/keys {"label":"owner"}`);

const envFile = join(root, ".env.selfhost");
const lines = [
  `# Written by deploy/setup-gateway.mjs on ${new Date().toISOString()}. Keep this file private.`,
  `OPENATLAS_BASE_URL=${gatewayUrl}`,
  `OPENATLAS_ADMIN_TOKEN=${DRY ? "<generated>" : adminToken}`,
  `OPENATLAS_API_KEY=${apiKey}`,
  `OPENATLAS_TEST_KEY=${apiKey}`,
].join("\n") + "\n";
if (DRY) console.log(`\nWould write ${envFile}:\n${lines}`);
else {
  if (existsSync(envFile)) writeFileSync(envFile + ".bak", readFileSync(envFile));
  writeFileSync(envFile, lines);
  console.log(`\nDone. Values saved to ${envFile}. Try: node --env-file=.env.selfhost examples/quickstart.mjs`);
}
