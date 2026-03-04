/**
 * GMX protocol adapter configuration.
 *
 * @see {@link ../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import type { Address } from "viem";

import type { GmxReadsDeps } from "./types";

/** Configuration for creating a GMX protocol adapter. */
export interface GmxProtocolAdapterConfig {
  /** Base URL for GMX Oracle API (e.g. https://arbitrum-api.gmxinfra.io). */
  baseUrl: string;
  /** Optional: public client for chain reads (position, GM balance). */
  publicClient?: GmxReadsDeps["publicClient"];
  /** Optional: account address for position and balance reads. */
  account?: Address | undefined;
  /** Optional: chain ID (default Arbitrum). */
  chainId?: GmxReadsDeps["chainId"];
}
