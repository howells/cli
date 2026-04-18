/** Structured JSON response envelope for agent-first CLIs. */
export interface CliResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  command?: string;
  [key: string]: unknown;
}

/**
 * Output a success response and exit.
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
  process.exit(0);
}

/**
 * Output an error response and exit.
 *
 * @param message - Human-readable error message.
 * @param command - The command that failed.
 */
export function error(message: string, command?: string): never {
  const result: CliResult = { ok: false, error: message };
  if (command) result.command = command;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(1);
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
