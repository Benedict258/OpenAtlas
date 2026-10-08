"use client";

import { useEffect, useState } from "react";

type State = "loading" | "up" | "down" | "unknown" | "mock";

interface StatusResponse {
  ok: boolean;
  reachable: boolean | null;
  mock: boolean;
}

export default function StatusDot() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: StatusResponse = await res.json();
        if (!alive) return;
        if (data.mock) {
          setState("mock");
        } else {
          setState(data.reachable === true ? "up" : data.reachable === false ? "down" : "unknown");
        }
      } catch {
        if (alive) setState("unknown");
      }
    }

    check();
    const id = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const label =
    state === "up"
      ? "Model server reachable"
      : state === "down"
        ? "Model server unreachable"
        : state === "mock"
          ? "Mock mode — not N-ATLaS"
          : state === "loading"
            ? "Checking model server…"
            : "Model server status unknown";

  return (
    <span className="status" title={label}>
      <span
        className={`status-dot${
          state === "up"
            ? " up"
            : state === "down"
              ? " down"
              : state === "mock"
                ? " mock"
                : state === "unknown"
                  ? " unknown"
                  : ""
        }`}
        aria-hidden
      />
      {label}
    </span>
  );
}
