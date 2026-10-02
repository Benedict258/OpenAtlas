# OpenAtlas
### A White Paper on Developer Tooling for N-ATLaS

**Author:** Benedict Isaac
**Track:** National AI Innovation Challenge (NAIC) 2026 — Academia & Research, Developer Infrastructure problem statement
**Status:** In build (submission deadline October 12, 2026)

---

## 1. The Gap Between a Model and an Ecosystem

N-ATLaS is Nigeria's first sovereign open-source large language model — a Llama-3 8B fine-tune released by NCAIR/NITDA, paired with four dedicated automatic speech recognition models covering Hausa, Yoruba, Igbo, and Nigerian-accented English. On its own terms, this is a significant release: it is the first time a Nigerian institution has shipped a text-generation model and a matching set of local-language ASR models as a coherent, openly licensed unit.

But a model is not a product, and a model card is not a developer experience. Using N-ATLaS today means knowing which Hugging Face repository to pull, how the LLM's chat template expects to be called, which of four separate ASR checkpoints matches your audio and how each one wants its input, and how to wire all of that into the application you were actually trying to build. There is no single client library and no starter template for the obvious first use cases — a citizen-facing chatbot, a classroom tool, a customer-service line.

This is the gap OpenAtlas closes: not a new model, and not another application built on N-ATLaS, but the missing developer tooling between "the model exists on Hugging Face" and "a Nigerian developer can build something real on it in an afternoon."

## 2. What OpenAtlas Offers: One SDK, a Small Set of Capabilities

OpenAtlas is a TypeScript/Node SDK, `openatlas`, built entirely around N-ATLaS. The product is its capability surface — what a developer can do with one import:

| Method | What it gives a developer |
|---|---|
| `chat()` | N-ATLaS text generation in English, Hausa, Yoruba, or Igbo. One method; no knowledge of the model's format, chat template, or inference settings required. |
| `transcribe()` | Speech-to-text, routed automatically to the correct one of N-ATLaS's four ASR models by language code. One method instead of four separate model interfaces. |
| `normalizeText()` | Cleans Nigerian-language text whose special characters were corrupted by typing or scraping, before it goes into `chat()` or after it comes back from `transcribe()`. Pure text processing; no model involved. |
| `reportIssue()` | Lets a developer flag a bad N-ATLaS output together with a correction. Every app built on OpenAtlas becomes a small, opt-in data-contribution pipeline back to the N-ATLaS ecosystem. |
| `speak()` *(stretch)* | Final-stage spoken audio in Hausa, Yoruba, Igbo, or Pidgin — **the ElevenLabs gap for Nigerian languages.** |

Three starter kits — citizen services, education, and customer service — show in runnable code what an N-ATLaS-native application looks like end to end using these methods.

Where the models run is an implementation detail behind the SDK, covered in the Architecture document. Developers never handle GPUs, model weights, or hosting credentials; they hold one OpenAtlas key.

## 3. Why Each Capability Exists

### 3.1 `chat()` and `transcribe()` — one interface instead of five

N-ATLaS is five models (one LLM, four ASR), each with its own repository and calling conventions. The LLM has specific inference behaviour a newcomer would not know: its chat template inserts a hard-coded date ("26 Jul 2024") unless the current date is passed in, and in testing against the real weights it needed a repetition penalty (1.12) to avoid looping. The SDK applies these settings for the developer. `transcribe()` takes a language code (`ha`, `yo`, `ig`, `en-ng`) and routes to the matching ASR model, so a developer never has to know there are four.

### 3.2 `normalizeText()` — the diacritics problem

Hausa, Yoruba, and Igbo are written with characters most keyboards and pipelines handle badly: Hausa's hooked letters (ɓ, ɗ, ƙ), Yoruba's and Igbo's dot-below vowels and consonants (ẹ, ọ, ṣ, ị, ụ), and tone marks. The research literature documents that these are routinely missing from electronic text. Orife (2018) notes that, with very few exceptions, diacritics are omitted from electronic Yorùbá text because of limited device and application support; Ezeani et al. (2016) report the same for Igbo. Text that does carry them is often corrupted on the way through a pipeline — mis-decoded encodings ("á»" in place of "ọ"), look-alike substitutes from other keyboards (Turkish "ş" in place of Yoruba "ṣ", "ķ" in place of Hausa "ƙ"), invisible characters, and decomposed sequences that break exact matching.

`normalizeText()` repairs the corruption that can be repaired deterministically: encoding damage, look-alike substitutions, invisible characters, Unicode composition, and (opt-in, Hausa) the common ASCII apostrophe conventions for hooked letters (`k'asa` → `ƙasa`).

**Honest boundary:** restoring tone marks to text where they were never typed is a modelling problem — both papers above solve it with trained models — and `normalizeText()` does not attempt it. It cleans what is there; it does not guess what is missing.

### 3.3 `reportIssue()` — the data bottleneck

