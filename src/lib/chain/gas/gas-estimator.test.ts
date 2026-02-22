import { describe, expect, it, vi } from "vitest";
import { ChainError } from "../errors";

vi.mock("@gmx-io/sdk/configs/dataStore", () => ({
  increaseOrderGasLimitKey: () =>
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  decreaseOrderGasLimitKey: () =>
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  depositGasLimitKey: () => "0x0000000000000000000000000000000000000000000000000000000000000003",
  withdrawalGasLimitKey: () => "0x0000000000000000000000000000000000000000000000000000000000000004",
}));
vi.mock("@gmx-io/sdk/configs/contracts", () => ({
  getContract: () => "0x0000000000000000000000000000000000000001",
}));
vi.mock("@gmx-io/sdk/configs/chainIds", () => ({ ARBITRUM: 42161 }));
vi.mock("@gmx-io/sdk/abis/DataStore", () => ({
  default: [
    {
      name: "getUint",
      type: "function",
      inputs: [{ name: "key", type: "bytes32", internalType: "bytes32" }],
      outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
      stateMutability: "view",
    },
  ],
}));
import {
  checkExecutionFeeOrThrow,
  createGasEstimator,
  estimateExecutionFeeWeiOrThrow,
} from "./gas-estimator";
import type { GasEstimatorDeps, GasOrderType } from "./gas-estimator";

const mockPublicClient = {
  readContract: async () => 500_000n,
  getGasPrice: async () => 100_000_000n,
} as unknown as GasEstimatorDeps["publicClient"];

const deps: GasEstimatorDeps = {
  publicClient: mockPublicClient,
  maxExecutionFeeWei: 100_000_000n,
};

describe("checkExecutionFeeOrThrow", () => {
  it("does not throw when fee is below max", () => {
    expect(() => checkExecutionFeeOrThrow(deps, 50n)).not.toThrow();
  });

  it("does not throw when fee equals max", () => {
    expect(() => checkExecutionFeeOrThrow(deps, 100_000_000n)).not.toThrow();
  });

  it("throws ChainError GAS_TOO_HIGH when fee exceeds max", () => {
    expect(() => checkExecutionFeeOrThrow(deps, 100_000_001n)).toThrow(ChainError);
    try {
      checkExecutionFeeOrThrow(deps, 100_000_001n);
    } catch (err) {
      const chainErr = err as ChainError;
      expect(chainErr.code).toBe("GAS_TOO_HIGH");
      expect(chainErr.message).toContain("100000001");
    }
  });
});

describe("createGasEstimator", () => {
  it("returns bound functions", () => {
    const estimator = createGasEstimator(deps);
    expect(typeof estimator.estimateExecutionFeeWei).toBe("function");
    expect(typeof estimator.checkExecutionFeeOrThrow).toBe("function");
    expect(typeof estimator.estimateExecutionFeeWeiOrThrow).toBe("function");
  });

  it("checkExecutionFeeOrThrow throws when over threshold", () => {
    const estimator = createGasEstimator({
      ...deps,
      maxExecutionFeeWei: 10n,
    });
    expect(() => estimator.checkExecutionFeeOrThrow(11n)).toThrow(ChainError);
  });
});

describe("estimateExecutionFeeWeiOrThrow", () => {
  it("throws GAS_TOO_HIGH when estimated fee exceeds max", async () => {
    const highThresholdDeps: GasEstimatorDeps = {
      ...deps,
      maxExecutionFeeWei: 1n,
    };
    await expect(estimateExecutionFeeWeiOrThrow(highThresholdDeps, "increase")).rejects.toThrow(
      ChainError,
    );
    try {
      await estimateExecutionFeeWeiOrThrow(highThresholdDeps, "increase");
    } catch (err) {
      expect((err as ChainError).code).toBe("GAS_TOO_HIGH");
    }
  });
});

describe("GasOrderType", () => {
  const orderTypes: GasOrderType[] = ["increase", "decrease", "deposit", "withdrawal"];

  it("estimateExecutionFeeWei resolves for all order types", async () => {
    const estimator = createGasEstimator(deps);
    for (const orderType of orderTypes) {
      const fee = await estimator.estimateExecutionFeeWei(orderType);
      expect(typeof fee).toBe("bigint");
    }
  });
});
