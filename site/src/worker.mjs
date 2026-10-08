// OpenAtlas website: static pages (site/dist) plus the API behind the live starter-kit windows and the
// key request form. The kit logic is imported from starter-kits/*/kit.mjs, the same code the
// standalone kits run. The site's OpenAtlas key is a Worker secret and never reaches the browser.
import { OpenAtlas } from "@openatlas/sdk";
import { ask } from "../../starter-kits/citizen-services/kit.mjs";
import { explain, report as reportExplanation } from "../../starter-kits/education/kit.mjs";
import { ticket, report as reportTranscript, speakDraft, converse } from "../../starter-kits/customer-service/kit.mjs";
import { playChat, playTranscribe, playSpeak } from "./playground.mjs";
import { LIVE_KITS, LIVE_SPEECH, PLAYGROUND_SPEECH } from "../live-kits.mjs";

const ROUTES = {
  "/api/citizen/ask": ask,
  "/api/education/explain": explain,
  "/api/education/report": reportExplanation,
  "/api/support/ticket": ticket,
  "/api/support/report": reportTranscript,
  "/api/support/speak": speakDraft,
  "/api/support/chat": converse,
  "/api/playground/chat": playChat,
  "/api/playground/transcribe": playTranscribe,
  "/api/playground/speak": playSpeak,
};

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// The end-user ID the demos send for the N-ATLaS license count is derived here, never taken from the
// browser: a made-up `user` (or cookie) per request would otherwise count as a new person each time and
// use up the website key's share of the cap. The ID comes from the visitor's network address (an IPv4
// address, or the IPv6 /64 a subscriber holds), so one network yields at most USER_BUCKETS IDs however
// many IDs or cookies a script invents. The cookie only spreads real visitors who share an address (an
// office, a school) over those buckets. IDs are keyed with the site's secret, so they can't be reversed.
// "online" | "loading" | "offline": whether the gateway can reach a GPU backend with its models loaded.
const backendState = (health) => (health.backend?.reachable !== true ? "offline" : health.backend.status === "ok" ? "online" : health.backend.status === "loading" ? "loading" : "offline");

const USER_BUCKETS = 8;
const VISITOR_COOKIE = "oa_vid";

function network(ip) {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

async function keyedHash(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function siteUser(req, secret) {
  const cookie = /(?:^|;\s*)oa_vid=([0-9a-f-]{36})(?:;|$)/.exec(req.headers.get("Cookie") ?? "")?.[1];
  const visitor = cookie ?? crypto.randomUUID();
  const bucket = parseInt((await keyedHash(secret, `bucket|${visitor}`)).slice(0, 8), 16) % USER_BUCKETS;
  const user = `web-${await keyedHash(secret, `user|${network(req.headers.get("CF-Connecting-IP"))}|${bucket}`)}`;
  const setCookie = cookie ? {} : { "Set-Cookie": `${VISITOR_COOKIE}=${visitor}; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` };
  return { user, setCookie };
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const gateway = env.OPENATLAS_BASE_URL.replace(/\/+$/, "");
    // Cloudflare blocks a Worker from fetching another Worker's workers.dev URL on the same account
    // (error 1042), so in production the gateway is reached through a Service Binding.
    const gatewayFetch = env.GATEWAY ? (input, init) => env.GATEWAY.fetch(input, init) : (input, init) => fetch(input, init);
    try {
      if (req.method === "GET" && pathname === "/api/status") {
        const health = await gatewayFetch(`${gateway}/v1/health`).then((r) => r.json());
        const speech = LIVE_SPEECH && health.tts_enabled === true && health.backend?.tts?.status === "ok";
        const ttsReady = health.tts_enabled === true && health.backend?.tts?.status === "ok";
        return json(200, { mock: health.backend?.mock === true, speech, playground_speech: PLAYGROUND_SPEECH && ttsReady, backend: backendState(health) });
      }
      if (req.method !== "POST") return json(405, { error: "Method not allowed." });
      // Per-IP limit (site/wrangler.toml), so one visitor can't drain the shared demo key.
      if (env.DEMO_LIMITER) {
        const { success } = await env.DEMO_LIMITER.limit({ key: req.headers.get("CF-Connecting-IP") ?? "unknown" });
        if (!success) return json(429, { error: "Too many requests from your network. Wait a minute and try again." });
      }
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json(400, { error: "Request body must be JSON." });

      // Forms whose data the gateway stores (it owns the database); forwarded as-is.
      const FORMS = { "/api/key-request": "/v1/key-requests" };
      if (FORMS[pathname]) {
        const res = await gatewayFetch(`${gateway}${FORMS[pathname]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const out = await res.json().catch(() => ({}));
        return res.ok ? json(201, out) : json(res.status, { error: out.error?.message ?? `Gateway returned HTTP ${res.status}` });
      }

      const handler = ROUTES[pathname];
      if (!handler) return json(404, { error: "Not found." });
      const kit = pathname.split("/")[2];
      if (kit !== "playground" && !LIVE_KITS.includes(kit)) {
        return json(503, { error: "This demo is paused until its pipeline has been verified against the live N-ATLaS model." });
      }
      if (pathname === "/api/support/speak" && !LIVE_SPEECH) {
        return json(503, { error: "Spoken replies are switched off until they have been verified against the live backend." });
      }
      if (pathname === "/api/playground/speak" && !PLAYGROUND_SPEECH) {
        return json(503, { error: "Speech output is switched off in the playground." });
      }
      const client = new OpenAtlas({ apiKey: env.OPENATLAS_API_KEY, baseURL: gateway, fetch: gatewayFetch });
      // The browser's `user` is ignored (see siteUser).
      const { user, setCookie } = await siteUser(req, env.OPENATLAS_API_KEY);
      return json(200, await handler(client, { ...body, user }), setCookie);
    } catch (err) {
      return json(err.status ?? 502, { error: err.message });
    }
  },
};
