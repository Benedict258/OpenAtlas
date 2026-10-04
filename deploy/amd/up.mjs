// Starts the OpenAtlas backend on the AMD MI300X droplet and connects the gateway to it, in one command.
// It uploads this checkout's server code and runs deploy/amd/bootstrap.sh on the droplet (the same script
// you'd run there by hand), then points the gateway at the new tunnel URL. Run it after every new droplet
// or restart: the tunnel URL changes each time.
//
// Usage (repo root): [SSH_KEY=<private key>] node --env-file=.env deploy/amd/up.mjs <droplet-ip> [--no-tts]
//
// Needs in .env: HF_TOKEN, NATLAS_API_KEY (the backend's key, shared with the gateway), OPENATLAS_BASE_URL
// and CLOUDFLARE_API_TOKEN (for deploy/set-backend.mjs), plus your SSH key on the droplet for root.
// Secrets go over SSH on stdin and reach the container as named variables; they are never written to the
// droplet's disk or shown in a process list.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const ip = args.find((a) => !a.startsWith("--"));
if (!ip) {
  console.error("Usage: node --env-file=.env deploy/amd/up.mjs <droplet-ip> [--no-tts]");
  process.exit(1);
}
const { HF_TOKEN, NATLAS_API_KEY } = process.env;
if (!HF_TOKEN || !NATLAS_API_KEY || NATLAS_API_KEY.length < 16) throw new Error("Set HF_TOKEN and NATLAS_API_KEY (16+ chars) in .env.");
const root = fileURLToPath(new URL("../..", import.meta.url));
const host = `root@${ip}`;
// accept-new: a freshly created droplet's host key is trusted on first contact and checked after that.
const SSH = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "StrictHostKeyChecking=accept-new",
  // SSH_KEY=<path> picks a specific private key (e.g. one made for this droplet); otherwise ssh's default keys.
  ...(process.env.SSH_KEY ? ["-i", process.env.SSH_KEY, "-o", "IdentitiesOnly=yes"] : [])];
const CODE = "/shared-docker/openatlas";
const FILES = ["deploy/amd", "deploy/server/natlas_server.py", "deploy/server/tts_renderer.py"];

console.log(`Uploading ${FILES.join(", ")} to ${ip}:${CODE}…`);
const tar = spawnSync("tar", ["-czf", "-", ...FILES], { cwd: root, maxBuffer: 50e6 });
if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
const up = spawnSync("ssh", [...SSH, host, `mkdir -p ${CODE} && tar -xzf - -C ${CODE}`], { input: tar.stdout, stdio: ["pipe", "inherit", "inherit"] });
if (up.status !== 0) throw new Error(`Upload failed (exit ${up.status}). Can you run: ssh ${host} ?`);

const tts = args.includes("--no-tts") ? "0" : "1";
const remote = `read -r HF_TOKEN; read -r BACKEND_API_KEY; export HF_TOKEN BACKEND_API_KEY OPENATLAS_CODE=uploaded ENABLE_TTS=${tts}; bash ${CODE}/deploy/amd/bootstrap.sh`;
const output = await new Promise((resolve, reject) => {
  const p = spawn("ssh", [...SSH, host, remote], { stdio: ["pipe", "pipe", "inherit"] });
  let out = "";
  p.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
  p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`deploy/amd/bootstrap.sh failed (exit ${code}); see the output above.`))));
  p.stdin.end(`${HF_TOKEN}\n${NATLAS_API_KEY}\n`);
});
const url = /^TUNNEL_URL=(https:\S+)$/m.exec(output)?.[1];
if (!url) throw new Error("The bootstrap didn't print a tunnel URL.");

console.log("\nConnecting the gateway…");
// The key reaches set-backend.mjs through the environment (NATLAS_API_KEY), not its command line.
const sb = spawnSync(process.execPath, ["deploy/set-backend.mjs", url], { cwd: root, stdio: "inherit", env: process.env });
process.exit(sb.status ?? 1);
