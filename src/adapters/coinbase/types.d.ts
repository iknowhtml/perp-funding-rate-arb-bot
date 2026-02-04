/**
 * Type declarations for @coinbase-sample/advanced-trade-sdk-ts
 *
 * The SDK package doesn't properly export types, so we declare them here.
 */

declare module "@coinbase-sample/advanced-trade-sdk-ts" {
  export class CoinbaseAdvTradeCredentials {
    constructor(key?: string, secret?: string);
  }

  export class CoinbaseAdvTradeClient {
    constructor(credentials?: CoinbaseAdvTradeCredentials, apiBasePath?: string);
  }

  export class PublicService {
    constructor(client: CoinbaseAdvTradeClient);
    getServerTime(request: { productId?: string }): Promise<unknown>;
    getProduct(request: { productId: string }): Promise<unknown>;
  }

  export class AccountsService {
    constructor(client: CoinbaseAdvTradeClient);
    listAccounts(request: Record<string, unknown>): Promise<unknown>;
  }
}
