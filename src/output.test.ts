import { describe, expect, it } from "vitest";
import { filterFields } from "./output.ts";

describe("filterFields", () => {
  const items = [
    { id: "1", name: "Alice", role: "admin", email: "a@b.com" },
    { id: "2", name: "Bob", role: "user", email: "b@b.com" },
  ];

  it("returns all fields when no filter", () => {
    expect(filterFields(items, undefined)).toEqual(items);
  });

  it("filters to specified fields", () => {
    expect(filterFields(items, "id,name")).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("handles single field", () => {
    expect(filterFields(items, "name")).toEqual([
      { name: "Alice" },
      { name: "Bob" },
    ]);
  });

  it("ignores non-existent fields", () => {
    expect(filterFields(items, "id,nonexistent")).toEqual([
      { id: "1" },
      { id: "2" },
    ]);
  });

  it("handles whitespace in field list", () => {
    expect(filterFields(items, "id , name")).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("handles empty array", () => {
    expect(filterFields([], "id")).toEqual([]);
  });
});
