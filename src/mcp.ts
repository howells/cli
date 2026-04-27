/**
 * MCP-server helpers — keep CLI and MCP error envelopes byte-identical.
 *
 * MCP tool errors should look like the CLI's error JSON so an agent can
 * write retry logic once against the `code`/`is_retriable` shape and have
 * it work for both transports.
 *
 * This module deliberately doesn't import from
 * `@modelcontextprotocol/sdk` — it just produces the envelope shape MCP
 * tool handlers should return. That way @howells/cli stays a small,
 * dependency-free package.
 */

import { asCliError, errorEnvelope } from "./errors.ts";

/**
 * MCP `CallToolResult` shape, narrowed to what we produce here.
 *
 * Mirrors the SDK's exported type without importing it — keeps this
 * package free of the MCP SDK dependency.
 */
export interface McpToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Translate any thrown value to an MCP tool error envelope matching the
 * CLI's stdout error JSON. Use inside your MCP tool handlers' catch:
 *
 *   try { ... } catch (err) { return toMcpToolError(err); }
 *
 * The envelope is also exposed via `structuredContent` so agents that
 * support MCP's structured-content extension don't need to JSON-parse
 * the text.
 */
export function toMcpToolError(err: unknown): McpToolResult {
  const cliErr = asCliError(err);
  const envelope = errorEnvelope(cliErr);
  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    isError: true,
  };
}

/**
 * Wrap a successful tool payload so the text channel mirrors the CLI's
 * stdout JSON. Pass any serializable shape — usually `{ ok: true, data,
 * meta? }` to match the CLI envelope.
 */
export function toMcpToolResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent:
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload },
  };
}
