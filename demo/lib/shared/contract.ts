/**
 * The shape every /api/* route in the demo app speaks, plus the friendly user-facing
 * messages from the build spec (section 5.4). Shared by client and server: it holds
 * no secrets.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "not_configured"
  | "bad_request"
  | "invalid_api_key"
  | "missing_api_key"
  | "key_quota_exceeded"
  | "license_cap_reached"
  | "backend_unavailable"
  | "upstream_timeout"
  | "upstream_error"
  | "audio_too_large"
  | "invalid_audio"
  | "text_too_long"
  | "tts_disabled"
  | "unknown";

export interface ApiErrorBody {
  code: ApiErrorCode | (string & {});
  /** Server-side detail. Never rendered to the user. */
  detail?: string;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResult<T> = ({ ok: true } & T) | ApiFailure;

export const MODEL_DOWN_MESSAGE =
  "The OpenAtlas model server is not running right now. It is only switched on during testing windows.";

export const WAKING_MESSAGE =
  "The model may be waking up. The first reply can take a minute.";

const FRIENDLY: Record<ApiErrorCode, string> = {
  unauthorized: "This session has expired. Please unlock the demo again.",
  rate_limited: "You are going fast — please slow down a little and try again.",
  not_configured: "The demo is not configured correctly.",
  bad_request: "Something went wrong. Please check the form and try again.",
  invalid_api_key: "The demo is not configured correctly.",
  missing_api_key: "The demo is not configured correctly.",
  key_quota_exceeded: "The demo has reached its daily limit. Please try again tomorrow.",
  license_cap_reached: "The N-ATLaS active-user limit has been reached.",
  backend_unavailable: MODEL_DOWN_MESSAGE,
  upstream_timeout: MODEL_DOWN_MESSAGE,
  upstream_error: MODEL_DOWN_MESSAGE,
  audio_too_large: "That recording could not be used. Try a shorter clip (30 seconds or less).",
  invalid_audio: "That recording could not be used. Try a shorter clip (30 seconds or less).",
  text_too_long: "Text is too long (1,000 characters maximum).",
  tts_disabled: "Speech output is switched off on the server right now.",
  unknown: "Something went wrong. Please try again.",
};

const DOWN_CODES = new Set<string>([
  "backend_unavailable",
  "upstream_timeout",
  "upstream_error",
  "timeout",
  "connection",
]);

export function friendlyError(code: string): { message: string; isDown: boolean } {
  const isDown = DOWN_CODES.has(code);
  const message =
    FRIENDLY[code as ApiErrorCode] ?? (isDown ? MODEL_DOWN_MESSAGE : FRIENDLY.unknown);
  return { message, isDown };
}
