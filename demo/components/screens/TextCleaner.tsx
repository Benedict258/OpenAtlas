"use client";

import { useMemo, useState } from "react";
import { normalizeText } from "@openatlas/sdk";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import { TEXT_LANGS } from "@/lib/langs";
import { diffChars } from "@/lib/client/diff";
import { examplesFor } from "@/lib/client/examples";

const MAX_INPUT = 2000;

export default function TextCleaner() {
  const [language, setLanguage] = useState("ha");
  const [apostrophes, setApostrophes] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ input: string; output: string } | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const options = useMemo(() => examplesFor(language), [language]);
  const showApostrophes = language === "ha";

  // The After panel shows a real normalizeText() call; it re-runs when the input
  // or the options change after the first Clean.
  const live = useMemo(() => {
    if (!input) return "";
    return normalizeText(input, {
      language: language as "en" | "en-ng" | "ha" | "yo" | "ig",
      hausaApostrophes: showApostrophes && apostrophes,
    });
  }, [input, language, apostrophes, showApostrophes]);

  const dirty = result !== null && (result.input !== input || result.output !== live);
  const output = result ? (dirty ? live : result.output) : null;

  const segments = useMemo(
    () => (output !== null ? diffChars(input, output) : null),
    [input, output],
  );

  const changed = segments?.some((s) => s.changed) ?? false;

  function clean() {
    if (!input) return;
    setResult({ input, output: live });
  }

  function loadExample() {
    const ex = options[exampleIdx % options.length];
    setExampleIdx((i) => i + 1);
    if (ex.language) setLanguage(ex.language);
    setApostrophes(Boolean(ex.hausaApostrophes));
    setInput(ex.text);
    setResult(null);
    // Run it straight away so the video shows the change immediately.
    const after = normalizeText(ex.text, {
      language: (ex.language ?? language) as "en" | "en-ng" | "ha" | "yo" | "ig",
      hausaApostrophes: Boolean(ex.hausaApostrophes),
    });
    setResult({ input: ex.text, output: after });
  }

  async function copy() {
    if (output === null) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const exampleLabel = options.length > 1
    ? options[exampleIdx % options.length].label
    : "Example: broken text";

  return (
    <Screen
      title="normalizeText(): repair corrupted characters (runs locally)"
      desc="Fixes text damaged on the way in — encoding mix-ups, look-alike letters, invisible characters."
      actions={
        <>
          <LangSelect options={TEXT_LANGS} value={language} onChange={setLanguage} />
          {showApostrophes && (
            <label className="check">
              <input
                type="checkbox"
                checked={apostrophes}
                onChange={(e) => setApostrophes(e.target.checked)}
              />
              Convert Hausa apostrophes (k'asa)
            </label>
          )}
        </>
      }
    >
      <p className="note">
        {language
          ? "With a language, its specific repairs run too."
          : "Without a language, only the language-neutral steps run (invisible characters, encoding repair, Unicode NFC)."}
      </p>

      <div className="row grow" style={{ alignItems: "stretch", gap: 16 }}>
        <div className="col grow">
          <div className="field grow" style={{ gap: 8 }}>
            <label htmlFor="before">Before (paste messy text)</label>
            <textarea
              id="before"
              className="textarea grow"
              style={{ height: "100%" }}
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste corrupted text here, or load an example…"
              spellCheck={false}
            />
          </div>
          <div className="row between">
            <span className="counter">
              {input.length} / {MAX_INPUT}
            </span>
            <button type="button" className="btn ghost small" onClick={loadExample}>
              {exampleLabel}
            </button>
          </div>
        </div>

        <div className="col grow">
          <div className="field grow" style={{ gap: 8 }}>
            <label>After (cleaned)</label>
            <div className="panel scroll grow" style={{ height: "100%" }}>
              {output === null ? (
                <p className="empty">Press Clean to see the repaired text.</p>
              ) : segments ? (
                <p className="diff">
                  {segments.map((seg, i) =>
                    seg.changed ? (
                      <mark key={i} className="diff-add">
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <div className="row between">
            <span className="note">
              {output === null
                ? "Changed characters will be highlighted here."
                : changed
                  ? "Changed characters highlighted above."
                  : "No changes — this text is already clean."}
            </span>
            <button type="button" className="btn ghost small" onClick={copy} disabled={output === null}>
              {copied ? "Copied ✓" : "Copy result"}
            </button>
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <button type="button" className="btn" onClick={clean} disabled={!input}>
          Clean
        </button>
        <span className="chip" style={{ cursor: "default" }}>
          Runs locally — no network call, no API key
        </span>
        <span className="note">
          This repairs characters that were damaged on the way in. It does not add tone marks or
          dot-below marks that were never typed.
        </span>
      </div>
    </Screen>
  );
}
