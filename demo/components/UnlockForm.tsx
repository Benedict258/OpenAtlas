"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DemoApiError, friendlyError } from "@/lib/client/api";

export default function UnlockForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !passcode) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !data || (data as { ok?: boolean }).ok !== true) {
        const code =
          data && typeof data === "object"
            ? (data as { error?: { code?: unknown } }).error?.code
            : undefined;
        throw new DemoApiError(typeof code === "string" && code ? code : "unknown");
      }
      router.push("/chat");
      router.refresh();
    } catch (err) {
      const code = err instanceof DemoApiError ? err.code : "unknown";
      setMessage(friendlyError(code).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="col" style={{ gap: 14 }}>
      <div className="field">
        <label htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          type="password"
          className="input"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Enter the demo passcode"
          autoFocus
          autoComplete="off"
        />
      </div>
      {message && (
        <div className="banner error fade-in" role="alert">
          <span className="banner-text">{message}</span>
        </div>
      )}
      <button type="submit" className="btn" disabled={busy || !passcode}>
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
