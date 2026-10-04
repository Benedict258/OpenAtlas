# OpenAtlas demo video: script and shot list

**Target length:** 4:40. NAIC requires 3–5 minutes.

**Sources:** every number on screen comes from [`docs/REPORT.md`](REPORT.md). Don't add claims that aren't there.

**Prerequisites:**
- The backend must be up for the live shots, and the gateway's `/v1/health` must show `reachable: true`.
- **Hosting:** the AMD MI300X droplet. Bring it up with `node --env-file=.env deploy/amd/up.mjs <droplet-ip>` (about 2.5 min on a set-up droplet), and destroy it after recording.

## Before recording

- Confirm the gateway is connected, and run `node --env-file=.env scripts/smoke-gateway.mjs` once, so the models are loaded and warm.
- **Browser:** clean window, 125% zoom, site open at `/playground`, a second tab on `/starter-kits`.
- **Terminal:** large font, an empty folder ready for the fresh-install shot.
- **Customer Service shot:** have a ~20 s spoken Hausa voice note ready to record live, plus `test-audio/eval/51s.wav` (Yoruba, 51 s) for the "sent in parts" shot.
- **Speech (shot 3):** the gateway's `/v1/health` must show `tts_enabled: true` and the backend's `tts` as `ok`; the site's `/api/status` then shows `playground_speech: true`.
- **Rehearse the waits:**
  - on the MI300X, chat replies take about 1.5–4 s through the website, speech about 5–6 s, and a voice note about 5–11 s (REPORT.md sections 29, 31);
  - plan to cut the waits in editing, and leave the timer visible once, so the latency is shown honestly.

## Script

| # | Time | On screen | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:25 | Title card: "OpenAtlas: one SDK for N-ATLaS". Then the five NCAIR1 model pages on Hugging Face, side by side. | "N-ATLaS is Nigeria's open language model, with speech recognition for Hausa, Yoruba, Igbo and Nigerian English. It ships as five separate model repos with their own calling conventions. OpenAtlas is developer infrastructure for it: one TypeScript SDK, a hosted gateway, and three starter kits." |
| 2 | 0:25–1:05 | **Best shot: fresh install.** Terminal: an empty folder, `npm install @openatlas/sdk`, paste `sdk/examples/quickstart.mjs`, set only the API key, run. The output appears: the repaired question, the Hausa answer, then `NCAIR1/N-ATLaS, Powered by Awarri`. | "From an empty folder: one npm install, set one key, run. This is the README quickstart, unchanged. The question came in with broken characters ('zaÉ“e'); `normalizeText()` repaired it before sending. The answer comes from the real N-ATLaS model through our gateway, in about five seconds, with the attribution N-ATLaS's terms require." |
| 3 | 1:05–1:30 | **Playground.** `/playground`, chat tab, Hausa: type a question, Send; the reply appears with `NCAIR1/N-ATLaS · Powered by Awarri`. Open "The same call with the SDK" and pause on `user`. Then the speak tab: English, press Speak, let ~3 s play. | "No code needed to try it: the playground calls the same SDK on a shared, rate-limited demo key, and shows the exact code for each call. Note the end-user ID: N-ATLaS's license caps use at 1,000 active users per 30 days, and the gateway counts them, hashed, so apps stay within it. Speech output is a separate renderer, not N-ATLaS, and we show it in English only: our tests show it isn't accurate enough yet for Hausa, Yoruba and Igbo." |
| 4 | 1:30–2:00 | **Best shot: Citizen Services, Hausa.** Type "Ina zan je don yin rajistar katin zabe?" and press Ask. The answer appears (INEC). | "The starter kits are reference apps for developers, not products. Citizen Services: ask in Hausa, and N-ATLaS answers from a small civic dataset. Here it correctly points to INEC." |
| 5 | 2:00–2:25 | Education: the same question at Primary, then Secondary. Show both answers. | "Education reframes the same `chat()` call by level. The primary answer is short and simple. At secondary level the model isn't always consistent: in our tests it sometimes still answered for a young child, and made small factual slips. We document that rather than hide it." |
| 6 | 2:25–3:20 | **Best shot: Customer Service, live recording.** Press Record; the countdown runs. Speak a ~20 s Hausa complaint, then Stop. In the review step, play it back, then Send. The transcript and draft appear; status: "NCAIR1/Hausa-ASR → NCAIR1/N-ATLaS. Powered by Awarri." Then upload `51s.wav` (Yoruba) and show the warning: "sent as 2 parts … only reliable on 30 s at a time." | "Customer Service chains two models: speech in, transcript, drafted reply. That's a real browser recording; webm decoding was fixed and checked live. Nothing is sent until you confirm. Recording stops at 30 seconds, because we measured that longer audio lost words. Longer files are split into 25-second parts, and the user is told so before sending." |
| 6b | 3:20–3:35 | **Customer Service, text chat.** Switch to "Text chat", English: "My blender arrived broken. What can I do?", then "How long does the refund take?" Both replies appear. | "Not everyone wants to send a voice note, so the same kit has a text chat. It's a multi-turn conversation grounded in one shop's policies. It also shows where the model needs care: in our tests it sometimes adds details the policies don't say, which we record as a known issue." |
| 7 | 3:35–3:50 | Customer Service: "Correct this transcript", edit a word, Send: "Thanks, recorded … with audio". Then the operator export (terminal), showing `has_audio: 1`. | "When a transcript is wrong, the correction goes back with its audio. Every OpenAtlas app becomes an opt-in source of corrected Nigerian-language speech data, which is exactly what these languages are short of." |
| 8 | 3:50–4:20 | **Best shot: the evidence.** Scroll `docs/REPORT.md`: the WER table, then the Yoruba loop excerpt ("afẹ́fẹ́fẹ́…"), then the known-issues table. | "Every claim here is backed by a recorded test. Speech-recognition error rates on real recordings: Nigerian English 26%, Hausa 41%, Yoruba 56%. Yoruba is the weakest: its chat replies occasionally fall into a repetition loop, about one in eleven runs in our tests. So the Citizen Services demo opens in Hausa. These are the models' limits, measured and published, not hidden." |
| 9 | 4:20–4:35 | The architecture page diagram, then the end card with the repo link, the site link, and the attribution line. | "One SDK, a license-aware gateway, three verified starter kits, and an open record of what works and what doesn't. N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies." |

