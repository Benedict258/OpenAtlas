// OpenAtlas website: static pages (site/dist) plus the API behind the live starter-kit windows and the
// key request form. The kit logic is imported from starter-kits/*/kit.mjs, the same code the
// standalone kits run. The site's OpenAtlas key is a Worker secret and never reaches the browser.
import { OpenAtlas } from "openatlas";
import { ask } from "../../starter-kits/citizen-services/kit.mjs";
import { explain, report as reportExplanation } from "../../starter-kits/education/kit.mjs";
import { ticket, report as reportTranscript } from "../../starter-kits/customer-service/kit.mjs";

const ROUTES = {
  "/api/citizen/ask": ask,
  "/api/education/explain": explain,
  "/api/education/report": reportExplanation,
  "/api/support/ticket": ticket,
  "/api/support/report": reportTranscript,
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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
        return json(200, { mock: health.backend?.mock === true });
      }
      if (req.method !== "POST") return json(405, { error: "Method not allowed." });
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json(400, { error: "Request body must be JSON." });

      if (pathname === "/api/key-request") {
        // The gateway owns the database; forward the form as-is.
        const res = await gatewayFetch(`${gateway}/v1/key-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const out = await res.json().catch(() => ({}));
        return res.ok ? json(201, out) : json(res.status, { error: out.error?.message ?? `Gateway returned HTTP ${res.status}` });
      }

      const handler = ROUTES[pathname];
      if (!handler) return json(404, { error: "Not found." });
      const client = new OpenAtlas({ apiKey: env.OPENATLAS_API_KEY, baseURL: gateway, fetch: gatewayFetch });
      return json(200, await handler(client, body));
    } catch (err) {
      return json(err.status ?? 502, { error: err.message });
    }
  },
};
