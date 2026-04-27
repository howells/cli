import { describe, expect, it } from "vitest";
import { CliError } from "./errors.ts";
import {
  classifyHttpError,
  classifyNetworkError,
  parseRetryAfter,
  parseVendorErrorBody,
} from "./http.ts";

function res(
  status: number,
  body = "",
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe("parseRetryAfter", () => {
  it("returns undefined for null/empty", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });

  it("parses delta-seconds form", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("  120  ")).toBe(120);
  });

  it("parses HTTP-date form", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const seconds = parseRetryAfter(future);
    expect(seconds).toBeGreaterThanOrEqual(58);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("rejects garbage", () => {
    expect(parseRetryAfter("nonsense")).toBeUndefined();
  });
});

describe("parseVendorErrorBody", () => {
  it("returns empty detail for empty body", () => {
    expect(parseVendorErrorBody("")).toEqual({ detail: "" });
  });

  it("extracts message + numeric code", () => {
    expect(
      parseVendorErrorBody(JSON.stringify({ message: "nope", code: 9002 })),
    ).toEqual({ detail: "nope", vendorCode: 9002 });
  });

  it("extracts message + string code", () => {
    expect(
      parseVendorErrorBody(
        JSON.stringify({ message: "nope", code: "rate_exceeded" }),
      ),
    ).toEqual({ detail: "nope", vendorCode: "rate_exceeded" });
  });

  it("falls back to `error` field when `message` is absent", () => {
    expect(
      parseVendorErrorBody(JSON.stringify({ error: "auth failed" })),
    ).toEqual({ detail: "auth failed" });
  });

  it("returns raw body when not JSON", () => {
    expect(parseVendorErrorBody("<html>oops</html>")).toEqual({
      detail: "<html>oops</html>",
    });
  });
});

describe("classifyHttpError", () => {
  it("maps 401 to AUTH_REFUSED, not retriable", () => {
    const err = classifyHttpError(res(401, "bad token"), "bad token");
    expect(err.code).toBe("AUTH_REFUSED");
    expect(err.status).toBe(401);
    expect(err.is_retriable).toBe(false);
  });

  it("maps 403 to INSUFFICIENT_SCOPE by default", () => {
    const err = classifyHttpError(res(403, "forbidden"), "forbidden");
    expect(err.code).toBe("INSUFFICIENT_SCOPE");
    expect(err.is_retriable).toBe(false);
  });

  it("maps 404 to NOT_FOUND", () => {
    const err = classifyHttpError(res(404, "missing"), "missing");
    expect(err.code).toBe("NOT_FOUND");
  });

  it("maps 429 to RATE_LIMITED with retry_after_seconds", () => {
    const r = res(429, "slow down", { "retry-after": "45" });
    const err = classifyHttpError(r, "slow down");
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.is_retriable).toBe(true);
    expect(err.retry_after_seconds).toBe(45);
    expect(err.recovery_hint).toContain("45s");
  });

  it("maps 5xx to API_ERROR retriable", () => {
    const err = classifyHttpError(res(503, "down"), "down");
    expect(err.code).toBe("API_ERROR");
    expect(err.status).toBe(503);
    expect(err.is_retriable).toBe(true);
  });

  it("maps 4xx (non-special) to API_ERROR non-retriable", () => {
    const err = classifyHttpError(res(418, "teapot"), "teapot");
    expect(err.code).toBe("API_ERROR");
    expect(err.is_retriable).toBe(false);
  });

  it("includes vendor name in message", () => {
    const err = classifyHttpError(res(500, "boom"), "boom", {
      vendor: "Wise",
    });
    expect(err.message).toContain("Wise API 500");
  });

  it("attaches vendor error code under `<vendor>_error_code` key", () => {
    const body = JSON.stringify({ message: "blocked", code: 9002 });
    const err = classifyHttpError(res(403, body), body, { vendor: "Revolut" });
    expect(err.extra?.revolut_error_code).toBe(9002);
  });

  it("respects override for vendor-specific cases", () => {
    const body = JSON.stringify({ message: "blocked", code: 9002 });
    const err = classifyHttpError(res(403, body), body, {
      vendor: "Revolut",
      override(status, parsed) {
        if (status === 403 && parsed.vendorCode === 9002) {
          return new CliError("IP not whitelisted", {
            code: "IP_NOT_WHITELISTED",
            status,
            is_retriable: false,
            recovery_hint: "Add IP to allowlist",
          });
        }
        return undefined;
      },
    });
    expect(err.code).toBe("IP_NOT_WHITELISTED");
    expect(err.recovery_hint).toBe("Add IP to allowlist");
  });

  it("extracts trace id from x-request-id", () => {
    const err = classifyHttpError(res(500, "", { "x-request-id": "abc" }), "");
    expect(err.trace_id).toBe("abc");
  });
});

describe("classifyNetworkError", () => {
  it("returns NETWORK_ERROR retriable", () => {
    const err = classifyNetworkError(new TypeError("fetch failed"), {
      vendor: "Wise",
    });
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.is_retriable).toBe(true);
    expect(err.message).toContain("Wise");
  });

  it("works on string-typed throwables", () => {
    const err = classifyNetworkError("DNS broken");
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toContain("DNS broken");
  });
});
