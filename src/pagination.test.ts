import { describe, expect, it } from "vitest";
import { paginate } from "./pagination.ts";

describe("paginate", () => {
  it("returns the rows and limit verbatim", () => {
    const page = paginate([1, 2, 3], { limit: 10 });
    expect(page.data).toEqual([1, 2, 3]);
    expect(page.meta.limit).toBe(10);
    expect(page.meta.returned).toBe(3);
  });

  it("flags has_more when returned === limit (heuristic)", () => {
    const page = paginate([1, 2], { limit: 2 });
    expect(page.meta.has_more).toBe(true);
    expect(page.meta.next_offset).toBe(2);
  });

  it("clears next_offset when has_more is false", () => {
    const page = paginate([1], { limit: 10 });
    expect(page.meta.has_more).toBe(false);
    expect(page.meta.next_offset).toBeUndefined();
  });

  it("respects explicit offset", () => {
    const page = paginate([1, 2, 3], { limit: 3, offset: 6 });
    expect(page.meta.offset).toBe(6);
    expect(page.meta.next_offset).toBe(9);
  });

  it("defaults offset to 0", () => {
    const page = paginate([], { limit: 10 });
    expect(page.meta.offset).toBe(0);
  });
});
