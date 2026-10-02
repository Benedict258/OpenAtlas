# OpenAtlas verification report

The running record of what has been checked against the **live N-ATLaS model**, in order. Every future check is appended here.

How to read it:
- **Live** means a real request went to the real model and the output below is what came back, verbatim.
- Anything checked only against the mock backend or stubbed models is labelled that way.
- Times are wall-clock seconds measured by the caller, so they include the gateway and the tunnel.
- Raw records for every run are appended to `deploy/smoke-results.jsonl` (gitignored).

## Setup used for every live check below

| | |
|---|---|
| Path | SDK (`packages/sdk`) → live gateway `openatlas-gateway.isaacbenedict001.workers.dev` → backend |
| Backend | `natlas_colab.ipynb` on Google Colab (T4 GPU), behind a Cloudflare quick tunnel |
| Tunnel host | `dinner-gui-resume-recall.trycloudflare.com` (changes on every Colab run) |
| LLM | `NCAIR1/N-ATLaS`, 4-bit NF4 |
| ASR | `NCAIR1/Hausa-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR`, `NCAIR1/NigerianAccentedEnglish` |
| Chat settings | temperature 0.1, repetition penalty 1.12, today's date in the chat template |
| Mock? | No. The backend's `/health` reported `NCAIR1/N-ATLaS`, the gateway reported `mock: false`, and the notebook has no fallback model. |

Hosting is interim: the Colab session is not persistent. NiHub is the intended host.

---

## 2026-10-02

### 1. First real `chat()` call: PASS

The gateway was connected with `deploy/set-backend.mjs`. The backend accepted its key (probe HTTP 200), and the gateway's health check reported the tunnel reachable.

| Language | Time | Prompt | Reply (verbatim) |
|---|---|---|---|
| en | 8.2 s | In two sentences, what does the National Identity Management Commission (NIMC) in Nigeria do? | "The National Identity Management Commission (NIMC) in Nigeria is responsible for issuing the National Identification Number (NIN), which is a unique identifier given to every Nigerian citizen, and it also oversees the registration process for the National e-Passport. The NIMC manages the data of individuals and provides services related to national identification through its various operations." |

Verdict: fluent, on-topic, follows the two-sentence instruction, no repetition. **One factual error:** e-passports are issued by the Nigeria Immigration Service, not NIMC. A NIN is required to apply, which is probably the source of the mix-up.

### 2. Citizen Services starter kit, live on the website: PASS, with one known issue

This is the website's `/api/citizen/ask` endpoint. It uses the same kit code as `starter-kits/citizen-services`: `normalizeText()`, then `chat()` with the demo dataset in the system prompt.

| # | Check | Time | Result |
|---|---|---|---|
| 1 | Real browser (headless Chrome, 390 px phone width); Hausa: "Ina zan je don yin rajistar katin zabe?" | 12.2 s | Correct agency (INEC), sensible steps. 4/4 UI checks passed: mock badge hidden, "Asking…" state, answer shown, button reset. |
| 2 | Hausa question with corrupted characters (UTF-8 read as Windows-1252: "É—an Æ™asa") | 11.0 s | `normalizeText()` repaired it to "ɗan ƙasa" before the model saw it. Answer correct: NIMC enrolment centres or licensed partners. |
| 3 | Hausa question the demo notes do not cover: "Nawa ne kuɗin tikitin jirgin sama daga Kano zuwa Legas?" (airfare) | 13.1 s | **Ignored the "answer only from the notes" instruction.** It gave general advice (check airline sites, Google Flights, Skyscanner) instead of saying the notes don't cover it. It did not invent a price. Logged as known issue KI-1. |
| 4 | Yoruba: "Báwo ni mo ṣe lè forúkọsílẹ̀ fún NIN?" | 22.8 s | Reasonable steps in Yoruba. Most tone marks missing, and some invented details (marriage certificate, "kaadi kaadi"). |

Replies, verbatim:

