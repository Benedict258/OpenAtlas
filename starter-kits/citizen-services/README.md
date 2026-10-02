# Citizen Services starter kit

**What it shows:** `chat()` with language-aware prompting. A question in Yoruba, Hausa, Igbo or English is answered by the N-ATLaS LLM, grounded in a small reference dataset that gets injected into the system prompt.

**What it deliberately doesn't do:** no persistence, no auth, no retrieval over a real corpus. `demo-dataset.mjs` is six general facts, labeled as a demo in the UI. Swap in your own verified content.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3001
```

The call path is `index.html` → `POST /api/ask` → `normalizeText(question)` (repairs broken characters; the page shows the repaired question when anything changed) → `client.chat({ messages: [system + question], language })` → OpenAtlas gateway → N-ATLaS LLM.
