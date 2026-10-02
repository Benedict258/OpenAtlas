// Builds site/dist from site/pages, injecting the three starter kits' live windows and scripts
// (starter-kits/*/public) so the website and the standalone kits share one source.
// Run by wrangler before `dev` and `deploy` ([build] in wrangler.toml).
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  page = page.replace(placeholder, m[1].trimEnd());
  cpSync(here(`../starter-kits/${dir}/public/app.js`), here(`./dist/kits/${kit}.js`));
}
writeFileSync(here("./dist/starter-kits.html"), page);
console.log("site/dist built");
