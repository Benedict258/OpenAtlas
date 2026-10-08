"use client";

import { useEffect, useRef, useState } from "react";
import Screen from "@/components/Screen";
import LangSelect from "@/components/LangSelect";
import Waiting from "@/components/Waiting";
import ErrorPanel from "@/components/ErrorPanel";
import { TRANSCRIBE_LANGS } from "@/lib/langs";
import { DemoApiError, postForm } from "@/lib/client/api";
import { useWaiting } from "@/lib/client/useWaiting";

const MAX_SECONDS = 30;
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

interface TranscribeOk {
  ok: true;
  mock: boolean;
  text: string;
  language: string;
  model: string;
  attribution: string;
}

interface Clip {
  blob: Blob;
  url: string;
  source: "record" | "upload";
  label: string;
  fileName: string;
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

export default function Transcribe() {
  const [language, setLanguage] = useState("ha");
  const [clip, setClip] = useState<Clip | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscribeOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { waiting, seconds, start, stop } = useWaiting();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);
  const startedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function teardownRecorder() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setLevel(0);
  }

  useEffect(() => teardownRecorder, []);

  function setNewClip(blob: Blob, source: "record" | "upload", label: string, fileName: string) {
    setResult(null);
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, url: URL.createObjectURL(blob), source, label, fileName };
    });
  }

  async function startRecording() {
    setRecError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecError("This browser does not support audio recording.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setRecError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone permission was denied. Allow the microphone in your browser and try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Could not open the microphone. Please check your input device.",
      );
      return;
    }

    streamRef.current = stream;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ms = Math.min(Date.now() - startedRef.current, MAX_SECONDS * 1000);
      const wasRecording = recordingRef.current;
      teardownRecorder();
      if (!wasRecording) return;
      if (blob.size > 0) {
        setNewClip(blob, "record", `Recording · ${clock(ms)}`, `recording.${extFor(type)}`);
      } else {
        setRecError("That recording was empty — please record again.");
      }
    };

    // Level meter from the same stream.
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          peak = Math.max(peak, Math.abs(buf[i] - 128));
        }
        setLevel(Math.min(100, Math.round((peak / 128) * 100 * 1.6)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // the level meter is optional
    }

    startedRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    recordingRef.current = true;
    recorder.start();
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsed(ms);
      if (ms >= MAX_SECONDS * 1000) stopRecording();
    }, 100);
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else teardownRecorder();
  }

  function takeFile(file: File) {
    setClipError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setClipError("That recording could not be used. Try a shorter clip (30 seconds or less).");
      return;
    }
    setNewClip(file, "upload", `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, file.name);
  }

  async function transcribe() {
    if (!clip || waiting) return;
    setError(null);
    start();
    try {
      const fd = new FormData();
      fd.append("audio", clip.blob, clip.fileName);
      fd.append("language", language);
      const res = await postForm<TranscribeOk>("/api/transcribe", fd);
      setResult(res);
    } catch (e) {
      setError(e instanceof DemoApiError ? e.code : "unknown");
    } finally {
      stop();
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const remaining = Math.max(0, MAX_SECONDS - Math.floor(elapsed / 1000));

  return (
    <Screen
      title="transcribe(): speech to text"
      desc="Speech recognition with the N-ATLaS ASR model for the language you speak."
      actions={<LangSelect options={TRANSCRIBE_LANGS} value={language} onChange={setLanguage} />}
    >
      <p className="note">
        The spoken language must match the selection — there is no auto-detection. Clips up to{" "}
        {MAX_SECONDS} seconds are reliable.
      </p>

      <div className="row" style={{ gap: 16, alignItems: "stretch" }}>
        <div className="card col grow" style={{ gap: 14 }}>
          <h3>Record in the browser</h3>
          {!recording ? (
            <div className="row" style={{ gap: 16 }}>
              <button type="button" className="mic" onClick={() => void startRecording()} disabled={waiting}>
                <span aria-hidden>●</span>
              </button>
              <div className="col" style={{ gap: 4 }}>
                <strong>{clip?.source === "record" ? "Record again" : "Record"}</strong>
                <span className="note">Stops by itself at 00:{MAX_SECONDS}</span>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 16 }}>
              <button type="button" className="mic on" onClick={stopRecording} title="Stop recording">
                <span aria-hidden>■</span>
              </button>
              <div className="col grow" style={{ gap: 8 }}>
                <strong className="counter">
                  {clock(elapsed)} / 00:{MAX_SECONDS} —{" "}
                  <span className={remaining <= 5 ? "counter over" : ""}>{remaining} s left</span>
                </strong>
                <div className="level">
                  <div className="level-fill" style={{ width: `${level}%` }} />
                </div>
              </div>
            </div>
          )}
          {recError && (
            <div className="banner error" role="alert">
              <span className="banner-text">{recError}</span>
            </div>
          )}
        </div>

        <div
          className="card col grow"
          style={{ gap: 14 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) takeFile(f);
          }}
        >
          <h3>Or upload an audio file</h3>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn ghost" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
            <span className="note">Drop a file here (max 7 MB) — webm, m4a, wav…</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) takeFile(f);
              e.target.value = "";
            }}
          />
          {clipError && (
            <div className="banner error" role="alert">
              <span className="banner-text">{clipError}</span>
            </div>
          )}
        </div>
      </div>

      {clip && (
        <div className="player fade-in">
          <span className="note" style={{ whiteSpace: "nowrap" }}>
            {clip.source === "record" ? "Your recording" : "File"}: {clip.label}
          </span>
          <audio src={clip.url} controls />
        </div>
      )}

      <div className="row wrap" style={{ gap: 12 }}>
        <button type="button" className="btn" onClick={() => void transcribe()} disabled={!clip || waiting}>
          {waiting ? "Transcribing…" : "Transcribe"}
        </button>
        {clip && !waiting && <span className="note">Review the clip above, then press Transcribe.</span>}
      </div>

      {error && <ErrorPanel code={error} onRetry={transcribe} onDismiss={() => setError(null)} />}
      {waiting && <Waiting seconds={seconds} />}

      <div className="panel scroll grow">
        {result ? (
          <div className="col fade-in" style={{ gap: 12 }}>
            <p className="transcript">{result.text}</p>
            <div className="row between wrap" style={{ gap: 12 }}>
              <span className="meta">
                <span>Model: {result.model}</span>
                <span className="attribution">{result.attribution}</span>
              </span>
              <button type="button" className="btn ghost small" onClick={() => void copy()}>
                {copied ? "Copied ✓" : "Copy transcript"}
              </button>
            </div>
          </div>
        ) : (
          <p className="empty">The transcript appears here.</p>
        )}
      </div>
    </Screen>
  );
}
