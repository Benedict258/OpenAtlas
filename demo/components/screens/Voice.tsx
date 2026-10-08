"use client";

import { useRef, useState } from "react";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { TRANSCRIBE_LANGS, langName } from "@/lib/langs";
import { DemoApiError, postForm, postJson } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";
import { useRecorder } from "@/lib/client/useRecorder";

const MAX_SECONDS = 30;

const PHASE_TEXT = {
  transcribing: "Transcribing your voice…",
  thinking: "The model is thinking…",
  speaking: "Speaking the reply…",
} as const;

type Phase = keyof typeof PHASE_TEXT | null;

interface TranscribeOk {
  ok: true;
  mock: boolean;
  text: string;
  language: string;
  model: string;
  attribution: string;
}

interface ChatOk {
  ok: true;
  mock: boolean;
  content: string;
  model: string;
  attribution: string;
}

interface SpeakOk {
  ok: true;
  mock: boolean;
  audioBase64: string;
  attribution: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  durationMs?: number;
  model?: string;
  attribution?: string;
  audioUrl?: string;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "webm";
}

export default function Voice() {
  const [language, setLanguage] = useState("ha");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>(null);
  const [error, setError] = useState<string | null>(null);
  const { waiting, seconds, start, stop } = useWaiting();
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const lastClipRef = useRef<{ blob: Blob; durationMs: number } | null>(null);

  const recorder = useRecorder(MAX_SECONDS, (blob, durationMs) => {
    void runPipeline(blob, durationMs);
  });
  const { recording, elapsed, level, error: recError } = recorder;

  // transcribe and chat use the same spoken language; chat's code is en for en-ng.
  const chatLang = language === "en-ng" ? "en" : language;

  async function runPipeline(blob: Blob, durationMs: number) {
    if (waiting) return;
    lastClipRef.current = { blob, durationMs };
    setError(null);
    setPhase("transcribing");
    start();
    try {
      const fd = new FormData();
      fd.append("audio", blob, `voice.${extFor(blob.type)}`);
      fd.append("language", language);
      const t = await postForm<TranscribeOk>("/api/transcribe", fd);

      const history = historyRef.current;
      const userMsg = { role: "user" as const, content: t.text };
      setTurns((prev) => [...prev, { role: "user", text: t.text, durationMs }]);

      setPhase("thinking");
      const chat = await postJson<ChatOk>("/api/chat", {
        messages: [...history, userMsg],
        language: chatLang,
      });
      historyRef.current = [...history, userMsg, { role: "assistant", content: chat.content }];
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: chat.content, model: chat.model, attribution: chat.attribution },
      ]);

      setPhase("speaking");
      const s = await postJson<SpeakOk>("/api/speak", { text: chat.content, language: chatLang });
      const bytes = Uint8Array.from(atob(s.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      setTurns((prev) =>
        prev.map((tn, i) => (i === prev.length - 1 && tn.role === "assistant" ? { ...tn, audioUrl: url } : tn)),
      );
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      setPhase(null);
      stop();
    }
  }

  function clearAll() {
    setTurns((prev) => {
      prev.forEach((t) => t.audioUrl && URL.revokeObjectURL(t.audioUrl));
      return [];
    });
    historyRef.current = [];
    setError(null);
  }

  const remaining = Math.max(0, MAX_SECONDS - Math.floor(elapsed / 1000));
  const retry = () => {
    const c = lastClipRef.current;
    if (c) void runPipeline(c.blob, c.durationMs);
  };

  return (
    <Screen
      title="Voice conversation"
      desc="A speech loop in one screen: transcribe() hears you, chat() answers, speak() reads it back."
      actions={
        <>
          <LangSelect options={TRANSCRIBE_LANGS} value={language} onChange={setLanguage} />
          <button type="button" className="btn ghost small" onClick={clearAll} disabled={waiting || turns.length === 0}>
            Clear conversation
          </button>
        </>
      }
    >
      <p className="note">
        Speak <strong>{langName(TRANSCRIBE_LANGS, language)}</strong> — the language must match the
        selection, there is no auto-detection. The reply is read back in the same language.
      </p>

      <div className="panel scroll grow">
        {turns.length === 0 ? (
          <p className="empty">Press the mic and say something — the answer is spoken back.</p>
        ) : (
          <div className="msgs">
            {turns.map((t, i) => (
              <div key={i} className={`msg ${t.role}`}>
                <div className="msg-body">{t.text}</div>
                <div className="msg-meta">
                  {t.role === "user" ? (
                    <span>You spoke {t.durationMs ? clock(t.durationMs) : ""}</span>
                  ) : (
                    <>
                      <span>Model: {t.model}</span>
                      <span className="attribution">{t.attribution}</span>
                    </>
                  )}
                </div>
                {t.role === "assistant" && t.audioUrl && (
                  <audio src={t.audioUrl} controls autoPlay />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 16 }}>
        {!recording ? (
          <>
            <button type="button" className="mic" onClick={() => void recorder.start()} disabled={waiting}>
              <span aria-hidden>●</span>
            </button>
            <div className="col" style={{ gap: 4 }}>
              <strong>Hold a conversation</strong>
              <span className="note">
                Press to speak (max {MAX_SECONDS} s) — the reply plays automatically.
              </span>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="mic on" onClick={recorder.stop} title="Stop recording">
              <span aria-hidden>■</span>
            </button>
            <div className="col grow" style={{ gap: 8, maxWidth: 420 }}>
              <strong className="counter">
                {clock(elapsed)} / 00:{MAX_SECONDS} —{" "}
                <span className={remaining <= 5 ? "counter over" : ""}>{remaining} s left</span>
              </strong>
              <div className="level">
                <div className="level-fill" style={{ width: `${level}%` }} />
              </div>
            </div>
          </>
        )}
      </div>

      {recError && (
        <div className="banner error" role="alert">
          <span className="banner-text">{recError}</span>
        </div>
      )}
      {error && <ErrorPanel code={error} onRetry={retry} onDismiss={() => setError(null)} />}
      {waiting && (
        <div className="row" style={{ gap: 12 }}>
          <Waiting seconds={seconds} />
          {phase && <span className="note">{PHASE_TEXT[phase]}</span>}
        </div>
      )}
    </Screen>
  );
}
