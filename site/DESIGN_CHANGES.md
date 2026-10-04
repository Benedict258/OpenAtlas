# Changes from the Claude Design file (OpenAtlas.html)

Layout, styling and structure are as designed. Only factually wrong copy was changed (your choice: "fix facts only"),
new SDK methods were added using the design's own components, and the kit windows were wired to the real SDK.
Not converted: the "Logo directions" board (a design exploration, not a site page). New page: /request-key.

## Product

- **Was:** Tabs: 01 Hosted deployment · 02 TypeScript SDK · 03 Starter kits
- **Now:** Tabs: 01 TypeScript SDK · 02 Starter kits · 03 Gateway and hosting
- **Why:** Hosting is an implementation detail, not the pitch (your repositioning decision). Same three tabs, new order.

## Product

- **Was:** OpenAtlas is a hosted N-ATLaS deployment and a single TypeScript SDK. Call Nigeria's
- **Now:** OpenAtlas is a single TypeScript SDK for N-ATLaS. Call Nigeria's
- **Why:** Hosting is no longer part of the headline offer.

## Product

- **Was:** content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }], });
- **Now:** content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }], user: "your-end-user-id", // required: one ID per end user });
- **Why:** Without `user` the copy-pasted quickstart fails with 400 missing_user.

## Product

- **Was:** A persistent N-ATLaS endpoint. No GPU on your side.
- **Now:** One gateway in front of N-ATLaS. No GPU on your side.
- **Why:** Describes the gateway, which exists, instead of a RunPod endpoint, which doesn't.

## Product

- **Was:** RunPod Serverless serves the N-ATLaS LLM and all four ASR models behind one stable URL, so you never provision hardware or manage weights just to try the model.
- **Now:** The OpenAtlas gateway issues your key, counts active users against the licence cap and forwards each call to a GPU host serving the N-ATLaS LLM and all four ASR models. You never provision hardware or manage weights just to try the model.
- **Why:** RunPod is not the host (fallback only, unfunded).

## Product

- **Was:** Not load-tested, with no uptime or SLA claim. Cold-start latency is expected and documented up front.
- **Now:** Not load-tested, with no uptime or SLA claim. The GPU host can change behind the gateway without any change to your code, and first-call latency while models load is documented up front.
- **Why:** Cold starts were a RunPod scale-to-zero property.

## Product

- **Was:** A single npm package routes chat() to the LLM and transcribe() to the right ASR model by language code, with typed errors, retries and timeouts.
- **Now:** A single npm package routes chat() to the LLM and transcribe() to the right ASR model by language code, with typed errors, retries and timeouts. It also repairs broken Nigerian-language text with normalizeText() and sends corrections back with reportIssue().
- **Why:** Two SDK methods were added after the design.

## Product

- **Was:** chat({ messages, language? }) transcribe({ audio, language })
- **Now:** chat({ messages, user, language? }) transcribe({ audio, language, user }) normalizeText(text, { language? }) reportIssue({ kind, output, correction })
- **Why:** `user` is required; two methods added.

## Product

- **Was:** It reuses client logic already tested against a real N-ATLaS deployment.
- **Now:** It matches the stack of the starter kits and the gateway, and ships the inference settings already tested against the real N-ATLaS weights.
- **Why:** natlas.ts never existed; the SDK was written fresh.

## Product

- **Was:** Citizen Services — chat() over a small demo civic dataset Education — chat() reframed by level and language Customer Service — transcribe() chained into chat()
- **Now:** Citizen Services — normalizeText() and chat() over a small demo civic dataset Education — chat() reframed by level and language, with reportIssue() for wrong answers Customer Service — transcribe() chained into chat(), with transcript corrections via reportIssue()
- **Why:** What the kits actually call now.

## Product

- **Was:** Three methods. That's the whole surface.
- **Now:** Five methods. That's the whole surface.
- **Why:** normalizeText() and reportIssue() added.

## Product

- **Was:** Every endpoint except the optional speech one is served by an N-ATLaS model.
- **Now:** Every model call except the optional speech one is served by an N-ATLaS model.
- **Why:** normalizeText() has no endpoint and reportIssue() isn't a model call.

## Product

