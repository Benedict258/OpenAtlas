// Builds site/dist from site/pages, injecting the three starter kits' live windows and scripts
// (starter-kits/*/public) so the website and the standalone kits share one source.
// Run by wrangler before `dev` and `deploy` ([build] in wrangler.toml).
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KIT_NAMES, LIVE_KITS } from "./live-kits.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const KITS = { citizen: "citizen-services", education: "education", support: "customer-service" };

// Empty dist rather than deleting it: on Windows a running `wrangler dev` holds the directory open.
if (existsSync(here("./dist"))) for (const f of readdirSync(here("./dist"))) rmSync(here(`./dist/${f}`), { recursive: true, force: true });
cpSync(here("./pages"), here("./dist"), { recursive: true });
mkdirSync(here("./dist/kits"), { recursive: true });

let page = readFileSync(here("./pages/starter-kits.html"), "utf8");
for (const [kit, dir] of Object.entries(KITS)) {
  const kitPage = readFileSync(here(`../starter-kits/${dir}/public/index.html`), "utf8");
  const m = new RegExp(`<!-- window:${kit} -->\\n([\\s\\S]*?)<!-- /window:${kit} -->`).exec(kitPage);
  if (!m) throw new Error(`No <!-- window:${kit} --> block in starter-kits/${dir}/public/index.html`);
  const placeholder = `<!-- kit:${kit} -->`;
  if (!page.includes(placeholder)) throw new Error(`No ${placeholder} in pages/starter-kits.html`);
  if (LIVE_KITS.includes(kit)) {
    page = page.replace(placeholder, m[1].trimEnd());
    cpSync(here(`../starter-kits/${dir}/public/app.js`), here(`./dist/kits/${kit}.js`));
  } else {
    // Paused: same window frame, no controls, and its script is not loaded.
    page = page.replace(placeholder, pausedWindow(kit, dir)).replace(new RegExp(String.raw`<script src="/kits/${kit}\.js"></script>\r?\n`), "");
  }
}
writeFileSync(here("./dist/starter-kits.html"), page);

function pausedWindow(kit, dir) {
  return `<div class="win" data-kit="${kit}">
<div class="wbar"><span>OpenAtlas — ${KIT_NAMES[kit]} Demo</span><span style="display:flex;gap:8px;flex:none"><span class="demo">Paused</span></span></div>
<div class="wbody">
<div class="out"><b>Live demo paused</b><span>This demo goes live once its full pipeline has been checked against the live N-ATLaS model. Until then it is switched off rather than shown unverified. The kit's code is in <span class="mono">starter-kits/${dir}</span>.</span></div>
</div>
</div>`;
}
console.log("site/dist built");
