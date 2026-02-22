import { describe, expect, it, vi } from "vitest";
import {
  buildDecreaseOrderPayload,
  buildDepositPayload,
  buildIncreaseOrderPayload,
  buildWithdrawalPayload,
} from "./multicall-payloads";

vi.mock("@gmx-io/sdk/configs/contracts", () => ({
  getContract: (chainId: number, _name: string) => `0x${String(chainId).padStart(40, "0")}`,
}));
vi.mock("@gmx-io/sdk/configs/chainIds", () => ({ ARBITRUM: 42161 }));

const account = "0x0000000000000000000000000000000000000001" as const;
const market = "0x0000000000000000000000000000000000000002" as const;
const collateralToken = "0x0000000000000000000000000000000000000003" as const;

describe("buildIncreaseOrderPayload", () => {
  it("returns calls and valueWei", () => {
    const payload = buildIncreaseOrderPayload({
      account,
      market,
      collateralToken,
      collateralAmountWei: 1000n,
      sizeDeltaUsd: 5000n,
      isLong: true,
      acceptablePrice: 1_000_000n,
      executionFeeWei: 100_000n,
    });
    expect(payload.calls.length).toBe(3);
    expect(payload.calls[0]).toMatch(/^0x/);
    expect(payload.calls[1]).toMatch(/^0x/);
    expect(payload.calls[2]).toMatch(/^0x/);
    expect(payload.valueWei).toBe(100_000n);
  });
});

describe("buildDecreaseOrderPayload", () => {
  it("returns sendWnt + createOrder calls and valueWei", () => {
    const payload = buildDecreaseOrderPayload({
      account,
      market,
      collateralToken,
      sizeDeltaUsd: 3000n,
      isLong: false,
      acceptablePrice: 999_000n,
      executionFeeWei: 80_000n,
    });
    expect(payload.calls.length).toBe(2);
    expect(payload.valueWei).toBe(80_000n);
  });
});

describe("buildDepositPayload", () => {
  it("returns sendWnt + createDeposit calls and valueWei", () => {
    const longToken = "0x0000000000000000000000000000000000000004" as const;
    const shortToken = "0x0000000000000000000000000000000000000005" as const;
    const payload = buildDepositPayload({
      account,
      market,
      initialLongToken: longToken,
      initialShortToken: shortToken,
      minMarketTokens: 100n,
      executionFeeWei: 50_000n,
    });
    expect(payload.calls.length).toBe(2);
    expect(payload.valueWei).toBe(50_000n);
  });
});

describe("buildWithdrawalPayload", () => {
  it("returns sendWnt + createWithdrawal calls and valueWei", () => {
    const payload = buildWithdrawalPayload({
      account,
      market,
      minLongTokenAmount: 10n,
      minShortTokenAmount: 10n,
      executionFeeWei: 60_000n,
    });
    expect(payload.calls.length).toBe(2);
    expect(payload.valueWei).toBe(60_000n);
  });
});
