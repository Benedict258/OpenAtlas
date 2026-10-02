// Which starter-kit demos the website serves live. A kit is added here only after its full pipeline
// has been verified end to end against the live N-ATLaS backend. The others show a "paused" window
// (site/build.mjs) and their API routes answer 503 (site/src/worker.mjs).
export const LIVE_KITS = ["citizen"];

export const KIT_NAMES = { citizen: "Citizen Services", education: "Education", support: "Customer Service" };
