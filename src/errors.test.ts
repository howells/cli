import { describe, expect, it } from "vitest";
import {
  asCliError,
  CliError,
  EXIT,
  errorEnvelope,
  exitCodeFor,
} from "./errors.ts";

describe("CliError", () => {
  it("carries all metadata fields", () => {
    const err = new CliError("rate limit", {
      code: "RATE_LIMITED",
      status: 429,
      is_retriable: true,
      retry_after_seconds: 30,
      recovery_hint: "wait and retry",
      suggestions: ["a", "b"],
      trace_id: "req-1",
      extra: { vendor_error_code: 9002 },
    });
    expect(err.name).toBe("CliError");
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
    expect(err.is_retriable).toBe(true);
    expect(err.retry_after_seconds).toBe(30);
    expect(err.recovery_hint).toBe("wait and retry");
    expect(err.suggestions).toEqual(["a", "b"]);
    expect(err.trace_id).toBe("req-1");
    expect(err.extra).toEqual({ vendor_error_code: 9002 });
  });

  it("defaults is_retriable to false", () => {
    const err = new CliError("nope", { code: "VALIDATION" });
    expect(err.is_retriable).toBe(false);
  });

  it("preserves cause chain when provided", () => {
    const root = new Error("root");
    const wrapped = new CliError("wrap", { code: "INTERNAL", cause: root });
    expect(wrapped.cause).toBe(root);
  });
});

describe("asCliError", () => {
  it("returns CliError instances unchanged", () => {
    const orig = new CliError("x", { code: "USAGE" });
    expect(asCliError(orig)).toBe(orig);
  });

  it("wraps plain Error as INTERNAL", () => {
    const wrapped = asCliError(new Error("boom"));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("boom");
    expect(wrapped.is_retriable).toBe(false);
  });

  it("wraps non-Error throwables", () => {
    const wrapped = asCliError("string thrown");
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("string thrown");
  });
});

describe("exitCodeFor", () => {
  it("maps standard codes", () => {
    expect(exitCodeFor("USAGE")).toBe(EXIT.USAGE);
    expect(exitCodeFor("VALIDATION")).toBe(EXIT.DATAERR);
    expect(exitCodeFor("NOT_FOUND")).toBe(EXIT.NOTFOUND);
    expect(exitCodeFor("AUTH_REFUSED")).toBe(EXIT.NOPERM);
    expect(exitCodeFor("AUTH_MISSING")).toBe(EXIT.NOPERM);
    expect(exitCodeFor("INSUFFICIENT_SCOPE")).toBe(EXIT.NOPERM);
    expect(exitCodeFor("RATE_LIMITED")).toBe(EXIT.UNAVAILABLE);
    expect(exitCodeFor("API_ERROR")).toBe(EXIT.UNAVAILABLE);
    expect(exitCodeFor("NETWORK_ERROR")).toBe(EXIT.UNAVAILABLE);
    expect(exitCodeFor("INTERNAL")).toBe(EXIT.GENERIC);
  });

  it("routes vendor codes by prefix heuristic", () => {
    // AUTH_* prefix → NOPERM
    expect(exitCodeFor("AUTH_2FA_REQUIRED")).toBe(EXIT.NOPERM);
    // *_NOT_FOUND suffix → NOTFOUND
    expect(exitCodeFor("ACCOUNT_NOT_FOUND")).toBe(EXIT.NOTFOUND);
    // Special-case for IP_NOT_WHITELISTED (Revolut)
    expect(exitCodeFor("IP_NOT_WHITELISTED")).toBe(EXIT.NOPERM);
  });

  it("falls back to GENERIC for unknown codes", () => {
    expect(exitCodeFor("WEIRD_VENDOR_THING")).toBe(EXIT.GENERIC);
  });
});

describe("errorEnvelope", () => {
  it("emits the minimal envelope", () => {
    const env = errorEnvelope(new CliError("nope", { code: "USAGE" }));
    expect(env).toEqual({
      ok: false,
      error: "nope",
      code: "USAGE",
      is_retriable: false,
    });
  });

  it("includes command when supplied", () => {
    const env = errorEnvelope(
      new CliError("nope", { code: "USAGE" }),
      "balance",
    );
    expect(env.command).toBe("balance");
  });

  it("merges extra fields verbatim", () => {
    const env = errorEnvelope(
      new CliError("403", {
        code: "INSUFFICIENT_SCOPE",
        status: 403,
        extra: { revolut_error_code: 9002 },
      }),
    );
    expect(env.status).toBe(403);
    expect(env.revolut_error_code).toBe(9002);
  });

  it("omits empty suggestions array", () => {
    const env = errorEnvelope(
      new CliError("x", { code: "NOT_FOUND", suggestions: [] }),
    );
    expect(env.suggestions).toBeUndefined();
  });

  it("includes suggestions when non-empty", () => {
    const env = errorEnvelope(
      new CliError("x", {
        code: "NOT_FOUND",
        suggestions: ["a", "b"],
      }),
    );
    expect(env.suggestions).toEqual(["a", "b"]);
  });
});
