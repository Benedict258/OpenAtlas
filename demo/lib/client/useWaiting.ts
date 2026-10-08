"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks elapsed seconds while a request runs, so every page can show the same
 * spinner + seconds and the 8-second "model may be waking up" note.
 */
export function useWaiting() {
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setWaiting(false);
  }, []);

  const start = useCallback(() => {
    startedAt.current = Date.now();
    setSeconds(0);
    setWaiting(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds((Date.now() - startedAt.current) / 1000);
    }, 100);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return { waiting, seconds, start, stop };
}
