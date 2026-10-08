"use client";

import { useEffect, useRef, useState } from "react";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { TEXT_LANGS } from "@/lib/langs";
import { DemoApiError, postJson } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";

const MAX_TEXT = 8000;
const MAX_NOTE = 1980;

interface ReportOk {
  ok: true;
  mock: boolean;
  id: string;
  received_at: string;
}

export default function ReportIssue() {
  const [kind, setKind] = useState<"chat" | "transcription">("chat");
  const [output, setOutput] = useState("");
  const [correction, setCorrection] = useState("");
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [note, setNote] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [result, setResult] = useState<ReportOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { waiting, seconds, start, stop } = useWaiting();
  const loadedRef = useRef(false);

  // Prefill from ?output=&input= (the "Report this reply" link on /chat).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const out = params.get("output");
    const inp = params.get("input");
    const lang = params.get("language");
    if (out) setOutput(out.slice(0, MAX_TEXT));
    if (inp) setInput(inp.slice(0, MAX_TEXT));
    if (lang && ["en", "en-ng", "ha", "yo", "ig"].includes(lang)) setLanguage(lang);
    setPrefilled(Boolean(out));
  }, []);

  async function send() {
    if (waiting) return;
    setError(null);
    start();
    try {
      const res = await postJson<ReportOk>("/api/report-issue", {
        kind,
        output,
        correction,
        ...(kind === "chat" ? { input } : {}),
        language,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      stop();
    }
  }

  function reset() {
    setOutput("");
    setCorrection("");
    setInput("");
    setNote("");
    setResult(null);
    setPrefilled(false);
  }

  const canSend = Boolean(output.trim() && correction.trim() && (kind === "transcription" || input.trim()));

  if (result) {
    return (
      <Screen
        title="reportIssue(): corrections"
        desc="Send a wrong N-ATLaS output and its correction to the N-ATLaS team."
      >
        <div className="panel fade-in" style={{ maxWidth: 640 }}>
          <div className="col" style={{ gap: 10 }}>
            <h3 style={{ margin: 0 }}>Report received</h3>
            <p className="transcript">
              Thank you — your correction has been sent{result.mock ? " (mock)" : ""}.
            </p>
            <span className="meta">
              <span>id: {result.id}</span>
              <span>received_at: {result.received_at}</span>
            </span>
            <div className="row" style={{ gap: 12 }}>
              <button type="button" className="btn" onClick={reset}>
                Report another issue
              </button>
            </div>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title="reportIssue(): corrections"
      desc="Send a wrong N-ATLaS output and its correction to the N-ATLaS team."
      actions={<LangSelect options={TEXT_LANGS} value={language} onChange={setLanguage} />}
    >
      <div className="row grow" style={{ alignItems: "stretch", gap: 16 }}>
        <div className="col scroll-y grow" style={{ gap: 12, paddingRight: 4 }}>
          <div className="field" style={{ gap: 6 }}>
            <label>Which output was wrong?</label>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className={`chip${kind === "chat" ? " on" : ""}`}
                aria-pressed={kind === "chat"}
                onClick={() => setKind("chat")}
              >
                a chat reply
              </button>
              <button
                type="button"
                className={`chip${kind === "transcription" ? " on" : ""}`}
                aria-pressed={kind === "transcription"}
                onClick={() => setKind("transcription")}
              >
                a transcription
              </button>
            </div>
          </div>

          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="ri-output">What N-ATLaS returned</label>
            <textarea
              id="ri-output"
              className="textarea"
              style={{ minHeight: 74 }}
              value={output}
              maxLength={MAX_TEXT}
              onChange={(e) => setOutput(e.target.value)}
              placeholder="Paste the wrong output…"
            />
            {prefilled && <span className="note">Prefilled from your conversation — edit if you like.</span>}
          </div>

          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="ri-correction">What it should have been</label>
            <textarea
              id="ri-correction"
              className="textarea"
              style={{ minHeight: 74 }}
              value={correction}
              maxLength={MAX_TEXT}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Type the correct output…"
            />
          </div>

          {kind === "chat" && (
            <div className="field" style={{ gap: 6 }}>
              <label htmlFor="ri-input">The prompt that produced it (required for chat issues)</label>
              <textarea
                id="ri-input"
                className="textarea"
                style={{ minHeight: 56 }}
                value={input}
                maxLength={MAX_TEXT}
                onChange={(e) => setInput(e.target.value)}
                placeholder="The user message that was sent…"
              />
            </div>
          )}
        </div>

        <div className="col scroll-y grow" style={{ gap: 12, paddingRight: 4 }}>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="ri-note">Note — context for the team (optional, max 2,000 characters)</label>
            <textarea
              id="ri-note"
              className="textarea"
              style={{ minHeight: 90 }}
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. The reply mixed up two dates."
            />
            <span className="note">
              The app tags every note with the prefix <code>[demo-app]</code>.
            </span>
          </div>

          <div className="col" style={{ gap: 12 }}>
            <button type="button" className="btn" onClick={() => void send()} disabled={!canSend || waiting}>
              {waiting ? "Sending…" : "Send report"}
            </button>
            <span className="note">
              Nothing is recorded unless you send this report. By sending it, you consent to this
              correction being stored to improve N-ATLaS. <strong>reportIssue()</strong> is the only
              thing that stores anything — the gateway keeps no chat history.
            </span>
          </div>

          {error && <ErrorPanel code={error} onRetry={send} onDismiss={() => setError(null)} />}
          {waiting && <Waiting seconds={seconds} />}
        </div>
      </div>
    </Screen>
  );
}
