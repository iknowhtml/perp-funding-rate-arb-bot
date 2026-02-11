# ADR 0027: Private Key & Wallet Security Model

- **Status:** Proposed
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md)
  - [ADR-0007: Infrastructure (Fly.io)](0007-infrastructure-flyio.md)

## Context

The bot holds a private key that controls real funds on Arbitrum. Unlike CEX API keys (which can be scoped to specific permissions and revoked), a compromised Ethereum private key means **total loss of all assets in the wallet** with no recourse.

This ADR addresses the security model for key management, token approvals, capital limits, and recovery procedures.

### Current State

The plan (A-01) loads `ARBITRUM_PRIVATE_KEY` from an environment variable. This is the simplest approach but raises questions about production security.

### Threat Model

| Threat | Impact | Likelihood |
|--------|--------|------------|
| Server compromise (Fly.io) → key extracted from env/memory | Total loss | Low |
| Env var leaked in logs/error messages | Total loss | Low (if careful) |
| Unlimited token approval exploited via contract vulnerability | Loss up to approved amount | Low |
| Nonce manipulation from concurrent access | Stuck transactions | Medium (mitigated by serial queue) |
| Bot bug sends wrong tx (e.g., wrong amount, wrong direction) | Partial loss | Medium |

### Open Questions

1. **Key storage**: How should the private key be stored and loaded?
   - **Option A**: Environment variable (current plan) — simplest, standard for server apps, relies on platform security (Fly.io secrets)
   - **Option B**: Encrypted keystore file (password from env) — adds a layer, but password is still in env
   - **Option C**: Cloud KMS (AWS KMS, GCP KMS) for signing — key never leaves HSM, but adds latency and vendor dependency
   - **Option D**: Hardware wallet (Ledger) via USB — most secure, but incompatible with headless server deployment
   - Note: For a solo project with small capital, Option A may be sufficient. At what capital level does this change?

2. **Hot wallet capital limits**: How much capital should the bot wallet hold?
   - **Option A**: Only what's needed for the current position + gas buffer — requires periodic manual top-ups
   - **Option B**: Enough for N positions (e.g., 2-3x current position size) — less manual intervention
   - **Option C**: No explicit limit, trust the risk engine's position size limits
   - Should there be a separate "treasury" wallet that the bot requests funds from?

3. **Token approval strategy**: How to handle ERC20 approvals?
   - **Option A**: `approve(MAX_UINT256)` once — fewest txs, but exposes full balance if router is exploited
   - **Option B**: Exact amount per trade — safest, but costs extra gas every entry/exit
   - **Option C**: Approve a capped amount (e.g., 2x max position size) and re-approve when depleted — compromise
   - GMX's ExchangeRouter is battle-tested and audited, but smart contract risk is non-zero

4. **Nonce management**: How to handle nonce gaps and stuck transactions?
   - **Option A**: Let viem handle nonces automatically (default) — simplest, works if serial queue prevents concurrency
   - **Option B**: Explicit nonce tracking with gap detection — more control, more complexity
   - **Option C**: Nonce manager that can "unstick" transactions by resubmitting with higher gas
   - The serial queue (ADR-0018) already prevents concurrent txs. Is explicit nonce management needed beyond that?

5. **Transaction validation**: Should the bot validate its own transactions before signing?
   - **Option A**: Trust the tx builder (simulation is the validation) — simpler
   - **Option B**: Additional sanity checks before signing (amount within bounds, recipient is known contract, etc.) — defense in depth
   - **Option C**: Both simulation + sanity checks — belt and suspenders

6. **Compromise recovery**: What's the procedure if the key is compromised?
   - Transfer remaining funds to a safe wallet?
   - Revoke all token approvals?
   - Is there an automated "drain to safe address" function the bot could trigger?
   - Should the bot have a hardcoded "safe address" for emergency withdrawals?

7. **Key rotation**: Can/should the key be rotated periodically?
   - On-chain wallets can't rotate keys — would require migrating funds to a new wallet
   - Is this worth the overhead for a solo project?

## Decision

**TBD** — to be decided after reviewing options above.

## Consequences

_To be filled after decision._

## References

- [Fly.io Secrets](https://fly.io/docs/reference/secrets/)
- [viem Account Management](https://viem.sh/docs/accounts/local)
- [ERC20 Approval Best Practices](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#IERC20-approve-address-uint256-)
- Plan A-01: Viem Client Setup
- Plan E-09: On-Chain Small Capital Deployment
