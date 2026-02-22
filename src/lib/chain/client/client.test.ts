import { describe, expect, it, vi } from "vitest";

vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({ type: "public" })),
  createWalletClient: vi.fn(() => ({ type: "wallet", account: {} })),
  http: vi.fn(() => ({})),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: "0x123" })),
}));

vi.mock("viem/chains", () => ({
  arbitrum: { id: 42161 },
}));

import { createArbitrumPublicClient, createArbitrumWalletClient } from "./client";

describe("createArbitrumPublicClient", () => {
  it("returns a client object", () => {
    const client = createArbitrumPublicClient("https://arb1.arbitrum.io/rpc");
    expect(client).toBeDefined();
    expect(client.type).toBe("public");
  });
});

describe("createArbitrumWalletClient", () => {
  it("returns a client with account", () => {
    const client = createArbitrumWalletClient(
      "https://arb1.arbitrum.io/rpc",
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    expect(client).toBeDefined();
    expect(client.type).toBe("wallet");
    expect(client.account).toBeDefined();
  });
});
