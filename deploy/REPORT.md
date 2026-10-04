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
- Not pursued further, as agreed. The likely fix is to split long audio into ≤30 s pieces on the server, instead of using the pipeline's chunked mode. Until that is done and verified, **30 s per request is the documented reliable limit.**

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

### 17. Customer Service go-live checks on the new backend: 4/4 steps PASS

Backend: a fresh Colab run of `natlas_colab.ipynb` at commit `998a946` (`synthetic-occupations-dragon-specialist.trycloudflare.com`). Confirmed to be the new version: a direct transcription response carries `"audio_seconds"` and `"pieces"`. The steps were run in the agreed order, each gated on the one before.

**Step 1: the six worst long clips, with server-side 25 s pieces: PASS.** The results are word for word what the manual split gave in section 13:

| Clip | Audio | Words kept: `chunk_length_s` (§11) → server pieces | WER: §11 → server pieces |
|---|---|---|---|
| ha-29 | 44.1 s | 57 → **123** of 131 | 68% → **22%** |
| yo-14 | 37.9 s | 35 → **75** of 90 | 81% → **47%** |
| yo-17 | 54.3 s | 58 → **94** of 95 | 55% → **23%** |
| yo-34 | 122.6 s | 213 → 209 of 332 | 65% → 67% |
| yo-44 | 89.3 s | 153 → 186 of 254 | 77% → 70% |
| yo-46 | 90.6 s | 142 → 182 of 215 | 51% → 58% |

- The chunker's word loss is gone for 38–54 s clips.
- The 89–123 s recordings still lose words with clean pieces too, as section 13 found. That part is the model on very long free speech.

**Step 2: webm (and m4a) decoding: PASS.**
- **Clips:** two real clips (Hausa 26.7 s, Nigerian English 7.5 s) converted to webm/Opus (what Chrome and Firefox record) and m4a/AAC (what Safari records), then sent directly to the backend.
- **Result:** all 4 decoded and transcribed. The transcripts match the WAV ones; the only difference is one Hausa word ("ka ce" vs "kake") on the webm, from Opus compression.
- **Through the public path:** webm sent as a `Blob` via SDK → gateway took 5.4 s and returned `model: "NCAIR1/Hausa-ASR"` with `attribution: "Powered by Awarri"`.

**Step 3: GPU lock under concurrent requests: PASS** (script: `deploy/concurrency-check.mjs`).
- **Concurrent:** 3 chats and 3 transcriptions (90.6 s, 51 s, 7.5 s of audio), fired at the backend at the same moment. All 6 returned HTTP 200, and the backend stayed healthy.
- **Sequential:** the same 6 requests one at a time took **41.3 s** of model time in total.
- **Comparison:** fired together, they finished in **42.6 s**, against a longest single request of 16.1 s. So the lock queued them. Had they shared the GPU, the total would have been near 16 s.
- **Side finding:** the notebook's `latency_seconds` starts timing before the lock is acquired, so under load it includes queueing time.

**Step 4: Customer Service switched on and tested end to end on the live site: PASS.**
- `LIVE_KITS = ["citizen", "education", "support"]`, site version `a34f9d40`. No paused windows remain, and `/kits/support.js` serves the new recorder.
- **Browser test** (headless Chrome, fake microphone, live site, real N-ATLaS): 10/10.
  - The 90.6 s upload warns "4 parts"; 51 s gives 2 parts; 20 s gives one clip with no warning; 130 s is refused.
  - Recording shows a countdown and stopped itself at 29.8 s.
  - Nothing is sent before "Send voice note".
  - Sending a 51 s Yoruba note made 1 request carrying 2 WAV pieces. Status: "Done: NCAIR1/Yoruba-ASR (2 parts) → NCAIR1/N-ATLaS. Powered by Awarri."
  - Transcript (excerpt): "akú dídìwò ìbíré mi ni ṣé o jẹ́ ènìyàn tó máa ń ṣe ètò ǹkan bẹ́ẹ̀mì, mo jẹ́ nìyàn tó máa ń ṣètò ǹkan …". It is partly garbled, consistent with Yoruba WER.
  - Draft: "Kategori: ibaraẹnisọrọ | Ipele Pataki: kekere | Idahun Ibeere: O ṣeun fun pinpin awọn iriri ati ero rẹ. …". The format labels were translated into Yoruba, and the category is not one of the allowed five.
- **Hausa single clip** via the live site API (26.7 s), 11.3 s:
  - Transcript: "wane wasa kake son yi? akwai wasan da nake son yi wannan wasa kuma shi ne wasan ɗere-tseren doki, …".
  - Draft: "Category: other / Urgency: low / Draft reply: Ina matukar sha'awar wasannin tsere na dawaki, …". The format was followed, but the "reply" restates the customer's own words ("I'm very interested in horse racing…") instead of answering them.
- **Correct this transcript, with audio,** via the live site API: stored (`c971a126…`, 1.9 s, `audio_included: true`). The operator export shows `has_audio: 1`.

### 18. System prompts: does a structured prompt layer improve instruction-following?

**Question.** KI-1, KI-10 and KI-12 are all cases of N-ATLaS not following the kit's instructions. Does a defined, structured system prompt measurably fix them, compared with each kit's free-form prompt?

