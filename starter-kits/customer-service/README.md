# Customer Service starter kit

**What it shows:** `transcribe()` and `chat()` chained. A voice note in Igbo, Hausa, Yoruba or Nigerian English is transcribed by the matching N-ATLaS ASR model. The N-ATLaS LLM then categorizes it and drafts a reply. Both intermediate results are shown, so the whole pipeline is visible.

**What it deliberately doesn't do:** no ticket storage, no auth, no spoken reply by default. "Play response audio" (`speak()`, a separate text-to-speech renderer) appears only when the server reports speech output switched on and ready; it reads out the draft's "Draft reply:" text unchanged.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3003
```

The call path is `public/index.html` (record or upload, then review: play the note back, check the language, and press **Send voice note** or **Discard**) → `POST /api/support/ticket` → `kit.mjs` → `client.transcribe({ audio, language })` → `normalizeText(transcript)` → `client.chat({ messages: [triage prompt + transcript], language })` → OpenAtlas gateway → N-ATLaS ASR + LLM.

**Correct this transcript** → `POST /api/support/report` → `client.reportIssue({ kind: "transcription", output, correction, audio })`. Clips over ~1 MB (base64) are reported as text only.

Limit: about 7 MB of audio per request (the gateway rejects larger requests).

Files: `kit.mjs` holds the kit logic (prompts and SDK calls), `server.mjs` serves `public/` and the API, `public/` is the page, styled from the OpenAtlas design. The OpenAtlas website runs this same `kit.mjs` and window markup for its live demo.