- **Was:** POST /v1/audio/transcriptions
- **Now:** POST /v1/audio/transcriptions normalizeText()Text repairFixes Nigerian-language characters broken by typing or scraping, such as Æ™asa to ƙasa. Runs locally. It does not add tone marks that were never typed.Local · no request client.reportIssue()CorrectionsFlag a wrong N-ATLaS output with its correction. Every app becomes an opt-in source of corrected local-language data.POST /v1/issues
- **Why:** Two new method cells, same component.

## Product

- **Was:** Final-stage rendering of text N-ATLaS already produced. Ships only if NAIC confirms the pairing.
- **Now:** The ElevenLabs gap for Nigerian languages: final-stage rendering of text N-ATLaS already produced. Ships only if NAIC confirms the pairing.
- **Why:** speak() positioning you set.

## Product

- **Was:** transcribe()N-ATLaS ASR, by language
- **Now:** transcribe()N-ATLaS ASR, by language normalizeText()Repair broken characters
- **Why:** The kit now repairs the transcript before chat().

## Product

- **Was:** InputQuestion in text or voice
- **Now:** InputQuestion in text normalizeText()Repair broken characters
- **Why:** The Citizen Services kit takes text only; it now repairs the question first.

## Product

- **Was:** such as how to renew an ID.chat()
- **Now:** such as how to renew an ID.normalizeText() → chat()
- **Why:** Actual SDK calls.

## Product

- **Was:** reframed by level.chat()
- **Now:** reframed by level.chat() · reportIssue()
- **Why:** Actual SDK calls.

## Product

- **Was:** transcribe() → chat()
- **Now:** transcribe() → normalizeText() → chat()
- **Why:** Actual SDK calls.

## Product

- **Was:** Cold startsThe first call after idle takes longer while the serverless endpoint wakes up. Expect it, and retry if a request times out.
- **Now:** First-call latencyThe first call after the backend starts takes longer while the models load. Expect it, and retry if a request times out.
- **Why:** No serverless endpoint is in use.

## Product

- **Was:** API keys are requested manually. There is no usage analytics or billing UI.
- **Now:** API keys are requested through a short form and issued by hand. There is no usage analytics or billing UI. Text repair, not restorationnormalizeText() fixes characters that were corrupted. It does not add tone marks that were never typed; N-ATLaS-based tone restoration is a roadmap item.
- **Why:** Key requests now go through /request-key; normalizeText() limitation stated plainly.

## Docs

- **Was:** Request one through [KEY REQUEST CHANNEL — email or form], then export it.
- **Now:** Request one through the key request form, then export it.
- **Why:** Placeholder filled with the real request form.

## Docs

- **Was:** content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }], });
- **Now:** content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }], user: "your-end-user-id", // required: one ID per end user });
- **Why:** Without `user` the quickstart fails with 400 missing_user.

## Docs

- **Was:** The hosted endpoint runs on serverless GPUs. The first request after idle includes a cold start. See What to expect below.
- **Now:** The first request after the backend starts waits while the models load. See What to expect below.
- **Why:** Not running on serverless GPUs.

## Docs

- **Was:** Three methods.
- **Now:** Five methods.
- **Why:** normalizeText() and reportIssue() added.

## Docs

- **Was:** Every endpoint except the optional speech endpoint is served by an N-ATLaS model.
- **Now:** Every model call except the optional speech endpoint is served by an N-ATLaS model.
- **Why:** normalizeText() has no endpoint and reportIssue() isn't a model call.

## Docs

- **Was:** client.chat({ messages, language? })
- **Now:** client.chat({ messages, user, language? })
- **Why:** `user` is required.

## Docs

- **Was:** language"ha" | "yo" | "ig" | "en"Optional. returns{ content, model }
- **Now:** userstringRequired. A stable, opaque ID for your end user. Hashed, and used only to count active users against the licence cap. language"ha" | "yo" | "ig" | "en"Optional. returns{ content, model, usage }
- **Why:** `user` row; usage is returned.

## Docs

- **Was:** client.transcribe({ audio, language })
- **Now:** client.transcribe({ audio, language, user })
- **Why:** `user` is required.

## Docs

- **Was:** language: "yo", });
- **Now:** language: "yo", user: currentUser.id, });
- **Why:** `user` is required.

## Docs

- **Was:** audiobase64 or multipartRequired.
- **Now:** audiobytes or base64Required. Any common format (wav, mp3, ogg, webm, m4a), about 7 MB at most.
- **Why:** Multipart isn't supported.

