# Education starter kit

> **Live demo:** https://getopenatlas.xyz/starter-kits · **Docs:** https://getopenatlas.xyz/docs · **Main README:** [../../README.md](../../README.md)
>
> **Non-commercial use only** under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS) (at most 1,000 active end users per 30 days). **"Powered by Awarri" must be shown wherever model output is shown**; this kit's page carries the full N-ATLaS credit line ("…powered by Awarri Technologies"). Keep it if you adapt the kit. Code: MIT ([LICENSE](../../LICENSE)).

**What it shows:** the same `chat()` call reframed by prompt context. A Level selector (primary or secondary) changes only the system prompt, and the tutor answers in Hausa, Yoruba, Igbo or English.

**What it deliberately doesn't do:** no curriculum, no student accounts, no history. It's one question and one explanation.

**Running it** needs Node 22.9+ and an OpenAtlas API key ([request one](https://getopenatlas.xyz/request-key)). From a fresh clone, build the SDK once in the repo root (`npm install && npm run build`), then:
```bash
cp .env.example .env      # set OPENATLAS_API_KEY (OPENATLAS_BASE_URL defaults to the hosted API)
npm install && npm start  # http://localhost:3002
```

The call path is `public/index.html` → `POST /api/education/explain` → `kit.mjs` → `client.chat({ messages: [tutor framing + question], language })` → OpenAtlas gateway → N-ATLaS LLM.

**Report a wrong answer** → `POST /api/education/report` → `client.reportIssue({ kind: "chat", input, output, correction })`. The page tells the user what is sent before they send it.

Files: `kit.mjs` holds the kit logic (prompts and SDK calls), `server.mjs` serves `public/` and the API, `public/` is the page, styled from the OpenAtlas design. The OpenAtlas website runs this same `kit.mjs` and window markup for its live demo.
