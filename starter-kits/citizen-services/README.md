# Citizen Services starter kit

> **Live demo:** https://getopenatlas.xyz/starter-kits · **Docs:** https://getopenatlas.xyz/docs · **Main README:** [../../README.md](../../README.md)
>
> **Non-commercial use only** under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS) (at most 1,000 active end users per 30 days). **"Powered by Awarri" must be shown wherever model output is shown**; this kit's page carries the full N-ATLaS credit line ("…powered by Awarri Technologies"). Keep it if you adapt the kit. Code: MIT ([LICENSE](../../LICENSE)).

**What it shows:** `chat()` with language-aware prompting. A question in Yoruba, Hausa, Igbo or English is answered by the N-ATLaS LLM, grounded in a small reference dataset that gets injected into the system prompt.

**What it deliberately doesn't do:** no persistence, no auth, no retrieval over a real corpus. `demo-dataset.mjs` is six general facts, labeled as a demo in the UI. Swap in your own verified content.

**Running it** needs Node 22.9+ and an OpenAtlas API key ([request one](https://getopenatlas.xyz/request-key)). From a fresh clone, build the SDK once in the repo root (`npm install && npm run build`), then:
```bash
cp .env.example .env      # set OPENATLAS_API_KEY (OPENATLAS_BASE_URL defaults to the hosted API)
npm install && npm start  # http://localhost:3001
```

The call path is `public/index.html` → `POST /api/citizen/ask` → `kit.mjs` → `normalizeText(question)` (repairs broken characters; the page shows the repaired question when anything changed) → `client.chat({ messages: [system + question], language })` → OpenAtlas gateway → N-ATLaS LLM.

Files: `kit.mjs` holds the kit logic (prompts and SDK calls), `server.mjs` serves `public/` and the API, `public/` is the page, styled from the OpenAtlas design. The OpenAtlas website runs this same `kit.mjs` and window markup for its live demo.
