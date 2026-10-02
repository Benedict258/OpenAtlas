# Education starter kit

**What it shows:** the same `chat()` call reframed by prompt context. A Level selector (primary or secondary) changes only the system prompt, and the tutor answers in Hausa, Yoruba, Igbo or English.

**What it deliberately doesn't do:** no curriculum, no student accounts, no history. It's one question and one explanation.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3002
```

The call path is `public/index.html` → `POST /api/education/explain` → `kit.mjs` → `client.chat({ messages: [tutor framing + question], language })` → OpenAtlas gateway → N-ATLaS LLM.

**Report a wrong answer** → `POST /api/education/report` → `client.reportIssue({ kind: "chat", input, output, correction })`. The page tells the user what is sent before they send it.

Files: `kit.mjs` holds the kit logic (prompts and SDK calls), `server.mjs` serves `public/` and the API, `public/` is the page, styled from the OpenAtlas design. The OpenAtlas website runs this same `kit.mjs` and window markup for its live demo.