## Docs

- **Was:** returns{ text, language, model }
- **Now:** userstringRequired. Same as chat(). returns{ text, language, model }
- **Why:** `user` row.

## Docs

- **Was:** client.speak({ text, language })
- **Now:** normalizeText(text, { language?, hausaApostrophes? }) LOCAL no request Repairs Nigerian-language text whose special characters were corrupted by typing or scraping: encoding damage (Æ™asa to ƙasa), look-alike letters (Ş to Ṣ for Yoruba, ķ to ƙ for Hausa), invisible characters and Unicode composition. Hausa apostrophe spellings such as k'asa to ƙasa are opt-in. Also available as client.normalizeText(). import { normalizeText } from "openatlas"; normalizeText("Ina zan sabunta katin Æ™asa?", { lang
- **Why:** Two method cards added, same component.

## Docs

- **Was:** Final-stage audio rendering of text N-ATLaS already produced. Available only if NAIC confirms the pairing is allowed.
- **Now:** The ElevenLabs gap for Nigerian languages: final-stage audio rendering of text N-ATLaS already produced. Available only if NAIC confirms the pairing is allowed.
- **Why:** speak() positioning you set.

## Docs

- **Was:** OpenAtlasTimeoutErrorThe request timed out, often a cold start.Retry, and expect first-call latency.
- **Now:** OpenAtlasTimeoutErrorThe request timed out, often while models are loading.Retry, and expect first-call latency. OpenAtlasConnectionErrorThe gateway could not be reached.Check your network and the base URL. OpenAtlasErrorInvalid input caught before any request, such as a missing user.Fix the call; nothing was sent.
- **Why:** All error classes the SDK throws.

## Docs

- **Was:** The endpoint scales to zero between requests, so the first call after idle takes longer while the model loads. Model weights are cached on a volume to avoid repeated downloads. Later calls are faster. This is documented here rather than discovered the hard way.
- **Now:** When the backend has just started, the first call waits while the models load. Later calls are faster. This is documented here rather than discovered the hard way.
- **Why:** No scale-to-zero or volume cache in the current hosting.

## Docs

- **Was:** Languages of the SDK
- **Now:** Text repairnormalizeText() fixes corrupted characters. It does not restore tone marks that were never typed; N-ATLaS-based restoration is a roadmap item. CorrectionsreportIssue() collects and exports corrections. There is no agreed hand-off to the N-ATLaS maintainers yet. Languages of the SDK
- **Why:** Limitations of the two new methods, stated plainly.

## Starter kits