## Best moments to screen-record live (ranked)

1. **Fresh install → quickstart answer** (shot 2). It proves the SDK works from nothing, and it's quick: 5–6 s.
2. **Customer Service live recording** (shot 6): the countdown, the review step, then transcript and draft. It shows two N-ATLaS models chained, plus the webm fix.
3. **Citizen Services Hausa answer naming INEC** (shot 4). A short, correct, easy-to-follow answer.
4. **The 51 s upload's "sent as 2 parts" warning** (shot 6). The 30-second finding, turned into product behaviour.
5. **Correction with audio, then the operator export** (shot 7). It makes `reportIssue()` tangible.

**Avoid recording live:**
- **Yoruba chat:** it can loop (KI-2). Show the loop from REPORT.md instead.
- **Text chat in Hausa, Yoruba or Igbo:** replies sometimes state wrong policy details (KI-16).
- **The 90 s+ uploads:** they still lose words.

## Honest rough edges the video states (all from REPORT.md)

- Yoruba: weakest language; occasional repetition loop (KI-2); Hausa is the default because of it.
- ASR WER: 26% (Nigerian English) to 56% (Yoruba) on small real-recording samples, not benchmarks.
- Instruction following is loose:
  - out-of-scope questions get general advice (KI-1);
  - level framing varies (KI-10);
  - Customer Service drafts sometimes break format or restate the customer (KI-12).
- Audio is reliable up to 30 s per request (KI-11).
- Speech output is shown in English only. Hausa, Yoruba and Igbo speech is heard back with 36–79% WER (KI-14).
- Customer Service text chat sometimes states things the policies don't say (KI-16).

## Open items before recording

- **Hosting:** settled. The AMD MI300X droplet, brought up with `deploy/amd/up.mjs`.
- **External beta testers:** NAIC requires at least 2 for Developer Infrastructure. Testers log sessions at `/tester?ref=T01`; `node --env-file=.env scripts/testers.mjs summary` gives the numbers and the quotable feedback. If there are testers by recording time, add a 15 s shot (the summary, or a quote with consent). Otherwise the video can't show this.
- **Install line:** `npm install @openatlas/sdk` installs 0.1.1 (published 2026-10-04). Shot 2 records that command for real.
