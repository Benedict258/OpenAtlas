"use client";

import { useMemo, useState } from "react";
import type { PromptSpec } from "@openatlas/sdk";
import { buildPrompt } from "@openatlas/sdk";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { CHAT_LANGS, langName } from "@/lib/langs";
import { DemoApiError, postJson } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";

interface RunOk {
  ok: true;
  mock: boolean;
  content: string;
  model: string;
  attribution: string;
}

const EXAMPLE_SPECS: { name: string; spec: Partial<PromptSpec>; input: string }[] = [
  {
    name: "Receipt explainer (Hausa)",
    spec: {
      language: "ha",
      role: "a cashier helper that explains receipts to shoppers",
      task: "Explain what the receipt total includes in two short sentences. If the message is not a receipt, say you cannot help with that.",
      format: "Line 1: Jumla (total). Line 2: Bayani (note).",
      reminder: "Reply in the two-line format for this receipt: {language}",
    },
    input: "Jumlar yau ita ce naira 4,500.",
  },
  {
    name: "Word coach (Yoruba)",
    spec: {
      language: "yo",
      role: "a Yoruba word coach for beginners",
      task: "Give the meaning of the word and one short example sentence. If you are not sure of the meaning, say so briefly instead of guessing.",
      example: "Word: ọmọ — child. Example: Ọmọ náà ń ṣeré. (The child is playing.)",
      reminder: "Use the Word / Meaning / Example labels exactly as written: {language}",
    },
    input: "ilé",
  },
];

