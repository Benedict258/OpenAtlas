"use client";

import { useState } from "react";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { SPEAK_LANGS, langName } from "@/lib/langs";
import { DemoApiError, postJson } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";

const MAX_TEXT = 1000;

const ENGINES = [
  { code: "auto", name: "Auto (default)" },
  { code: "sorotts", name: "SoroTTS — more natural, slower" },
  { code: "mms", name: "MMS — faster, more robotic" },
];

interface SpeakOk {
  ok: true;
  mock: boolean;
  audioBase64: string;
  sample_rate: number;
  seconds: number;
  language: string;
  engine: "sorotts" | "mms";
  model: string;
  voice: string | null;
  sentences: number;
  warnings: string[];
  fallback_reason?: string;
  attribution: string;
}

export default function Speak() {
  const [language, setLanguage] = useState("ha");
  const [engine, setEngine] = useState("auto");
  const [text, setText] = useState("");
  const [result, setResult] = useState<SpeakOk | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { waiting, seconds, start, stop } = useWaiting();

  async function speak() {
    const value = text.trim();
    if (!value || waiting) return;
    setError(null);
    start();
    try {
      const res = await postJson<SpeakOk>("/api/speak", { text: value, language, engine });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      setAudioUrl(url);
      setResult(res);
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      stop();
    }
  }

  const over = text.length > MAX_TEXT;

  return (
    <Screen
      title="speak(): text to speech"
      desc="Renders text as audio with the speech engine — it only reads text aloud; it never answers or translates."
      actions={
        <>
          <LangSelect options={SPEAK_LANGS} value={language} onChange={setLanguage} />
          <span className="lang-pick">
            <label htmlFor="engine">Engine:</label>
            <select id="engine" className="select inline" value={engine} onChange={(e) => setEngine(e.target.value)}>
              {ENGINES.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.name}
                </option>
              ))}
            </select>
          </span>
        </>
      }
    >
      <div className="col grow" style={{ gap: 12 }}>
        <div className="field grow" style={{ gap: 8 }}>
          <label htmlFor="speech-text">Text to speak (max {MAX_TEXT} characters)</label>
          <textarea
            id="speech-text"
            className="textarea grow"
            style={{ height: "100%", minHeight: 90 }}
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste the text to read aloud…"
          />
        </div>
        <div className="row between">
          <span className={`counter${over ? " over" : ""}`}>
            {text.length} / {MAX_TEXT}
          </span>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn" onClick={() => void speak()} disabled={waiting || !text.trim()}>
              {waiting ? "Speaking…" : "Speak"}
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorPanel code={error} onRetry={speak} onDismiss={() => setError(null)} />}
      {waiting && <Waiting seconds={seconds} />}

      {result && audioUrl && (
        <div className="col fade-in" style={{ gap: 12 }}>
          <div className="player">
            <audio src={audioUrl} controls autoPlay />
            <a className="btn ghost small" href={audioUrl} download="openatlas-speech.wav">
              Download WAV
            </a>
          </div>
          <div className="meta">
            <span>
              Engine used: <strong>{result.engine}</strong>
            </span>
            <span>Voice: {result.voice ?? "—"}</span>
            <span>{result.sample_rate} Hz</span>
            <span>{result.seconds.toFixed(1)} s</span>
            <span>
              {result.sentences} {result.sentences === 1 ? "sentence" : "sentences"}
            </span>
            <span className="attribution">{result.attribution}</span>
          </div>
          {result.warnings.length > 0 && (
            <div className="banner warn">
              <span className="banner-text">{result.warnings.join(" · ")}</span>
            </div>
          )}
          {result.fallback_reason && (
            <div className="banner warn">
              <span className="banner-text">Fallback: {result.fallback_reason}</span>
            </div>
          )}
        </div>
      )}

      {!result && !waiting && !error && (
        <p className="empty" style={{ minHeight: 60 }}>
          The rendered audio will appear here.
        </p>
      )}

      <div className="row between wrap" style={{ gap: 12 }}>
        <span className="note">
          English is clear. Hausa, Yoruba and Igbo speech is experimental.
        </span>
        <span className="note">
          Tip: Yoruba and Igbo sound best with tone marks and dots; Hausa with its hooked letters.
          You are speaking <strong>{langName(SPEAK_LANGS, language)}</strong>.
        </span>
      </div>
    </Screen>
  );
}
