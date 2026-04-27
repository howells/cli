import { describe, expect, it } from "vitest";
import { CliError } from "./errors.ts";
import { toMcpToolError, toMcpToolResult } from "./mcp.ts";

describe("toMcpToolError", () => {
  it("translates a CliError into the structured tool error envelope", () => {
    const err = new CliError("rate limit", {
      code: "RATE_LIMITED",
      status: 429,
      is_retriable: true,
      retry_after_seconds: 30,
    });
    const result = toMcpToolError(err);
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    const parsed = JSON.parse(result.content[0]?.text as string);
    expect(parsed).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
      status: 429,
      is_retriable: true,
      retry_after_seconds: 30,
    });
  });

  it("wraps plain Errors as INTERNAL", () => {
    const result = toMcpToolError(new Error("oops"));
    const parsed = JSON.parse(result.content[0]?.text as string);
    expect(parsed.code).toBe("INTERNAL");
    expect(parsed.is_retriable).toBe(false);
  });

  it("mirrors envelope into structuredContent", () => {
    const result = toMcpToolError(new CliError("nope", { code: "USAGE" }));
    expect(result.structuredContent).toMatchObject({
      ok: false,
      code: "USAGE",
    });
  });
});

describe("toMcpToolResult", () => {
  it("wraps an object payload as text + structuredContent", () => {
    const result = toMcpToolResult({ ok: true, data: [1, 2, 3] });
    expect(result.content[0]?.text).toBe('{"ok":true,"data":[1,2,3]}');
    expect(result.structuredContent).toEqual({ ok: true, data: [1, 2, 3] });
  });

  it("wraps a primitive payload under value", () => {
    const result = toMcpToolResult(42);
    expect(result.structuredContent).toEqual({ value: 42 });
  });
});
