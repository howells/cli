import {
  asCliError,
  type CliError,
  EXIT,
  errorEnvelope,
  exitCodeFor,
} from "./errors.ts";

/** Structured JSON response envelope for agent-first CLIs. */
export interface CliResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  command?: string;
  [key: string]: unknown;
}

/**
 * Pretty-print JSON when stdout is a TTY (humans), compact when piped
 * (agents and `jq`).
 *
 * The TTY heuristic intentionally uses `process.stdout.isTTY` rather than
 * any env var — this way `cmd | jq` and `cmd > out.json` both produce
 * compact output, while `cmd` straight to a terminal pretty-prints.
 */
export function stringify(value: unknown): string {
  return process.stdout.isTTY
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value);
}

/**
 * Output a success response and exit 0.
 *
 * Existing behavior: pretty-prints with 2-space indent unconditionally.
 * Kept stable for older consumers — new code should prefer
 * {@link reportSuccess} which is TTY-aware.
 *
 * @param data - The response payload.
 * @param command - The command name (included in envelope for agent routing).
 * @param extra - Additional top-level fields to merge into the envelope.
 */
export function success(
  data: unknown,
  command?: string,
  extra?: Record<string, unknown>,
): never {
  const result: CliResult = { ok: true, data };
  if (command) result.command = command;
  if (extra) Object.assign(result, extra);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(EXIT.OK);
}

/**
 * Output an error response and exit 1.
 *
 * Plain string-message variant kept for backward compatibility. New code
 * should throw a {@link CliError} and call {@link reportError}, which
 * handles structured codes and sysexits-aligned exit codes.
 */
export function error(message: string, command?: string): never {
  const result: CliResult = { ok: false, error: message };
  if (command) result.command = command;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(EXIT.GENERIC);
}

/**
 * TTY-aware success reporter — pretty when a human is reading, compact
 * when piped. Prefer this over {@link success} in new code.
 */
export function reportSuccess(
  data: unknown,
  command?: string,
  extra?: Record<string, unknown>,
): never {
  const result: CliResult = { ok: true, data };
  if (command) result.command = command;
  if (extra) Object.assign(result, extra);
  process.stdout.write(`${stringify(result)}\n`);
  process.exit(EXIT.OK);
}

/**
 * Serialize any thrown value to the structured error envelope and exit
 * with the right sysexits-aligned code.
 *
 * Pass a {@link CliError} for full metadata. Plain `Error`s and other
 * thrown values become `{ code: "INTERNAL", is_retriable: false }`.
 */
export function reportError(err: unknown, command?: string): never {
  const cliErr: CliError = asCliError(err);
  const envelope = errorEnvelope(cliErr, command);
  process.stdout.write(`${stringify(envelope)}\n`);
  process.exit(exitCodeFor(cliErr.code));
}

/**
 * Stream a list as newline-delimited JSON (NDJSON) and exit 0.
 *
 * Each item becomes its own compact line. The closing line carries
 * `{ ok: true, meta }` so consumers can still detect truncation
 * (`meta.has_more`) without making a separate request.
 *
 * @example
 *   reportNdjson(rows, { account: "main", has_more: true });
 */
export function reportNdjson(
  items: unknown[],
  meta?: Record<string, unknown>,
): never {
  for (const item of items) {
    process.stdout.write(`${JSON.stringify(item)}\n`);
  }
  if (meta) {
    process.stdout.write(`${JSON.stringify({ ok: true, meta })}\n`);
  }
  process.exit(EXIT.OK);
}

/**
 * Filter an array of objects to only include specified fields.
 * Returns the original array if no fields are specified.
 *
 * @example filterFields([{a: 1, b: 2}], "a") // [{a: 1}]
 */
export function filterFields(
  items: Record<string, unknown>[],
  fields: string | undefined,
): Record<string, unknown>[] {
  if (!fields) return items;
  const keys = fields.split(",").map((f) => f.trim());
  return items.map((item) => {
    const filtered: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in item) filtered[key] = item[key];
    }
    return filtered;
  });
}
