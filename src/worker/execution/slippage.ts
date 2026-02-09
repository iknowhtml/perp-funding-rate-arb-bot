/**
 * Slippage estimation and pre-trade validation.
 *
 * Simulates walking the order book to estimate execution slippage
 * before placing orders. This is a critical safety check to prevent
 * large adverse fills.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, OrderBook, OrderBookLevel, OrderSide } from "@/adapters/types";

import { BPS_PER_UNIT } from "./types";
import type { ExecutionConfig, SlippageEstimate } from "./types";

/**
 * Calculate the mid price from an order book.
 *
 * Mid price = (best bid + best ask) / 2.
 * Returns 0n if order book is empty on either side.
 */
export const calculateMidPriceQuote = (orderBook: OrderBook): bigint => {
  const bestBid = orderBook.bids[0];
  const bestAsk = orderBook.asks[0];

  if (!bestBid || !bestAsk) {
    return 0n;
  }

  return (bestBid.priceQuote + bestAsk.priceQuote) / 2n;
};

/**
 * Calculate total available depth (quantity) on one side of the order book.
 */
export const calculateAvailableDepthBase = (levels: readonly OrderBookLevel[]): bigint =>
  levels.reduce((total, level) => total + level.quantityBase, 0n);

/**
 * Simulate walking the order book to estimate average fill price and slippage.
 *
 * For a BUY, we walk the asks (ascending price).
 * For a SELL, we walk the bids (descending price).
 *
 * @param orderBook - Current order book state
 * @param side - Order side (BUY or SELL)
 * @param sizeBase - Order size in base units
 * @returns Slippage estimate with average fill price and slippage in bps
 */
export const estimateSlippage = (
  orderBook: OrderBook,
  side: OrderSide,
  sizeBase: bigint,
  maxSlippageBps: bigint,
): SlippageEstimate => {
  const midPriceQuote = calculateMidPriceQuote(orderBook);
  const levels = side === "BUY" ? orderBook.asks : orderBook.bids;
  const availableDepthBase = calculateAvailableDepthBase(levels);

  // If no mid price or no liquidity, cannot execute
  if (midPriceQuote === 0n || levels.length === 0) {
    return {
      estimatedSlippageBps: BPS_PER_UNIT, // 100% = max slippage indicator
      avgFillPriceQuote: 0n,
      midPriceQuote,
      availableDepthBase,
      requiredDepthBase: sizeBase,
      canExecute: false,
    };
  }

  // Walk the order book levels
  let remainingBase = sizeBase;
  let totalCostQuote = 0n;

  for (const level of levels) {
    if (remainingBase <= 0n) {
      break;
    }

    const fillBase = remainingBase < level.quantityBase ? remainingBase : level.quantityBase;
    totalCostQuote += fillBase * level.priceQuote;
    remainingBase -= fillBase;
  }

  // If we couldn't fill the entire order
  if (remainingBase > 0n) {
    return {
      estimatedSlippageBps: BPS_PER_UNIT,
      avgFillPriceQuote: 0n,
      midPriceQuote,
      availableDepthBase,
      requiredDepthBase: sizeBase,
      canExecute: false,
    };
  }

  // Calculate average fill price
  const filledBase = sizeBase;
  const avgFillPriceQuote = totalCostQuote / filledBase;

  // Calculate slippage in bps
  // For BUY: slippage = (avgFill - mid) / mid * 10000
  // For SELL: slippage = (mid - avgFill) / mid * 10000
  const slippageBps =
    side === "BUY"
      ? ((avgFillPriceQuote - midPriceQuote) * BPS_PER_UNIT) / midPriceQuote
      : ((midPriceQuote - avgFillPriceQuote) * BPS_PER_UNIT) / midPriceQuote;

  // Negative slippage (price improvement) is fine, clamp to 0
  const normalizedSlippageBps = slippageBps > 0n ? slippageBps : 0n;

  return {
    estimatedSlippageBps: normalizedSlippageBps,
    avgFillPriceQuote,
    midPriceQuote,
    availableDepthBase,
    requiredDepthBase: sizeBase,
    canExecute: normalizedSlippageBps <= maxSlippageBps,
  };
};

/**
 * Validate execution against slippage and liquidity constraints.
 *
 * Performs two checks:
 * 1. Estimated slippage must be within maxSlippageBps
 * 2. Available depth must be at least minLiquidityMultiplier * required size
 *
 * @param adapter - Exchange adapter to fetch order book
 * @param symbol - Trading symbol
 * @param side - Order side
 * @param sizeBase - Order size in base units
 * @param config - Execution config with slippage limits
 * @returns Validation result with slippage estimate
 */
export const validateExecution = async (
  adapter: ExchangeAdapter,
  symbol: string,
  side: OrderSide,
  sizeBase: bigint,
  config: ExecutionConfig,
): Promise<{ valid: boolean; reason?: string; slippageEstimate: SlippageEstimate }> => {
  const orderBook = await adapter.getOrderBook(symbol);
  const slippageEstimate = estimateSlippage(orderBook, side, sizeBase, config.maxSlippageBps);

  // Check slippage limit
  if (!slippageEstimate.canExecute) {
    return {
      valid: false,
      reason: `Slippage ${slippageEstimate.estimatedSlippageBps}bps exceeds limit ${config.maxSlippageBps}bps`,
      slippageEstimate,
    };
  }

  // Check liquidity depth
  const requiredDepthBase = sizeBase * config.minLiquidityMultiplier;
  if (slippageEstimate.availableDepthBase < requiredDepthBase) {
    return {
      valid: false,
      reason: "Insufficient liquidity depth",
      slippageEstimate,
    };
  }

  return { valid: true, slippageEstimate };
};
