# Citizen Services starter kit

**What it shows:** `chat()` with language-aware prompting. A question in Yoruba, Hausa, Igbo or English is answered by the N-ATLaS LLM, grounded in a small reference dataset that gets injected into the system prompt.

**What it deliberately doesn't do:** no persistence, no auth, no retrieval over a real corpus. `demo-dataset.mjs` is six general facts, labeled as a demo in the UI. Swap in your own verified content.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3001
```

The call path is `public/index.html` → `POST /api/citizen/ask` → `kit.mjs` → `normalizeText(question)` (repairs broken characters; the page shows the repaired question when anything changed) → `client.chat({ messages: [system + question], language })` → OpenAtlas gateway → N-ATLaS LLM.

Files: `kit.mjs` holds the kit logic (prompts and SDK calls), `server.mjs` serves `public/` and the API, `public/` is the page, styled from the OpenAtlas design. The OpenAtlas website runs this same `kit.mjs` and window markup for its live demo.
