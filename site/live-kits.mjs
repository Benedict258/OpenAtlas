// Which starter-kit demos the website serves live. A kit is added here only after its full pipeline
// has been verified end to end against the live N-ATLaS backend. The others show a "paused" window
// (site/build.mjs) and their API routes answer 503 (site/src/worker.mjs).
export const LIVE_KITS = ["citizen", "education", "support"];

// The Customer Service kit's optional "Play response audio" (speak(), a text-to-speech renderer after
// N-ATLaS). Switched on only after it has been verified against the live backend (docs/REPORT.md).
export const LIVE_SPEECH = false;

// The playground's speak() tab (/playground). On: the user asked for chat, transcribe and speak all to be
// testable on the site. Clear in English, experimental in the other languages (docs/REPORT.md, KI-14), and
// the page says so next to the controls.
export const PLAYGROUND_SPEECH = true;

export const KIT_NAMES = { citizen: "Citizen Services", education: "Education", support: "Customer Service" };
