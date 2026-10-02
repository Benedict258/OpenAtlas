// Customer Service starter kit: serves the demo page and its API. The kit logic is in kit.mjs.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { OpenAtlas } from "openatlas";
import { ticket, report } from "./kit.mjs";

const client = new OpenAtlas();
const ROUTES = { "POST /api/support/ticket": ticket, "POST /api/support/report": report };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

async function readJson(req) {
  // Concatenate bytes before decoding so multi-byte characters split across chunks survive.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const route = `${req.method} ${req.url}`;
  try {
    if (ROUTES[route]) return send(res, 200, await ROUTES[route](client, await readJson(req)));
    if (route === "GET /api/status") {
      const health = await fetch(`${client.baseURL}/v1/health`).then((r) => r.json());
      return send(res, 200, { mock: health.backend?.mock === true });
    }
    if (req.method === "GET") {
      const file = req.url === "/" ? "index.html" : req.url.slice(1);
      if (!/^[\w-]+\.(html|js|css)$/.test(file)) return send(res, 404, { error: "not found" });
      const body = await readFile(new URL(`./public/${file}`, import.meta.url)).catch(() => null);
      if (!body) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] });
      return res.end(body);
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, err.status ?? 502, { error: err.message });
  }
}).listen(Number(process.env.PORT ?? 3003), () => console.log(`Customer Service demo on http://localhost:${process.env.PORT ?? 3003}`));