The deeper problem for Nigerian-language AI is data. Joshi et al. (2020) show the large and persistent resource gap between a handful of languages and everyone else; the Masakhane participatory study (Nekoto et al., 2020) shows that new datasets for African languages come from many contributors adding to them, not from re-using the same few corpora. Most applied work in this space consumes the existing datasets without contributing back.

`reportIssue()` turns every OpenAtlas app into a contributor. When an end user or developer sees a wrong N-ATLaS answer or transcript, one call records the input, the model's output, and the correction (optionally with the audio clip, for transcription issues). The reports are stored in the OpenAtlas database and are exportable as a correction dataset — real, in-domain, human-corrected Nigerian-language data that does not exist today. It is opt-in by construction: nothing is recorded unless the app calls `reportIssue()`.

**Honest boundary:** OpenAtlas collects and exports these reports. There is not yet an agreed channel for handing them to NCAIR or the N-ATLaS maintainers; establishing one is a post-submission goal.

### 3.4 `speak()` — the ElevenLabs gap for Nigerian languages *(stretch)*

ElevenLabs made high-quality spoken English one API call away. For Hausa, Yoruba, Igbo, and Pidgin there is no accessible equivalent: a developer who wants their app to talk back in a Nigerian language has to find, host, and integrate a research TTS model themselves. `speak()` closes that gap the same way — one method, text in, audio out.

N-ATLaS does not include a TTS model, so `speak()` would use a separate open TTS model (`Shinzmann/sorotts`, with Meta MMS-TTS as fallback) as a final rendering step, strictly after N-ATLaS has produced the text. It is gated on confirmation from the NAIC secretariat that this pairing does not conflict with the rule that submissions must genuinely use N-ATLaS rather than wrap a general-purpose model. If the answer is no, or does not arrive in time, `speak()` is dropped without weakening the rest of the SDK.

## 4. Why Tooling, Not Another Application

This project deliberately does not build a citizen-services app, an education app, or a customer-service app as its primary deliverable. It builds the tooling that makes building any of those fast, and demonstrates it with three starter kits.

- **N-ATLaS's own gap is at the tooling layer.** A reusable way to reach N-ATLaS compounds across every app that uses it; fixing one app's plumbing does not.
- **It is the least ambiguous way to satisfy the challenge's core rule.** NAIC disqualifies submissions that wrap a general-purpose model instead of using N-ATLaS. Every reasoning and transcription call in OpenAtlas is served by an N-ATLaS model.
- **It is honestly buildable in the time available.** An SDK, the service behind it, and three thin reference apps are a realistic scope for a ten-day window — and they are the actual product, not padding.

## 5. Honest Scope

- The SDK wraps N-ATLaS's own LLM and ASR models. It adds no model capability, fine-tuning, or training.
- `normalizeText()` repairs corrupted characters; it does not restore tone marks that were never typed (§3.2).
- `reportIssue()` collects corrections; no hand-off channel to the N-ATLaS maintainers exists yet (§3.3).
- The starter kits are reference implementations, not deployment-ready products.
- `speak()` ships only if NAIC confirms eligibility (§3.4).
- N-ATLaS's license caps use at 1,000 active end users per 30 days and is non-commercial. OpenAtlas measures usage against that cap and refuses new users once it is reached; it is positioned as a non-commercial developer and research resource, not a production service.
- No claim is made about production-scale reliability, uptime, or multi-tenant load.

## 6. The Broader Case

A sovereign LLM is only as useful as the ecosystem built around it, and ecosystems are built by developers who can get started quickly. OpenAtlas gives Nigerian and West African developers one well-documented way to use N-ATLaS's text and speech capabilities, cleans up the text those capabilities depend on, and turns the apps they build into a source of the corrected local-language data the field is short of.

The bet behind this project: the next wave of genuinely local AI applications in Nigeria will be built by people who never have to think about chat templates, ASR checkpoint formats, or broken diacritics — because OpenAtlas already handled them.

---

## References

- Orife, I. (2018). *Attentive Sequence-to-Sequence Learning for Diacritic Restoration of Yorùbá Language Text.* Interspeech 2018. https://arxiv.org/abs/1804.00832
- Ezeani, I., Hepple, M., Onyenwe, I. (2016). *Automatic Restoration of Diacritics for Igbo Language.* Text, Speech, and Dialogue (TSD 2016). https://eprints.whiterose.ac.uk/117833/
- Joshi, P., Santy, S., Budhiraja, A., Bali, K., Choudhury, M. (2020). *The State and Fate of Linguistic Diversity and Inclusion in the NLP World.* ACL 2020. https://aclanthology.org/2020.acl-main.560
- Nekoto, W., et al. (2020). *Participatory Research for Low-resourced Machine Translation: A Case Study in African Languages.* Findings of EMNLP 2020. https://aclanthology.org/2020.findings-emnlp.195

*N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.*
