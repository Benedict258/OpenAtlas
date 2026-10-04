// Downloads a multi-clip ASR evaluation set (real speech + human reference transcripts) from public
// Hugging Face datasets into test-audio/eval/ (gitignored), with a manifest for scripts/asr-eval.mjs.
// Clips are taken at evenly spaced rows across each split so they span different speakers.
//
// Caveat: the NCAIR1 ASR model cards say only that training used "publicly available datasets", so
// overlap between these clips and the models' training data cannot be ruled out.
//
// Usage: node --env-file=.env scripts/dev/fetch-asr-eval.mjs [clips per source, default 20]

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PER_SOURCE = Number(process.argv[2] ?? 20);
const SOURCES = [
  { lang: "ha", dataset: "SilencioNetwork/hausa-speech-transcribed", config: "default", split: "test", text: "transcript", duration: "duration" },
  { lang: "yo", dataset: "SilencioNetwork/yoruba-speech-transcribed", config: "default", split: "test", text: "transcript", duration: "duration" },
  { lang: "ig", dataset: "str20tbl/igbosyncorp-igbo-asr-benchmark", config: "default", split: "train", text: "sentence", duration: "duration_s" },
  { lang: "ig", dataset: "deepdml/igbo-dict-16khz", config: "default", split: "train", text: "text", count: 10 },
  { lang: "en-ng", dataset: "benjaminogbonna/nigerian_accented_english_dataset", config: "default", split: "test", text: "sentence" },
];
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test-audio", "eval");
const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
const viewer = "https://datasets-server.huggingface.co";

// The dataset viewer rate-limits bursts; retry with backoff.
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (attempt === 5) throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

const clips = [];
for (const src of SOURCES) {
  const q = `dataset=${src.dataset}&config=${src.config}&split=${src.split}`;
  const first = await getJson(`${viewer}/rows?${q}&offset=0&length=1`);
  const total = first.num_rows_total;
  const n = Math.min(src.count ?? PER_SOURCE, total);
  const dir = join(root, src.lang);
  mkdirSync(dir, { recursive: true });
  let got = 0;
  for (let i = 0; i < n; i++) {
    const offset = Math.floor((i * total) / n);
    const page = await getJson(`${viewer}/rows?${q}&offset=${offset}&length=1`);
    const row = page.rows?.[0]?.row;
    const reference = row?.[src.text];
    const audio = row && Object.values(row).find((v) => Array.isArray(v) && v[0]?.src)?.[0];
    if (!audio || typeof reference !== "string" || !reference.trim() || reference === "unknown") continue;
    const ext = (audio.type?.split("/")[1] ?? "wav").replace("mpeg", "mp3").replace("x-wav", "wav");
    const bytes = Buffer.from(await fetch(audio.src).then((r) => r.arrayBuffer()));
    const file = `${src.dataset.split("/")[1]}-${offset}.${ext}`;
    writeFileSync(join(dir, file), bytes);
    clips.push({
      language: src.lang,
      file: `${src.lang}/${file}`,
      reference,
      dataset: src.dataset,
      split: src.split,
      row: offset,
      duration_s: src.duration && row[src.duration] ? Number(row[src.duration]) : null,
      bytes: bytes.length,
    });
    got++;
  }
  console.log(`${src.lang}: ${got} clips from ${src.dataset} (${src.split}, ${total} rows)`);
}
writeFileSync(join(root, "manifest.json"), JSON.stringify(clips, null, 2) + "\n");
console.log(`${clips.length} clips → test-audio/eval/manifest.json`);
