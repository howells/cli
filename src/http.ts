/**
 * HTTP error classification for agent-first CLIs.
 *
 * Most CLIs in this ecosystem talk to a vendor REST API. They all have to
 * answer the same questions on every non-2xx response: is this retriable?
 * is the token bad? did we hit a rate limit? `classifyHttpError` answers
 * those questions in one place so each CLI's `api.ts` becomes ~30 lines
 * instead of a hundred-line classifier.
 */

import { CliError, type ErrorCode } from "./errors.ts";

/**
 * Parse a Retry-After header. Supports both delta-seconds (`"30"`) and
 * HTTP-date (`"Wed, 21 Oct 2026 07:28:00 GMT"`).
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds);
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return undefined;
}

/**
 * Try to parse a vendor error body. Many APIs return JSON with a `message`
 * (or `error`) human string and an optional vendor `code`. Falls back to
 * the raw body when JSON parse fails.
 */
export function parseVendorErrorBody(body: string): {
  detail: string;
  vendorCode?: number | string;
} {
  if (!body) return { detail: "" };
  try {
    const parsed = JSON.parse(body) as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
    };
    const detail =
      typeof parsed.message === "string" && parsed.message.length > 0
        ? parsed.message
        : typeof parsed.error === "string" && parsed.error.length > 0
          ? parsed.error
          : body;
    const vendorCode =
      typeof parsed.code === "number" || typeof parsed.code === "string"
        ? parsed.code
        : undefined;
    return { detail, vendorCode };
  } catch {
    return { detail: body };
  }
}

export interface ClassifyOptions {
  /** Vendor name, used in error messages (e.g. "Revolut", "Wise"). */
  vendor?: string;
  /**
   * Optional override invoked before the standard mapping. Return a
   * {@link CliError} to override, or `undefined` to fall through. Used for
   * vendor-specific cases like Revolut's `9002` IP-whitelist code.
   */
  override?: (
    status: number,
    parsed: { detail: string; vendorCode?: number | string },
    res: Response,
  ) => CliError | undefined;
  /**
   * Override the parser. Defaults to {@link parseVendorErrorBody}. Use when
   * a vendor returns a non-standard error shape.
   */
  parseBody?: (body: string) => {
    detail: string;
    vendorCode?: number | string;
  };
  /** Recovery hint to attach to AUTH_REFUSED errors. */
  authRecoveryHint?: string;
  /** Recovery hint to attach to INSUFFICIENT_SCOPE errors. */
  scopeRecoveryHint?: string;
}

/**
 * Classify a non-2xx HTTP response into a {@link CliError} with the right
 * code, retriability, retry-after, and trace id.
 *
 * @param res - The non-OK response.
 * @param body - The response body, already read as text.
 * @param opts - Vendor name and optional override hook.
 *
 * @example
 *   if (!res.ok) {
 *     const body = await res.text().catch(() => "");
 *     throw classifyHttpError(res, body, { vendor: "Wise" });
 *   }
 */
export function classifyHttpError(
  res: Response,
  body: string,
  opts: ClassifyOptions = {},
): CliError {
  const status = res.status;
  const parser = opts.parseBody ?? parseVendorErrorBody;
  const parsed = parser(body);
  const traceId =
    res.headers.get("x-request-id") ??
    res.headers.get("x-trace-id") ??
    res.headers.get("x-amzn-requestid") ??
    undefined;
  const vendorPrefix = opts.vendor ? `${opts.vendor} API ` : "";
  const message = `${vendorPrefix}${status}: ${parsed.detail || res.statusText}`;

  // Vendor-specific override comes first so things like Revolut 9002 win
  // before we apply the generic 403→INSUFFICIENT_SCOPE mapping.
  const override = opts.override?.(status, parsed, res);
  if (override) return override;

  if (status === 401) {
    return new CliError(message, {
      code: "AUTH_REFUSED",
      status,
      is_retriable: false,
      trace_id: traceId,
      recovery_hint: opts.authRecoveryHint,
      extra: vendorExtraFor(parsed.vendorCode, opts.vendor),
    });
  }

  if (status === 403) {
    return new CliError(message, {
      code: "INSUFFICIENT_SCOPE",
      status,
      is_retriable: false,
      trace_id: traceId,
      recovery_hint: opts.scopeRecoveryHint,
      extra: vendorExtraFor(parsed.vendorCode, opts.vendor),
    });
  }

  if (status === 404) {
    return new CliError(message, {
      code: "NOT_FOUND",
      status,
      is_retriable: false,
      trace_id: traceId,
      extra: vendorExtraFor(parsed.vendorCode, opts.vendor),
    });
  }

  if (status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    return new CliError(message, {
      code: "RATE_LIMITED",
      status,
      is_retriable: true,
      retry_after_seconds: retryAfter,
      trace_id: traceId,
      recovery_hint: retryAfter
        ? `Wait ${retryAfter}s and retry.`
        : "Wait and retry.",
      extra: vendorExtraFor(parsed.vendorCode, opts.vendor),
    });
  }

  // 5xx — retriable. Other 4xx fall through to API_ERROR but not retriable.
  const isRetriable = status >= 500;
  return new CliError(message, {
    code: "API_ERROR",
    status,
    is_retriable: isRetriable,
    trace_id: traceId,
    recovery_hint: isRetriable
      ? "Transient upstream failure. Retry with backoff."
      : undefined,
    extra: vendorExtraFor(parsed.vendorCode, opts.vendor),
  });
}

/**
 * Translate a thrown fetch error into a {@link CliError} with code
 * `NETWORK_ERROR`. Use this in your api wrapper's catch block:
 *
 *   try { res = await fetch(...); }
 *   catch (err) { throw classifyNetworkError(err, { vendor: "Wise" }); }
 */
export function classifyNetworkError(
  err: unknown,
  opts: { vendor?: string } = {},
): CliError {
  const detail = err instanceof Error ? err.message : String(err);
  const vendor = opts.vendor ? ` ${opts.vendor}` : "";
  return new CliError(`Network error contacting${vendor}: ${detail}`, {
    code: "NETWORK_ERROR",
    is_retriable: true,
    recovery_hint: "Check connectivity and retry.",
    cause: err,
  });
}

/**
 * Build the `extra` object for a `CliError`, surfacing vendor codes under
 * a stable key like `revolut_error_code`. Returns undefined when there's
 * nothing useful to attach so the envelope stays clean.
 */
function vendorExtraFor(
  vendorCode: number | string | undefined,
  vendor: string | undefined,
): Record<string, unknown> | undefined {
  if (vendorCode === undefined) return undefined;
  const vendorLabel = vendor?.toLowerCase().replace(/\s+/g, "_");
  if (!vendorLabel) return { vendor_error_code: vendorCode };
  return { [`${vendorLabel}_error_code`]: vendorCode };
}
