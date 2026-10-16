/**
 * Shared HTTP plumbing for the data services (PubChem, NCI CACTUS): typed errors,
 * per-service rate limiting, timeouts and cancellation.
 */

/** Where a failure (or a piece of data) came from. "local" is in-browser computation. */
export type Service = "pubchem" | "cactus" | "local";

export type ApiErrorKind =
  | "not_found" // 404 (or CACTUS 500), or a SMILES that parses but matches no compound
  | "bad_request" // 400, or a SMILES that cannot be parsed
  | "busy" // 429 / 502 / 503 / 504: throttled or overloaded
  | "timeout" // our client-side timeout fired
  | "network" // fetch rejected: offline, DNS, or an error response without CORS headers
  | "invalid_data" // response arrived but is not what we expected
  | "http"; // any other non-OK status

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly service: Service;
  readonly status: number | undefined;
  /** For "busy": seconds the service asked us to wait, when the Retry-After header is readable. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    kind: ApiErrorKind,
    service: Service,
    message: string,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.service = service;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Thrown when the caller's signal aborted the work. Not an error from the user's point of view. */
export class AbortedError extends Error {
  constructor() {
    super("Request was cancelled");
    this.name = "AbortedError";
  }
}

export function isAbortedError(error: unknown): error is AbortedError {
  return error instanceof AbortedError;
}

/** Wait for `ms`, or reject with AbortedError as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Sliding-window limiter: at most `limit` request starts per `windowMs`.
 * Checking and claiming a slot happen in one synchronous step, so concurrent callers
 * cannot claim the same slot. An aborted caller stops waiting and claims nothing.
 */
export class RateLimiter {
  private readonly starts: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new AbortedError();
      const now = Date.now();
      while (this.starts.length > 0 && now - (this.starts[0] ?? 0) >= this.windowMs) this.starts.shift();
      if (this.starts.length < this.limit) {
        this.starts.push(now);
        return;
      }
      await sleep(this.windowMs - (now - (this.starts[0] ?? now)) + 10, signal);
    }
  }
}

export interface ServiceConfig {
  service: Service;
  /** Human-readable name for error messages. */
  label: string;
  limiter: RateLimiter;
  timeoutMs: number;
  /** Map a non-OK status to an error kind (defaults cover the common cases). */
  classifyStatus?: (status: number) => ApiErrorKind | undefined;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
}

function defaultKind(status: number): ApiErrorKind {
  if (status === 404) return "not_found";
  if (status === 400) return "bad_request";
  if (status === 429 || status === 502 || status === 503 || status === 504) return "busy";
  return "http";
}

/**
 * One rate-limited fetch() with a timeout and a cancel signal, mapping every failure mode
 * to ApiError / AbortedError. Resolves only for 2xx responses. The timeout covers the
 * network request only, not the wait for a rate-limit slot.
 */
export async function httpRequest(config: ServiceConfig, url: string, options: RequestOptions = {}): Promise<Response> {
  const { signal, timeoutMs = config.timeoutMs, init } = options;
  await config.limiter.acquire(signal);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ApiError("timeout", config.service, `${config.label} did not respond within ${timeoutMs / 1000} s.`);
    }
    if (signal?.aborted) throw new AbortedError();
    // fetch rejects with TypeError for network failures. Error pages without CORS
    // headers also surface here; the message covers both.
    throw new ApiError("network", config.service, error instanceof Error ? error.message : "Network request failed.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (response.ok) return response;

  const status = response.status;
  const kind = config.classifyStatus?.(status) ?? defaultKind(status);
  const detail = await readFaultMessage(response);
  // Retry-After is only readable if the service exposes it via CORS; usually it does not.
  const retryAfter = Number(response.headers.get("Retry-After"));
  throw new ApiError(kind, config.service, detail ?? `${config.label} returned HTTP ${status}.`, {
    status,
    retryAfterSeconds: kind === "busy" && Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

/** PUG REST errors carry `{ Fault: { Code, Message, Details } }`; extract the message if present. */
async function readFaultMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const fault = isRecord(body) && isRecord(body.Fault) ? body.Fault : null;
    if (fault && typeof fault.Message === "string") return fault.Message;
  } catch {
    // Body was not JSON (e.g. an HTML error page).
  }
  return null;
}

export async function readJson(response: Response, service: Service): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError("invalid_data", service, "The response is not valid JSON.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