1. "Don yin rijistar katin zabe, za ku iya ziyartar hukumar zabe mai zaman kanta ta kasa (INEC) domin gudanar da rajistar masu kada kuri’a na ci gaba. Hakanan ana iya samun wannan sabis a cibiyoyi ko rumfunan jama'a da aka keɓe a fadin jihohin. Kafin yin rajista, tabbatar kun mallaki ingantaccen takardar shaidar shaida tare da bayanan tantancewa."
2. "Don sabunta katin Shaida ta Ƙasa (NIN), je zuwa cibiyar rajista ta NIMC mafi kusa ko wani mai lasisi don yin rajistar da aka tsara. Kana bukatar ka kawo ingantaccen takardun shaidarka na farko da bayanan tuntuɓar juna idan akwai. Bayan an yi rajistan, za ku karbi sabon katin ID ɗinku."
3. "Kudin tikitin jirgin sama daga Kano zuwa Legas na iya bambanta dangane da irin jirgin, kamfanin jirgi, da lokacin da aka yi rajista. Don samun ingantaccen farashi, zan ba da shawarar ziyartar gidan yanar gizon kamfanonin jiragen sama ko kuma yin bincike ta hanyoyi masu inganci kamar Google Flights, Skyscanner, ko Expedia. Ka tuna ka duba don samun mafi kyawun ranaku da lokutan tashi don samun arha mai kyau!"
4. "Lati forukọsilẹ fun NIN rẹ, o le tẹle awọn igbesẹ wọnyi:
   1. Lọ si ile-iṣẹ iforukọsilẹ ti Orilẹ-ede tabi ọkan ninu awọn alabaṣiṣẹpọ iwe-aṣẹ ti a mọ lati gba fọọmu NIN kan.
   2. Pese idanimọ rẹ, gẹgẹbi iwe irinna ilu okeere, iwe-ẹri ibimọ, tabi iwe-ẹri miiran ti a fọwọsi.
   3. Ti o ba jẹ dandan, pese iwe afikun, gẹgẹbi iwe-ẹri igbeyawo tabi iwe-ẹri iyipada orukọ.
   4. Fọwọsi fọọmu naa ki o si fi gbogbo awọn ohun elo ti o nilo silẹ.
   5. Gba nọmba ID rẹ sori kaadi kaadi ID rẹ.
   6. Tẹsiwaju si ile-iṣẹ NIMC agbegbe rẹ lati pari ilana naa ati gba NIN rẹ."

The Education and Customer Service website demos stay **paused**: their API routes return 503 until each pipeline is verified live. The switch is `site/live-kits.mjs`.

### 3. Smoke test, `chat()` in four languages: 3 PASS, 1 FAIL

Run with `deploy/smoke-gateway.mjs`, max 200 tokens.

| Language | Time | Verdict | Reply (verbatim) |
|---|---|---|---|
| en | 5.5 s | PASS | "The National Identification Management Commission (NIMC) is responsible for issuing the National Identification Number (NIN), which is a unique number assigned to every Nigerian citizen. They are also responsible for managing and maintaining the national identification database of Nigeria." |
| ha | 4.5 s | PASS | "Kalmar "gwagwarmaya" na nufin gwagwarmayar mutum don cimma wata manufa ko burin, yawanci yana fuskantar kalubale ko wahalhalu." |
| yo | 19.6 s | **FAIL** | Off-topic, then a repetition loop until the token limit: "Oju-ọrun n sún mọ́lẹ̀ lè jẹ́ nítorí àwọn ipò oríṣiríṣi, bíi pé ó wà lábẹ́ òrùlé igun tàbí ibì kan pẹ̀lú ògiri gíga tó yí i ká. Nínú irú àyíká bẹ́ẹ̀, afẹ́fẹ́fẹ́fẹ́fẹ́fẹ́fẹ́fẹ́…" (see KI-2) |
| ig | 7.4 s | PASS | "Ịsacha aka tupu iri nri bara uru n'ihi na ọ na-ebelata ihe ize ndụ nke ibute ọrịa sitere na nri, na-eme ka ọnụ na ahụ dị ọcha, ma na-enyere aka ịkwado ezi omume hygiene onwe onye." Fluent, but drops in the English word "hygiene". |

### 4. Smoke test, `transcribe()` with word error rate

> **These are one-clip spot checks, not benchmarks.** Each language was tested on a single real recording from a public dataset, with that dataset's human transcript as the reference. The Igbo and English clips are short single sentences. The numbers show the pipeline works end to end. They do not measure the models' accuracy.

WER is computed after lowercasing, NFC normalisation and stripping punctuation. Tone marks and other diacritics are kept, so a dropped tone mark counts as an error.

| Language | Clip source | Time | WER | Notes |
|---|---|---|---|---|
| ha | SilencioNetwork/hausa-speech-transcribed | 10.1 s | 26% | Long conversational clip. Errors such as "tseren" → "ɗere", "sha'awa" → "nishawa". |
| yo | SilencioNetwork/yoruba-speech-transcribed | 6.9 s | 74% | Fast conversational speech. Words run together ("àgbàlá òjò" → "àgbàlọ́jọ̀"). |
| ig | deepdml/igbo-dict-16khz | 2.1 s | 0% | 4-word clip. |
| en-ng | benjaminogbonna/nigerian_accented_english_dataset | 1.7 s | 0% | One sentence. |

### 5. `reportIssue()` and operator export: PASS

A correction report was stored as id `2b939345-cee9-4b26-8d12-4c7332bfeacf` and was present in the admin export.

### 6. Yoruba repetition loop: baseline, then fix (fix pending live verification)

**Baseline:** 10 more runs of the smoke-test Yoruba prompt, before any fix.

| Runs | Full loop | Stutter that recovered ("fẹ́" ×3 or more) | Time |
|---|---|---|---|
| 10 | 0 | 2 | 11.4–19.3 s |

Including the smoke test, that makes 1 full loop in 11 runs. The fault is intermittent.

**Possible confounder in the test prompt:** in "kí ni ìdí tí ojú ọ̀run fi máa ń **ṣú** bulúù?", "ṣú" usually means "become dark/overcast". All 11 replies talk about the sky darkening or the weather, not about why the sky is blue. So the off-topic part may come from the prompt rather than the model. A Yoruba speaker should confirm. The loop is a separate problem either way.

