# Customer Service starter kit

**What it shows:** `transcribe()` and `chat()` chained. A voice note in Igbo, Hausa, Yoruba or Nigerian English is transcribed by the matching N-ATLaS ASR model. The N-ATLaS LLM then categorizes it and drafts a reply. Both intermediate results are shown, so the whole pipeline is visible.

**What it deliberately doesn't do:** no ticket storage, no auth, no spoken reply. `speak()` / TTS is a stretch component waiting on a NAIC eligibility answer and isn't built.

```bash
cp .env.example .env      # set OPENATLAS_API_KEY and OPENATLAS_BASE_URL
npm install && npm start  # http://localhost:3003
```

The call path is `index.html` (record or upload) → `POST /api/ticket` → `client.transcribe({ audio, language })` → `client.chat({ messages: [triage prompt + transcript], language })` → OpenAtlas gateway → N-ATLaS ASR + LLM on RunPod.

Limit: about 7 MB of audio per request (RunPod's 10 MB payload cap after base64 encoding).
