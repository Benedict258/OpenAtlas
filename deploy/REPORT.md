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
- Fallback applied: the Citizen Services language menu lists Hausa first, live on site version `a5b4ade5`. Yoruba is still selectable.
- **The guard was tried and removed.** It made no measurable difference (1 loop in 11 runs before vs 1 in 12 with it; stutters 2 → 3), and it changes legitimately repetitive output: in the probe above, the model was forced to write "hi" instead of "hello". `natlas_colab.ipynb` and `deploy/server/natlas_server.py` are back to the earlier settings: temperature 0.1, repetition penalty 1.12, today's date in the template.
- **KI-2 is closed as a known model limitation.** Yoruba works, with a documented intermittent failure. Hausa is the default because of it. No further fixes are planned before submission. The untried options were a reworded prompt from a native speaker and a stronger single-token penalty.

### 8. `transcribe()` multi-clip evaluation: 80/90 transcribed; 10 failed on audio over 30 s

**Setup:**
- 90 real recordings with human reference transcripts, sent through SDK `transcribe()` → live gateway → Colab backend (`breakfast-rom-released-replied.trycloudflare.com`).
- Fetched by `dev/fetch-asr-eval.mjs`, taking evenly spaced rows across each split so the clips cover different speakers.
- Converted to 16 kHz mono WAV by `dev/resample-eval.py`, which is what Whisper uses internally anyway.
- Scored by `deploy/asr-eval.mjs`.
- WER is corpus-level: total word errors ÷ total reference words. It is reported twice:
  - with tone marks and other diacritics counted;
  - with them ignored.

**Caveats:**
- These are small samples (10–20 clips per source), not benchmarks.
- The NCAIR1 model cards state only that training used "publicly available datasets", so overlap with these public clips cannot be ruled out.
- No ASR WER is published on the model cards to compare against.

| Language | Source (split) | Clips transcribed | WER, marks count | WER, marks ignored | Median request time |
|---|---|---|---|---|---|
| ha | SilencioNetwork/hausa-speech-transcribed (test) | 17/20 | 41.1% | 41.1% | 4.8 s |
| yo | SilencioNetwork/yoruba-speech-transcribed (test) | 13/20 | 56.2% | 44.9% | 6.1 s |
| ig | str20tbl/igbosyncorp-igbo-asr-benchmark | 20/20 | 101.1% | 60.5% | 1.8 s (all Igbo) |
| ig | deepdml/igbo-dict-16khz | 10/10 | 26.2% | 23.0% | |
| en-ng | benjaminogbonna/nigerian_accented_english_dataset (test) | 20/20 | 26.3% | 26.3% | 2.1 s |

**What the numbers mean:**
- **Hausa and Yoruba are worse than the one-clip spot checks suggested.** Hausa is 41% across 17 clips, against 26% on the single clip in section 4. These are conversational, free-speech recordings, 20–30 s long.
- **Yoruba:** about 11 points of its 56% come from tone marks alone, as the gap to 45% shows.
- **IgboSynCorp:** its references mark the tone of every syllable (e.g. "ẹ̀ẹ̀ ǹdéēwó nụ̀"). The model writes ordinary Igbo spelling ("ee, ndị ewu nri"), so with marks counted almost every word is wrong (101%). With marks ignored it is 60.5%. Its multi-dialect speech is also hard.
- **Igbo dictionary set:** short single sentences, so it is much easier (23–26%).
- **Nigerian English: 26%.** The errors are mostly near-misses, e.g. "Oil Rivers" → "oil reverse".

**Failure found: audio over 30 seconds.** All 10 clips longer than 30 s failed with HTTP 500. That's 3 Hausa clips (30.3–44.1 s) and 7 Yoruba clips (37.9–122.6 s). Every clip of 30 s or less succeeded.
- **Cause:** the backend log shows the notebook passes the audio to Whisper without chunking. Recent transformers versions then raise `ValueError: You have passed more than 3000 mel input features (> 30 seconds)…`.
- **Fix:** `chunk_length_s=30`, which `deploy/server/natlas_server.py` already had. It is now added to `natlas_colab.ipynb`; on the running session it needs the patch cell. The long clips will be re-run after the fix (section 9).

