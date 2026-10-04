// Downloads one real speech clip per N-ATLaS ASR language, with its human reference transcript,
// from public Hugging Face datasets into test-audio/ (gitignored). Used by scripts/smoke-gateway.mjs
// so transcribe() is checked against real speech with a known answer.
//
// Usage: node --env-file=.env scripts/dev/fetch-test-audio.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCES = {
  ha: { dataset: "SilencioNetwork/hausa-speech-transcribed", text: "transcript" },
  yo: { dataset: "SilencioNetwork/yoruba-speech-transcribed", text: "transcript" },
  ig: { dataset: "deepdml/igbo-dict-16khz", text: "text" },
  "en-ng": { dataset: "benjaminogbonna/nigerian_accented_english_dataset", text: "sentence" },
};
const ROW = Number(process.env.ROW ?? 0);
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test-audio");
const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
const viewer = "https://datasets-server.huggingface.co";

mkdirSync(dir, { recursive: true });
const refs = {};
for (const [lang, src] of Object.entries(SOURCES)) {
  const { splits } = await fetch(`${viewer}/splits?dataset=${src.dataset}`, { headers }).then((r) => r.json());
  const { config, split } = splits[0];
  const page = await fetch(`${viewer}/rows?dataset=${src.dataset}&config=${config}&split=${split}&offset=${ROW}&length=1`, { headers }).then((r) => r.json());
  const row = page.rows[0].row;
  const audio = Object.values(row).find((v) => Array.isArray(v) && v[0]?.src)[0];
  const ext = (audio.type?.split("/")[1] ?? "wav").replace("mpeg", "mp3").replace("x-wav", "wav");
  const bytes = Buffer.from(await fetch(audio.src).then((r) => r.arrayBuffer()));
  const file = `${lang}.${ext}`;
  writeFileSync(join(dir, file), bytes);
  refs[lang] = { file, reference: row[src.text], dataset: src.dataset, row: ROW };
  console.log(`${lang}: ${file} (${(bytes.length / 1024).toFixed(0)} KB) — "${row[src.text].slice(0, 70)}…"`);
}
writeFileSync(join(dir, "refs.json"), JSON.stringify(refs, null, 2) + "\n");
