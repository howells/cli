import { describe, expect, it, vi } from "vitest";

vi.mock("./output.ts", () => ({
  error: (message: string, command?: string) => {
    throw new Error(`[${command}] ${message}`);
  },
  success: () => {},
  filterFields: (t: unknown[]) => t,
}));

import {
  hardenId,
  validateFields,
  validatePositiveInt,
  validateTitle,
} from "./validate.ts";

describe("hardenId", () => {
  it("accepts normal identifiers", () => {
    expect(() => hardenId("ENG-123", "test")).not.toThrow();
    expect(() => hardenId("abc-def-ghi", "test")).not.toThrow();
    expect(() => hardenId("e3608465-aa78-4aa8", "test")).not.toThrow();
  });

  it("rejects path traversal", () => {
    expect(() => hardenId("../../etc/passwd", "test")).toThrow(
      "path traversal",
    );
  });

  it("rejects backslash traversal", () => {
    expect(() => hardenId("..\\windows\\system32", "test")).toThrow(
      "path traversal",
    );
  });

  it("rejects control characters", () => {
    expect(() => hardenId("ENG\x00-123", "test")).toThrow("control characters");
    expect(() => hardenId("ENG\n-123", "test")).toThrow("control characters");
  });

  it("rejects percent encoding", () => {
    expect(() => hardenId("ENG%2e123", "test")).toThrow("encoded");
  });

  it("rejects query params", () => {
    expect(() => hardenId("ENG?key=val", "test")).toThrow("query");
    expect(() => hardenId("ENG#section", "test")).toThrow("query");
  });

  it("rejects overly long IDs", () => {
    expect(() => hardenId("a".repeat(129), "test")).toThrow("too long");
  });

  it("respects custom maxLength", () => {
    expect(() => hardenId("a".repeat(20), "test", { maxLength: 10 })).toThrow(
      "too long",
    );
    expect(() =>
      hardenId("a".repeat(10), "test", { maxLength: 10 }),
    ).not.toThrow();
  });

  it("uses custom label in errors", () => {
    expect(() => hardenId("../x", "test", { label: "account" })).toThrow(
      "Invalid account",
    );
  });
});

describe("validateTitle", () => {
  it("accepts normal titles", () => {
    expect(() => validateTitle("Fix the bug", "test")).not.toThrow();
  });

  it("rejects empty", () => {
    expect(() => validateTitle("", "test")).toThrow("required");
  });

  it("rejects whitespace-only", () => {
    expect(() => validateTitle("   ", "test")).toThrow("required");
  });

  it("rejects over default max", () => {
    expect(() => validateTitle("a".repeat(1001), "test")).toThrow("too long");
  });

  it("respects custom max", () => {
    expect(() => validateTitle("a".repeat(50), "test", 40)).toThrow("too long");
  });
});

describe("validatePositiveInt", () => {
  it("accepts positive integers", () => {
    expect(validatePositiveInt("1", "limit", "test")).toBe(1);
    expect(validatePositiveInt("100", "limit", "test")).toBe(100);
  });

  it("rejects zero", () => {
    expect(() => validatePositiveInt("0", "limit", "test")).toThrow("positive");
  });

  it("rejects negative", () => {
    expect(() => validatePositiveInt("-5", "limit", "test")).toThrow(
      "positive",
    );
  });

  it("rejects floats", () => {
    expect(() => validatePositiveInt("3.5", "limit", "test")).toThrow(
      "positive",
    );
  });

  it("rejects non-numbers", () => {
    expect(() => validatePositiveInt("abc", "limit", "test")).toThrow(
      "positive",
    );
  });
});

describe("validateFields", () => {
  it("accepts valid camelCase fields", () => {
    expect(() =>
      validateFields("id,counterParty,amount", "test"),
    ).not.toThrow();
  });

  it("accepts single field", () => {
    expect(() => validateFields("title", "test")).not.toThrow();
  });

  it("rejects path traversal in fields", () => {
    expect(() => validateFields("title,../hack", "test")).toThrow(
      "alphanumeric",
    );
  });

  it("rejects fields starting with numbers", () => {
    expect(() => validateFields("1bad", "test")).toThrow("alphanumeric");
  });

  it("rejects fields with spaces", () => {
    expect(() => validateFields("bad field", "test")).toThrow("alphanumeric");
  });
});
