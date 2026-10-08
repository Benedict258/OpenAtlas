"use client";

import { friendlyError } from "@/lib/shared/contract";

/**
 * Friendly error banner for API failures (build spec 5.4). Shows the mapped
 * message, a Retry button where retrying makes sense, and never raw error text.
 */
export default function ErrorPanel({
  code,
  onRetry,
  onDismiss,
}: {
  code: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const { message, isDown } = friendlyError(code);
  const canRetry = Boolean(onRetry) && (isDown || code === "unknown" || code === "rate_limited");
  const expired = code === "unauthorized";

  return (
    <div className="banner error fade-in" role="alert">
      <span className="banner-text">
        {message}
        {expired && (
          <>
            {" "}
            <a href="/unlock">Unlock the demo again</a>
          </>
        )}
      </span>
      <span className="row" style={{ gap: 10 }}>
        {canRetry && (
          <button type="button" className="btn small" onClick={onRetry}>
            Retry
          </button>
        )}
        {onDismiss && !canRetry && (
          <button type="button" className="btn ghost small" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </span>
    </div>
  );
}
