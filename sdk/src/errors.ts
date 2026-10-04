/** Base class for every error the SDK throws. */
export class OpenAtlasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Codes the gateway can return to an API key holder, by HTTP status. `(string & {})` keeps the type open,
 * so a newer gateway's codes still type-check, while editors autocomplete these.
 */
export type OpenAtlasErrorCode =
  // 400: the request was rejected before reaching a model
  | "invalid_json" | "invalid_messages" | "invalid_language" | "invalid_audio" | "invalid_text" | "invalid_engine"
  | "invalid_issue" | "invalid_request" | "missing_user"
  // 401: authentication
  | "missing_api_key" | "invalid_api_key"
  // 404 / 501: speech output switched off, or not available on this backend
  | "tts_disabled" | "tts_unsupported_backend"
  // 413: over a size limit
  | "audio_too_large" | "issue_too_large" | "text_too_long"
  // 429: limits. Only new end users are refused at the license cap; existing ones continue.
  | "license_cap_reached" | "key_user_share_reached" | "key_quota_exceeded"
  // 502: the backend failed on this request (not retried)
  | "backend_error" | "backend_auth_failed" | "backend_route_missing" | "model_error" | "unexpected_upstream_shape"
  | "upstream_error" | "upstream_failed"
  // 503: no backend, or it's down or still loading (retried), and 504: it didn't answer in time
  | "backend_unavailable" | "upstream_not_configured" | "upstream_timeout"
  // anything else: the HTTP status text
  | "http_error"
  | (string & {});

/** The gateway answered with a non-2xx status. */
export class OpenAtlasAPIError extends OpenAtlasError {
  /** HTTP status from the gateway. */
  readonly status: number;
  /** Machine-readable code; see {@link OpenAtlasErrorCode}. Branch on this, not on the message text. */
  readonly code: OpenAtlasErrorCode;
  /** RunPod job id, when the RunPod backend failed after a job was queued. Useful when reporting issues. */
  readonly jobId?: string;

  constructor(status: number, code: OpenAtlasErrorCode, message: string, jobId?: string) {
    super(`${message} (HTTP ${status}, ${code})`);
    this.status = status;
    this.code = code;
    this.jobId = jobId;
  }
}

/**
 * The request took longer than `timeoutMs`. Usually the N-ATLaS backend had just started and was still
 * loading its models; retrying shortly afterwards normally succeeds.
 */
export class OpenAtlasTimeoutError extends OpenAtlasError {
  constructor(timeoutMs: number) {
    super(
      `No response within ${Math.round(timeoutMs / 1000)}s. The N-ATLaS backend may still be loading its models ` +
        `(a cold start). Retry in a minute, or raise \`timeoutMs\`.`,
    );
  }
}

/** The gateway could not be reached at all (DNS, TLS, network). */
export class OpenAtlasConnectionError extends OpenAtlasError {
  constructor(baseURL: string, cause: unknown) {
    super(`Could not reach the OpenAtlas gateway at ${baseURL}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
