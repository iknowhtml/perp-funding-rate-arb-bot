/**
 * GMX v2 contract addresses for Arbitrum One (chain ID 42161).
 * Source: @gmx-io/sdk configs/contracts.js
 */
export const GMX_CONTRACTS = {
  dataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
  syntheticsReader: "0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789",
  exchangeRouter: "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41",
  depositHandler: "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5",
  withdrawalHandler: "0x0628D46b5D145f183AdB6Ef1f2c97eD1C4701C55",
  orderHandler: "0xF89e77e8Dc11691C9e8757e84aaFbCD8A67d7A55",
} as const;

/** ETH/USD market (ETH-USDC pool) - marketToken address */
export const ETH_USD_MARKET = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336";

/** BTC/USD market (WBTC.b-USDC pool) - marketToken address */
export const BTC_USD_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";