**A second problem found on the same failures:** the gateway reported the backend's 500 as `503 backend_unavailable` ("not serving right now"), and the SDK retried the upload. The fix:
- The gateway now maps a backend 500 to `502 backend_error`.
- The SDK retries only 503 and network errors.

Verified locally: the SDK test suite (23/23) and the gateway mock suite (12/12). Against a throwaway server that always returns 500, the request was sent once, with an accurate message.

**SDK changes from the same review:**
- `transcribe()` accepts a `Blob`/`File`, such as a browser recording.
- It rejects empty audio, and audio over the ~7 MB limit, before uploading. The error message suggests compressed or 16 kHz mono audio.
- Raw 48 kHz WAV reaches the limit at about 75 s; the largest Yoruba clip was 23.5 MB in its original form.

## 2026-10-03

Backend: the **same Colab kernel as 2026-10-02** (the traceback shows `ipykernel_5444`), with a new tunnel (`offerings-country-alternatively-walls.trycloudflare.com`). It is not a fresh run of the repo notebook. Its server cell still calls the ASR pipeline without chunking; chunking was added only through the patch cell. Gateway versions: error handling `847daa0a`, then attribution `4f9461f8`.

### 9. Long-clip re-test: FAIL, 0/10; transcription broken on this backend

| Check | Result |
|---|---|
| The 10 clips over 30 s (3 Hausa, 7 Yoruba) | **0/10.** All returned HTTP 500 from the backend. |
| One short clip per language (2.1–26.7 s), all of which transcribed on 2026-10-02 | **0/4.** HTTP 500. |
| An 8.8 s English clip | HTTP 500 |

**Cause, from the Colab traceback:**
- The ASR patch cell was run twice, so each pipeline was wrapped twice, and the outer wrapper passed `chunk_length_s` into the inner one.
- Every call then failed with `TypeError: AutomaticSpeechRecognitionPipeline … got multiple values for keyword argument 'chunk_length_s'`, including short clips.
- This was a fault in the patch cell (it was not safe to re-run), not in chunking itself. **Chunking has not been tested yet.**
- **KI-7 stays open** until the long clips are re-run with a single, correct wrapper.

**KI-9 confirmed live:** each failure came back as `502 backend_error` ("The N-ATLaS backend failed on this request (HTTP 500)"), not "not serving", and was not retried.

### 10. Education starter kit against live N-ATLaS: PASS, with a quality note

Run as the standalone kit (`starter-kits/education`, local server) → SDK → live gateway. The browser test (headless Chrome, 1280 px) passed 7/7:
- no mock badge;
- the language menu starts with Hausa;
- Hausa/primary explanation shown;
- "Report a wrong answer" offered;
- English/secondary explanation shown;
- the correction box opens;
- the correction is stored through `reportIssue()` (id `3deb2ce7…`).

| Language / level | Question | Time | Reply, verbatim or excerpt |
|---|---|---|---|
| ha / primary | Me yasa ruwan sama yake sauka? | 11.3 s | "Ruwa yana saukowa ne saboda gajimare a cikin sararin sama sun yi girma sosai har suka kama iskar da ke tashi. Wannan iskar tana dauke da danshi ko ruwa mai digo. Lokacin da wadannan gajimaren suka hadu, suna hade su zuba ruwan sama. Don haka, ruwan sama yana faruwa lokacin da gajimaren da aka taru a saman juna suka bar ruwan sama ya fado kasa." |
| en / secondary (browser) | What is photosynthesis? | 15.4 s | "Photosynthesis is how plants make their own food from sunlight. It's like a superpower that helps them survive! … they turn these two things into a yummy, sweet drink called glucose …" |
| en / secondary (API, repeat) | What is photosynthesis? | 16.7 s | Same framing ("like a magic power", "a yummy, sweet drink called glucose"), plus a word equation. |
| en / primary (API) | What is photosynthesis? | 4.7 s | "Photosynthesis is how plants make their own food from sunlight! Just like you eat food to have energy, plants use sunlight to make their food. They use this food to grow big and strong." |

