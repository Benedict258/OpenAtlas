# @openatlas/sdk

TypeScript client for the hosted **N-ATLaS** models: Nigeria's open LLM and its Hausa, Yoruba, Igbo and Nigerian-English speech recognition.

**Website:** https://getopenatlas.xyz · **API:** https://api.getopenatlas.xyz · **Docs:** https://getopenatlas.xyz/docs · **Source:** https://github.com/Benedict258/OpenAtlas

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies. **Non-commercial use only**, capped at 1,000 active end users per rolling 30 days under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS). **Attribution is required:** show "Powered by Awarri" wherever N-ATLaS output appears in your app (every response carries it in `attribution`).

```ts
import { OpenAtlas, normalizeText } from "@openatlas/sdk";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

const response = await client.chat({
  messages: [{ role: "user", content: "Ina zan je don yin rajistar katin zaɓe?" }],
  language: "ha",
  user: "your-end-user-id", // required: counts active users against the license cap
});
console.log(response.content, `(${response.model}, ${response.attribution})`); // NCAIR1/N-ATLaS, Powered by Awarri

// Keep each clip to 30 s or less (longer audio currently loses words).
const { text } = await client.transcribe({ audio: audioBytes, language: "ha", user: "your-end-user-id" });

// Repair corrupted Nigerian-language characters locally (no request): "Æ™asa" → "ƙasa"
const clean = normalizeText(scraped, { language: "ha" });

// Flag a wrong output with its correction
await client.reportIssue({ kind: "transcription", output: text, correction: "…", language: "ha", audio: audioBytes });
```

Get a key with the [request form](https://getopenatlas.xyz/request-key), or self-host the whole stack and pass `baseURL` (or set `OPENATLAS_BASE_URL`): [deploy guide](https://github.com/Benedict258/OpenAtlas/blob/main/docs/deploy-your-own.md).

Node 18+, no runtime dependencies. MIT-licensed. Full docs: the [OpenAtlas README](https://github.com/Benedict258/OpenAtlas/blob/main/README.md), including its measured known limitations, and the [API reference](https://github.com/Benedict258/OpenAtlas/blob/main/docs/api-reference.md).
