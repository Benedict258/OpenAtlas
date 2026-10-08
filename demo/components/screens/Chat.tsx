"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@openatlas/sdk";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { CHAT_LANGS } from "@/lib/langs";
import { DemoApiError, postJson } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";

interface ChatOk {
  ok: true;
  mock: boolean;
  content: string;
  model: string;
  attribution: string;
}

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  attribution?: string;
}

/** Starter prompts: only the Hausa example is final; the rest are placeholders for Benedict. */
const STARTERS: Record<string, (string | null)[]> = {
  en: [null, null, null],
  ha: ["Ina zan je don yin rajistar katin zabe?", null, null],
  yo: [null, null, null],
  ig: [null, null, null],
};

export default function Chat() {
  const [language, setLanguage] = useState("en");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [systemText, setSystemText] = useState("");
  const [draft, setDraft] = useState("");
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.1);
  const [error, setError] = useState<string | null>(null);
  const { waiting, seconds, start, stop } = useWaiting();
  const listRef = useRef<HTMLDivElement>(null);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send() {
    const text = draft.trim();
    if (!text || waiting) return;

    const next: UiMessage[] = [...messages, { role: "user", content: text }];
    const request: ChatMessage[] = [
      ...(systemText.trim() ? [{ role: "system" as const, content: systemText.trim() }] : []),
      ...next.map((m) => ({ role: m.role, content: m.content })),
    ];

    setError(null);
    start();
    scrollToEnd();
    try {
      const res = await postJson<ChatOk>("/api/chat", {
        messages: request,
        language,
        max_tokens: maxTokens,
        temperature,
      });
      setMessages([
        ...next,
        { role: "assistant", content: res.content, model: res.model, attribution: res.attribution },
      ]);
      setDraft("");
      scrollToEnd();
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      stop();
    }
  }

  function newChat() {
    setMessages([]);
    setError(null);
    setDraft("");
  }

  const starters = STARTERS[language] ?? STARTERS.en;

  return (
    <Screen
      title="chat(): text generation with N-ATLaS"
      desc="One conversation, sent in full on every turn — the gateway keeps no history."
      actions={<LangSelect options={CHAT_LANGS} value={language} onChange={setLanguage} />}
    >
      <div className="row wrap" style={{ gap: 10 }}>
        {starters.map((s, i) =>
          s ? (
            <button key={i} type="button" className="chip" onClick={() => setDraft(s)}>
              {s}
            </button>
          ) : (
            <span key={i} className="chip placeholder" title="To be supplied by Benedict">
              [example prompt {i + 1} — to be supplied]
            </span>
          ),
        )}
      </div>

      <div className="panel scroll grow" ref={listRef}>
        {messages.length === 0 ? (
          <p className="empty">
            Type a message below and press Send — the reply comes from the N-ATLaS model.
          </p>
        ) : (
          <div className="msgs">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role} fade-in`}>
                <div className="msg-body">{m.content}</div>
                {m.role === "assistant" && (
                  <div className="meta msg-meta">
                    <span>Model: {m.model}</span>
                    <span className="attribution">{m.attribution}</span>
                    <a
                      href={`/report-issue?output=${encodeURIComponent(m.content)}&input=${encodeURIComponent(messages[i - 1]?.content ?? lastUser?.content ?? "")}`}
                    >
                      Report this reply
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <ErrorPanel code={error} onRetry={send} onDismiss={() => setError(null)} />}
      {waiting && <Waiting seconds={seconds} />}

      <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
        <details className="pop" style={{ flex: "0 0 auto" }}>
          <summary>System message</summary>
          <textarea
            className="textarea"
            rows={2}
            maxLength={2000}
            placeholder="Optional instructions for the model (default: none)"
            value={systemText}
            onChange={(e) => setSystemText(e.target.value)}
          />
        </details>
        <details className="pop" style={{ flex: "0 0 auto" }}>
          <summary>Advanced</summary>
          <div className="row" style={{ gap: 14 }}>
            <span className="field">
              <label htmlFor="mt">max_tokens (≤ 1024)</label>
              <input
                id="mt"
                className="input"
                type="number"
                min={1}
                max={1024}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 512)}
                style={{ width: 120 }}
              />
            </span>
            <span className="field">
              <label htmlFor="tp">temperature</label>
              <input
                id="tp"
                className="input"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value) || 0.1)}
                style={{ width: 120 }}
              />
            </span>
          </div>
        </details>
        <textarea
          className="textarea grow"
          style={{ minHeight: 76 }}
          placeholder="Type a message… (Enter sends, Shift+Enter makes a new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="btn" onClick={() => void send()} disabled={waiting || !draft.trim()}>
          {waiting ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="row between meta">
        <span>
          {lastReply ? (
            <>
              Model: {lastReply.model} <span className="attribution">{lastReply.attribution}</span>
            </>
          ) : (
            "The whole conversation is sent with each request."
          )}
        </span>
        <button type="button" className="btn ghost small" onClick={newChat} disabled={messages.length === 0}>
          New chat
        </button>
      </div>
    </Screen>
  );
}