The level does change the answer: primary is much shorter and simpler. But the secondary answer is still pitched at young children, and it calls glucose "a sweet drink", which is wrong. Logged as KI-10.

A live chat also confirmed the new response fields: `model: "NCAIR1/N-ATLaS"`, `attribution: "Powered by Awarri"`.

### 11. Long-clip re-test with 30 s chunking: 10/10 transcribed (KI-7 fixed); long audio loses words

Backend: a fresh Colab run (`figure-changelog-inc-granted.trycloudflare.com`), with ASR chunking applied once (`chunk_length_s=30, batch_size=8`).

**Short clips first, to confirm transcription works again:** 4/4 OK, one per language (2.1–26.7 s, 1.8–5.8 s each). The transcripts match those from 2026-10-02.

**The 10 clips over 30 s: 10/10 transcribed, no errors.**

| Clip | Audio | Time | WER | Words, reference → transcript |
|---|---|---|---|---|
| ha-12 | 30.5 s | 8.6 s | 25% | 56 → 55 |
| ha-26 | 30.3 s | 5.4 s | 55% | 40 → 42 |
| ha-29 | 44.1 s | 7.9 s | 68% | 131 → 57 |
| yo-2 | 38.3 s | 8.1 s | 71% | 99 → 89 |
| yo-14 | 37.9 s | 8.6 s | 81% | 90 → 35 |
| yo-17 | 54.3 s | 9.8 s | 55% | 95 → 58 |
| yo-19 | 48.2 s | 16.7 s | 45% | 182 → 144 |
| yo-34 | 122.6 s | 24.1 s | 65% | 332 → 213 |
| yo-44 | 89.3 s | 22.1 s | 77% | 254 → 153 |
| yo-46 | 90.6 s | 39.6 s | 51% | 215 → 142 |

Corpus WER for these long clips: Hausa 55.1% (3 clips); Yoruba 63.0%, or 54.2% ignoring tone marks (7 clips). Both are worse than the same languages' clips of 30 s or less in section 8 (41.1% and 56.2%).

**Finding: long audio loses words.**
- For clips of 30 s or less (section 8, Hausa and Yoruba), the transcript has a median 91% as many words as the reference.
- For clips longer than about 37 s, it has only 39–79%. Whole stretches of speech are missing, not just misrecognised.
- The cause is not established. Candidates are the chunking boundaries (the default overlap between chunks), and the fine-tuned models skipping speech in long free-form recordings.
- Logged as KI-11. **For now, the reliable range for `transcribe()` is up to about 30 s per request.**

### 12. Education demo switched on for the website: PASS

`site/live-kits.mjs` now lists Citizen Services and Education; Customer Service stays paused. Live on site version `8f7352f8`.
- `/kits/education.js` is served (200).
- One paused window remains, Customer Service.
- Browser test on the live site at 390 px phone width: 7/7, the same checks as section 10. The correction was stored (`b1d05df1…`).

| Language / level | Time | Result |
|---|---|---|
| ha / primary | 13.3 s | The same sensible explanation of rainfall as section 10 |
| en / secondary | 35.2 s | This time a genuinely secondary-level answer: stomata, roots and the photosynthesis equation. The equation is printed as "6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + O₂", missing the 6 before O₂. Earlier runs gave a young-child register (section 10). |

So the level framing varies from run to run, and the answers can contain factual slips. KI-10 is reclassified as a **content-accuracy limitation** of the model, not a bug to chase.

### 13. KI-11 check: is audio lost at chunk boundaries, or by the model? Mostly the chunker

**The one bounded check:** the 6 long clips with the largest word loss were split locally into plain 25 s pieces, with no overlap. Each piece was sent as its own `transcribe()` call, so the backend never chunks anything. The joined transcripts were compared with the backend-chunked run in section 11. Script: `deploy/asr-split-check.mjs`.

