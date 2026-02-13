import { describe, expect, it } from "vitest";

import { readMarketAddresses, readMarketCount } from "./reader";

describe("readMarketCount", () => {
  it("returns bigint", async () => {
    const mockClient = {};
    const result = await readMarketCount(mockClient as never);
    expect(typeof result).toBe("bigint");
  });
});

describe("readMarketAddresses", () => {
  it("returns array", async () => {
    const mockClient = {};
    const result = await readMarketAddresses(mockClient as never, 0n);
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array for count 0", async () => {
    const mockClient = {};
    const result = await readMarketAddresses(mockClient as never, 0n);
    expect(result).toEqual([]);
  });
});
