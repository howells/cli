import { error, filterFields, success } from "./output.ts";
import { validateFields, validatePositiveInt } from "./validate.ts";

const argv = process.argv.slice(2);

/**
 * Get a named flag value from argv.
 *
 * @example flag("team") // returns value after --team, or undefined
 */
export function flag(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

/**
 * Check if a boolean flag is present in argv.
 *
 * @example hasFlag("dry-run") // true if --dry-run is in argv
 */
export function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

/**
 * Parse and validate the --limit flag.
 * Returns undefined if not present, validated positive integer otherwise.
 */
export function getLimit(command: string): number | undefined {
  const raw = flag("limit");
  if (!raw) return undefined;
  return validatePositiveInt(raw, "limit", command);
}

/**
 * Parse and validate the --fields flag.
 * Returns undefined if not present, validated field string otherwise.
 */
export function getFields(command: string): string | undefined {
  const raw = flag("fields");
  if (!raw) return undefined;
  validateFields(raw, command);
  return raw;
}

/**
 * Parse the --json flag as a JSON object.
 * Returns empty object if not present.
 *
 * @throws Exits with structured error if JSON is invalid.
 */
export function readJsonInput(command: string): Record<string, unknown> {
  const jsonStr = flag("json");
  if (!jsonStr) return {};
  try {
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      error("--json must be a JSON object.", command);
    }
    return parsed as Record<string, unknown>;
  } catch {
    error("--json contains invalid JSON.", command);
  }
}

/**
 * Apply --fields and --limit to a result set and output as success.
 * Convenience function for read commands.
 */
export function readResult(
  command: string,
  data: Record<string, unknown>[],
  extra?: Record<string, unknown>,
): void {
  const limit = getLimit(command);
  const limited = limit ? data.slice(0, limit) : data;
  const filtered = filterFields(limited, getFields(command));
  success(filtered, command, extra);
}
