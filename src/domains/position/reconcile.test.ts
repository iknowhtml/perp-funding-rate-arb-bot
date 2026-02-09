import { describe, expect, it } from "vitest";

import type { Position } from "@/adapters/types";

import { derivePosition } from "./derive";
import { reconcilePosition } from "./reconcile";
import type { PositionConfig } from "./types";

describe("reconcilePosition", () => {
  const baseConfig: PositionConfig = {
    perpSymbol: "BTC-USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    baseDecimals: 8,
  };

  const tolerance = {
    sizeBps: 10n, // 0.1% tolerance
    priceBps: 10n,
  };

  it("should report consistent position when no mismatch", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 10000000000n,
      leverageBps: 10000n,
      marginQuote: 40000000000n,
    };

    const derivedPosition = derivePosition(exchangePosition, null, 50000000000n, [], baseConfig);

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition,
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(true);
    expect(result.inconsistencies).toHaveLength(0);
    expect(result.correctedPosition.source).toBe("reconciled");
  });

  it("should report warning for size mismatch within tolerance", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    // Derived position has slightly different size (0.05% difference = 5 bps)
    const derivedPosition = derivePosition(
      {
        ...exchangePosition,
        sizeBase: 100050000n, // 1.0005 BTC (0.05% larger)
      },
      null,
      50000000000n,
      [],
      baseConfig,
    );

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition,
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(false);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.inconsistencies[0]?.field).toBe("perpQuantityBase");
    expect(result.inconsistencies[0]?.severity).toBe("warning"); // Within tolerance
  });

  it("should report critical for size mismatch exceeding tolerance", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    // Derived position has significantly different size (1% difference = 100 bps)
    const derivedPosition = derivePosition(
      {
        ...exchangePosition,
        sizeBase: 101000000n, // 1.01 BTC (1% larger)
      },
      null,
      50000000000n,
      [],
      baseConfig,
    );

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition,
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(false);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.inconsistencies[0]?.field).toBe("perpQuantityBase");
    expect(result.inconsistencies[0]?.severity).toBe("critical"); // Exceeds tolerance
  });

  it("should report critical for side mismatch", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n,
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    // Derived position thinks it's SHORT
    const derivedPosition = derivePosition(
      {
        ...exchangePosition,
        side: "SHORT",
      },
      null,
      50000000000n,
      [],
      baseConfig,
    );

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition,
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(false);
    expect(
      result.inconsistencies.some((i) => i.field === "side" && i.severity === "critical"),
    ).toBe(true);
  });

  it("should report critical when exchange position null but derived shows open", () => {
    const derivedPosition = derivePosition(
      {
        symbol: "BTC-USD",
        side: "LONG",
        sizeBase: 100000000n,
        entryPriceQuote: 40000000000n,
        markPriceQuote: 50000000000n,
        liquidationPriceQuote: null,
        unrealizedPnlQuote: 0n,
        leverageBps: 10000n,
        marginQuote: 0n,
      },
      null,
      50000000000n,
      [],
      baseConfig,
    );

    const result = reconcilePosition(
      derivedPosition,
      null, // Exchange says flat
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(false);
    expect(
      result.inconsistencies.some((i) => i.field === "open" && i.severity === "critical"),
    ).toBe(true);
  });

  it("should report critical when exchange position open but derived shows flat", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n,
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const derivedPosition = derivePosition(null, null, 50000000000n, [], baseConfig);

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition, // Exchange says open
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    expect(result.consistent).toBe(false);
    expect(
      result.inconsistencies.some((i) => i.field === "open" && i.severity === "critical"),
    ).toBe(true);
  });

  it("should use exchange position as corrected position (exchange wins)", () => {
    const exchangePosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n,
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const derivedPosition = derivePosition(
      {
        ...exchangePosition,
        sizeBase: 101000000n, // Different size
      },
      null,
      50000000000n,
      [],
      baseConfig,
    );

    const result = reconcilePosition(
      derivedPosition,
      exchangePosition,
      null,
      50000000000n,
      tolerance,
      baseConfig,
    );

    // Corrected position should match exchange position
    expect(result.correctedPosition.perpQuantityBase).toBe(exchangePosition.sizeBase);
    expect(result.correctedPosition.side).toBe(exchangePosition.side);
    expect(result.correctedPosition.source).toBe("reconciled");
  });
});