export default function PromptBuilder() {
  const [spec, setSpec] = useState<PromptSpec>({
    language: "ha",
    role: "a cashier helper that explains receipts to shoppers",
    task: "Explain what the receipt total includes in two short sentences. If the message is not a receipt, say you cannot help with that.",
    format: "Line 1: Jumla (total). Line 2: Bayani (note).",
    reminder: "Reply in the two-line format for this receipt: {language}",
  });
  const [input, setInput] = useState("Jumlar yau ita ce naira 4,500.");
  const [result, setResult] = useState<RunOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { waiting, seconds, start, stop } = useWaiting();

  const preview = useMemo(() => {
    try {
      if (!spec.role.trim() || !spec.task.trim() || !input.trim()) return null;
      return buildPrompt(spec, input);
    } catch {
      return null;
    }
  }, [spec, input]);

  function set<K extends keyof PromptSpec>(key: K, value: PromptSpec[K]) {
    setSpec((prev) => ({ ...prev, [key]: value }));
  }

  function loadExample(i: number) {
    const ex = EXAMPLE_SPECS[i];
    if (!ex) return;
    setSpec({ ...ex.spec } as PromptSpec);
    setInput(ex.input);
    setResult(null);
  }

  async function run() {
    if (!preview || waiting) return;
    setError(null);
    start();
    try {
      const res = await postJson<RunOk>("/api/prompt-run", { spec, input });
      setResult(res);
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      stop();
    }
  }

  async function copySystem() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview[0]?.content ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const userMessage = preview?.[preview.length - 1]?.content ?? "";

  return (
    <Screen
      title="buildPrompt(): prompt builder"
      desc="Compose a system prompt with systemPrompt(), preview the exact messages, then run them through chat()."
      actions={
        <>
          <LangSelect options={CHAT_LANGS} value={spec.language} onChange={(v) => set("language", v as PromptSpec["language"])} />
          <span className="lang-pick">
            <label htmlFor="preset">Example:</label>
            <select
              id="preset"
              className="select inline"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") loadExample(Number(e.target.value));
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Load…
              </option>
              {EXAMPLE_SPECS.map((ex, i) => (
                <option key={ex.name} value={i}>
                  {ex.name}
                </option>
              ))}
            </select>
          </span>
        </>
      }
    >
      <div className="row grow" style={{ alignItems: "stretch", gap: 16 }}>
        <div className="col scroll-y grow" style={{ gap: 12, paddingRight: 4 }}>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-role">Role — one sentence on what the assistant does (required)</label>
            <input
              id="pb-role"
              className="textarea"
              value={spec.role}
              maxLength={500}
              onChange={(e) => set("role", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-task">Task — what to do with the message, and what to do when it can&apos;t be done (required)</label>
            <textarea
              id="pb-task"
              className="textarea"
              style={{ minHeight: 74 }}
              value={spec.task}
              maxLength={2000}
              onChange={(e) => set("task", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-ref">Reference — material the answer must come from (optional)</label>
            <textarea
              id="pb-ref"
              className="textarea"
              style={{ minHeight: 56 }}
              value={spec.reference ?? ""}
              maxLength={4000}
              onChange={(e) => set("reference", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-format">Format — fixed output format; labels stay in English (optional)</label>
            <input
              id="pb-format"
              className="textarea"
              value={spec.format ?? ""}
              maxLength={1000}
              onChange={(e) => set("format", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-example">Example — one worked example, kept short (optional)</label>
            <textarea
              id="pb-example"
              className="textarea"
              style={{ minHeight: 56 }}
              value={spec.example ?? ""}
              maxLength={1000}
              onChange={(e) => set("example", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-reminder">Reminder — repeated after the message; {"{language}"} becomes the reply language (optional)</label>
            <input
              id="pb-reminder"
              className="textarea"
              value={spec.reminder ?? ""}
              maxLength={500}
              onChange={(e) => set("reminder", e.target.value)}
            />
          </div>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-label">Input label — how the message is introduced when a reminder is set (optional)</label>
            <input
              id="pb-label"
              className="textarea"
              value={spec.inputLabel ?? ""}
              maxLength={200}
              onChange={(e) => set("inputLabel", e.target.value)}
            />
          </div>
        </div>

        <div className="col scroll-y grow" style={{ gap: 12, paddingRight: 4 }}>
          <div className="field" style={{ gap: 6 }}>
            <label htmlFor="pb-input">User message</label>
            <textarea
              id="pb-input"
              className="textarea"
              style={{ minHeight: 60 }}
              value={input}
              maxLength={8000}
              onChange={(e) => setInput(e.target.value)}
              placeholder="The message the model will answer…"
            />
          </div>

          <div className="field grow" style={{ gap: 6, minHeight: 0 }}>
            <div className="row between">
              <label htmlFor="pb-system">System prompt — systemPrompt(spec)</label>
              <button type="button" className="btn ghost small" onClick={() => void copySystem()} disabled={!preview}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <pre id="pb-system" className="prompt-pre scroll grow">
              {preview ? preview[0]?.content : "Fill in Role and Task to build the prompt…"}
            </pre>
          </div>

          <div className="field" style={{ gap: 6 }}>
            <label>User message sent — buildPrompt() adds the reminder, if set</label>
            <pre className="prompt-pre" style={{ maxHeight: 110 }}>
              {userMessage || "—"}
            </pre>
          </div>

          <div className="row wrap" style={{ gap: 12 }}>
            <button type="button" className="btn" onClick={() => void run()} disabled={!preview || waiting}>
              {waiting ? "Running…" : "Run prompt"}
            </button>
            <span className="note">
              Runs locally in your browser until you press Run prompt — that sends it through{" "}
              <strong>chat()</strong>.
            </span>
          </div>

          {error && <ErrorPanel code={error} onRetry={run} onDismiss={() => setError(null)} />}
          {waiting && <Waiting seconds={seconds} />}

          {result && (
            <div className="panel fade-in" style={{ maxHeight: 220, overflowY: "auto" }}>
              <div className="col" style={{ gap: 10 }}>
                <p className="transcript">{result.content}</p>
                <span className="meta">
                  <span>Model: {result.model}</span>
                  <span className="attribution">{result.attribution}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 12 }}>
        <span className="note">
          Reply in <strong>{langName(CHAT_LANGS, spec.language)}</strong>. chat() is called without a
          language so fixed format labels stay English (prompt.d.ts).
        </span>
        <span className="note">Both preview panels are live buildPrompt() output — nothing is sent until you run.</span>
      </div>
    </Screen>
  );
}