**Fix:** `no_repeat_ngram_size = 10` in the chat call. It is set as the default in `natlas_colab.ipynb` and `deploy/server/natlas_server.py`. Smaller windows were rejected by replaying the rule offline, with N-ATLaS's tokenizer, over the 11 real Yoruba replies above:

| Window (tokens) | Normal (non-loop) replies it would have changed | Where it cuts the real loop |
|---|---|---|
| 4 | 10/10 | "fẹ́fẹ" |
| 6 | 8/10 | "fẹ́fẹ́f" |
| 8 | 4/10 (e.g. a second "afẹ́fẹ́") | "fẹ́fẹ́fẹ́" |
| **10** | **0/10** | "fẹ́fẹ́fẹ́fẹ" |
| 12 | 0/10 | "fẹ́fẹ́fẹ́fẹ́f" |

Why small windows fail: one Yoruba syllable such as "fẹ́" is 3 tokens, so the word "afẹ́fẹ́" is 6 tokens. Any window under 7 blocks normal repeats of common words.

The same replay over the 3 logged English, Hausa and Igbo replies showed no changes at 10. That is a small sample.

**Result: did not fix it.** See section 7.

### 7. Yoruba loop fix, live re-test: FAIL, stopgap applied

Backend: a fresh Colab run (`breakfast-rom-released-replied.trycloudflare.com`) with the n-gram guard added to the loaded model by a patch cell.

**Guard active?** Yes, confirmed directly on the backend. "Write the word hello 25 times" returned 11 × "hello", then a forced "hi", then 9 more. A 10-token repeat was blocked exactly where expected.

**Re-test:** the same Yoruba prompt 12 times through SDK → gateway, max 200 tokens.

| | Runs | Full loop | Stutter ("fẹ́" ×3 or more) | Time |
|---|---|---|---|---|
| Before guard (section 6) | 11 | 1 | 2 | 11.4–19.6 s |
| With guard | 12 | 1 (run 9) | 3 (runs 4, 8, 9) | 7.5–17.3 s |

The guard blocks *exact* repeats, but the model escapes it by mutating the syllable. Run 9, verbatim excerpt:

> "…Nínú irú àyíká bẹ́ẹ̀, afẹ́fẹ́fẹ́fẹ́fúnni tí a fẹ́fẹ́fẹ́fúnfúnfúnfúnfúnfúnni tí afẹ́fẹ́fẹ́típẹ̀fẹ́fẹ́fẹ́ tí afẹ́fẹ́fẹ́tẹ́fẹ́fẹ́fụ́fẹ́fẹ́fẹ̀fẹ́fẹ́fẹnukonu le fa"

Run 4, verbatim excerpt: "…pẹ̀lú afẹ́fẹ́fẹ́fẹ́fọ́fẹ́fẹ́fẹ̀fẹ́fẹ́fẹ́."

Every failure in both runs starts at the word "afẹ́fẹ́" (air). The test prompt's likely misreading (section 6) steers replies towards weather and air, so it probably triggers that word unusually often.

The other 9 replies have no loop. They are fluent Yoruba, with mixed tone-mark use and off-topic content as before.

**Decision:**
- The fallback is applied: the Citizen Services language menu now lists Hausa first, live on site version `a5b4ade5`. Yoruba is still selectable.
- KI-2 stays open.
- The guard is still in the notebook and server. It did not measurably help, and it does change some output: forced word swaps such as "hello" → "hi" in deliberately repetitive text.

---

## Known issues

| ID | Issue | Status |
|---|---|---|
| KI-1 | Citizen Services: on a question outside the demo notes (Hausa airfare), N-ATLaS gave general advice instead of saying the notes don't cover it. It ignores the "answer only from the notes" system instruction. | Open. Tracked, not being fixed yet. |
| KI-2 | Yoruba chat can degenerate into repeated or mutated syllables around "afẹ́fẹ́" ("afẹ́fẹ́fẹ́…", "fúnfúnfún…"). Before the guard: 1 full loop and 2 stutters in 11 runs. With `no_repeat_ngram_size = 10`: 1 full loop and 3 stutters in 12 runs. | **Open.** The n-gram guard did not help. Stopgap: Citizen Services opens in Hausa (site version `a5b4ade5`); Yoruba is still offered. |
| KI-3 | Yoruba is the weakest language so far: most tone marks missing in chat replies, invented details, 74% WER on the one ASR clip, and the slowest chat (11–23 s vs 4–8 s for the other languages). | Known limitation of the current models; stated as a caveat. |
| KI-4 | The shared website demo key is not rate-limited. Per-IP limits are not built. | Open. Must be listed in the final pre-submission status. |
| KI-5 | Before the Customer Service demo goes live: the notebook can't decode browser voice recordings (webm), and it has no GPU lock, so two requests at once can overlap on the GPU. | Deferred until Customer Service. |
| KI-6 | The Colab notebook's chat reply has no token `usage` field, so the smoke test prints `undefined` for it. | Cosmetic. |
