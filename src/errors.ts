/**
 * Structured error envelope for agent-first CLIs.
 *
 * `CliError` carries enough metadata for an agent to decide what to do next:
 * is this transient, what HTTP status produced it, what should the human
 * try, and which exit code should the harness see.
 *
 * The envelope is a superset of @howells/cli's `CliResult`, so existing
 * consumers that only read `ok` and `error` continue to work.
 *
 * Vendor-specific codes are first-class — the `ErrorCode` type accepts any
 * string while still autocompleting the standard set. Vendor-specific
 * fields ride on `extra: Record<string, unknown>`, which `reportError()`
 * merges into the envelope verbatim.
 */

/**
 * Stable error codes that agents can switch on.
 *
 * These are the codes every agent harness should know how to route. CLIs
 * are free to add their own (e.g. `IP_NOT_WHITELISTED`) — the
 * {@link ErrorCode} type accepts any string without losing autocomplete on
 * the standard ones.
 */
export type StandardErrorCode =
  | "USAGE" // Bad flags, missing required args, unknown command
  | "VALIDATION" // Input failed format check (date, slug, enum)
  | "NOT_FOUND" // Resource (account, profile, id) didn't resolve
  | "AUTH_MISSING" // No credentials configured
  | "AUTH_EXPIRED" // Refresh failed; needs re-consent
  | "AUTH_REFUSED" // HTTP 401 — credentials invalid or revoked
  | "INSUFFICIENT_SCOPE" // HTTP 403 — credentials valid but lack permission
  | "RATE_LIMITED" // HTTP 429
  | "API_ERROR" // Other 4xx/5xx
  | "NETWORK_ERROR" // fetch threw — connection-level failure
  | "INTERNAL"; // Unclassified — bug or unexpected condition

/**
 * Error codes accepted by {@link CliError}. The `(string & {})` keeps
 * autocomplete on standard codes while still allowing vendor extensions.
 */
// biome-ignore lint/suspicious/noExplicitAny: intersection with string is the standard pattern for "literal-or-string" types
export type ErrorCode = StandardErrorCode | (string & {});

/** sysexits.h-aligned exit codes — agent harnesses can switch on these. */
export const EXIT = {
  OK: 0,
  GENERIC: 1,
  USAGE: 64, // EX_USAGE
  DATAERR: 65, // EX_DATAERR — validation
  NOTFOUND: 66, // EX_NOINPUT — resource didn't resolve
  UNAVAILABLE: 69, // EX_UNAVAILABLE — 5xx/429/network
  NOPERM: 77, // EX_NOPERM — auth denied
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * Map a {@link StandardErrorCode} to its sysexits-aligned exit code. Vendor
 * codes that aren't in the standard set fall back to {@link EXIT.GENERIC}
 * unless callers pass a custom mapping.
 */
export function exitCodeFor(code: ErrorCode): ExitCode {
  switch (code) {
    case "USAGE":
      return EXIT.USAGE;
    case "VALIDATION":
      return EXIT.DATAERR;
    case "NOT_FOUND":
      return EXIT.NOTFOUND;
    case "AUTH_MISSING":
    case "AUTH_EXPIRED":
    case "AUTH_REFUSED":
    case "INSUFFICIENT_SCOPE":
      return EXIT.NOPERM;
    case "RATE_LIMITED":
    case "API_ERROR":
    case "NETWORK_ERROR":
      return EXIT.UNAVAILABLE;
    case "INTERNAL":
      return EXIT.GENERIC;
    default:
      // Vendor codes — best-effort heuristic by prefix, then fall back.
      if (typeof code === "string") {
        if (code.startsWith("AUTH_") || code === "IP_NOT_WHITELISTED") {
          return EXIT.NOPERM;
        }
        if (code.endsWith("_NOT_FOUND")) return EXIT.NOTFOUND;
      }
      return EXIT.GENERIC;
  }
}

export interface CliErrorOptions {
  /** Domain code agents switch on. */
  code: ErrorCode;
  /** HTTP status, when the error came from an upstream API. */
  status?: number;
  /** True when retrying the same call could succeed (5xx, 429, network). */
  is_retriable?: boolean;
  /** Seconds the agent should wait before retry. */
  retry_after_seconds?: number;
  /** Single-line action the human/agent should take next. */
  recovery_hint?: string;
  /** Structured suggestions — for "did you mean?" surfaces (valid slugs, etc). */
  suggestions?: string[];
  /** Upstream request id, when known. Mirrors RFC 9457 `instance`. */
  trace_id?: string;
  /**
   * Vendor-specific fields merged verbatim into the envelope.
   * Use for things like `{ revolut_error_code: 9002 }`.
   */
  extra?: Record<string, unknown>;
  /** Underlying cause, if any. Not serialized to the envelope. */
  cause?: unknown;
}

/**
 * An error that carries enough metadata for an agent to route on.
 *
 * Throw this from any layer (api wrapper, command, validator). When the
 * top-level handler calls {@link reportError} from "@howells/cli", the
 * shape is serialized to the agent-facing JSON envelope and the process
 * exits with the right sysexits code.
 */
export class CliError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly is_retriable: boolean;
  readonly retry_after_seconds?: number;
  readonly recovery_hint?: string;
  readonly suggestions?: string[];
  readonly trace_id?: string;
  readonly extra?: Record<string, unknown>;

  constructor(message: string, opts: CliErrorOptions) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "CliError";
    this.code = opts.code;
    this.status = opts.status;
    this.is_retriable = opts.is_retriable ?? false;
    this.retry_after_seconds = opts.retry_after_seconds;
    this.recovery_hint = opts.recovery_hint;
    this.suggestions = opts.suggestions;
    this.trace_id = opts.trace_id;
    this.extra = opts.extra;
  }
}

/**
 * Wrap an unknown thrown value as a {@link CliError}. Already-typed
 * `CliError`s pass through unchanged.
 */
export function asCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CliError(message, {
    code: "INTERNAL",
    is_retriable: false,
    cause: err,
  });
}

/**
 * Serialize a {@link CliError} to the agent-facing JSON envelope shape.
 *
 * Pure — does not write to stdout or exit. Used by both `reportError()`
 * (CLI) and `toMcpToolError()` (MCP server) so the two surfaces produce
 * identical envelopes.
 */
export function errorEnvelope(
  err: CliError,
  command?: string,
): Record<string, unknown> {
  const envelope: Record<string, unknown> = {
    ok: false,
    error: err.message,
    code: err.code,
    is_retriable: err.is_retriable,
  };
  if (command) envelope.command = command;
  if (err.status !== undefined) envelope.status = err.status;
  if (err.retry_after_seconds !== undefined) {
    envelope.retry_after_seconds = err.retry_after_seconds;
  }
  if (err.recovery_hint) envelope.recovery_hint = err.recovery_hint;
  if (err.suggestions && err.suggestions.length > 0) {
    envelope.suggestions = err.suggestions;
  }
  if (err.trace_id) envelope.trace_id = err.trace_id;
  if (err.extra) Object.assign(envelope, err.extra);
  return envelope;
}
