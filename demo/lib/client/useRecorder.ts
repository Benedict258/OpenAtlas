import { useEffect, useRef, useState } from "react";

export interface RecorderState {
  recording: boolean;
  elapsed: number;
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

/** In-browser microphone recording with a hard time cap and a level meter. */
export function useRecorder(
  maxSeconds: number,
  onClip: (blob: Blob, durationMs: number) => void,
): RecorderState {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);
  const startedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  function teardown() {
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

  useEffect(() => teardown, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser does not support audio recording.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
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
      const ms = Math.min(Date.now() - startedRef.current, maxSeconds * 1000);
      const wasRecording = recordingRef.current;
      teardown();
      if (!wasRecording) return;
      if (blob.size > 0) {
        onClipRef.current(blob, ms);
      } else {
        setError("That recording was empty — please record again.");
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
      if (ms >= maxSeconds * 1000) stop();
    }, 100);
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else teardown();
  }

  return { recording, elapsed, level, error, start, stop, clearError: () => setError(null) };
}
