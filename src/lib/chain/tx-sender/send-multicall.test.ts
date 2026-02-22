import { describe, expect, it, vi } from "vitest";
import { ChainError } from "../errors";
import type { MulticallPayload } from "../tx-builder";
import { sendMulticall } from "./send-multicall";
import type { TxSenderDeps } from "./types";

vi.mock("@gmx-io/sdk/configs/contracts", () => ({
  getContract: (_chainId: number, _name: string) => "0x0000000000000000000000000000000000000001",
}));
vi.mock("@gmx-io/sdk/configs/chainIds", () => ({ ARBITRUM: 42161 }));

const payload: MulticallPayload = {
  calls: ["0x01", "0x02"],
  valueWei: 100_000n,
};

const mockRequest = { address: "0xrouter" as const, data: "0x" as const, value: payload.valueWei };

/** Test helper: creates fresh mocks per call so assertions are per-test. */
const createDeps = (overrides?: {
  publicClient?: {
    simulateContract?: ReturnType<typeof vi.fn>;
    waitForTransactionReceipt?: ReturnType<typeof vi.fn>;
  };
  walletClient?: {
    account?: { address: string } | undefined;
    writeContract?: ReturnType<typeof vi.fn>;
  };
}): TxSenderDeps =>
  ({
    publicClient: {
      simulateContract:
        overrides?.publicClient?.simulateContract ??
        vi.fn().mockResolvedValue({ request: mockRequest }),
      waitForTransactionReceipt:
        overrides?.publicClient?.waitForTransactionReceipt ??
        vi.fn().mockResolvedValue({ status: "success", transactionHash: "0xabc" }),
    },
    walletClient: {
      account:
        overrides?.walletClient && "account" in overrides.walletClient
          ? overrides.walletClient.account
          : { address: "0x0000000000000000000000000000000000000002" },
      writeContract: overrides?.walletClient?.writeContract ?? vi.fn().mockResolvedValue("0xhash"),
    },
  }) as unknown as TxSenderDeps;

describe("sendMulticall", () => {
  it("simulates then sends then waits and returns receipt", async () => {
    const deps = createDeps();
    const receipt = await sendMulticall(payload, deps);

    expect(deps.publicClient.simulateContract).toHaveBeenCalledWith({
      address: "0x0000000000000000000000000000000000000001",
      abi: expect.any(Array),
      functionName: "multicall",
      args: [payload.calls],
      value: payload.valueWei,
      account: { address: "0x0000000000000000000000000000000000000002" },
    });
    expect(deps.walletClient.writeContract).toHaveBeenCalled();
    expect(deps.publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: "0xhash",
    });
    expect(receipt.status).toBe("success");
  });

  it("throws ChainError SIMULATION_FAILED when simulation fails", async () => {
    const deps = createDeps({
      publicClient: {
        simulateContract: vi.fn().mockRejectedValue(new Error("revert")),
        waitForTransactionReceipt: vi.fn(),
      },
    });

    await expect(sendMulticall(payload, deps)).rejects.toThrow(ChainError);
    await expect(sendMulticall(payload, deps)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      message: expect.stringContaining("Simulation failed"),
    });
    expect(deps.walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("throws ChainError TX_REVERTED when receipt status is reverted", async () => {
    const deps = createDeps({
      publicClient: {
        simulateContract: vi.fn().mockResolvedValue({
          request: { address: "0xrouter", data: "0x", value: payload.valueWei },
        }),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          status: "reverted",
          transactionHash: "0xrev",
        }),
      },
    });

    await expect(sendMulticall(payload, deps)).rejects.toThrow(ChainError);
    await expect(sendMulticall(payload, deps)).rejects.toMatchObject({
      code: "TX_REVERTED",
      message: "Transaction reverted",
    });
  });

  it("throws ChainError RPC_ERROR when wallet has no account", async () => {
    const deps = createDeps({
      walletClient: {
        writeContract: vi.fn(),
        account: undefined,
      },
    });

    await expect(sendMulticall(payload, deps)).rejects.toThrow(ChainError);
    await expect(sendMulticall(payload, deps)).rejects.toMatchObject({
      code: "RPC_ERROR",
      message: expect.stringContaining("account"),
    });
    expect(deps.publicClient.simulateContract).not.toHaveBeenCalled();
  });
});
