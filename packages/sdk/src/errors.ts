/** Base class for every error the SDK throws. */
export class OpenAtlasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The gateway answered with a non-2xx status. */
export class OpenAtlasAPIError extends OpenAtlasError {
  /** HTTP status from the gateway. */
  readonly status: number;
  /** Machine-readable code, e.g. `invalid_api_key`, `license_cap_reached`, `upstream_timeout`. */
  readonly code: string;
  /** RunPod job id, when the failure happened after a job was queued. Useful when reporting issues. */
  readonly jobId?: string;

  constructor(status: number, code: string, message: string, jobId?: string) {
    super(`${message} (HTTP ${status}, ${code})`);
    this.status = status;
    this.code = code;
    this.jobId = jobId;
  }
}

/**
 * The request took longer than `timeoutMs`. On a scaled-to-zero endpoint the first
 * request after an idle period includes model loading, so this is usually a cold start:
 * retrying shortly afterwards normally hits a warm worker.
 */
export class OpenAtlasTimeoutError extends OpenAtlasError {
  constructor(timeoutMs: number) {
    super(
      `No response within ${Math.round(timeoutMs / 1000)}s. The hosted N-ATLaS endpoint scales to zero when idle, ` +
        `so the first request after a quiet period includes loading the model (a cold start). ` +
        `Retry in a minute, or raise \`timeoutMs\`.`,
    );
  }
}

/** The gateway could not be reached at all (DNS, TLS, network). */
export class OpenAtlasConnectionError extends OpenAtlasError {
  constructor(baseURL: string, cause: unknown) {
    super(`Could not reach the OpenAtlas gateway at ${baseURL}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