**Method** (script: `deploy/prompt-eval.mjs`; raw replies: `deploy/prompt-eval-results.jsonl`, gitignored).
- **Backend:** the live gateway and the real N-ATLaS, on the same Colab backend (`synthetic-occupations-dragon-specialist…`), 2026-10-03. Temperature 0.1, the gateway default.
- **Variants:**
  - **A:** each kit's previous prompt.
  - **B:** a structured prompt: a shared base layer (role; rules: follow the task, reply language, keep format labels in English, don't guess; be concise), plus the kit's own sections (task, reference notes, output format, one example).
  - **C to H:** variations on B, to find out *why* B helped or failed (listed in the script header).
- **Same input for every variant:** the same inputs, the same `chat()` path, and the same `user` ID.
- **Scoring:**
  - Customer Service is scored automatically: three English labels, an allowed category and urgency, and the category matching the one I expected.
  - Citizen Services and Education replies were read and scored by me, with a fixed rubric for out-of-scope questions:
    - **clean** says the notes don't cover it and adds no named outside sources or facts;
    - **partial** declines but names outside sources;
    - **fail** answers from outside knowledge.
- **Sample size:** small, 10 Customer Service inputs, 10 Citizen Services questions and 6 Education prompts per variant. Differences of one or two cases are within noise. Replies at temperature 0.1 are *not* fully deterministic: the same Yoruba draft came back with different wording in two runs.

**Customer Service (KI-12): large, consistent improvement.** Inputs:
- two real transcripts behind KI-12 (Yoruba, Hausa);
- eight written complaints, two per language (en, ha, yo, ig), with an obvious category each.

| Variant | Format followed (English labels, allowed values) | Category as expected | Reply in the customer's language |
|---|---|---|---|
| A (previous prompt) | 3/10 | 3/10 | — |
| B structured | 6/10 | 6/10 | — |
| C = B without the gateway's trailing "Respond in X." | 8/10 | 7/10 | 9/10 |
| D = C + format reminder after the message | **10/10** | 8/10 | 9/10 |
| **E** = D, reminder also names the reply language | **10/10** | 6/10 | **10/10** |

What caused the failures:
1. In Yoruba and Igbo, the model translated the format labels ("Kíláàsì:", "Ẹka:", "Nkeji:", "Uru:"), and in Hausa it once put all three fields on one line. The gateway's "Respond in Yoruba." is the *last* line of the system prompt, and the model followed it over the format: removing it (C) fixed most of the label translation.
2. Repeating the format after the customer's message (D) fixed the rest.
3. Without the language line, one English complaint was answered in Igbo (C and D). Naming the language in the reminder (E) fixed that.

Category accuracy stays model judgment. "I paid … but it hasn't arrived" was classed as billing rather than delivery in E (4 misses). Drafts in B to E answer the customer rather than restate them, apart from one copied example: B's Yoruba draft repeated the example's "I paid for my order last week".

**Citizen Services (KI-1): fixed, with a language trade-off found and resolved.** Inputs:
- six questions the notes don't cover: airfare in ha, yo and ig; a licence fee; a hospital; a farm loan;
- four questions they do cover: voter registration, passport, NIN, BVN.

| Variant | Out-of-scope: clean / partial / fail | In-scope answered from notes | Reply in the asked language |
|---|---|---|---|
| A (previous prompt) | 1 / 1 / 4 | 4/4 | 10/10 |
| B structured, English example | **6 / 0 / 0** (same in a repeat run) | 4/4 | 8/10: both Hausa declines in English |
| E = B + reminder, no gateway language line | 6 / 0 / 0 | 4/4 | 7/10 |
| F = B without the example | 4 / 1 / 1 | 4/4 | 10/10 |
| G = marker "NOT_IN_NOTES" instead of a written decline | 6 / 0 / 0 | **2/4**: declined voter registration and passport | — |
| **H** = B with the example reply in the reply language | **5 / 0 / 1** | 4/4 | **10/10** |

Findings:
- **Under the previous prompt**, A gave airline-search advice for airfare, an invented list of "best hospitals in Abuja", and named FMARD and Jaiz Bank for farm loans.
- **The one example decline drives clean declines**, and it also drags the decline into its own language. Without it (F), the outside advice comes back: Travelstart.com for airfare, FMARD for farm loans. With an English example (B, E), Hausa declines come back in English. Written in the reply language (H), the declines are clean and in the right language. The one remaining failure is the Hausa farm-loan question, answered from outside knowledge.
- **Correction to an interim figure:** an early "F" run sent B's prompt by mistake (a script bug ignored the option). It was relabelled `B-repeat` in the results file, and F was re-run. Under the rubric above, the real F run scores 4/1/1; I had reported "2 clean, 3 partial" mid-run before fixing the rubric.

**Education (KI-10): no measurable improvement; not changed.** Three questions (two English, one Hausa) at both levels, A vs B.
- **Better:** B fixed the reproduced KI-10 case. The secondary photosynthesis answer under A was again "a magic power … a yummy, sweet drink called glucose"; under B it was teen-level, with the correct balanced equation.
- **Worse:**
  - B's primary answer for fractions used "numerator/denominator" despite "no technical terms";
  - its secondary fractions answer got *shorter* (82 words, below the 120 asked);
  - its secondary photosynthesis answer ran to 305 words (cap 250);
  - its primary photosynthesis answer still had "a yummy, sweet drink called glucose".
- **Conclusion:** the level framing is not measurably more reliable under B. The Education kit keeps its prompt, and KI-10 stays a content-accuracy limitation.

**What was built.**
- **The layer lives in the SDK,** not the gateway: `buildPrompt(spec, input)` and `systemPrompt(spec)` in `packages/sdk/src/prompt.ts`.
  - OpenAtlas supplies the base layer (role line, rules, reply language).
  - Each app passes its own `role`, `task`, and optional `reference`, `format`, `example` and `reminder`.
  - **Why the SDK:** developers can see and test the exact prompt; kits can extend it; and the gateway keeps passing messages through unchanged.
  - The doc comments carry the two measured cautions: examples are copied closely, including their language; and drop `language` when the format has fixed labels.
  - 5 unit tests; SDK suite 29/29.
- **Citizen Services** uses variant H. **Customer Service** uses variant E, calling `chat()` without `language`.
- **Checked** byte for byte against the evaluated prompts, by capturing what each kit's code sends (8/8 identical).

**Known-issue cases re-run through the kits' own code** (`deploy/prompt-known-issues.mjs`), live gateway, real N-ATLaS:
- **KI-1, Hausa airfare** (5.8 s, same in two runs): "Yi hakuri, bayanan da nake da su bai kunshi bayani kan kudin tikitin jirgin sama daga Kano zuwa Legas ba, don haka ba zan iya amsa wannan ba." A clean decline, in Hausa. **Fixed for this case.**
- **KI-12, Yoruba 51 s voice note** (real audio, speech recognition then draft, 15–19 s): "Category: other / Urgency: low / Draft reply: …". English labels, allowed values, in Yoruba. **Format fixed.**
  - The draft's wording varied between the two runs ("we will address your questions quickly" / a vaguer line).
  - The transcript itself is garbled (KI-8), so there is little to answer.
- **KI-12, Hausa 26.7 s voice note** (15.9 s): "Category: Other / Urgency: Low / Draft reply: Muna godiya da sha'awar ku ga wasannin tsere na dawaki. Za mu iya taimaka muku …". It answers rather than restating the customer. **Fixed for this case.**

**Not yet deployed:** the website's demos still run the previous prompts until the site is redeployed.

**Not checked by a native speaker:** the Hausa, Yoruba and Igbo example declines in the Citizen Services kit were written by the developer.

### 19. Speech output (`speak()`): built and stub-tested; real-model check pending

**What was built.** A separate, final-stage renderer: it turns text N-ATLaS has already written into audio.
- **Backend:** `deploy/server/tts_renderer.py`.
  - It receives only the HTTP app, the API-key check and the GPU lock, and has no access to the N-ATLaS models.
  - Engines:
    - **SoroTTS** (`Shinzmann/sorotts`, a LoRA adapter on `hypaai/hypaai_orpheus_v5` + SNAC; yo/ha/ig/pcm; loaded in 4-bit to fit beside N-ATLaS on a T4);
    - **MMS-TTS** as the fallback and for English: `facebook/mms-tts-{eng,hau,yor,pcm}`. For Igbo it uses `Shinzmann/soro-tts-ibo`, because `facebook/mms-tts-ibo` is not publicly available (HTTP 401).
  - One sentence per generation, joined with 0.25 s of silence. The GPU lock is released between sentences, so chat and speech-recognition requests can interleave.
- **Notebook:** `natlas_colab.ipynb` section 7b, two new cells behind `ENABLE_TTS`. They attach to the running server; the notebook diff is additions only.
- **Gateway:** `POST /v1/audio/speech` behind `TTS_ENABLED` (default `"false"`).
- **SDK:** `speak()` with the same typed errors as `chat()` and `transcribe()`.
- **Customer Service kit:** "Play response audio", which speaks only the draft's "Draft reply:" text. It is shown only when the site's `LIVE_SPEECH` switch is on *and* the gateway reports the renderer ready.

**Checked:**
- **Stub test of the renderer:** 18/18, with the real FastAPI routing and stand-in engines. Covered: auth, validation, `auto` routing per language, fallback with its reason, valid WAV output (rate, channels, duration), sentence splitting, safe re-install, `/health` merging, and the SNAC frame layout.
- **SDK:** 3 new unit tests; the suite is 32/32.
- **Live gateway with TTS off** (version `ecdd7525`): `speak()` returns `404 tts_disabled` as a typed error, and `chat()` is unaffected (1.6 s).

**Not yet checked:** real models, real audio. This needs the TTS cells run in Colab. Then `deploy/tts-check.mjs` will:
1. take N-ATLaS's own reply in each language;
2. render it with both engines;
3. save the WAVs;
4. send each one back through the N-ATLaS ASR model, as an intelligibility check (WER against the spoken text).

### 20. API keys: audited, then limits and revocation built (tested locally; live migration not applied)

**What existed (live D1, 2026-10-03 02:3x UTC):**
- **Keys:** two, `owner-testing` (348 requests) and `website-demos` (26 requests), both with no limits. One key request had been made, and it was declined.
- **Issuance:** the request form, then `deploy/key-requests.mjs` (approve prints the key once), plus `POST /v1/admin/keys`.
- **Usage:** `/v1/usage` counted active users per key, but requests only in total.
- **Revocation:** the `revoked_at` column was honoured, but nothing could set it.
- **Rate limiting:** none (KI-4).

**Built:**
- **Per-key limits:**
  - a daily request quota (`429 key_quota_exceeded`; refused requests don't count);
  - a per-key share of the license cap (`429 key_user_share_reached`; existing users continue).
- **Defaults for new keys:** 1,000 requests a day and 100 users.
- **Admin endpoints:** list keys with usage per route, revoke with a reason, and set limits. `deploy/keys.mjs` wraps them, with a Markdown `report` intended as beta-tester evidence.
- **Website:** a per-IP limit on the demos and the request form, 10 POSTs a minute (Workers Rate Limiting binding; recognized in a wrangler dry run).
- **Database:** an additive migration, `gateway/migrations/0001_key_limits.sql`.

**Checked locally** (wrangler dev, a throwaway D1 created from the *old* schema and then migrated, mock backend): 13/13.
- issue with defaults;
- the 4th distinct user refused while existing users continue;
- the 6th counted request refused;
- removing a limit restores access;
- the list and the report;
- revoke → 401; revoking twice → 409; invalid limit → 400;
- `/v1/usage` per key.

The existing gateway end-to-end suite also passed on a fresh database from the new schema: 12/12.

**Not applied live:** running the migration on the live D1 was refused by the session's permission check (a production database change). The new gateway code reads the new columns, so it must not be deployed before the migration. The live gateway stays on `ecdd7525`.

### 21. npm: `@openatlas/sdk` prepared, not published

- **Rename:** the package is now `@openatlas/sdk`, with `publishConfig.access: public` and `prepublishOnly: npm test` (the test script builds first).
  - **Name check:** the registry has no `@openatlas/sdk` and no packages under the `@openatlas` scope. Whether the org *name* is free can only be confirmed when the org is created on npmjs.com.
- **Publish gate:**
  - with a deliberately failing test added, `npm publish --dry-run` stopped with exit 1 ("fail 1") before packing;
  - restored, it packed `@openatlas/sdk@0.1.0`: 15 files, 11.9 kB, shasum `4e189fef…`, public access.
- **Clean install of that exact tarball** (same shasum) into an empty folder outside the repo, with only `OPENATLAS_API_KEY` set:
  - installed;
  - `buildPrompt()` works from it;
  - `speak()` returned the typed `404 tts_disabled` from the live gateway.
- **Not yet run:** the quickstart's real answer. It returned `503 backend_unavailable`, because the Colab tunnel had gone down (Cloudflare 1033, about 02:33–02:45 UTC). To re-run once a backend is up.

**Published 2026-10-03 12:28:32 UTC: `@openatlas/sdk@0.1.0`** (npm org `openatlas`, owner `benedict258`).
- **Gate:** the publish ran the full test suite first (32/32).
- **First attempt:** refused with `403`, because publishing needs 2FA or a token that bypasses it. The second attempt used the account's `NPM_TOKEN` and succeeded.
- **Placeholder:** for a new package name, npm first published a `0.0.0-stage` placeholder (12:27:37 UTC), then `0.1.0` a minute later. `latest` now points to 0.1.0.
- **Registry match:** the registry checksum is `4e189fef…`, the same tarball as the dry run and the clean-install check above.
- **Install from the public registry:** `npm install @openatlas/sdk` in a new empty folder installs 0.1.0, and all exports load.
- **Still pending:** the real-answer quickstart from this install. The backend is still down.

### 22. Deploy Your Own: documented

- **Guide:** `docs/deploy-your-own.md`, plus a "Deploy your own" section on the website's docs page (checked at 1280 px and 390 px, with no sideways scroll). It covers the proven Colab path, any other GPU host, and RunPod Serverless.
- **One-command gateway setup:** `deploy/setup-gateway.mjs`. Checked with `--dry-run` only (it prints every step and touches nothing); not yet run against a fresh Cloudflare account.
- **RunPod facts found while writing it:**
  - no endpoint has ever been created;
  - the ASR image (`ghcr.io/benedict258/openatlas-asr:latest`, CI build of 2026-10-02) is anonymously pullable (manifest HTTP 200);
  - but `workers/asr/handler.py` still uses `chunk_length_s=30`, the chunking that lost words in KI-11. This is stated in the guide; the worker code was not changed.

### 23. Push, site redeploy, and a Kaggle copy of the backend notebook (2026-10-03)

- **Pushed** `79b3a25`, `2adfa79`, `73b22a2` to `main` (`503f296..73b22a2`).
- **Website redeployed** (version `57c63aca`). It now carries the structured kit prompts, the "Deploy your own" docs section, the `@openatlas/sdk` name on the docs page, and the per-IP rate limit. Checked live:
  - the docs page has the new section, the install line and the `speak()` status;
  - `/api/status` returns `{"mock":false,"speech":false}`;
  - exactly one "Play response audio" control exists in the Customer Service window, hidden while speech is off.
- **The per-IP limit works, but loosely.** It was tested with POSTs the kit rejects before any model call (empty question, HTTP 400):
  - 12 sequential requests: all 12 got through;
  - then 40 parallel requests: 21 got through, 19 were refused with `429`;
  - so about 33 got through in one minute against a configured 10.

  Cloudflare documents these counters as approximate and per location. The limit slows abuse; it is not a hard cap.
- **Gateway not redeployed:** it stays on `ecdd7525` until the live database migration (section 20) is applied.
- **Backend:** still down (Colab tunnel unreachable). The Colab GPU quota has run out, so hosting is moving to Kaggle, which was your call. `deploy/colab/natlas_kaggle.ipynb` was generated from `natlas_colab.ipynb`.
  - Only cells 0, 4, 14 and 19 and the notebook metadata differ. Cell 4 now reads its secrets with `kaggle_secrets.UserSecretsClient().get_secret(...)`.
  - All code cells parse.
  - Cell 4 was run against a stand-in `kaggle_secrets` module: it loads both secrets, and gives a clear message when one isn't attached.
  - **Not yet run on Kaggle.**

### 24. Kaggle backend live; fresh-install check; speech output verified on real models

**Backend: Kaggle, T4 x2** (`natlas_kaggle.ipynb`, `ENABLE_TTS = True`). The server's own `/health` reported N-ATLaS, all four ASR models and both TTS engines loaded, with `sorotts_error: null`. SoroTTS loaded in 52.3 s on the first run and 7.6 s after a session restart (cached).
- The first tunnel URL went offline (Cloudflare `530`) a few minutes after it was printed, while the server inside the session was still healthy. Re-running the tunnel cell gave a working URL. (The earlier 404s on that URL were a `/v1` suffix in `.env`, not a Kaggle problem.)

**Live database migration and gateway deploy:**
- The migration was run by the owner. `api_keys` now has `daily_request_limit`, `max_active_users` and `revoked_reason`.
- The gateway was deployed with `TTS_ENABLED=true` (owner ran it), and `set-backend.mjs` connected it to the Kaggle URL. The gateway reported `reachable: true`, `mock: false` and `tts_enabled: true`.
- `deploy/keys.mjs` read back live limits per key. `website-demos` is at 3,000 requests per 24 h and 300 active users. `owner-testing` has no limits. **KI-4's fix is live.**

**Fresh-install check:**
- In an empty folder, `npm install @openatlas/sdk@latest` installed `0.1.0` from the public registry.
- `examples/quickstart.mjs` ran with only `OPENATLAS_API_KEY` set, using the SDK's default gateway URL.
- It returned a real Hausa N-ATLaS answer about voter-card registration in 10.2 s, with the "NCAIR1/N-ATLaS, Powered by Awarri" credit. **Passes.**

**Speech output: `deploy/tts-check.mjs`**
- Each text is N-ATLaS's own two-sentence customer-service reply.
- It was spoken through the gateway with `speak()`, saved to `test-audio/tts/`, then sent back through the N-ATLaS ASR model for that language. WER is measured against the spoken text.
- There is no Pidgin ASR model; `pcm` audio is heard back by the Nigerian-English model.
- The full rows are in `deploy/tts-results.jsonl`.

| Lang | `engine` | Model used | Audio | Render time | Heard-back WER (ignoring tone marks) |
|---|---|---|---|---|---|
| ha | auto | SoroTTS (Hau1) | — | **failed: HTTP 524** (tunnel timeout) | — |
| ha | mms | `facebook/mms-tts-hau` | 10.2 s | 2.8 s | 32% (32%) |
| yo | auto | SoroTTS (Yor1) | — | **failed: HTTP 524** | — |
| yo | mms | `facebook/mms-tts-yor` | 9.4 s | 12.3 s | 79% (38%) |
| ig | auto | SoroTTS (Ibo1) | — | **failed: HTTP 524** | — |
| ig | mms | `Shinzmann/soro-tts-ibo` | 10.7 s | 9.4 s | 72% (72%) |
| pcm | auto | SoroTTS (NaijaA) | 13.4 s | **126.3 s** | **4%** (4%) |
| pcm | mms | `facebook/mms-tts-pcm` | 11.5 s | 2.6 s | 57% (57%) |
| en | auto | `facebook/mms-tts-eng` (SoroTTS has no English voice) | 15.9 s | 1.9 s | 7% (7%) |
| en | mms | `facebook/mms-tts-eng` | 16.9 s | 1.9 s | 2% (2%) |

**SoroTTS is too slow for a whole reply on a T4.**
- It rendered at about 9–10 s per second of audio, measured on the Pidgin reply and on two single short sentences:
  - Hausa: 5.1 s of audio in 50.7 s;
  - Yoruba: 3.8 s of audio in 37.7 s.
- A two-sentence Hausa, Yoruba or Igbo reply takes longer than the Cloudflare tunnel will hold a request open, so the gateway got `524` and returned `503 backend_unavailable`.
- The `auto` fallback to MMS-TTS never ran: it only triggers when SoroTTS raises an error, and here the connection was cut first.
- **No fallback from GPU memory pressure was seen.** SoroTTS loaded next to N-ATLaS and the ASR models on T4 x2, `sorotts_error` stayed `null`, and every SoroTTS request that finished came from SoroTTS.

**Quality where it rendered:**
- **SoroTTS Pidgin is the best result of the run:** it was heard back at 4% WER.
- **MMS-TTS English is clear:** 2–7%, mostly "reship" heard as "worship".
- **MMS-TTS Hausa is intelligible:** 32%, mostly word-joining spellings ("zasu" for "za su").
- **Yoruba and Igbo are weak.** The Yoruba ASR returns tone marks the spoken text didn't have, which is why the WER drops to 38% when they are ignored. Igbo is at 72%; on the Igbo row, MMS-TTS means the `Shinzmann/soro-tts-ibo` stand-in for Igbo, because `facebook/mms-tts-ibo` is gated.
- **MMS Pidgin is 57%:** words were swapped ("weekend", "madam").
- **Not checked by a native speaker:** WER through ASR is a proxy for intelligibility. The WAVs are saved for listening.

**What this means:**
- **Works today:** English and Hausa with `engine: "mms"`, and SoroTTS for short Pidgin replies.
- **Not usable through the tunnel:** `auto` for Hausa, Yoruba and Igbo whole replies.
- **Fix options (not built):**
  - make `auto` choose MMS-TTS for replies longer than one sentence;
  - stream sentence by sentence;
  - put SoroTTS on a faster GPU.
- The website's speech switch (`LIVE_SPEECH`) stays off.

### 25. Speech output: `auto` limited to one sentence on SoroTTS, re-verified (time-boxed to 45 min, done in 28)

**Change:** `auto` now uses SoroTTS only for single-sentence text. Anything longer goes to MMS-TTS, in every language (`tts_renderer.py`).
- **Stand-in test:** 20/20. New checks: three sentences on `auto` → MMS; one sentence → SoroTTS.

**Kaggle notebook rebuilt as 3 cells:** instructions, the renderer file, and one run-everything cell.
- Speech output now loads before the tunnel opens.
- The notebook asserts that two sentences on `auto` come back from MMS.
- `cloudflared` now runs in its own session and logs to a file. Before, its log went to an unread pipe, and it shared the kernel's process group; the tunnel had dropped with Cloudflare `530` three times on Kaggle.
- The 3-cell notebook ran end to end on Kaggle T4 x2 after a kernel restart. The first attempt hit `CUDA out of memory`: it ran in the old kernel, with the previous run's models still loaded.

**Live check of the rule through the gateway (Hausa):**
- Two sentences → `facebook/mms-tts-hau`, 4.1 s of audio in 2.3 s.
- One sentence → SoroTTS, 14.6 s of audio in 121.9 s. The same sentence gave 4.1 s of audio in 40 s earlier, so this output was probably garbled.

**`deploy/tts-check.mjs` re-run: 10/10 renders returned audio, no 524s.** WER is heard back by the N-ATLaS ASR model for that language; the last column ignores tone marks.

| Lang | `engine` | Sentences | Model used | Audio | Render time | WER | WER (no tone marks) |
|---|---|---|---|---|---|---|---|
| ha | auto | 2 | `facebook/mms-tts-hau` | 10.0 s | 2.0 s | 40% | 40% |
| ha | mms | 2 | `facebook/mms-tts-hau` | 9.8 s | 1.7 s | 36% | 36% |
| yo | auto | 1 | SoroTTS (Yor1) | 14.0 s | 116.6 s | 65% | 26% |
| yo | mms | 1 | `facebook/mms-tts-yor` | 6.3 s | 1.4 s | 61% | 26% |
| ig | auto | 1 | SoroTTS (Ibo1) | 9.5 s | 79.3 s | **0%** | 0% |
| ig | mms | 1 | `Shinzmann/soro-tts-ibo` | 10.1 s | 1.6 s | 79% | 79% |
| pcm | auto | 2 | `facebook/mms-tts-pcm` | 11.2 s | 1.6 s | 54% | 54% |
| pcm | mms | 2 | `facebook/mms-tts-pcm` | 9.9 s | 1.6 s | 43% | 43% |
| en | auto | 2 | `facebook/mms-tts-eng` | 16.2 s | 1.8 s | **2%** | 2% |
| en | mms | 2 | `facebook/mms-tts-eng` | 15.6 s | 2.1 s | 5% | 5% |

**Results:**
- **No timeouts on multi-sentence replies in any language.** Every one went to MMS-TTS and rendered in about 2 s.
- **The fresh MMS-TTS numbers confirm the quality gap.** Hausa 36–40%, Yoruba 61% (26% ignoring tone marks), Igbo 79% and Pidgin 43–54%, against English 2–5%.
- **This run's Yoruba and Igbo replies were single sentences,** so `auto` used SoroTTS:
  - it took 79–117 s;
  - it sounded better: Igbo 0% WER against 79% on MMS-TTS.
  - Those requests finished, but a long single sentence is close to the tunnel's limit, as the 121.9 s Hausa sentence shows. A 524 on a long single sentence is still possible.
- **Decision:** speech output is shown in English only (demo video shot 6b). The website's speech switch stays off.

### 26. Speech flag from the config file alone; site redeployed

**Gateway:**
- `gateway/wrangler.toml` is now `TTS_ENABLED = "true"`. Before, speech was on only because of a one-off `--var` override.
- Plain `npx wrangler deploy` with no `--var`: version `ba20d871`. Wrangler reported `env.TTS_ENABLED ("true")` as an environment variable from the file.
- The backend secret survived the deploy. `/v1/health` showed `reachable: true` and `tts_enabled: true`, with the backend's `tts` `ok`.
- **Real round trip with the SDK through the gateway:**
  - `speak()` on two English sentences returned `facebook/mms-tts-eng`, 4.43 s of audio in 2.1 s.
  - `transcribe()` with `NCAIR1/NigerianAccentedEnglish` heard it back as "thank you for your patience! your order will arrive tomorrow." That matches the input word for word, apart from punctuation.

**Site:** version `f69b8935`.
- `/docs` now shows the new `auto` rule ("SoroTTS for a single sentence … MMS-TTS (fast) for longer text, English, or on failure").
- `/api/status` is `{"mock":false,"speech":false}`, and `/api/support/speak` returns `503`.
- **The public website still has no speech.** Speech is used only through the API/SDK and the locally run demo kit.

### 27. Audit fixes: website user IDs, stale copy, backend-offline banner, Deploy Your Own with Docker

**1. Made-up user IDs on the website (found in the 15:35 audit).**
- **The problem:**
  - The website's demos passed the browser's `user` straight through to the license count, so each made-up ID counted as a new person.
  - The per-IP limit lets about 33 requests through per minute, so one script could have used up the `website-demos` key's 300-user share in roughly 10–30 minutes.
  - That would have refused every new visitor for 30 days.
- **The fix (`site/src/worker.mjs`):**
  - The website's server now ignores the browser's `user` and derives the ID itself, with a keyed hash (HMAC) of the visitor's network: the IPv4 address, or the IPv6 /64.
  - An HttpOnly cookie spreads people who share one address (an office, a school) over at most 8 IDs.
  - So one network address can count as at most 8 users, however many IDs or cookies a script invents.
  - The trade-off: more than 8 real visitors behind one shared address are under-counted.
- **Local test:** all 11 checks pass, including:
  - 500 requests from one IPv4 address without cookies → 8 IDs;
  - 300 hosts and cookies inside one IPv6 /64 → 8 IDs;
  - the same visitor keeps the same ID;
  - a forged cookie value is ignored.
- **Live test on the deployed site (`f2a27af1`), reading the key's active-user count with `deploy/keys.mjs` between steps:**

  | Step | Requests (all HTTP 200) | `website-demos` active users |
  |---|---|---|
  | Before | — | 9 |
  | One browser keeping its cookie, 8 different fake `user` IDs; then 12 requests without cookies, each with a new fake ID | 20 | **17 (+8, the per-address ceiling; before the fix this would have been +20)** |
  | 5 more fake IDs without cookies | 5 | **17 (+0)** |
  | After the final deploy (`c6389dc5`), 1 more fake ID | 1 | **17 (+0)** |

  **Made-up IDs no longer count as separate users.**
- **Still possible:** someone with many network addresses, such as rotating proxies, still counts as many users. The per-key share and the per-IP rate limit are the remaining guards.

**2. Stale public copy fixed (site `c6389dc5`):**
- **Landing page:**
  - install line `npm install @openatlas/sdk` (was `openatlas`, which doesn't exist on npm);
  - the `speak()` card is now "Optional" with the real quality note (was "Stretch… ships only if NAIC confirms").
- **Docs:**
  - the speech section now says the API serves it, is clear in English and experimental in Hausa, Yoruba and Igbo (was "off… returns `tts_disabled`");
  - the self-hosting section is now Kaggle-first, says no GPU came with the challenge, and adds a Docker row.
- **Architecture page:** the host is "Kaggle notebook today (free T4 x2)", where it said "NiHub (Colab while testing)". No "Colab" remains on the page; the timeline rows now say "free notebook GPU, now Kaggle".
- **Footer on all 5 pages:** "Built by Team Suiaah & NiHub".
- **Checked live:** each string was fetched from the deployed pages.

**3. Backend state shown up front.**
- `/api/status` (the website and the three standalone kit servers) now reports `backend: "online" | "loading" | "offline"`, from the gateway's health check.
- Each kit window shows a **Backend offline** or **Backend starting** banner on load, rechecked every 60 s, so visitors don't only find out after a failed Ask.
- **Checked:**
  - the standalone kit server against a fake gateway in every state: online, loading, tunnel down and backend error give the right value; gateway down gives `502`, which the page treats as offline;
  - each kit's page script against a stub page, 15 cases: the banner is hidden when online and shown in every other case, including when the status call fails;
  - live: `/api/status` is `{"mock":false,"speech":false,"backend":"online"}`, all three windows carry the banner (hidden), and a real Hausa question was answered in 6.1 s.
- **Not seen in a real browser while the backend was actually down,** because it was up throughout.

**4. Deploy Your Own rewritten as the main guide** (`docs/deploy-your-own.md`):
- It's on free tools; the hosted demo isn't up around the clock; this is how anyone, judges included, stands it up.
- It walks through what we actually ran: the Kaggle notebook part by part, the gateway, checks, the starter kits, reconnecting, a table of what we hit, and troubleshooting.
- **New Docker path** (`deploy/server/Dockerfile`, `requirements.txt`, `docker-compose.yml` with a `cloudflared` tunnel), plus a CI job (`.github/workflows/backend-image.yml`) that builds, smoke-tests and publishes `ghcr.io/benedict258/openatlas-backend`.
  - The CI job has no GPU or model access, so it checks only that the image builds, starts, answers `/health`, refuses calls without the key (`401`) and before the models load (`503`).
  - **The image has not been run on a GPU.** Docker isn't installed on our machine, and model downloads are kept off it.

**Correction to earlier entries:**
- **KI-1 and KI-12 were deployed:** the website's server imports the starter-kit code, so the site deploys on 2026-10-03 (`57c63aca` onward) shipped them.
- **Live confirmation (15:30 UTC):**
  - the Customer Service draft kept the English labels with a Hausa reply;
  - Citizen Services answered within the demo notes.

## 2026-10-04

### 28. Backend moved to an AMD Instinct MI300X (DigitalOcean AMD Developer Cloud) for judging

**Why:** Kaggle sessions end after 12 hours, and the weekly GPU quota can't keep a demo up through judging.

**The host:**
- One MI300X (192 GB; PyTorch reports 206 GB), a virtual-function GPU, on the 1-Click "PyTorch on AMD Instinct" image: Ubuntu 24.04, ROCm 7.14, PyTorch `2.12.0+rocm7.14.0`, HIP 7.14.60850, Python 3.12.3. It's provisioned by the owner.
- PyTorch runs inside the image's `rocm` container.
- Billed hourly from a $100 credit that expires 2026-10-18. Only destroying the droplet stops billing; powering it off does not.

**What changed:**
- **`natlas_server.py` loads in full precision by default** (`LLM_QUANT=none`: bf16 for the LLM, fp16 for the ASR models and SoroTTS). Its bitsandbytes import now happens only if `LLM_QUANT=4bit` is chosen.
  - **Deviation from the brief, flagged:** the 4-bit option wasn't deleted. It's kept as opt-in for the Docker self-host path on 16 GB NVIDIA cards, where an fp16 8B model doesn't fit.
  - On the AMD host, bitsandbytes is **not installed** (checked: `bitsandbytes installed: False`), so it can't be loaded there.
- **New one-command setup:**
  - `deploy/amd-bootstrap.sh` runs on the droplet. It checks the GPU in the container; gets the code (git clone/reset, or an upload); does the one-time container setup (ffmpeg, Python packages with the image's ROCm torch pinned, `cloudflared`); starts the server and a quick tunnel, detached; waits for the models; warms each model up; and prints the tunnel URL.
  - `deploy/amd/up.mjs` runs on our machine. It uploads the code over SSH, runs the bootstrap with the secrets passed as environment variables (never on disk or in a process list), then connects the gateway.
- **`set-backend.mjs`** now reads the backend key from `NATLAS_API_KEY` instead of a command-line argument; `setup-gateway.mjs` and `up.mjs` pass it that way.
  - **Reason:** while debugging, a process listing showed the key in `set-backend.mjs`'s arguments, and it ended up in this session's transcript. **Rotate `NATLAS_API_KEY`** (a new value in `.env`, then re-run `up.mjs`).
- **`concurrency-check.mjs`** reads the server's `inference_ms` as well as the notebook's `latency_seconds`.

**Security:**
- **The image publishes the container's ports 8000, 8888 and 30000 to the internet,** and Docker's published ports bypass UFW, so UFW's "22/80/443 only" doesn't protect them.
- **Mitigation:**
  - the server listens on `127.0.0.1` inside the container, so port 8000 doesn't answer from outside (checked: no connection), while the tunnel answers 200;
  - JupyterLab on 8888 is the image's own, and an unauthenticated request gets `403` (it needs its token).
- **No firewall rules were changed.**

**Startup, measured:**

| Run | Result |
|---|---|
| First start in this container (models downloaded) | Ready in **94 s**: LLM 27.4 s, each ASR about 5 s, speech renderer including SoroTTS by 94 s. |
| Restart with cached models, via the bootstrap | Ready in **30 s** (LLM 7.1 s). `up.mjs` from command to gateway serving: **70 s**. |
| Same, with the warm-up step | **2 min 29 s.** Warm-up times: chat 8.4 s; ASR 0.5–3.5 s per model; MMS 1.0–6.8 s per language; SoroTTS 38 s. |

**Not yet run:**
- **On a freshly created droplet.** This container was set up once and then restarted; a new droplet means a new container and re-downloading about 30 GB.
- **The bootstrap's git-clone mode,** because the repo is private and no read-only token was used. `up.mjs` uploads the code instead.

**Checks through the public gateway and website on the MI300X backend:**

| Check | Result |
|---|---|
| Citizen Services (Hausa, website) | 200 in 7.7 s. INEC answer in Hausa. |
| Education (English, primary, website) | 200 in 3.8 s. |
| Customer Service (`ha.wav`, 26.7 s, website) | 200 in 29.2 s; then 16.4, 19.7 and 27.5 s. Same transcript as on Kaggle; format kept (`Category: other` / `Urgency: low` / Hausa draft; lower case, unlike the 4-bit model's "Other"). **The time is mostly our upload:** directly at the backend, GPU time for that clip is 0.6–0.7 s against a 5.7–7.1 s round trip. The browser recorder sends 16 kHz mono, about 0.85 MB, not this 5 MB file. |
| Speech route on the website | 503, by design (`LIVE_SPEECH` off). |
| `smoke-gateway.mjs`: chat | en 2.3 s, ha 1.5 s, yo 2.8 s, ig 3.0 s. On Kaggle: 4–8 s, Yoruba 11–23 s. |
| `smoke-gateway.mjs`: ASR WER | ha 26%, yo 74%, ig 0%, en-ng 0%: **the same transcripts as on Kaggle.** |
| `smoke-gateway.mjs`: `reportIssue()` | Stored and in the admin export. |
| Auth and per-key limits (throwaway key, revoked afterwards) | no key → `401 missing_api_key`; wrong key → `401 invalid_api_key`; 2nd user over a 1-user share → `429 key_user_share_reached`; 4th request over a 3/day limit → `429 key_quota_exceeded`; after revoking → `401 invalid_api_key`. |
| Website per-IP limit (30 parallel POSTs, no model calls) | 15 through, 15 × `429` (limit 10; loose as before). |
| GPU lock (`concurrency-check.mjs`, 6 at once, direct) | All OK. Wall 12.6 s against a 13.7 s sum of compute, so they queued. ASR 90.6 s of Yoruba in 5.3 s; chat 0.4–1.5 s. |
| Website user-ID protection, backend-offline banner | Unchanged by the move. `/api/status` reports `backend: online`. |

**`deploy/tts-check.mjs`: 10/10 renders returned audio.**

| Lang | `engine` | Model used | Audio | Request time | WER (no tone marks) |
|---|---|---|---|---|---|
| ha | auto | `facebook/mms-tts-hau` | 12.3 s | 14.0 s (first MMS call) | 23% |
| ha | mms | `facebook/mms-tts-hau` | 13.6 s | 5.6 s | 27% |
| yo | auto | SoroTTS (Yor1), 1 sentence | 12.4 s | **34.8 s** (T4: 117 s for 14 s of audio) | 50% (13%) |
| yo | mms | `facebook/mms-tts-yor` | 4.8 s | 3.2 s | 69% (44%) |
| ig | auto / mms | `Shinzmann/soro-tts-ibo` | 20.9 / 20.0 s | 10.0 / 6.8 s | 82% / 85% |
| pcm | auto / mms | `facebook/mms-tts-pcm` | 4.9 / 5.1 s | 5.8 / 5.2 s | 63% / 50% |
| en | auto / mms | `facebook/mms-tts-eng` | 16.9 / 15.8 s | 6.8 / 6.4 s | **0% / 0%** |

**Speech results:**
- **English is clear: 0% WER.** The quality gap for the other languages (KI-14) is unchanged.
- **SoroTTS is about 3× faster than on the T4,** but still slower than real time.

**ROCm findings, reported here rather than worked around:**
1. **MMS-TTS is about 6× slower on ROCm than on a T4.**
   - Timed in the container: the first call took **11.6 s** (kernel set-up), then **1.8–2.1 s** for each 3-second sentence. The T4 needed about 0.3 s. On the CPU it takes 6.1–6.5 s.
   - It's not per-input-length compilation: repeated and new texts take the same ~3.8 s for two sentences.
   - **Effect:** speech is fine for English replies (about 7 s for a 16-second reply), but slower than on Kaggle.
2. **One CPU thread is at 100% the whole time.**
   - `gdb` shows `rocr::core::Runtime::AsyncEventsLoop` in `libhsa-runtime64.so.1` busy-polling. That's the ROCm runtime's default on this virtual-function GPU; no `HSA_*`/`HIP_*` variables are set.
   - It uses 1 of 20 vCPUs; no effect on results seen. **Not tuned:** for example, `HSA_ENABLE_INTERRUPT` is untested here.
3. **First calls are slower:** 8.4 s for the first chat, 7–12 s for the first MMS render. The bootstrap now warms every model up before reporting ready.
4. **Python packages:** `pip` could replace the ROCm torch with a CUDA build if any dependency asked for it, so setup pins the image's version. It wasn't needed this time: no package asked for a different torch. Installed: `transformers` 5.18.0, `accelerate` 1.15.0, `peft` 0.21.2, `snac` 1.2.1.
5. **No HIP errors and no ROCm warnings** in the server log. The only log noise is the same `transformers` deprecation notices as on Kaggle (`torch_dtype`, `forced_decoder_ids`, …).
6. **Debugging tools left in this container:** `py-spy` and `gdb`, installed while finding item 2. They're harmless and disappear with the droplet.

**Not built:** the "customer-service chat" mentioned in the brief doesn't exist yet, so it couldn't be checked.

### 29. Pre-submission re-verification on the MI300X; 4-bit removed from the server

**State found:**
- The deployment from section 28 was still running on the same droplet (`165.245.135.77`): `natlas_server.py` and `cloudflared` were up inside the `rocm` container.
- **SSH:** the `OpenAtlasSsh` key (`C:\Users\HP\Desktop\OpenAtlasSsh`) is **not** authorized on this droplet; only `~/.ssh/id_ed25519` is, and it was used. `up.mjs` now accepts `SSH_KEY=<path>`.

**Change:** at the owner's request, `natlas_server.py` no longer has any quantization path.
- The LLM always loads in bf16 (fp16 where bf16 isn't supported), and the server forces SoroTTS to full precision as well.
- bitsandbytes is gone from both requirement files. `transformers>=4.56` is now required: `dtype=` is honoured from that version, while older versions silently load fp32.
- **The Docker path now needs a 24 GB+ NVIDIA GPU.**
- The Kaggle notebook keeps its own 4-bit loading, because a T4 can't hold the model otherwise. It's separate code.
- Redeployed with `up.mjs`: the LLM loaded as **bfloat16** in 7.0 s, and was warmed up and connected to the gateway in about 2.5 min.

**Proof it runs on the GPU:**

| Evidence | Value |
|---|---|
| In the container | `torch.cuda.is_available(), torch.cuda.get_device_name(0)` → `True AMD Instinct MI300X VF` |
| Server log | `LLM loaded in 7.0s`, four ASR models in 0.5–0.6 s each, `ready. GPU memory allocated: 18.1 GB`, then `[openatlas-tts] ready. GPU memory allocated: 25.9 GB` |
| `amd-smi process` (host) | `/usr/bin/python3.12`, **VRAM_MEM 25.3 GB** |
| `amd-smi monitor -u -m` | idle: GFX 0%, MEM 0%; during a 1,024-token generation, sampled 4 times 1 s apart: **GFX 100%**, MEM 18–19%, memory clock 900 → 1300 MHz |
| ROCm tooling | `amd-smi metric -u` crashes on ROCm 7.14 (`AttributeError: 'Namespace' object has no attribute 'partition'`); `amd-smi monitor` works. |

**Direct requests to the backend's tunnel (no gateway):**

| Request | Result |
|---|---|
| chat en | 55 tokens, **855 ms on the GPU**, 1.1 s round trip. The NIMC answer is correct. |
| chat ha | 34 tokens, 527 ms. "Gwagwarmaya na nufin kokari, juriya, ko kuma gwabzawa don cimma wata manufa." |
| chat yo | 50 tokens, 769 ms. |
| chat ig | 60 tokens, 908 ms. |
| ASR ha (26.7 s of real speech) | **644 ms on the GPU**. Same transcript as on Kaggle. |
| ASR yo (20.2 s) | 955 ms. |
| ASR ig (3.0 s) | 143 ms. "nwoke ahụ bụ agbara": exact. |
| ASR en-ng (5.4 s) | 182 ms. Exact. |
| speak en (MMS-TTS) | 5.15 s of audio rendered in 3.97 s. Heard back by `NCAIR1/NigerianAccentedEnglish` as "thank you for your patience. your order will arrive tomorrow morning.": **exact**. Saved as `test-audio/tts/proof-en-mms.wav`. |
| speak yo (SoroTTS, Yor1) | 7.17 s of audio in 18.85 s. Heard back as "pádúpé fún sùrú rè̩ síwúù rè̩", from "A dupe fun suuru re, oja re yoo de laipe." Saved as `proof-yo-sorotts.wav`. |

**Through the public website and gateway:**

| Check | Result |
|---|---|
| `/api/status` | `{"mock":false,"speech":false,"backend":"online"}` |
| Citizen Services (Hausa) | 200 in 3.5 s. INEC / CVR answer. |
| Education (English, primary) | 200 in 3.0 s. |
| Customer Service (`ha.wav`) | 200 in 11.2 s. Transcript, then a three-line draft in Hausa with "Powered by Awarri". |
| Speech route on the website | 503, by design (website switch off). |
| API key auth and limits (throwaway key, revoked afterwards) | no key 401, wrong key 401, a 2nd user over a 1-user share 429, a 4th request over a 3/day limit 429, revoked 401. |
| `tts-check.mjs` through the gateway | 10/10 renders. en 0–3% WER; ha 18–38%; yo 81% with MMS (38% without tone marks), 19% with SoroTTS; ig 61–76%; pcm 35%. |
| Website per-IP limit | 30 parallel POSTs: 18 through, 12 × 429. |
| Website made-up user IDs | 10 fake IDs moved the website key from 24 to **25** active users (the per-address ceiling holds). |

**Not present:** the site has **no browser playground**; no page or script has one. The interactive parts are the three starter-kit windows and the key request form. The "customer-service chat" from section 28 is also still not built.

---

## Known issues

| ID | Issue | Status |
|---|---|---|
| KI-1 | Citizen Services: on a question outside the demo notes (Hausa airfare), N-ATLaS gave general advice instead of saying the notes don't cover it. It ignores the "answer only from the notes" system instruction. | **Fixed in the kit code for the reported case** (section 18): structured prompt; out-of-scope declined cleanly 5/6 (was 1/6), the Hausa airfare case declines in Hausa. One case still answered from outside knowledge (Hausa farm loan). Live on the website since 2026-10-03 (section 27). |
| KI-2 | Yoruba chat can degenerate into repeated or mutated syllables around "afẹ́fẹ́" ("afẹ́fẹ́fẹ́…", "fúnfúnfún…"). Without the guard: 1 full loop and 2 stutters in 11 runs. With `no_repeat_ngram_size = 10`: 1 full loop and 3 stutters in 12 runs. | **Closed as a known model limitation.** The n-gram guard was tried and removed. Citizen Services opens in Hausa (site version `a5b4ade5`); Yoruba is still selectable, with this caveat. |
| KI-3 | Yoruba is the weakest language so far: most tone marks missing in chat replies, invented details, 74% WER on the one ASR clip, and the slowest chat (11–23 s vs 4–8 s for the other languages, on the T4). | Known limitation of the current models; stated as a caveat. On the MI300X (section 28), Yoruba chat takes 2.8 s, so speed is no longer the problem; quality still is. |
| KI-4 | The shared website demo key is not rate-limited. Per-IP limits are not built. | **Fixed, live** (sections 20, 23, 24): per-key daily quota and share of the license cap, with `website-demos` at 3,000 requests per 24 h and 300 users, plus a per-IP limit on the website demos. The per-IP limit is approximate: about 33 requests got through per minute against a configured 10. Website user IDs are now derived on the server, so made-up IDs can't use up the share (section 27; checked live). Must be listed in the final pre-submission status. |
| KI-5 | The Colab notebook couldn't decode browser recordings (webm), and had no GPU lock for concurrent requests. | **Fixed.** ffmpeg decoding and one GPU lock (`998a946`), both verified live (section 17, steps 2–3). |
| KI-6 | The Colab notebook's chat reply has no token `usage` field, so the smoke test prints `undefined` for it. | Cosmetic. |
| KI-7 | `transcribe()` failed (HTTP 500) on every clip over 30 s: Colab notebook without chunking. | **Fixed.** With `chunk_length_s=30`, 10/10 long clips transcribe (section 11). The earlier 0/10 was a patch cell run twice (section 9). |
| KI-8 | ASR accuracy on conversational speech is modest: corpus WER Hausa 41%, Yoruba 56% (45% ignoring tone marks), Igbo 60–101% on a tone-marked multi-dialect benchmark, Nigerian English 26% (section 8). | Known limitation of the models; stated as a caveat. |
| KI-9 | The gateway reported a backend 500 as `503 backend_unavailable`, and the SDK retried it. | **Fixed.** Deployed; confirmed live on 2026-10-03 (`502 backend_error`, not retried). |
| KI-10 | Education kit: the level framing varies from run to run (a secondary answer sometimes comes back in a young-child register), and answers can contain factual slips: glucose as "a sweet drink"; O₂ missing its coefficient in the photosynthesis equation. | **Content-accuracy limitation of the model.** Documented, not being chased. |
| KI-11 | Audio over ~30 s lost words in the backend's chunked ASR mode: transcripts were 39–79% of reference length on clips over ~37 s. | **Fixed for 38–54 s clips:** the backend now sends plain 25 s pieces, and words kept went from 39–61% to 83–99% (section 17). On 89–123 s free speech some loss remains with clean pieces too (model). Documented reliable limit: 30 s per request. The Customer Service recorder caps at 30 s and splits uploads. |
| KI-12 | Customer Service drafts: with a Yoruba note, N-ATLaS translated the required format labels and picked a category outside the allowed list. With a Hausa note it kept the format, but its "reply" restated the customer's words instead of answering them. | **Format fixed in the kit code** (section 18): followed 10/10 (was 3/10), both reported notes re-run and passing. Category choice is still model judgment (6–8/10 as expected). Live on the website since 2026-10-03 (section 27). |
| KI-13 | The notebook's `latency_seconds` includes time spent waiting for the GPU lock, so it overstates model time under concurrent load. | Cosmetic. Measurement note only. |
| KI-14 | Speech output, two separate problems (section 24). **(1) Too slow:** SoroTTS renders at about 10 s per second of audio on a T4, so multi-sentence Hausa, Yoruba and Igbo replies don't finish within the free tunnel's timeout (HTTP 524; failed in 3 of 3 languages). **(2) Low quality:** the MMS-TTS engine has much higher heard-back word error rates for Hausa (32%), Yoruba (79%; 38% ignoring tone marks) and Igbo (72%) than for English (2%). That is a real quality gap, not a timeout artifact. | **(1) Fixed for multi-sentence replies** (section 25): `auto` sends anything past one sentence to MMS-TTS. Re-verified: 10/10 renders, no 524s. A long *single* sentence still goes to SoroTTS (79–122 s measured on the T4; 34.8 s for 12 s of audio on the MI300X, section 28), so a 524 there is much less likely on AMD, but still possible on a T4. **(2) Open, confirmed on re-test:** MMS-TTS Hausa 36–40%, Yoruba 61% (26% ignoring tone marks), Igbo 79%, against English 2–5%. A limit of the available speech models. Speech is shown in English only; the website's speech switch stays off. |
| KI-15 | ROCm on the AMD MI300X host (section 28): MMS-TTS is about 6× slower than on a T4 (about 2 s per short sentence, after an 11.6 s first call). One ROCm runtime thread (`AsyncEventsLoop`) busy-polls a CPU core the whole time. The first chat and the first speech render after a start are slower (8–12 s). | Documented. The bootstrap warms each model up before reporting ready. English speech still renders a 16-second reply in about 7 s. Not tuned further. |