| Clip | Audio | Reference words | Backend-chunked: words (ratio), WER | Split into 25 s pieces: words (ratio), WER |
|---|---|---|---|---|
| ha-29 | 44.1 s | 131 | 57 (0.44), 68% | **123 (0.94), 22%** |
| yo-14 | 37.9 s | 90 | 35 (0.39), 81% | **75 (0.83), 47%** |
| yo-17 | 54.3 s | 95 | 58 (0.61), 55% | **94 (0.99), 23%** |
| yo-34 | 122.6 s | 332 | 213 (0.64), 65% | 209 (0.63), 67% |
| yo-44 | 89.3 s | 254 | 153 (0.60), 77% | 186 (0.73), 70% |
| yo-46 | 90.6 s | 215 | 142 (0.66), 51% | 182 (0.85), 58% |

**Verdict: mostly a fixable chunking bug.**
- For the 38–54 s clips, simple splitting recovers nearly all the words and cuts WER from 55–81% to 22–47%. So the backend's chunked pipeline (`chunk_length_s=30, batch_size=8`) is dropping speech the model can transcribe.
- On the three 89–123 s recordings, splitting helps less, or not at all (yo-34). There, some loss also comes from the model or the recordings themselves.
- Not pursued further at the time. The likely fix is to split long audio into ≤30 s pieces on the server, instead of using the pipeline's chunked mode. Until that is done and verified, **30 s per request is the documented reliable limit.**

### 14. README quickstart, run exactly as published: PASS

`examples/quickstart.mjs` is the README quickstart. It was run with only `OPENATLAS_API_KEY` set, so the SDK's default gateway URL was tested too.
- **Time:** 6 s.
- **Output:**
  - `normalizeText()` repaired "zaÉ“e" → "zaɓe".
  - The reply, in Hausa: "Don yin rijistar katin zabe, ya kamata ku ziyarci ofishin zabe na gida a unguwar ku ko jihar ku."
  - `NCAIR1/N-ATLaS, Powered by Awarri`.

**Bug found on the first attempt:** an *empty* `OPENATLAS_BASE_URL`, common in `.env` templates, stopped the SDK falling back to the hosted gateway ("Missing gateway URL"). Fixed: empty environment variables now count as unset. New unit test; SDK tests 24/24.

### 15. Customer Service, step 1 and step 3 backend fixes: built and tested locally, **not yet live**

The changes are in `natlas_colab.ipynb` and `deploy/server/natlas_server.py`, commit `998a946`:
- **Splitting (KI-11):** the ASR pipeline's `chunk_length_s` mode is replaced by explicit plain 25 s pieces, the method that recovered words in section 13. A leftover under 2 s joins the last piece.
- **Decoding:** all audio goes through ffmpeg, so webm/opus and m4a work. Before, soundfile could not read browser recordings.
- **GPU lock:** one lock serialises chat generation and ASR.
- **Request handling:** the transcription endpoint is a plain `def`, so it runs off the event loop.

**Local test with stub models** (no model involved; real ffmpeg decoding of real audio): 7/7.
- A 122.6 s Yoruba clip as wav, webm (opus), m4a (aac) and mp3: each decodes, and splits into 5 pieces of 25/25/25/25/22.6 s.
- A 51 s clip gives pieces of 25 s then 26 s. A first version of the leftover merge overwrote the *first* piece; this test caught it before it shipped.
- Undecodable bytes give 400 "Could not decode this audio".
- 3 chat and 3 transcription requests fired at once: the GPU stubs never overlapped (maximum 1 concurrent job).

**Live status:** the running Colab (`figure-changelog-inc-granted…`) is still the previous version. A direct transcription response has no `pieces` field. The live six-clip re-test, the webm test and the concurrency test wait for a fresh Colab run of this version.

### 16. Customer Service, step 2: recorder with the 30 s rule, tested against the MOCK backend, **not yet live**

