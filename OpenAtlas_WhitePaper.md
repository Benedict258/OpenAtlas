# OpenAtlas
### A White Paper on Open Developer Infrastructure for N-ATLaS

**Author:** Benedict Isaac
**Track:** National AI Innovation Challenge (NAIC) 2026 — Academia & Research
**Status:** Proposal / pre-build (submitted ahead of a 10-day build window)

---

## 1. The Gap Between a Model and an Ecosystem

N-ATLaS is Nigeria's first sovereign open-source large language model — a Llama-3 8B fine-tune released by NCAIR/NITDA, paired with four dedicated automatic speech recognition models covering Hausa, Yoruba, Igbo, and Nigerian-accented English. On its own terms, this is a significant release: it is the first time a Nigerian institution has shipped a text-generation model and a matching set of local-language ASR models as a coherent, openly licensed unit.

But a model is not a product, and a model card is not a developer experience. As it stands today, using N-ATLaS means knowing which Hugging Face repository to pull, how to quantize and serve an 8B-parameter model on a GPU you have to find and pay for yourself, how to call four separate ASR checkpoints with four separate interfaces, and how to wire all of that into whatever application you were actually trying to build. There is no persistent public endpoint. There is no single client library. There is no starter template for the obvious first use cases — a citizen-facing chatbot, a classroom tool, a customer-service line — that a model like this exists to serve.

This is the gap OpenAtlas is built to close: not a new model, and not another application built on top of N-ATLaS, but the missing layer of infrastructure between "the model exists on Hugging Face" and "a Nigerian developer can build something real on it in an afternoon."

## 2. What OpenAtlas Is

OpenAtlas is a developer infrastructure toolkit built entirely around N-ATLaS. It has three parts:

1. **A persistent, hosted N-ATLaS deployment.** The LLM and its four ASR models, reachable behind one stable API, so a developer never has to provision their own GPU or manage model weights just to try N-ATLaS. The deployment scales to zero when idle and is billed only while serving requests — the cost profile a self-funded academic project can sustain — so the first request after a quiet period incurs a cold start while the model loads. That latency is measured and documented, not hidden.
2. **A unified TypeScript/Node SDK.** One client library — `openatlas` — that wraps the LLM and all four ASR endpoints behind a single, consistent interface, so calling N-ATLaS feels like calling any modern API, not assembling five different model cards into a working pipeline.
3. **Starter-kit templates.** Minimal, working reference applications for three concrete niches — citizen services, education, and customer service — that show, in runnable code, what an N-ATLaS-native application looks like end to end: speech or text in, N-ATLaS reasoning or transcription, a response out.

A fourth component — a self-hosted text-to-speech rendering step, so a developer can get spoken output as well as spoken input — is included as a stretch component, contingent on confirmation from the NAIC secretariat that pairing N-ATLaS with a separate, self-hosted open TTS model for final audio rendering does not conflict with the challenge's requirement that submissions genuinely use N-ATLaS rather than wrap a general-purpose model. N-ATLaS itself does not include a TTS model; this is stated plainly rather than implied.

## 3. Why Infrastructure, Not Another Application

There is an important and deliberate scoping decision behind OpenAtlas, and it is worth stating explicitly: this project does not build a citizen-services app, an education app, or a customer-service app as its primary deliverable. It builds the plumbing that makes building any of those fast and straightforward, and then demonstrates that plumbing with working starter kits in those three areas.

The reasoning is threefold:

- **N-ATLaS's own gap is at the infrastructure layer, not the application layer.** Nigeria already has, or could build, countless single-purpose apps. What it does not have is a reusable way to reach N-ATLaS that any of those apps could share. Fixing the shared layer compounds; fixing one app's plumbing does not.
- **The challenge's Developer Infrastructure problem statement asks for exactly this.** NAIC's own framing is explicit that submissions wrapping a general-purpose model instead of genuinely using N-ATLaS will be disqualified. An SDK and hosted endpoint that make N-ATLaS itself easier to use is the most direct, least ambiguous way to satisfy that rule — there is no general-purpose model anywhere in the critical path.
- **It is honestly buildable in the time available.** A from-scratch citizen-services product with real users, real data, and a defensible impact story is not something that can be built credibly in a ten-day application window. A hosted endpoint, a client library, and three thin reference implementations are a realistic, demonstrable scope for that window — and they are not padding; they are the actual product.

## 4. Honest Scope

This white paper does not claim more than what OpenAtlas will be able to show by the NAIC deadline. Specifically:

- The hosted N-ATLaS deployment is new infrastructure built for this submission, not a production service with an existing user base or uptime track record.
- The SDK wraps N-ATLaS's own LLM and ASR models; it does not add new model capability, fine-tuning, or training of any kind.
- The three starter kits are reference implementations meant to prove the SDK works end to end for each niche — they are illustrative, not finished products ready for deployment by a government agency, school, or company as-is.
- The TTS rendering step, if it ships, is a thin, clearly-labeled final-stage audio renderer sitting after N-ATLaS's own reasoning and transcription work — never a replacement for, or a disguise of, N-ATLaS's role in the pipeline. If NAIC's clarification indicates this pairing is disallowed, it is dropped from scope without weakening the core SDK/hosting submission.
- No claim is made about production-scale reliability, cost efficiency, or multi-tenant load — these are reasonable post-submission engineering goals, not demo-day claims.

## 5. The Broader Case

The value of OpenAtlas does not end with the NAIC submission. A sovereign LLM is only as useful as the ecosystem that can be built around it, and ecosystems are built by developers who can get started quickly. By giving Nigerian (and broader West African) developers a single, well-documented way to call N-ATLaS's text and speech capabilities — hosted, so no one needs their own GPU; unified, so no one has to learn five separate interfaces; and demonstrated, so no one has to guess what a real integration looks like — OpenAtlas aims to lower the single biggest barrier between "Nigeria has a sovereign AI model" and "Nigeria has a sovereign AI ecosystem."

That is the broader bet behind this project: that the next wave of genuinely local, genuinely sovereign AI applications in Nigeria will be built by people who never have to think about quantization, GPU rental, or ASR checkpoint formats — because OpenAtlas already did that work for them.
