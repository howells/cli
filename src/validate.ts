import { error } from "./output.ts";

/** Check if a string contains ASCII control characters (0x00-0x1F). */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/** Options for {@link hardenId}. */
export interface HardenIdOptions {
  /** Maximum allowed length (default: 128). */
  maxLength?: number;
  /** Label for error messages (default: "ID"). */
  label?: string;
}

/**
 * Validate a resource identifier against agent hallucination patterns.
 *
 * Rejects:
 * - Control characters (0x00-0x1F)
 * - Path traversal (`..`, `/`, `\`)
 * - Percent-encoded segments (`%`)
 * - Embedded query params (`?`, `#`)
 * - Overly long strings
 *
 * @param value - The identifier to validate.
 * @param command - The CLI command name (for error messages).
 * @param options - Validation options.
 *
 * @example hardenId("ENG-123", "issue") // passes
 * @example hardenId("../../etc/passwd", "issue") // exits with error
 */
export function hardenId(
  value: string,
  command: string,
  options: HardenIdOptions = {},
): void {
  const { maxLength = 128, label = "ID" } = options;

  if (hasControlChars(value)) {
    error(`Invalid ${label}: contains control characters.`, command);
  }
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    error(`Invalid ${label}: contains path traversal characters.`, command);
  }
  if (value.includes("%") || value.includes("?") || value.includes("#")) {
    error(`Invalid ${label}: contains encoded or query characters.`, command);
  }
  if (value.length > maxLength) {
    error(`Invalid ${label}: too long (max ${maxLength} characters).`, command);
  }
}

/**
 * Validate a title/name string.
 * Rejects empty strings and strings over the max length.
 *
 * @param value - The title to validate.
 * @param command - The CLI command name.
 * @param maxLength - Maximum allowed length (default: 1000).
 */
export function validateTitle(
  value: string,
  command: string,
  maxLength = 1000,
): void {
  if (!value || value.trim().length === 0) {
    error("Title is required and cannot be empty.", command);
  }
  if (value.length > maxLength) {
    error(
      `Title too long: ${value.length} characters (max ${maxLength}).`,
      command,
    );
  }
}

/**
 * Validate a positive integer string. Returns the parsed number.
 *
 * @throws Exits with structured error if not a positive integer.
 */
export function validatePositiveInt(
  value: string,
  field: string,
  command: string,
): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    error(`Invalid ${field}: "${value}". Must be a positive integer.`, command);
  }
  return n;
}

/**
 * Validate a comma-separated field filter string.
 * Each field must be alphanumeric (camelCase allowed).
 *
 * @throws Exits with structured error if any field name is invalid.
 */
export function validateFields(value: string, command: string): void {
  const fields = value.split(",").map((f) => f.trim());
  for (const field of fields) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) {
      error(
        `Invalid field name: "${field}". Fields must be alphanumeric.`,
        command,
      );
    }
  }
}