The changes are in `starter-kits/customer-service`, commit `cf4c326`:
- Recording stops itself at 30 s, with a countdown.
- Every note is converted in the browser to 16 kHz mono WAV.
- Notes over 30 s are cut into plain parts of up to 25 s, and the review step warns about this before anything is sent.
- Uploads over 2 minutes are refused.
- The kit transcribes each part, then drafts once from the joined transcript.

**Browser test, headless Chrome with a fake microphone, against the mock backend** (UI logic only, no N-ATLaS): 10/10.
- A 90.6 s upload: the review says "4 parts … only reliable on 30 s at a time".
- A 51 s upload gives 2 parts; a 20 s upload gives one clip, with no warning.
- A 130 s upload is refused.
- Recording shows a countdown ("28 s left") and stopped itself at 29.9 s, staged as one clip.
- Nothing is sent before "Send voice note".
- Sending made exactly one request, carrying 2 WAV pieces. The mock transcribed both, and the draft came back with "Powered by Awarri".

---

## Known issues

| ID | Issue | Status |
|---|---|---|
| KI-1 | Citizen Services: on a question outside the demo notes (Hausa airfare), N-ATLaS gave general advice instead of saying the notes don't cover it. It ignores the "answer only from the notes" system instruction. | Open. Tracked, not being fixed yet. |
| KI-2 | Yoruba chat can degenerate into repeated or mutated syllables around "afẹ́fẹ́" ("afẹ́fẹ́fẹ́…", "fúnfúnfún…"). Without the guard: 1 full loop and 2 stutters in 11 runs. With `no_repeat_ngram_size = 10`: 1 full loop and 3 stutters in 12 runs. | **Closed as a known model limitation.** The n-gram guard was tried and removed. Citizen Services opens in Hausa (site version `a5b4ade5`); Yoruba is still selectable, with this caveat. |
| KI-3 | Yoruba is the weakest language so far: most tone marks missing in chat replies, invented details, 74% WER on the one ASR clip, and the slowest chat (11–23 s vs 4–8 s for the other languages). | Known limitation of the current models; stated as a caveat. |
| KI-4 | The shared website demo key is not rate-limited. Per-IP limits are not built. | Open. Must be listed in the final pre-submission status. |
| KI-5 | Before the Customer Service demo goes live: the notebook can't decode browser voice recordings (webm), and it has no GPU lock, so two requests at once can overlap on the GPU. | Deferred until Customer Service. |
| KI-6 | The Colab notebook's chat reply has no token `usage` field, so the smoke test prints `undefined` for it. | Cosmetic. |
| KI-7 | `transcribe()` failed (HTTP 500) on every clip over 30 s: Colab notebook without chunking. | **Fixed.** With `chunk_length_s=30`, 10/10 long clips transcribe (section 11). The earlier 0/10 was a patch cell run twice (section 9). |
| KI-8 | ASR accuracy on conversational speech is modest: corpus WER Hausa 41%, Yoruba 56% (45% ignoring tone marks), Igbo 60–101% on a tone-marked multi-dialect benchmark, Nigerian English 26% (section 8). | Known limitation of the models; stated as a caveat. |
| KI-9 | The gateway reported a backend 500 as `503 backend_unavailable`, and the SDK retried it. | **Fixed.** Deployed; confirmed live on 2026-10-03 (`502 backend_error`, not retried). |
| KI-10 | Education kit: the level framing varies from run to run (a secondary answer sometimes comes back in a young-child register), and answers can contain factual slips: glucose as "a sweet drink"; O₂ missing its coefficient in the photosynthesis equation. | **Content-accuracy limitation of the model.** Documented, not being chased. |
| KI-11 | Audio longer than about 30 s transcribes, but loses words: transcripts are 39–79% of reference length on clips over ~37 s, against a median 91% for clips of 30 s or less. | **Mostly a chunking bug** (section 13): splitting into plain 25 s pieces recovers most words on 38–54 s clips. Not fixed. Documented limit: 30 s per request. The Customer Service recorder must enforce or split at 30 s. |
