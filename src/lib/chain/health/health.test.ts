import { describe, expect, it, vi } from "vitest";

import { checkRpcHealth } from "./health";

describe("checkRpcHealth", () => {
  it("returns healthy for valid block", async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockClient = {
      getBlock: vi.fn().mockResolvedValue({
        number: 100n,
        timestamp: BigInt(now - 10),
      }),
      getChainId: vi.fn().mockResolvedValue(42161),
    };

    const result = await checkRpcHealth(mockClient as never);
    expect(result.status).toBe("healthy");
    expect(result.blockNumber).toBe(100n);
    expect(result.chainId).toBe(42161);
  });

  it("returns unhealthy for stale block", async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockClient = {
      getBlock: vi.fn().mockResolvedValue({
        number: 100n,
        timestamp: BigInt(now - 120),
      }),
      getChainId: vi.fn().mockResolvedValue(42161),
    };

    const result = await checkRpcHealth(mockClient as never, 60n);
    expect(result.status).toBe("unhealthy");
    expect(result.error).toContain("Block age");
  });

  it("returns unhealthy on RPC error", async () => {
    const mockClient = {
      getBlock: vi.fn().mockRejectedValue(new Error("network error")),
      getChainId: vi.fn().mockRejectedValue(new Error("network error")),
    };

    const result = await checkRpcHealth(mockClient as never);
    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("network error");
  });
});
