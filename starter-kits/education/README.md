# Education starter kit

**What it shows:** the same `chat()` call reframed by prompt context. A Level selector (primary or secondary) changes only the system prompt, and the tutor answers in Hausa, Yoruba, Igbo or English.

**What it deliberately doesn't do:** no curriculum, no student accounts, no history. It's one question and one explanation.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3002
```

The call path is `index.html` → `POST /api/explain` → `client.chat({ messages: [tutor framing + question], language })` → OpenAtlas gateway → N-ATLaS LLM.

**Report a wrong answer** → `POST /api/report` → `client.reportIssue({ kind: "chat", input, output, correction })`. The page tells the user what is sent before they send it.
