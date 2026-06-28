/**
 * Hardened fetch for all external/upstream network calls.
 *
 * Why this exists: the Rutgers upstreams (SOC, Passio GO, FoodPro) and the
 * local model server can be slow or hang. A bare `fetch` with no timeout means
 * one slow upstream blocks the whole agent and the app "feels broken". This
 * wrapper adds:
 *   - a hard timeout (AbortController) so requests never hang forever,
 *   - bounded retries with exponential backoff + jitter on transient failures,
 *   - a response-size cap so a malicious/huge upstream body can't blow up memory.
 *
 * Caller cancellation is respected: if you pass your own `signal` and it aborts,
 * we propagate immediately and do NOT retry.
 */

export interface FetchGuardOptions extends RequestInit {
  /** Abort the request after this many ms. Default 8000. */
  timeoutMs?: number;
  /** Max retry attempts on transient failure (network error, 429, 5xx). Default 2. */
  retries?: number;
  /** Base backoff in ms; grows ~2^attempt with jitter. Default 300. */
  backoffMs?: number;
  /** Human label for logs/errors, e.g. "SOC", "Passio". */
  label?: string;
}

export class FetchGuardError extends Error {
  readonly label: string;
  readonly status?: number;
  readonly attempts: number;
  readonly timedOut: boolean;
  constructor(
    message: string,
    opts: { label: string; status?: number; attempts: number; timedOut: boolean; cause?: unknown }
  ) {
    super(message, { cause: opts.cause });
    this.name = "FetchGuardError";
    this.label = opts.label;
    this.status = opts.status;
    this.attempts = opts.attempts;
    this.timedOut = opts.timedOut;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (seconds or HTTP-date) into ms, capped. Returns 0 if absent. */
function parseRetryAfterMs(header: string | null): number {
  if (!header) return 0;
  const secs = Number(header);
  if (!Number.isNaN(secs)) return Math.min(secs * 1000, 8_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), 8_000);
  return 0;
}

/**
 * fetch() with a timeout + bounded retries. Returns the Response on success
 * (including non-retryable 4xx — caller decides how to handle those).
 * Throws FetchGuardError only when all attempts fail or the caller aborts.
 */
export async function fetchWithGuard(
  url: string,
  options: FetchGuardOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    label = "fetch",
    signal: callerSignal,
    ...init
  } = options;

  let lastErr: unknown;
  let lastStatus: number | undefined;
  let timedOut = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Compose a per-attempt timeout with the caller's signal (if any).
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([timeoutSignal, callerSignal])
      : timeoutSignal;

    try {
      const res = await fetch(url, { ...init, signal });

      if (isRetryableStatus(res.status) && attempt < retries) {
        lastStatus = res.status;
        // Honor server's Retry-After (e.g. Groq TPM "try again in 3s") if it asks for longer.
        const backoff = backoffMs * 2 ** attempt + Math.floor(Math.random() * 100);
        const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
        await sleep(Math.max(backoff, retryAfter));
        continue;
      }
      return res;
    } catch (err) {
      // Caller explicitly cancelled — do not retry, surface immediately.
      if (callerSignal?.aborted) {
        throw new FetchGuardError(`${label} request cancelled`, {
          label,
          attempts: attempt + 1,
          timedOut: false,
          cause: err,
        });
      }
      lastErr = err;
      timedOut = timeoutSignal.aborted;
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt + Math.floor(Math.random() * 100));
        continue;
      }
    }
  }

  throw new FetchGuardError(
    timedOut
      ? `${label} timed out after ${timeoutMs}ms (${retries + 1} attempts)`
      : `${label} failed after ${retries + 1} attempts`,
    { label, status: lastStatus, attempts: retries + 1, timedOut, cause: lastErr }
  );
}

const DEFAULT_MAX_BYTES = 5_000_000; // 5 MB — far above any legit Rutgers payload

/**
 * Read a Response body as text with a hard size cap. Protects against a
 * malicious or runaway upstream returning a multi-GB body. Aborts the stream
 * and throws FetchGuardError once the cap is exceeded.
 */
export async function readTextCapped(
  res: Response,
  maxBytes: number = DEFAULT_MAX_BYTES,
  label = "response"
): Promise<string> {
  const body = res.body;
  if (!body) return res.text();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new FetchGuardError(`${label} body exceeded ${maxBytes} bytes`, {
          label,
          status: res.status,
          attempts: 1,
          timedOut: false,
        });
      }
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  } finally {
    reader.releaseLock();
  }
}
