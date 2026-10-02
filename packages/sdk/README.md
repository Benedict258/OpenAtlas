# openatlas

TypeScript client for the hosted **N-ATLaS** models: Nigeria's open LLM and its Hausa, Yoruba, Igbo and Nigerian-English speech recognition.

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies. Non-commercial use only, capped at 1,000 active end-users per rolling 30 days under the N-ATLaS Terms of Use.

```ts
import { OpenAtlas, normalizeText } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

const response = await client.chat({
  messages: [{ role: "user", content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }],
  user: "your-end-user-id", // required: counts active users against the license cap
});
console.log(response.content);

const { text } = await client.transcribe({ audio: audioBytes, language: "ha", user: "your-end-user-id" });

// Repair corrupted Nigerian-language characters locally (no request): "Æ™asa" → "ƙasa"
const clean = normalizeText(scraped, { language: "ha" });

// Flag a wrong output with its correction
await client.reportIssue({ kind: "transcription", output: text, correction: "…", language: "ha", audio: audioBytes });
```

Node 18+, no runtime dependencies. Full docs: the [OpenAtlas README](../../README.md) and the [API reference](../../docs/api-reference.md).