- **Was:** Three static kit windows
- **Now:** The live kit windows (same markup), injected at build from starter-kits/*/public/index.html
- **Why:** Wired to the real SDK. Additions inside them: a hidden 'Mock backend' badge, the repaired-question output (Citizen), 'Report a wrong answer' (Education), 'Correct this transcript' (Customer Service), and the Play button disabled until speak() ships.

## Starter kits

- **Was:** SDK callschat() ShowsLanguage-aware prompting with injected context
- **Now:** SDK callsnormalizeText() → chat() ShowsLanguage-aware prompting with injected context
- **Why:** Actual SDK calls.

## Starter kits

- **Was:** SDK callschat() ShowsInstructional framing by language and level
- **Now:** SDK callschat() · reportIssue() ShowsInstructional framing by language and level
- **Why:** Actual SDK calls.

## Starter kits

- **Was:** transcribe() → chat() → speak() (stretch)
- **Now:** transcribe() → normalizeText() → chat() · reportIssue() · speak() (stretch)
- **Why:** Actual SDK calls.

## Starter kits

- **Was:** Each kit is a single screen or script that sends a real request through the SDK to the hosted endpoint.
- **Now:** Each kit is a single screen or script that sends a real request through the SDK to N-ATLaS. The three windows below are the kits themselves, running live.
- **Why:** The windows are now live.

## Starter kits

- **Was:** Point the kit at the hosted deployment with one environment variable.
- **Now:** Point the kit at the OpenAtlas gateway with one environment variable.
- **Why:** There is a gateway, not a hosted deployment URL.

## Architecture

- **Was:** HTTPS · OpenAI-style REST
- **Now:** In-process call
- **Why:** App → SDK is a function call; HTTPS starts at the SDK.

## Architecture

- **Was:** Routes chat() to the LLM, transcribe() to the right one of four ASR endpoints, and speak() to the TTS endpoint. Handles retries, timeouts and typed errors.
- **Now:** Routes chat() to the LLM, transcribe() to the right one of four ASR models, and speak() to TTS (stretch). Repairs text locally with normalizeText() and sends corrections with reportIssue(). Handles retries, timeouts and typed errors.
- **Why:** Two methods added; ASR models sit behind one service.

## Architecture

- **Was:** Hosted endpoint RunPod Serverless
- **Now:** HTTPS · OpenAI-style REST · your OpenAtlas key OpenAtlas gateway Cloudflare Worker Checks your key, counts active end users against the licence cap, stores corrections from reportIssue(), and forwards each call to the GPU host. The host's credentials never leave it. Backend chosen by configuration GPU host · NiHub (Colab while testing)
- **Why:** The gateway layer was missing; RunPod is fallback only.

## Architecture

- **Was:** Llama-3 8B fine-tune, quantized to fit the GPU tier, served with vLLM.
- **Now:** Llama-3 8B fine-tune, 4-bit quantized to fit the GPU tier.
- **Why:** Served with transformers, not vLLM, on the current host.

## Architecture

- **Was:** RunPod Serverless over Modal or ColabAt bursty, low-baseline traffic, pay-per-active-second billing is cheaper than Modal's comparable tier. Colab sessions time out, cap at roughly 12 hours and change URL every run, which is unacceptable for an endpoint others must reach reliably.
- **Now:** A gateway in front of a swappable hostGPU hosts give each endpoint its own URL and key, and count requests rather than people. The gateway gives developers one URL and their own key, measures unique end users against the licence cap, and lets the host move with a configuration change: Colab for testing today (its sessions time out and change URL every run), NiHub for the persistent deployment, RunPod as fallback.
- **Why:** RunPod was not chosen; the gateway design replaced it.

## Architecture

- **Was:** Inference hostRunPod Serverless, on-demand GPU
- **Now:** Inference hostNiHub persistent GPU (Colab while testing, RunPod as fallback)
- **Why:** Current hosting plan.

## Architecture

- **Was:** Model servingvLLM plus each ASR model's native wrapper
- **Now:** Model servingOne Python server (FastAPI and transformers) for the LLM and all four ASR models
- **Why:** deploy/server/natlas_server.py.

## Architecture

- **Was:** One client over all of the above, reusing the existing natlas.ts logic.
- **Now:** One client over all of the above, written fresh with the inference settings tested against the real N-ATLaS weights. GatewayCloudflare Worker and D1One public URL and per-developer keys. Counts active end users against the licence cap, stores reportIssue() corrections and holds the GPU host's credentials.
- **Why:** natlas.ts never existed; gateway row was missing.

## Architecture

- **Was:** One RunPod endpoint for LLM and ASR, split if VRAM requires. An optional separate endpoint for TTS.
- **Now:** One GPU process serves the LLM and all four ASR models, which fit together on a 16 GB GPU. An optional separate service for TTS.
- **Why:** Current deployment shape.

## Architecture

- **Was:** Weights are pulled from Hugging Face at build or cold start and cached on the RunPod volume.
- **Now:** Weights are pulled from Hugging Face when the backend starts.
- **Why:** No RunPod volume.

## Architecture

- **Was:** A single shared API key for the hackathon-stage demo. Per-key quotas are a roadmap item.
- **Now:** Per-developer OpenAtlas keys, stored only as hashes. The GPU host's credentials stay in the gateway. Per-key quotas are a roadmap item.
- **Why:** Keys are per developer.

## Architecture

- **Was:** Positioned as a non-commercial resource, with basic request logging to monitor usage against the 1,000 active users per 30 days cap.
- **Now:** Positioned as a non-commercial resource. The gateway counts distinct end users over a rolling 30 days and refuses new ones at the 1,000 cap.
- **Why:** The cap is enforced, not just logged.

## Architecture

- **Was:** The LLM deployment is the single hard dependency, so it comes first. Speech output is gated behind an explicit go or no-go on Day 8.
- **Now:** A live N-ATLaS backend is the single hard dependency, so it comes first. Speech output is gated behind an explicit go or no-go by October 7.
- **Why:** Revised plan (Architecture doc §7).

## Architecture

- **Was:** Replace the single shared key with per-developer limits.
- **Now:** Add per-developer rate limits on top of per-developer keys.
- **Why:** Keys are already per developer.

## Architecture

- **Was:** 04Cost efficiencyTune GPU tiers and cold-start behavior against real traffic.
- **Now:** 04Cost efficiencyTune GPU tiers and cold-start behavior against real traffic. 05Tone restorationUse N-ATLaS itself to restore tone marks that were never typed. Roadmap only.
- **Why:** Roadmap item you confirmed.

## Architecture

- **Was:** Day 1Send the NAIC eligibility email on the TTS pairing. Set up RunPod and start the LLM deployment. Days 2–3N-ATLaS LLM serving end to end. First version of th…
- **Now:** Dated plan Oct 2 → Oct 12 (from the Architecture doc §7)
- **Why:** The day plan said 'ported from natlas.ts' and 'Set up RunPod', both false.

## Starter kits (Customer Service window)

- **Was:** no Submit control in the design.
- **Now:** after recording or choosing a file, a "Voice note ready" block (the design's `.out` style) with playback, plus **Send voice note** (`.wbtn`) and **Discard** (`.wbtn.sec`). Nothing is sent until Send is pressed.
- **Why:** your decision: a review step before a voice note is sent.
## All pages (responsive layer and mobile navigation)

- **Was:** below 760px the design hid the nav links with no replacement, so phones had no navigation; desktop spacing (80–112px sections) on every screen; form fields stretched with tall empty gaps; a grid row that wasn't full showed a solid grey block.
- **Now:** `site/pages/responsive.css`, loaded after each page's own styles and using only the design's tokens. At 900px and below, a hamburger button (✕ when open) opens a full-width menu with the four pages, the current one marked, and "Get an API key". It closes on a link tap, Escape, or tapping outside. Also: scaled section spacing, tabs that stack on phones, pipeline steps that read top to bottom, single-column cards, forms without stretched gaps, and grid dividers drawn as cell outlines.
- **Why:** your request to make the site responsive on every screen size, with a hamburger menu.
- **Also fixed:** the Docs header's "Get an API key" linked to the page's own quickstart section; it now opens /request-key like every other page.


## Starter kits page: Education and Customer Service demos paused

- The Education and Customer Service windows show a "Paused" badge and a "Live demo paused" note in place of their controls, and their scripts are not loaded. Their API routes on the site Worker answer 503.
- Why: a demo goes live only after its full pipeline has been verified against the live N-ATLaS model. Citizen Services is checked first.
- Switch: `site/live-kits.mjs` (`LIVE_KITS`), read by both `site/build.mjs` and `site/src/worker.mjs`.

## Starter kits page: Citizen Services defaults to Hausa

- The language menu now lists Hausa first (it was Yoruba), so the demo opens in Hausa. Yoruba is still offered.
- Why: live checks found Yoruba chat replies sometimes degenerate into repeated syllables ("afẹ́fẹ́fẹ́…"). This is a stopgap while that is open; see docs/REPORT.md, KI-2.

## All pages: N-ATLaS attribution; API examples show real model IDs

- Every page footer now carries the attribution N-ATLaS's terms require in all public use: "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies." The site had none before.
- The Product page code sample and the Docs return-value rows now show `model: "NCAIR1/N-ATLaS"` and `attribution: "Powered by Awarri"`, matching the API. The API no longer renames the models (`n-atlas-llm`, `n-atlas-asr-*`), because the terms require renamed models to carry "Powered by Awarri".

## Starter kits page: Education demo live

- The Education window is live again (`LIVE_KITS = ["citizen", "education"]`). Its pipeline was verified against live N-ATLaS on 2026-10-03; see docs/REPORT.md, section 10. Customer Service stays paused.

## Starter kits page: Customer Service demo live, with the 30-second recorder

- All three kit windows are live (`LIVE_KITS = ["citizen", "education", "support"]`). Customer Service was verified end to end on 2026-10-03; see docs/REPORT.md, section 17.
- New behaviour in the Customer Service window, using its existing elements and styles:
  - the record button shows a countdown ("Stop recording (28 s left)") and stops at 30 s;
  - the review step says when a longer upload will be sent in parts, and why;
  - uploads over 2 minutes are refused, with a message;
  - the status line ends with "Powered by Awarri".
