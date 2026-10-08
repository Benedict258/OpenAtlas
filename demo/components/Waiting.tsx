"use client";

import { WAKING_MESSAGE } from "@/lib/shared/contract";

export default function Waiting({ seconds }: { seconds: number }) {
  return (
    <div className="waiting" role="status">
      <span className="spinner" aria-hidden />
      <span className="elapsed">{seconds.toFixed(1)} s</span>
      {seconds >= 8 && <span>{WAKING_MESSAGE}</span>}
    </div>
  );
}
