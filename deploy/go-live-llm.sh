#!/usr/bin/env bash
# One command after RunPod is funded:
#   1. create the N-ATLaS LLM endpoint on RunPod
#   2. give its ID to the live gateway (Worker secret)
#   3. run the real smoke test (cold Yoruba, warm Yoruba, warm Hausa)
#   4. one real chat() through the public gateway with the SDK
# Usage (from repo root): bash deploy/go-live-llm.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

if [ -f deploy/endpoints.json ] && node -e 'process.exit(require("./deploy/endpoints.json").llm ? 0 : 1)'; then
  echo "LLM endpoint already exists: $(node -pe 'require("./deploy/endpoints.json").llm.id') (skipping create)"
else
  node --env-file=.env deploy/llm/deploy-llm.mjs
fi
LLM_ID=$(node -pe 'require("./deploy/endpoints.json").llm.id')

(cd gateway && printf '%s' "$LLM_ID" | npx wrangler secret put LLM_ENDPOINT_ID)
curl -s "$OPENATLAS_BASE_URL/v1/health"; echo

node --env-file=.env deploy/llm/smoke-test.mjs

echo "=== Through the public gateway (SDK → Cloudflare → RunPod → N-ATLaS)"
OPENATLAS_API_KEY="$OPENATLAS_TEST_KEY" node --input-type=module -e '
import { OpenAtlas } from "./packages/sdk/dist/index.js";
const client = new OpenAtlas();
const t0 = Date.now();
const r = await client.chat({ messages: [{ role: "user", content: "Za ka iya bayyana dalilin da ya sa sararin sama yake shuɗi?" }], user: "owner-smoke-test" });
console.log(`wall ${((Date.now() - t0) / 1000).toFixed(1)}s | model ${r.model} | usage ${JSON.stringify(r.usage)}`);
console.log("OUTPUT:", r.content);'
